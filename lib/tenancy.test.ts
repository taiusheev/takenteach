import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

/**
 * THE TEST PHASE 2 EXISTS FOR — now re-run against Postgres.
 *
 * Everything in the tenancy migration — the org_id columns, the Scope
 * parameter, the guard changes — is a means to one end: two organizations on
 * one installation must not be able to see or touch each other's work. That
 * claim is either true or it is a security incident, and "tsc passes" does not
 * establish it. This does.
 *
 * It runs against the REAL query layer, not a mock. A mocked lib/db would be
 * testing the assertion that the mock is right, which is the thing in doubt.
 *
 * ── WHAT THE PORT CHANGED HERE ───────────────────────────────────────────
 * The database used to be a throwaway SQLite file in the OS temp directory,
 * pointed at by TAKENTEACH_DB before lib/db was imported — which is why the
 * imports were dynamic and inside `before`. There is no file any more: with no
 * DATABASE_URL, lib/pg.ts runs PGlite in-process, so the whole dance collapses
 * into `ensureSchema()` and ordinary top-level imports.
 *
 * The assertions themselves are unchanged apart from `await`, which is the
 * point of running them: they are the same claims, re-proved on the new engine
 * rather than assumed to have survived the translation.
 */

/* A DATABASE_URL in the shell would otherwise point this suite at the real
   Supabase database — and this file creates organizations and deletes
   materials. Cleared before anything can open a connection. */
delete process.env.DATABASE_URL;

const db = await import("./db");
const store = await import("./auth/store");
const { ensureSchema } = await import("./schema");
const { all, closeDb } = await import("./pg");

/** Two organizations, each with a teacher, a kit and a lesson. */
interface Tenant {
  scope: import("./db").Scope;
  orgId: number;
  userId: number;
  materialId: number;
  kitId: number;
  studentId: number;
}

async function makeTenant(name: string, i: number): Promise<Tenant> {
  const user = await store.createUser({
    email: `t${i}@example.test`,
    passwordHash: "scrypt$1$1$1$c2FsdA==$aGFzaA==",
    name: `Teacher ${i}`,
  });
  const org = await store.createOrganization({ name, kind: "school" });
  await store.createMembership({
    userId: user.id,
    orgId: org.id,
    orgRole: "owner",
    status: "active",
  });

  /* canSeeAllPrivate: true — these are owners. Testing with the MOST privileged
     role in each org is deliberate: if the strongest role in org A still cannot
     reach org B, no weaker one can either. A test using two plain teachers
     would pass even if org scoping were missing entirely, because the
     visibility filter alone would hide the rows. */
  const scope = { orgId: org.id, userId: user.id, canSeeAllPrivate: true };

  const kitId = (await db.listStyleKits(scope))[0].id;
  const materialId = await db.createMaterial(
    scope,
    `${name} lesson`,
    kitId,
    { title: `${name} lesson` } as never,
    "founder",
    "debate"
  );
  const studentId = await db.createStudent(scope, {
    name: `Student ${i}`,
    cohort: "",
    subject: "debate",
    gradeBand: "",
    note: "",
  });

  return { scope, orgId: org.id, userId: user.id, materialId, kitId, studentId };
}

let a: Tenant;
let b: Tenant;

describe("tenant isolation", () => {
  before(async () => {
    await ensureSchema();
    a = await makeTenant("Alpha Academy", 1);
    b = await makeTenant("Beta School", 2);
  });

  after(async () => {
    await closeDb();
  });

  test("ids come back as numbers, not strings", async () => {
    /* The one failure the port could have introduced that every other test
       here would have missed. `pg` decodes bigint as a STRING by default and
       PGlite decodes it as a number, so without the type parser in lib/pg.ts
       this suite would pass on PGlite while production served `"13"` as every
       material id — and `id === 13` would silently be false. */
    assert.equal(typeof a.materialId, "number");
    const material = await db.getMaterial(a.scope, a.materialId);
    assert.equal(typeof material!.id, "number");
    assert.equal(typeof material!.org_id, "number");
    assert.equal(typeof (await db.countForksOf(a.scope, a.materialId)), "number");
  });

  test("each organization sees only its own materials", async () => {
    const seenByA = (await db.listMaterials(a.scope)).map((m) => m.id);
    const seenByB = (await db.listMaterials(b.scope)).map((m) => m.id);

    assert.deepEqual(seenByA, [a.materialId]);
    assert.deepEqual(seenByB, [b.materialId]);
    assert.equal(
      seenByA.includes(b.materialId),
      false,
      "Alpha can see Beta's lesson in the library"
    );
  });

  test("addressing another organization's material by id returns nothing", async () => {
    // The 404-not-403 rule: to A, B's material does not exist.
    assert.equal(await db.getMaterial(a.scope, b.materialId), null);
    assert.equal(await db.getMaterial(b.scope, a.materialId), null);
    // ...while each can still read its own.
    assert.ok(await db.getMaterial(a.scope, a.materialId));
  });

  test("style kits, students and rounds are scoped too", async () => {
    assert.deepEqual(
      (await db.listStyleKits(a.scope)).map((k) => k.id),
      [a.kitId]
    );
    assert.equal(await db.getStyleKit(a.scope, b.kitId), null);
    assert.deepEqual(
      (await db.listStudents(a.scope)).map((s) => s.id),
      [a.studentId]
    );
    assert.equal(await db.getStudent(a.scope, b.studentId), null);
    assert.deepEqual(await db.listRounds(a.scope), []);
  });

  test("promoting a default kit does not touch another organization", async () => {
    /* The regression this names really existed: setDefaultStyleKit ran
       `UPDATE style_kits SET is_default = 0` with no WHERE at all, so one
       school promoting a kit cleared the flag for every school on the
       platform and the next teacher anywhere found no kit selected. */
    const extra = await db.createStyleKit(a.scope, "Second kit", {} as never, []);
    await db.setDefaultStyleKit(a.scope, extra);

    const bDefaults = (await db.listStyleKits(b.scope)).filter(
      (k) => k.is_default === 1
    );
    assert.equal(bDefaults.length, 1, "Beta lost its default kit");
    assert.equal(bDefaults[0].id, b.kitId);
  });

  test("cross-organization writes change nothing", async () => {
    /* Reads being scoped is only half of it. Every UPDATE that carries an id
       must also carry the organization, or a caller who knows a number can
       edit a row they cannot see — which is a worse bug than reading it,
       because it leaves no trace on their own screen. */
    await db.updateStyleKit(a.scope, b.kitId, "Renamed by Alpha", {} as never, []);
    const bKit = await db.getStyleKit(b.scope, b.kitId);
    assert.notEqual(bKit!.name, "Renamed by Alpha", "Alpha renamed Beta's kit");

    await db.setStudentArchived(a.scope, b.studentId, true);
    const bStudent = await db.getStudent(b.scope, b.studentId);
    assert.equal(bStudent!.archived, 0, "Alpha archived Beta's student");

    await db.setMaterialVisibility(a.scope, b.materialId, "private");
    const bMaterial = await db.getMaterial(b.scope, b.materialId);
    assert.equal(
      bMaterial!.visibility,
      "organization",
      "Alpha changed who can see Beta's lesson"
    );
  });

  test("deleting across organizations destroys nothing", async () => {
    await db.deleteMaterial(a.scope, b.materialId);
    assert.ok(
      await db.getMaterial(b.scope, b.materialId),
      "Alpha deleted Beta's lesson"
    );
  });

  test("a version cannot be restored into another organization's material", async () => {
    // A version is addressed by its OWN id, so it is reachable without naming
    // its material — the one row shape where the join is the whole defence.
    const versionId = await db.snapshotMaterial(b.materialId, "test", "founder");
    assert.ok(versionId);
    assert.equal(await db.getVersion(a.scope, versionId!), null);
    assert.equal(await db.restoreVersion(a.scope, versionId!, "founder"), null);
    assert.ok(await db.getVersion(b.scope, versionId!));
  });

  test("a private material is hidden from colleagues but not from its author", async () => {
    const authorScope = { ...a.scope, canSeeAllPrivate: false };
    const colleague = {
      orgId: a.orgId,
      userId: a.userId + 999, // same org, a different person
      canSeeAllPrivate: false,
    };
    await db.setMaterialVisibility(a.scope, a.materialId, "private");

    assert.equal(await db.getMaterial(colleague, a.materialId), null);
    assert.ok(await db.getMaterial(authorScope, a.materialId));
    // A coach or admin in the same org reviews what they cannot otherwise see.
    assert.ok(
      await db.getMaterial({ ...colleague, canSeeAllPrivate: true }, a.materialId)
    );
  });

  test("every content table refuses to hold an unowned row", async () => {
    /* This used to be the substitute for a constraint SQLite could not express:
       ALTER TABLE could add NOT NULL or a REFERENCES clause but not both, so
       the migrated database had a nullable org_id and a startup assertion stood
       in for it. Postgres has the real constraint now (proved in
       lib/schema.test.ts), so what is worth checking HERE is the other half —
       that after a suite's worth of ordinary writes, nothing has landed
       unowned. */
    for (const table of ["materials", "style_kits", "students", "rounds"]) {
      const rows = await all<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${table} WHERE org_id IS NULL`
      );
      assert.equal(rows[0].n, 0, `${table} has rows with no organization`);
    }
  });
});
