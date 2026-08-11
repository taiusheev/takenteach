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
       zero-setup local dev path. It is NOT a production fallback — a missing
       DATABASE_URL in production would otherwise start the app against an
       empty in-memory database and look like every lesson had vanished. */
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "DATABASE_URL is not set. Refusing to start against a throwaway " +
          "in-memory database in production — see .env.example."
      );
    }
    return pgliteDriver(process.env.PGLITE_PATH ?? "memory://");
  }

  const { Pool } = await import("pg");
  const local = /localhost|127\.0\.0\.1/.test(url);

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
    /* Supabase terminates TLS with a certificate Node's default trust store
       does not chain to, so verification is off. That encrypts the connection
       but does not authenticate the server — acceptable for an MVP, and the
       way to harden it is to download Supabase's CA and pass `ca:` here rather
       than to leave this comment unread. */
    ssl: local ? undefined : { rejectUnauthorized: false },
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
