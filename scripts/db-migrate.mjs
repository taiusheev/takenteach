/**
 * Apply the schema to whatever DATABASE_URL points at.
 *
 *   npm run db:migrate
 *
 * Idempotent — every statement is IF NOT EXISTS — so it is safe to re-run and
 * safe to wire into a deploy. It is deliberately NOT run by the application on
 * startup: a serverless app that applied DDL on every cold start would pay a
 * round trip for a no-op forever, and schema changes would race between
 * instances.
 *
 * With no DATABASE_URL it targets an in-process PGlite database, which is only
 * useful for proving the script runs — the tables vanish with the process.
 */
import { ensureSchema } from "@/lib/schema";
import { all, closeDb } from "@/lib/pg";

const target = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL).host
  : "an in-memory PGlite database (no DATABASE_URL set)";

console.log(`Applying schema to ${target} …`);
await ensureSchema();

const tables = await all(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name`
);
console.log(`✓ ${tables.length} tables present:`);
console.log(tables.map((t) => `    ${t.table_name}`).join("\n"));

await closeDb();
