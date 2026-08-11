import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { all, one, insert, run, closeDb } from "./pg";
import { ensureSchema } from "./schema";

/**
 * Proves the ported DDL is valid Postgres and still enforces what the SQLite
 * version enforced — against PGlite, so it runs offline.
 *
 * A schema that merely parses is not the bar. The interesting assertions are
 * the constraints: the NOT NULL on org_id that SQLite could not express, the
 * ON DELETE rules that decide whether a lesson survives the teacher who left,
 * and the UNIQUE that stops one person joining an organization twice.
 */
describe("the Postgres schema", () => {
  after(async () => {
    await closeDb();
  });

  test("applies, and applies twice without complaint", async () => {
    await ensureSchema();
    // Idempotence is not decoration: db:migrate will be run repeatedly, and on
    // every deploy if it is ever wired into one.
    await ensureSchema();
    const tables = await all<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name`
    );
    const names = tables.map((t) => t.table_name);
    for (const expected of [
      "organizations", "users", "memberships", "sessions", "password_resets",
      "departments", "style_kits", "materials", "activity_log", "checklist_runs",
      "students", "rounds", "ballot_submissions", "material_versions",
      "observations", "corrections",
    ]) {
      assert.ok(names.includes(expected), `missing table: ${expected}`);
    }
  });

  test("timestamps default to SQLite's exact format", async () => {
    // The whole reason these columns are text — the application compares them
    // as strings in ~26 places. A different format would sort differently and
    // sessions would expire at the wrong time, silently.
    const orgId = await insert(
      "INSERT INTO organizations (slug, name, kind) VALUES (?, ?, ?)",
      ["fmt", "Format Test", "school"]
    );
    const row = await one<{ created_at: string }>(
      "SELECT created_at FROM organizations WHERE id = ?",
      [orgId]
    );
    assert.match(
      row!.created_at,
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
      `created_at was ${row!.created_at}`
    );
  });

  test("org_id is NOT NULL — the constraint SQLite could not add", async () => {
    const orgId = await insert(
      "INSERT INTO organizations (slug, name, kind) VALUES (?, ?, ?)",
      ["nn", "NotNull School", "school"]
    );
    const kitId = await insert(
      "INSERT INTO style_kits (org_id, name, config) VALUES (?, ?, ?)",
      [orgId, "kit", "{}"]
    );
    await assert.rejects(
      insert(
        `INSERT INTO materials (org_id, style_kit_id, content, created_by_role)
         VALUES (?, ?, ?, ?)`,
        [null, kitId, "{}", "founder"]
      ),
      /null value|not-null/i,
      "a material with no organization was accepted"
    );
  });

  test("a material cannot belong to an organization that does not exist", async () => {
    await assert.rejects(
      insert(
        `INSERT INTO materials (org_id, style_kit_id, content, created_by_role)
         VALUES (?, ?, ?, ?)`,
        [999999, 1, "{}", "founder"]
      ),
      /foreign key/i
    );
  });

  test("a lesson outlives the teacher who created it", async () => {
    const orgId = await insert(
      "INSERT INTO organizations (slug, name, kind) VALUES (?, ?, ?)",
      ["outlive", "Outlive School", "school"]
    );
    const userId = await insert(
      "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
      ["leaver@example.test", "x", "Leaver"]
    );
    const kitId = await insert(
      "INSERT INTO style_kits (org_id, name, config) VALUES (?, ?, ?)",
      [orgId, "kit", "{}"]
    );
    const matId = await insert(
      `INSERT INTO materials (org_id, created_by, style_kit_id, content, created_by_role)
       VALUES (?, ?, ?, ?, ?)`,
      [orgId, userId, kitId, "{}", "teacher"]
    );

    await run("DELETE FROM users WHERE id = ?", [userId]);

    const mat = await one<{ created_by: number | null }>(
      "SELECT created_by FROM materials WHERE id = ?",
      [matId]
    );
    assert.ok(mat, "deleting a teacher deleted their lesson");
    assert.equal(mat!.created_by, null, "created_by should drop to null, not cascade");
  });

  test("one person cannot join the same organization twice", async () => {
    const orgId = await insert(
      "INSERT INTO organizations (slug, name, kind) VALUES (?, ?, ?)",
      ["dup", "Dup School", "school"]
    );
    const userId = await insert(
      "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
      ["dup@example.test", "x", "Dup"]
    );
    await insert(
      "INSERT INTO memberships (user_id, org_id, org_role, status) VALUES (?, ?, ?, ?)",
      [userId, orgId, "teacher", "active"]
    );
    await assert.rejects(
      insert(
        "INSERT INTO memberships (user_id, org_id, org_role, status) VALUES (?, ?, ?, ?)",
        [userId, orgId, "owner", "active"]
      ),
      /duplicate key|unique/i
    );
  });

  test("the JSON reach-in used by listSeriesSiblings works on a text column", async () => {
    // The one query that looks inside the content JSON. SQLite did this with
    // json_extract; Postgres needs a cast, and this is the proof it parses and
    // matches rather than silently returning nothing.
    const orgId = await insert(
      "INSERT INTO organizations (slug, name, kind) VALUES (?, ?, ?)",
      ["json", "Json School", "school"]
    );
    const kitId = await insert(
      "INSERT INTO style_kits (org_id, name, config) VALUES (?, ?, ?)",
      [orgId, "kit", "{}"]
    );
    await insert(
      `INSERT INTO materials (org_id, style_kit_id, content, created_by_role, type)
       VALUES (?, ?, ?, ?, 'lesson-pack')`,
      [orgId, kitId, JSON.stringify({ series: "  Novice Debate  " }), "founder"]
    );
    const rows = await all(
      `SELECT id FROM materials
        WHERE org_id = ?
          AND lower(trim(COALESCE(content::jsonb ->> 'series', ''))) = ?`,
      [orgId, "novice debate"]
    );
    assert.equal(rows.length, 1);
  });
});
