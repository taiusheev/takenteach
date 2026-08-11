import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  /**
   * NO FLOATING PROMISES — on the server only.
   *
   * Added after the Postgres port, because it is the one class of mistake that
   * port could make invisibly. Every data function used to be synchronous and
   * returned `void`; now they return promises, and calling one as a bare
   * statement still type-checks perfectly. `tsc` went from 393 errors to zero
   * while six writes were still unawaited — including four `snapshotAndUpdate`
   * calls, where the route answers "saved" and then may be frozen by the
   * platform before the write lands. That is a teacher's work disappearing with
   * a success message on screen, and no test or type-check would have caught it.
   *
   * This needs type information, so it declares its own typed parser rather
   * than relying on the Next presets.
   *
   * SERVER FILES ONLY. In a browser event handler `onClick={() => save()}` is
   * ordinary and correct — nothing is going to freeze the tab mid-promise — and
   * turning this on everywhere would mean 20-odd `void` annotations that teach
   * the reader nothing. The risk being guarded is a serverless instance
   * suspended the moment it responds, which is a server-side risk.
   *
   * The `scripts/*.mjs` are outside tsconfig's project and so cannot be typed
   * without pulling them in. They are left out deliberately: they are run by
   * hand, one at a time, and a dropped promise in one is visible immediately in
   * the terminal rather than silently a week later in production.
   */
  {
    files: ["app/api/**/*.ts", "lib/**/*.ts"],
    ignores: ["lib/**/*.test.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-floating-promises": [
        "error",
        // `void f()` stays available for the rare deliberate fire-and-forget,
        // which is worth having to write out.
        { ignoreVoid: true, ignoreIIFE: true },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
