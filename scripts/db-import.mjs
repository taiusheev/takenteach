/**
 * Copy the SQLite library into Postgres, ids intact.
 *
 *   node --import ./scripts/test-resolver.mjs scripts/db-import.mjs
 *   node --import ./scripts/test-resolver.mjs scripts/db-import.mjs --from data/ascent.db
 *   node --import ./scripts/test-resolver.mjs scripts/db-import.mjs --force
 *
 * Run `npm run db:migrate` first — this script fills tables, it does not create
 * them.
 *
 * ── WHY IDS ARE PRESERVED ────────────────────────────────────────────────
 * Not for tidiness. `materials.forked_from`, `rounds.ballot_id`,
 * `corrections.material_id` and every child table's parent key are raw numbers
 * pointing at other rows, and a lesson's *content* embeds ids too. Letting
 * Postgres assign fresh ones would silently re-point fork lineage and ballots
 * at whatever row happened to land on that number — a corruption with no error
 * message and no way back once the SQLite file is gone.
 *
 * `id` is `GENERATED ALWAYS AS IDENTITY`, which REFUSES an explicit value
 * unless the insert says `OVERRIDING SYSTEM VALUE`. That is deliberate on
 * Postgres's part and exactly right: supplying your own id is a thing you
 * should have to say out loud. Having said it, every sequence then has to be
 * fast-forwarded past the ids just written, or the next lesson a teacher
 * creates collides with lesson 1.
 *
 * ── ORDER IS THE FOREIGN KEYS ────────────────────────────────────────────
 * The constraints are not deferrable, so tables go in dependency order:
 * organizations before the users' memberships, materials before anything that
 * references a material. The whole import is one transaction, so a violation
 * anywhere leaves the target exactly as it was rather than half-populated.
 *
 * ── WHAT IS DELIBERATELY NOT COPIED ──────────────────────────────────────
 * `sessions` and `password_resets`. Both are live credentials. A session is
 * bound to a cookie in one browser against localhost and means nothing on the
 * deployed domain, and copying an unspent reset token would carry a working
 * password-reset link into production for no benefit. Signing out is the
 * correct behaviour for a database that has moved.
 */

import fs from "node:fs";
import Database from "better-sqlite3";
import { one, run, script, transaction, closeDb } from "@/lib/pg";

const args = process.argv.slice(2);
const force = args.includes("--force");
const fromArg = args.indexOf("--from");
const SOURCE = fromArg >= 0 ? args[fromArg + 1] : "data/ascent.db";

/**
 * Every table to copy, in dependency order, with the columns to carry.
 *
 * Columns are listed explicitly rather than taken from `SELECT *`: the SQLite
 * table picked up its later columns via ALTER TABLE, so its column ORDER is not
 * the schema's, and a positional copy would quietly write `subject` into
 * `forked_from` on any table where the two drifted.
 */
const TABLES = [
  ["organizations", ["id", "slug", "name", "kind", "location", "size_band", "plan", "created_at"]],
  ["users", ["id", "email", "password_hash", "name", "platform_role", "must_change_password", "email_verified_at", "created_at", "last_login_at"]],
  ["memberships", ["id", "user_id", "org_id", "org_role", "status", "created_at", "approved_at", "approved_by"]],
  ["departments", ["id", "org_id", "name", "created_at"]],
  ["style_kits", ["id", "org_id", "name", "config", "locked_fields", "is_default"]],
  ["materials", ["id", "org_id", "created_by", "visibility", "department_id", "student_level", "type", "subject", "title", "status", "style_kit_id", "content", "created_by_role", "forked_from", "inherited_outline", "created_at", "updated_at"]],
  ["activity_log", ["id", "material_id", "role", "action", "detail", "created_at"]],
  ["checklist_runs", ["id", "material_id", "passed", "results", "created_at"]],
  ["material_versions", ["id", "material_id", "title", "content", "label", "role", "created_at"]],
  ["students", ["id", "org_id", "name", "cohort", "subject", "grade_band", "note", "archived", "created_at"]],
  ["observations", ["id", "student_id", "skill", "rating", "note", "context", "observed_on", "role", "created_at"]],
  ["rounds", ["id", "org_id", "ballot_id", "label", "resolution", "pro_team", "con_team", "room", "held_on", "created_by_role", "pro_student_id", "con_student_id", "created_at"]],
  ["ballot_submissions", ["id", "round_id", "judge_name", "role", "winner", "scores", "speaker_points", "rfd", "feedback", "seconds_taken", "created_at"]],
  ["corrections", ["id", "org_id", "material_id", "action", "role", "subject", "type", "tags", "note", "created_at"]],
];

function line(s = "") {
  process.stdout.write(`${s}\n`);
}

if (!fs.existsSync(SOURCE)) {
  line(`No SQLite database at ${SOURCE}. Pass --from <path>.`);
  process.exit(1);
}

const target = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL).host
  : `PGlite at ${process.env.PGLITE_PATH ?? "memory:// (nothing will persist)"}`;

line(`Importing ${SOURCE}`);
line(`        → ${target}`);
line();

const sqlite = new Database(SOURCE, { readonly: true });

/* Refuse to run twice. Every row here carries an explicit id, so a second run
   would not duplicate the library — it would fail halfway through on a primary
   key and leave the transaction rolled back. That is a safe failure, but a
   confusing one, so it is named up front. */
const existing = await one("SELECT COUNT(*) AS n FROM organizations");
if (existing.n > 0 && !force) {
  line(
    `The target already holds ${existing.n} organization(s). Refusing to import ` +
      `into a database that is not empty — pass --force if that is really what ` +
      `you mean.`
  );
  await closeDb();
  process.exit(1);
}

const counts = [];

await transaction(async () => {
  for (const [table, cols] of TABLES) {
    const rows = sqlite.prepare(`SELECT ${cols.join(", ")} FROM ${table}`).all();
    for (const row of rows) {
      await run(
        `INSERT INTO ${table} (${cols.join(", ")})
         OVERRIDING SYSTEM VALUE
         VALUES (${cols.map(() => "?").join(", ")})`,
        cols.map((c) => row[c])
      );
    }
    counts.push([table, rows.length]);
    line(`  ${String(rows.length).padStart(4)}  ${table}`);
  }

  /* Fast-forward every identity sequence past what was just written. Without
     this the next INSERT starts at 1 and collides with row 1 immediately —
     the classic way an id-preserving import breaks the application ten minutes
     after it appears to have worked. */
  for (const [table] of TABLES) {
    await script(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'),
                     (SELECT COALESCE(MAX(id), 0) + 1 FROM ${table}),
                     false)`
    );
  }
});

sqlite.close();

/* Verified by reading it back, not by trusting the loop above: the point of an
   import is the state of the target, and counting what was sent is a different
   claim from counting what arrived. */
line();
line("Verifying …");
let bad = 0;
for (const [table, expected] of counts) {
  const got = await one(`SELECT COUNT(*) AS n FROM ${table}`);
  const ok = got.n === expected;
  if (!ok) bad++;
  line(`  ${ok ? "✓" : "✗"} ${table.padEnd(20)} ${got.n} / ${expected}`);
}

/* The sequences matter as much as the rows, and are the thing nobody checks
   until a teacher's next save fails with a duplicate key.

   Verified by actually drawing the next value and putting it back, rather than
   by reading `pg_sequences.last_value` — which reports NULL until a sequence
   has been read from at least once, so the obvious catalog query says nothing
   at all about a freshly setval'd sequence. `nextval` then `setval(..., false)`
   leaves the sequence exactly where it was and proves what the next INSERT
   will really get. */
line();
for (const [table] of TABLES) {
  const s = await one(
    `SELECT nextval(pg_get_serial_sequence(?, 'id')) AS next,
            (SELECT COALESCE(MAX(id), 0) FROM ${table}) AS max_id`,
    [table]
  );
  await run(`SELECT setval(pg_get_serial_sequence(?, 'id'), ?, false)`, [
    table,
    s.next,
  ]);
  const ok = Number(s.next) > Number(s.max_id);
  if (!ok) bad++;
  line(
    `  ${ok ? "✓" : "✗"} ${`${table}.id`.padEnd(24)} next ${s.next} > max ${s.max_id}`
  );
}

await closeDb();

if (bad > 0) {
  line();
  line(`${bad} table(s) did not match. The transaction committed — inspect before using this database.`);
  process.exit(1);
}
line();
line("Import complete.");
