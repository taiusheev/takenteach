/**
 * RESTORE A BACKUP INTO WHATEVER DATABASE IS CONFIGURED.
 *
 *   npm run db:restore -- backups/takenteach-2026-08-22.json
 *   npm run db:restore -- <file> --force     (overwrite a non-empty target)
 *
 * ── WHY THIS EXISTS AND db:import DOES NOT COVER IT ──────────────────────
 * `db:import` reads `data/ascent.db` — the SQLite file as it stood at the
 * moment of the Postgres port. It is frozen; nothing has written to it since.
 * Running it to populate a new database would restore the library as it was
 * months ago, report success, and look right: nine materials instead of
 * sixteen, and no way to notice except by counting.
 *
 * This restores from `npm run db:backup`, which reads the LIVE database. That
 * is the pair that actually round-trips.
 *
 * ── WHAT MAKES IT SAFE ───────────────────────────────────────────────────
 * It refuses a non-empty target unless forced, inserts in dependency order so
 * foreign keys hold, fast-forwards every identity sequence past the ids it
 * wrote (or the next INSERT collides with a restored row), and verifies every
 * table by reading the count back rather than trusting the writes.
 */

import fs from "node:fs";
import "./test-resolver.mjs";

const { all, run, closeDb } = await import("../lib/pg.ts");

const file = process.argv.find((a) => a.endsWith(".json"));
const force = process.argv.includes("--force");
if (!file || !fs.existsSync(file)) {
  console.error("\nUsage: npm run db:restore -- backups/takenteach-YYYY-MM-DD.json\n");
  process.exit(1);
}

/**
 * Parents before children. Postgres enforces the foreign keys, so a wrong
 * order here is a loud failure rather than a silent one — but a loud failure
 * halfway through a restore still leaves a half-populated database.
 */
const ORDER = [
  "organizations",
  "users",
  "memberships",
  "departments",
  "style_kits",
  "materials",
  "activity_log",
  "checklist_runs",
  "material_versions",
  "students",
  "observations",
  "rounds",
  "ballot_submissions",
  "corrections",
  "ai_usage",
  "teaching_log",
];

const dump = JSON.parse(fs.readFileSync(file, "utf8"));
if (!dump.tables) {
  console.error("That file is not a takenteach backup (no `tables`).");
  process.exit(1);
}

const where = process.env.DATABASE_URL
  ? `Postgres (${new URL(process.env.DATABASE_URL).host})`
  : `PGlite (${process.env.PGLITE_PATH || "in memory"})`;
console.log(`\nrestoring ${file}`);
console.log(`  taken from : ${dump.source} at ${dump.at}`);
console.log(`  writing to : ${where}\n`);

/* The guard db:import has, for the same reason: restoring over a live database
   is the one mistake here that cannot be undone by running it again. */
if (!force) {
  for (const t of ORDER) {
    const n = Number((await all(`SELECT COUNT(*) AS n FROM ${t}`))[0].n);
    if (n > 0) {
      console.error(
        `Refusing: ${t} already has ${n} rows. Pass --force to overwrite, ` +
          `having first checked that is what you mean.`
      );
      await closeDb();
      process.exit(1);
    }
  }
}

let written = 0;
for (const table of ORDER) {
  const rows = dump.tables[table] ?? [];
  if (force) await run(`DELETE FROM ${table}`);
  if (rows.length === 0) {
    console.log(`  ${table.padEnd(20)}     0`);
    continue;
  }
  const cols = Object.keys(rows[0]);
  const list = cols.map((c) => `"${c}"`).join(", ");
  const holes = cols.map((_, i) => `$${i + 1}`).join(", ");
  /* OVERRIDING SYSTEM VALUE, because every id is `GENERATED ALWAYS AS
     IDENTITY` and a restore has to keep the ids it was given — every foreign
     key in the dump points at them. */
  const sql = `INSERT INTO ${table} (${list}) OVERRIDING SYSTEM VALUE VALUES (${holes})`;
  for (const r of rows) await run(sql, cols.map((c) => r[c]));
  written += rows.length;
  console.log(`  ${table.padEnd(20)} ${String(rows.length).padStart(5)}`);
}

/* Fast-forward the identity sequences. Without this the next INSERT starts at
   1 and collides with a restored row — which surfaces as a duplicate-key error
   on the first thing anyone creates, long after the restore looked fine. */
console.log("\nresetting identity sequences…");
for (const table of ORDER) {
  const seq = (
    await all(`SELECT pg_get_serial_sequence('${table}', 'id') AS s`)
  )[0]?.s;
  if (!seq) continue;
  const max = Number(
    (await all(`SELECT COALESCE(MAX(id), 0) AS m FROM ${table}`))[0].m
  );
  await run(`SELECT setval('${seq}', ${max + 1}, false)`);
}

console.log("\nverifying by reading back:");
let bad = 0;
for (const table of ORDER) {
  const want = (dump.tables[table] ?? []).length;
  const got = Number((await all(`SELECT COUNT(*) AS n FROM ${table}`))[0].n);
  if (want !== got) {
    console.log(`  ${table.padEnd(20)} MISMATCH — expected ${want}, found ${got}`);
    bad++;
  }
}
console.log(bad === 0 ? `  all ${written} rows accounted for` : `  ${bad} table(s) wrong`);

await closeDb();
process.exit(bad === 0 ? 0 : 1);
