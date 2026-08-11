import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * THE TEST PHASE 2 EXISTS FOR.
 *
 * Everything else in the migration — the org_id columns, the Scope parameter,
 * the guard changes — is a means to one end: two organizations on one
 * installation must not be able to see or touch each other's work. That claim
 * is either true or it is a security incident, and "tsc passes" does not
 * establish it. This does.
 *
 * It runs against the REAL query layer, not a mock. A mocked lib/db would be
 * testing the assertion that the mock is right, which is the thing in doubt.
 * The database is a throwaway file in the OS temp directory, pointed at by
 * TAKENTEACH_DB before lib/db is imported — the module opens its connection on
 * first use, so the import has to come after the variable is set, which is why
 * it is a dynamic import inside `before` rather than a top-level one.
 */

const TMP = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "tt-tenancy-")),
  "test.db"
);

type Db = typeof import("./db");
type Store = typeof import("./auth/store");
let db: Db;
let store: Store;

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
  const user = store.createUser({
    email: `t${i}@example.test`,
    passwordHash: "scrypt$1$1$1$c2FsdA==$aGFzaA==",
    name: `Teacher ${i}`,
  });
  const org = store.createOrganization({ name, kind: "school" });
  store.createMembership({
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

  const kitId = db.listStyleKits(scope)[0].id;
  const materialId = db.createMaterial(
    scope,
    `${name} lesson`,
    kitId,
    { title: `${name} lesson` } as never,
    "founder",
    "debate"
  );
  const studentId = db.createStudent(scope, {
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
    process.env.TAKENTEACH_DB = TMP;
    db = await import("./db");
    store = await import("./auth/store");
    a = await makeTenant("Alpha Academy", 1);
    b = await makeTenant("Beta School", 2);
  });

  after(() => {
    try {
      fs.rmSync(path.dirname(TMP), { recursive: true, force: true });
    } catch {
      /* a leftover temp directory is not worth failing a suite over */
    }
  });

  test("each organization sees only its own materials", () => {
    const seenByA = db.listMaterials(a.scope).map((m) => m.id);
    const seenByB = db.listMaterials(b.scope).map((m) => m.id);

    assert.deepEqual(seenByA, [a.materialId]);
    assert.deepEqual(seenByB, [b.materialId]);
    assert.equal(
      seenByA.includes(b.materialId),
      false,
      "Alpha can see Beta's lesson in the library"
    );
  });

  test("addressing another organization's material by id returns nothing", () => {
    // The 404-not-403 rule: to A, B's material does not exist.
    assert.equal(db.getMaterial(a.scope, b.materialId), null);
    assert.equal(db.getMaterial(b.scope, a.materialId), null);
    // ...while each can still read its own.
    assert.ok(db.getMaterial(a.scope, a.materialId));
  });

  test("style kits, students and rounds are scoped too", () => {
    assert.deepEqual(
      db.listStyleKits(a.scope).map((k) => k.id),
      [a.kitId]
    );
    assert.equal(db.getStyleKit(a.scope, b.kitId), null);
    assert.deepEqual(
      db.listStudents(a.scope).map((s) => s.id),
      [a.studentId]
    );
    assert.equal(db.getStudent(a.scope, b.studentId), null);
    assert.deepEqual(db.listRounds(a.scope), []);
  });

  test("promoting a default kit does not touch another organization", () => {
    /* The regression this names really existed: setDefaultStyleKit ran
       `UPDATE style_kits SET is_default = 0` with no WHERE at all, so one
       school promoting a kit cleared the flag for every school on the
       platform and the next teacher anywhere found no kit selected. */
    const extra = db.createStyleKit(a.scope, "Second kit", {} as never, []);
    db.setDefaultStyleKit(a.scope, extra);

    const bDefaults = db.listStyleKits(b.scope).filter((k) => k.is_default === 1);
    assert.equal(bDefaults.length, 1, "Beta lost its default kit");
    assert.equal(bDefaults[0].id, b.kitId);
  });

  test("deleting across organizations destroys nothing", () => {
    db.deleteMaterial(a.scope, b.materialId);
    assert.ok(
      db.getMaterial(b.scope, b.materialId),
      "Alpha deleted Beta's lesson"
    );
  });

  test("a version cannot be restored into another organization's material", () => {
    // A version is addressed by its OWN id, so it is reachable without naming
    // its material — the one row shape where the join is the whole defence.
    const versionId = db.snapshotMaterial(b.materialId, "test", "founder");
    assert.ok(versionId);
    assert.equal(db.getVersion(a.scope, versionId!), null);
    assert.equal(db.restoreVersion(a.scope, versionId!, "founder"), null);
    assert.ok(db.getVersion(b.scope, versionId!));
  });

  test("a private material is hidden from colleagues but not from its author", () => {
    const authorScope = { ...a.scope, canSeeAllPrivate: false };
    const colleague = {
      orgId: a.orgId,
      userId: a.userId + 999, // same org, a different person
      canSeeAllPrivate: false,
    };
    db.setMaterialVisibility(a.scope, a.materialId, "private");

    assert.equal(db.getMaterial(colleague, a.materialId), null);
    assert.ok(db.getMaterial(authorScope, a.materialId));
    // A coach or admin in the same org reviews what they cannot otherwise see.
    assert.ok(db.getMaterial({ ...colleague, canSeeAllPrivate: true }, a.materialId));
  });

  test("every content table refuses to hold an unowned row", () => {
    const raw = db.getDb();
    for (const table of ["materials", "style_kits", "students", "rounds"]) {
      const { n } = raw
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE org_id IS NULL`)
        .get() as { n: number };
      assert.equal(n, 0, `${table} has rows with no organization`);
    }
  });
});
