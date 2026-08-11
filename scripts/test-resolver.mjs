/**
 * Let `node --test` follow the app's extensionless imports.
 *
 * The source is written for a bundler: `import { x } from "./lesson-pack-schema"`.
 * Next/webpack resolves that; Node's ESM resolver does not — it requires a full
 * specifier and does no extension guessing. Without this, only modules with zero
 * relative runtime imports (lib/batch-queue.ts) could be tested at all.
 *
 * The alternative was appending `.ts` to every relative import across ~50 source
 * files, which is a lot of churn to the shipped code in service of the tests.
 * This does the same job in one place, and only for the test process — the app's
 * own build never loads it.
 *
 * Registered via `--import` in the `test` script; see package.json.
 */

import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/** Specifiers that already name a file Node can resolve on its own. */
const HAS_EXTENSION = /\.(ts|tsx|js|mjs|cjs|json|node)$/;

/**
 * The `@/*` alias, from tsconfig.json's `paths`.
 *
 * Added when the seed script needed to run lib/auth against the real database:
 * those modules import each other as `@/lib/...`, which webpack rewrites and
 * Node has never heard of. Handled here rather than by rewriting the imports,
 * for the same reason the extension guessing below is — the shipped code should
 * not be reshaped to suit the one process that runs it outside a bundler.
 */
const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = path.join(ROOT, specifier.slice(2));
      for (const candidate of HAS_EXTENSION.test(specifier)
        ? [base]
        : [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
        if (existsSync(candidate)) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
    }
    if (specifier.startsWith(".") && !HAS_EXTENSION.test(specifier)) {
      // Resolve against the importing module so `./x` and `../y/z` both work.
      const base = context.parentURL ?? import.meta.url;
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        const url = new URL(candidate, base);
        if (existsSync(fileURLToPath(url))) {
          return nextResolve(candidate, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
