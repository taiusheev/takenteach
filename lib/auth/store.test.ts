import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

/**
 * The identity queries, against Postgres.
 *
 * These were the least-covered part of the port and the most load-bearing:
 * `readSessionRecord` runs on EVERY authenticated request, and nothing else in
 * the suite touches it.
 *
 * ── WHAT THIS IS REALLY GUARDING ─────────────────────────────────────────
 * Column aliases. These queries select `u.id AS "userId"` — and the quoting is
 * not style. Postgres folds an unquoted identifier to lower case, so the
 * `AS userId` that SQLite honoured would come back as `userid`, every field of
 * `SessionRecord` would be `undefined`, and the failure would surface as
 * "signed in as nobody, in no organization" rather than as an error. That is a
 * whole-application outage produced by six missing quote marks, and it is
 * invisible to `tsc` because the row is cast to the interface.
 *
 * So the assertions below are deliberately field-by-field rather than a
 * truthiness check on the record.
 */

delete process.env.DATABASE_URL;

const store = await import("./store");
// "../schema" — NOT "./schema", which is lib/auth/schema.ts, the zod bodies.
const { ensureSchema } = await import("../schema");
const { closeDb, run } = await import("../pg");
const { expiryFromNow, hashToken, newToken } = await import("./tokens");

let userId: number;
let orgId: number;

describe("the identity store", () => {
  before(async () => {
    await ensureSchema();
    const user = await store.createUser({
      email: "  Ada@School.org  ",
      passwordHash: "scrypt$1$1$1$c2FsdA==$aGFzaA==",
      name: "Ada",
      mustChangePassword: true,
    });
    const org = await store.createOrganization({
      name: "St Mary's",
      kind: "school",
    });
    await store.createMembership({
      userId: user.id,
      orgId: org.id,
      orgRole: "coach",
      status: "active",
    });
    userId = user.id;
    orgId = org.id;
  });

  after(async () => {
    await closeDb();
  });

  test("email is normalised on write and on read", async () => {
    // `Ada@School.org` and `ada@school.org` must not be two accounts.
    const found = await store.getUserByEmail("ADA@SCHOOL.ORG");
    assert.equal(found?.id, userId);
    assert.equal(found?.email, "ada@school.org");
  });

  test("a session resolves to every field it promises", async () => {
    const token = newToken();
    await store.createSessionRow({
      token,
      userId,
      activeOrgId: orgId,
      ttlSeconds: 3600,
      userAgent: "test",
    });

    const s = await store.readSessionRecord(token);
    assert.ok(s, "the session did not resolve at all");
    // Every aliased column, named individually — see the note above.
    assert.equal(s.userId, userId);
    assert.equal(s.email, "ada@school.org");
    assert.equal(s.name, "Ada");
    assert.equal(s.platformRole, "user");
    assert.equal(s.orgId, orgId);
    assert.equal(s.orgName, "St Mary's");
    assert.equal(s.orgSlug, "st-mary-s");
    assert.equal(s.orgKind, "school");
    assert.equal(s.orgRole, "coach");
    assert.equal(s.membershipStatus, "active");
    // Declared boolean, and an integer column underneath.
    assert.equal(s.mustChangePassword, true);
    assert.equal(typeof s.mustChangePassword, "boolean");
  });

  test("an expired session resolves to nothing", async () => {
    const token = newToken();
    await store.createSessionRow({
      token,
      userId,
      activeOrgId: orgId,
      ttlSeconds: 3600,
    });
    // Expiry is filtered in the query, so backdate the row rather than waiting.
    await run("UPDATE sessions SET expires_at = ? WHERE token_hash = ?", [
      expiryFromNow(-60),
      hashToken(token),
    ]);
    assert.equal(await store.readSessionRecord(token), undefined);
  });

  test("removing a membership kills the session on the next request", async () => {
    /* The membership is JOINed rather than looked up separately precisely so
       this works: revoking access must not wait for a cookie to expire. */
    const token = newToken();
    await store.createSessionRow({
      token,
      userId,
      activeOrgId: orgId,
      ttlSeconds: 3600,
    });
    assert.ok(await store.readSessionRecord(token));

    await run("DELETE FROM memberships WHERE user_id = ? AND org_id = ?", [
      userId,
      orgId,
    ]);
    assert.equal(await store.readSessionRecord(token), undefined);

    await store.createMembership({
      userId,
      orgId,
      orgRole: "coach",
      status: "active",
    });
  });

  test("listMemberships and getMembership alias their columns too", async () => {
    const all = await store.listMemberships(userId);
    assert.equal(all.length, 1);
    assert.equal(all[0].orgId, orgId);
    assert.equal(all[0].orgName, "St Mary's");
    assert.equal(all[0].orgSlug, "st-mary-s");
    assert.equal(all[0].orgKind, "school");
    assert.equal(all[0].orgRole, "coach");
    assert.equal(all[0].status, "active");

    const one = await store.getMembership(userId, orgId);
    assert.equal(one?.orgName, "St Mary's");
    assert.equal(one?.orgRole, "coach");
  });

  test("school search is case-insensitive and hides personal workspaces", async () => {
    /* `ILIKE`, which replaced `LIKE ? COLLATE NOCASE`. The second assertion is
       the one that matters: listing individual orgs would expose every solo
       user's name to anyone typing into a signup box. */
    await store.createOrganization({ name: "Ada's workspace", kind: "individual" });

    assert.equal((await store.findSchoolsByName("st mary")).length, 1);
    assert.equal((await store.findSchoolsByName("ST MARY")).length, 1);
    assert.deepEqual(await store.findSchoolsByName("workspace"), []);
    // Under two characters is not a search.
    assert.deepEqual(await store.findSchoolsByName("s"), []);
  });

  test("a colliding organization name gets a counter, not an error", async () => {
    const second = await store.createOrganization({
      name: "St Mary's",
      kind: "school",
    });
    assert.equal(second.slug, "st-mary-s-2");
  });

  test("a spent reset link is indistinguishable from one that never existed", async () => {
    const token = newToken();
    await store.createPasswordReset(userId, token, 3600);
    assert.equal((await store.readPasswordReset(token))?.user_id, userId);

    await store.consumePasswordReset(token);
    assert.equal(await store.readPasswordReset(token), undefined);
    assert.equal(await store.readPasswordReset(newToken()), undefined);
  });
});
