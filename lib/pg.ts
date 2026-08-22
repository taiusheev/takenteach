import { AsyncLocalStorage } from "node:async_hooks";

/**
 * THE POSTGRES LAYER.
 *
 * Replaces better-sqlite3, which could not survive the move to Vercel: it is a
 * native module reading a local file, and a serverless instance has neither a
 * persistent disk nor a guarantee that the next request lands on the same
 * machine. See docs/DEPLOYMENT.md §3.
 *
 * Three decisions worth reading before touching anything here.
 *
 * ── 1. `?` PLACEHOLDERS ARE KEPT ─────────────────────────────────────────
 * Postgres wants `$1, $2`; the existing 130-odd queries are written with `?`.
 * Rewriting them all by hand would be a large, silent-failure-prone diff — a
 * mis-numbered `$3` is not a syntax error, it is a query that returns the
 * wrong rows. So the conversion happens here, once, in code that can be
 * tested. The SQL in lib/db.ts barely changes, which keeps the port reviewable.
 *
 * The converter skips `?` inside single-quoted string literals. It does NOT
 * understand Postgres's jsonb `?` / `?|` / `?&` operators — nothing here uses
 * them, and if something ever does it must use `jsonb_exists()` instead.
 *
 * ── 2. TRANSACTIONS TRAVEL IN AsyncLocalStorage ──────────────────────────
 * better-sqlite3's `db.transaction(fn)` worked because everything was
 * synchronous and shared one connection. Postgres transactions live on ONE
 * client, so every query inside a transaction must use that client — and the
 * inner calls are ordinary functions like `logActivity()` that know nothing
 * about transactions.
 *
 * Threading a client parameter through all of them would touch every
 * signature for the benefit of eight call sites. Instead `withTransaction`
 * puts the client in AsyncLocalStorage and `query` picks it up, so the inner
 * functions are unchanged and CANNOT accidentally run outside the transaction
 * they are nested in. lib/usage-meter.ts already uses ALS for the same reason,
 * so the pattern is not new here.
 *
 * ── 3. TWO DRIVERS, ONE INTERFACE ────────────────────────────────────────
 * Production is `pg` against Supabase. Tests are PGlite — Postgres compiled to
 * WASM, in-process — so `npm test` stays offline and needs no database server,
 * which the existing suite's whole design depends on. Both satisfy `Driver`
 * below, and lib/db.ts cannot tell them apart.
 *
 * ── 4. bigint COMES BACK AS A NUMBER ─────────────────────────────────────
 * The two drivers disagree out of the box and it is the most dangerous kind of
 * disagreement: `pg` decodes int8 as a STRING, PGlite as a number. Every id in
 * the schema is `bigint`, and so is every `COUNT(*)`.
 *
 * Left alone, the whole test suite would pass on PGlite while production
 * returned `"13"` for `material.id` — and nothing would throw. `id === 13` is
 * false, `forked_from === id` never matches, and `count > 0` compares a string
 * to a number. A test suite that cannot see the bug it is there to catch is
 * worse than no test suite, so the drivers are made to agree HERE rather than
 * at each of the places that would otherwise have to remember.
 */

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

/** The narrow seam both drivers implement. */
export interface Driver {
  /** One statement, with parameters. Goes through the extended (prepared) protocol. */
  exec(sql: string, params: unknown[]): Promise<QueryResult>;
  /**
   * A multi-statement script with NO parameters — the schema, essentially.
   *
   * Separate from `exec` because Postgres refuses more than one command in a
   * prepared statement ("cannot insert multiple commands into a prepared
   * statement", 42601). The simple-query protocol allows it and takes no
   * parameters, which is exactly the DDL case and exactly why it must not be
   * reachable with user input.
   */
  script(sql: string): Promise<void>;
  /** Acquire a dedicated connection for BEGIN/COMMIT. */
  begin<T>(fn: (c: Driver) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/* ── Placeholders ─────────────────────────────────────────────────────────── */

/**
 * `SELECT * FROM t WHERE a = ? AND b = ?` → `... a = $1 AND b = $2`.
 *
 * Exported for its own test: this function is load-bearing for every query in
 * the application, and "it looked right" is not an adequate standard for that.
 */
export function toPositional(sql: string): string {
  let out = "";
  let n = 0;
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      // '' inside a string is an escaped quote, not the end of one
      if (inString && sql[i + 1] === "'") {
        out += "''";
        i++;
        continue;
      }
      inString = !inString;
      out += ch;
      continue;
    }
    if (ch === "?" && !inString) {
      out += `$${++n}`;
      continue;
    }
    out += ch;
  }
  return out;
}

/* ── bigint ───────────────────────────────────────────────────────────────── */

/**
 * int8 → number, refusing to lie about it.
 *
 * `Number("9007199254740993")` returns 9007199254740992 without complaint, so a
 * plain `Number` parser would silently corrupt an id rather than fail. Nothing
 * here will reach 2^53 — that is nine quadrillion lessons — but the check costs
 * one comparison and turns an impossible-to-diagnose wrong answer into an
 * exception naming the value.
 */
function asSafeInteger(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) {
    throw new Error(
      `Postgres returned ${raw}, which is past JavaScript's safe integer range. ` +
        `lib/pg.ts decodes bigint as a number; this value needs BigInt handling.`
    );
  }
  return n;
}

/* ── Transaction context ──────────────────────────────────────────────────── */

const txStore = new AsyncLocalStorage<Driver>();

/* ── The pg driver ────────────────────────────────────────────────────────── */

type PgPool = import("pg").Pool;
type PgClient = import("pg").PoolClient;

function pgDriver(pool: PgPool): Driver {
  return {
    async exec(sql, params) {
      const r = await pool.query(toPositional(sql), params);
      return { rows: r.rows as Record<string, unknown>[], rowCount: r.rowCount ?? 0 };
    },
    async script(sql) {
      // No params, so node-postgres uses the simple-query protocol, which is
      // the one that accepts several statements at once.
      await pool.query(sql);
    },
    async begin(fn) {
      const client: PgClient = await pool.connect();
      const bound = clientDriver(client);
      try {
        await client.query("BEGIN");
        const out = await txStore.run(bound, () => fn(bound));
        await client.query("COMMIT");
        return out;
      } catch (err) {
        /* The rollback is itself wrapped: if the connection died mid-transaction
           the ROLLBACK also fails, and an exception thrown from here would
           replace the real error with a confusing one. */
        try {
          await client.query("ROLLBACK");
        } catch {
          /* connection is gone; releasing it below is all that is left to do */
        }
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

function clientDriver(client: PgClient): Driver {
  return {
    async exec(sql, params) {
      const r = await client.query(toPositional(sql), params);
      return { rows: r.rows as Record<string, unknown>[], rowCount: r.rowCount ?? 0 };
    },
    async script(sql) {
      await client.query(sql);
    },
    // Postgres has savepoints, but nothing here nests transactions. Joining the
    // outer one is the honest behaviour: the alternative is a savepoint nobody
    // asked for whose rollback semantics would surprise the caller.
    async begin(fn) {
      return fn(clientDriver(client));
    },
    async close() {
      /* the pool owns this connection */
    },
  };
}

/* ── Driver selection ─────────────────────────────────────────────────────── */

declare global {
  var __ttDriver: Driver | undefined;
}

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;

  if (!url) {
    /* No connection string: PGlite, in-process. This is the test path and a
       zero-setup local dev path.
       ── WHAT THE PRODUCTION GUARD IS ACTUALLY FOR ──────────────────────────
       A DEPLOYED app with no DATABASE_URL would start against an empty
       in-memory database and look exactly as though every lesson had vanished.
       That is the disaster worth refusing to boot over.
       It is NOT the same thing as running the production build on your own
       machine against a PGlite DIRECTORY, which is what docs/RUNNING.md tells
       people to do and what `scripts\ascent.bat` runs — a real, persistent
       database that happens to live in a folder. The guard did not distinguish
       them, so the documented "leave it running all day" launcher could not
       start at all after the Postgres port: `npm start` threw on the first
       query every time.
       So the test is now the one that matches the danger. An explicit
       PGLITE_PATH pointing at a real directory is a deliberate choice of a
       persistent local store and is allowed; `memory://` (or nothing at all)
       in production is still refused, because that is the throwaway case. */
    const pglitePath = process.env.PGLITE_PATH;
    const persistent = !!pglitePath && pglitePath !== "memory://";
    if (process.env.NODE_ENV === "production" && !persistent) {
      throw new Error(
        "DATABASE_URL is not set. Refusing to start against a throwaway " +
          "in-memory database in production. Set DATABASE_URL, or set " +
          "PGLITE_PATH to a directory to run against a persistent local " +
          "database — see .env.example."
      );
    }
    return pgliteDriver(pglitePath ?? "memory://");
  }

/**
 * Which providers need TLS verification turned off, and nothing else does.
 *
 * Supabase is the one in use today. Kept as a list rather than a boolean so
 * adding a provider is a one-word change and the reason stays attached to it.
 */
function needsUnverifiedTls(url: string): boolean {
  if (process.env.PGSSL_NO_VERIFY === "1") return true;
  return /supabase.(co|com|net)/i.test(url);
}

  const { Pool, types } = await import("pg");
  const local = /localhost|127\.0\.0\.1/.test(url);

  /* Make int8 a number, matching PGlite — see note 4 at the top of this file.
     Process-wide and set before the first query, which is the only way pg
     exposes it. */
  types.setTypeParser(types.builtins.INT8, asSafeInteger);

  const pool = new Pool({
    connectionString: url,
    /* ONE connection per instance.
       Vercel runs many short-lived instances and each holds its own pool, so
       the limit that matters is instances × max, not max. Supabase's free
       pooler allows a few hundred; a pool of 10 per instance exhausts that
       under mild traffic and the failure surfaces as unrelated-looking 500s.
       A serverless instance also serves one request at a time, so a second
       connection would sit idle anyway. */
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    /* TLS VERIFICATION IS ON UNLESS THE PROVIDER CANNOT SUPPORT IT.
       It used to be off for everyone, because Supabase terminates TLS with a
       certificate Node's default trust store does not chain to. That encrypts
       the connection without authenticating the server, and it was applied to
       every provider rather than the one that needs it.

       Neon — and most managed Postgres — present certificates that chain to a
       public CA, so verification simply works there and turning it off would
       be giving up something for nothing. Detected from the host rather than
       configured, so nobody has to know this to deploy; `PGSSL_NO_VERIFY=1`
       is the manual escape hatch for a provider not covered here. */
    ssl: local
      ? undefined
      : { rejectUnauthorized: !needsUnverifiedTls(url) },
  });

  return pgDriver(pool);
}

async function pgliteDriver(path: string): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(path === "memory://" ? undefined : path);
  const wrap = (): Driver => ({
    async exec(sql, params) {
      const r = await db.query(toPositional(sql), params as never[]);
      return {
        rows: (r.rows ?? []) as Record<string, unknown>[],
        rowCount: r.affectedRows ?? (r.rows ?? []).length,
      };
    },
    async script(sql) {
      await db.exec(sql);
    },
    async begin(fn) {
      /* PGlite is single-connection, so a transaction is just the statements —
         which is also why it cannot deadlock against itself. */
      await db.exec("BEGIN");
      try {
        const out = await txStore.run(wrap(), () => fn(wrap()));
        await db.exec("COMMIT");
        return out;
      } catch (err) {
        await db.exec("ROLLBACK").catch(() => {});
        throw err;
      }
    },
    async close() {
      await db.close();
    },
  });
  return wrap();
}

/**
 * The process-wide driver.
 *
 * Cached on `globalThis` rather than a module constant for the reason the
 * SQLite version was: Next's dev server re-evaluates modules on every edit, and
 * a module-level pool would leak a connection pool per hot reload until the
 * database refused new ones. On Vercel the same cache lets a warm instance
 * reuse its connection instead of reconnecting per request.
 */
let connecting: Promise<Driver> | null = null;

export async function driver(): Promise<Driver> {
  if (globalThis.__ttDriver) return globalThis.__ttDriver;
  /* Two concurrent first requests would otherwise each build a pool and the
     second would orphan the first. */
  if (!connecting) {
    connecting = createDriver().then((d) => {
      globalThis.__ttDriver = d;
      return d;
    });
  }
  return connecting;
}

/* ── The API lib/db.ts uses ───────────────────────────────────────────────── */

/** Current transaction's client if we are inside one, else the pool. */
async function active(): Promise<Driver> {
  return txStore.getStore() ?? (await driver());
}

/** Every matching row. */
export async function all<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const r = await (await active()).exec(sql, params);
  return r.rows as T[];
}

/** The first row, or undefined. */
export async function one<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const r = await (await active()).exec(sql, params);
  return r.rows[0] as T | undefined;
}

/** A write. Returns the number of rows affected. */
export async function run(
  sql: string,
  params: unknown[] = []
): Promise<number> {
  const r = await (await active()).exec(sql, params);
  return r.rowCount;
}

/**
 * An INSERT, returning the new id.
 *
 * Replaces better-sqlite3's `lastInsertRowid`, which has no Postgres
 * equivalent — the id comes back from the statement itself. `RETURNING id` is
 * appended here rather than written into twelve call sites so it cannot be
 * forgotten in one of them.
 */
export async function insert(
  sql: string,
  params: unknown[] = []
): Promise<number> {
  const row = await one<{ id: number | string }>(`${sql} RETURNING id`, params);
  if (!row) throw new Error(`INSERT returned no id: ${sql.slice(0, 80)}`);
  return Number(row.id);
}

/**
 * A multi-statement script with no parameters — the schema.
 *
 * Deliberately not reachable with user input: it uses the simple-query
 * protocol, where a value cannot be a parameter and would have to be
 * concatenated into the SQL. Everything else goes through all/one/run/insert.
 */
export async function script(sql: string): Promise<void> {
  await (await active()).script(sql);
}

/**
 * Run `fn` inside a transaction. Nested calls join the enclosing one.
 *
 * Everything `fn` does — including through functions that know nothing about
 * transactions — runs on the same connection and rolls back together.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  const existing = txStore.getStore();
  if (existing) return fn(); // already inside one
  return (await driver()).begin(() => fn());
}

/** Close the pool. Tests and scripts; a server never calls this. */
export async function closeDb(): Promise<void> {
  const d = globalThis.__ttDriver;
  globalThis.__ttDriver = undefined;
  connecting = null;
  if (d) await d.close();
}
