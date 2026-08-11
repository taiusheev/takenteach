/**
 * Back up the whole library to a single file.
 *
 * Everything the platform knows — every lesson pack, the design systems, the
 * student observation log, judged rounds, version history — lives in one
 * SQLite file at data/ascent.db. Running locally is the right call for a single
 * user, but it means that file is the only copy in existence.
 *
 * Uses SQLite's own `VACUUM INTO`, not a file copy. The database runs in WAL
 * mode, so the bytes of `ascent.db` alone are NOT a complete snapshot while the
 * server is running — recent writes may still be sitting in the -wal sidecar. A
 * plain copy can therefore silently lose the last few edits, or worse, produce
 * a file that opens fine and is subtly behind. `VACUUM INTO` writes a
 * consistent, fully-checkpointed copy while the site keeps running.
 *
 *   node scripts/backup.mjs                  → backups/ascent-YYYY-MM-DD.db
 *   node scripts/backup.mjs "D:/Dropbox"     → writes there instead
 */

import Database from "better-sqlite3";
import { mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = join(root, "data", "ascent.db");
if (!existsSync(source)) {
  console.error(`No database at ${source} — nothing to back up.`);
  process.exit(1);
}

const dir = resolve(process.argv[2] ?? join(root, "backups"));
mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
const dest = join(dir, `ascent-${stamp}.db`);

const db = new Database(source, { readonly: true });
try {
  // Single-quoted SQL literal; the path is ours, but escape quotes anyway.
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
} finally {
  db.close();
}

const mb = (statSync(dest).size / 1e6).toFixed(1);
console.log(`Backed up to ${dest} (${mb} MB)`);

// Keep the last 20 so this can run on a schedule without filling the disk.
const kept = readdirSync(dir)
  .filter((f) => /^ascent-.*\.db$/.test(f))
  .sort()
  .reverse();
for (const old of kept.slice(20)) {
  unlinkSync(join(dir, old));
  console.log(`Removed old backup ${old}`);
}
