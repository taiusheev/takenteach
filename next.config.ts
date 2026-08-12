import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Load PGlite with Node's own `require` instead of bundling it.
   *
   * Without this, every database call from a route handler or server component
   * dies with a message that reads like a contradiction:
   *
   *   TypeError: The "path" argument must be of type string or an instance of
   *   Buffer or URL. Received an instance of URL
   *
   * It is not a contradiction. Bundled code gets the bundler's `URL`, not
   * Node's, so `fs`'s `instanceof URL` check fails on an object that is,
   * to any human reading the error, plainly a URL. PGlite hands `fs` a URL when
   * it opens a data directory, so this fires the moment `PGLITE_PATH` points at
   * one — which is exactly the local development setup.
   *
   * `pg` needs no entry: it is on Next's built-in externals list, along with
   * `better-sqlite3`, which is why the entry that used to be here for
   * better-sqlite3 was doing nothing even before the Postgres port removed the
   * dependency.
   */
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
