/**
 * RENDER A REAL COMPONENT IN PLAIN NODE.
 *
 * Extracted from scripts/render-check.mjs so more than one harness can use it.
 * Importing this module installs the hooks as a side effect; import it before
 * anything that pulls in a `.tsx` file.
 *
 * Two things make it work:
 *
 *   1. `.ts`/`.tsx` outside node_modules are transpiled at load time, so a
 *      component is rendered from the SAME source the app ships rather than
 *      from a build artefact that could disagree with it.
 *   2. `next/navigation` is shimmed. It reaches for a mounted app router that
 *      does not exist outside Next, and any client component touching
 *      `useRouter` would throw on import alone.
 *
 * ── THE TRAP WORTH KNOWING ABOUT ─────────────────────────────────────────
 * A component that imports anything from `lib/db` drags the whole Postgres
 * layer in at module scope and this harness HANGS rather than failing, because
 * PGlite starts booting. If a check stops producing output, look for a new
 * `@/lib/db` import in the graph — including a type-only one, which the
 * transpiler erases too late to help. Import types from the module that
 * DEFINES them instead.
 */

import { registerHooks } from "node:module";
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./test-resolver.mjs";

export const ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const SHIM = path.join(ROOT, "scripts", ".render-nav-shim.mjs");

fs.writeFileSync(
  SHIM,
  `export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, forward(){}, prefetch(){} });
export const usePathname = () => "/";
export const useSearchParams = () => new URLSearchParams();
export const useParams = () => ({});
export const redirect = () => {};
export const notFound = () => {};
`
);

/** Remove the next/navigation shim. Safe to call more than once. */
export function cleanupShim() {
  fs.rmSync(SHIM, { force: true });
}

export function pathToHref(p) {
  return new URL(`file:///${p.replace(/\\/g, "/")}`).href;
}

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "next/navigation") return next(pathToHref(SHIM), ctx);
    // The package ships extensionless deep paths that only a bundler resolves.
    if (spec.startsWith("next/") && !/\.(js|mjs|cjs)$/.test(spec)) {
      try {
        return next(spec + ".js", ctx);
      } catch {
        /* fall through to the plain specifier */
      }
    }
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    if (/\.tsx?($|\?)/.test(url) && !url.includes("node_modules")) {
      const source = ts.transpileModule(fs.readFileSync(new URL(url), "utf8"), {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          jsxImportSource: "react",
        },
        fileName: url,
      }).outputText;
      return { format: "module", shortCircuit: true, source };
    }
    return next(url, ctx);
  },
});

/** Assert a set of `[label, needle]` pairs against rendered HTML. */
export function checkHtml(html, checks) {
  let failed = 0;
  for (const [label, needle, shouldBeAbsent = false] of checks) {
    const present = html.includes(needle);
    const ok = shouldBeAbsent ? !present : present;
    if (!ok) failed += 1;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
  }
  return failed;
}
