/**
 * BACK UP THE LIVE DATABASE — whichever one that is.
 *
 *   npm run db:backup                 → backups/takenteach-YYYY-MM-DD.json
 *   npm run db:backup -- "D:/Dropbox" → writes there instead
 *
 * ── WHY THIS EXISTS ALONGSIDE scripts/backup.mjs ─────────────────────────
 * That one snapshots `data/ascent.db`, and that file has not been the live
 * database since the Postgres port. It still runs, still reports success, and
 * still produces a file containing no work done since the migration — which is
 * the worst kind of backup, because it looks like insurance.
 *
 * This reads through lib/pg.ts, so it backs up whatever `DATABASE_URL` /
 * `PGLITE_PATH` actually point at: the local PGlite directory today, a hosted
 * Postgres the moment one is configured, with no change here.
 *
 * ── WHY JSON AND NOT pg_dump ─────────────────────────────────────────────
 * pg_dump is the right tool and it is not installed on this machine, which
 * makes it the wrong tool today. Every table here is small — the whole library
 * is single-digit megabytes — and a portable, readable dump of rows is enough
 * to rebuild from, restorable by anything that can INSERT.
 *
 * ── WHAT IS DELIBERATELY NOT IN IT ───────────────────────────────────────
 * `sessions` and `password_resets`. Both hold live credentials, and carrying an
 * unspent reset token into a backup file is a risk with no matching benefit —
 * the same rule scripts/db-import.mjs already follows. Everyone signs in again
 * after a restore, which is correct behaviour for a database that has moved.
 */

import fs from "node:fs";
import path from "node:path";
import "./test-resolver.mjs";

const { all, closeDb } = await import("../lib/pg.ts");

/** Credentials, not content. See the note above. */
const SKIP = new Set(["sessions", "password_resets"]);

const outDir = process.argv[2] ?? path.join(process.cwd(), "backups");
fs.mkdirSync(outDir, { recursive: true });

const where = process.env.DATABASE_URL
  ? `Postgres (${new URL(process.env.DATABASE_URL).host})`
  : `PGlite (${process.env.PGLITE_PATH || "in memory"})`;
console.log(`\nbacking up: ${where}`);

const tables = (
  await all(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  )
).map((r) => String(r.table_name));

const dump = { takenteach: 1, at: new Date().toISOString(), source: where, tables: {} };
let total = 0;
for (const t of tables) {
  if (SKIP.has(t)) {
    console.log(`  ${t.padEnd(20)} skipped — holds live credentials`);
    continue;
  }
  const rows = await all(`SELECT * FROM ${t}`);
  dump.tables[t] = rows;
  total += rows.length;
  console.log(`  ${t.padEnd(20)} ${String(rows.length).padStart(5)} rows`);
}

/* Dated, not timestamped, and overwritten within a day on purpose: the failure
   this guards against is losing the machine, not losing an hour. A directory
   with ninety files in it is one nobody prunes and nobody reads. */
const file = path.join(outDir, `takenteach-${dump.at.slice(0, 10)}.json`);
fs.writeFileSync(file, JSON.stringify(dump, null, 1));

const mb = (fs.statSync(file).size / 1024 / 1024).toFixed(1);
console.log(`\n${total} rows across ${Object.keys(dump.tables).length} tables → ${file} (${mb} MB)`);
console.log("Keep a copy somewhere that is not this machine — that is the whole point.\n");

await closeDb();
