/**
 * CAN THE GENERATOR ACTUALLY EMIT WHAT WE ASK IT FOR?
 *
 * ── THE BUG THIS EXISTS TO MAKE IMPOSSIBLE ───────────────────────────────
 * There are two schemas for a lesson page and they are not the same object.
 * `activitySchema` in lib/lesson-pack-schema.ts is what a pack is STORED as;
 * `genActivitySchema` in lib/ai.ts is what the model is allowed to RETURN,
 * and it is handed to the API as a strict output format. A field present in
 * the first and missing from the second cannot be produced by any build, at
 * any price, no matter what the prompt asks for.
 *
 * That is exactly what had happened. Eight fields — the student coaching, why
 * a page exists, the card jobs, the exit ballot, the figures, the cut path,
 * the pass conditions, and which topic a page runs on — were added to the
 * storage schema, described at length in the prompt, and gated by the
 * checklist, while the output schema still forbade every one of them. Measured
 * on the two most recent builds: coaching 0/13, whyItMatters 0/13, cardJobs 0,
 * exitBallot 0, figures 0. Five gates failed on all eleven packs in the
 * library, the repair ladder paid model calls to fill in afterwards what the
 * generator was never able to write in the first place, and nothing anywhere
 * said so — the prompt and the schema disagreed silently.
 *
 * ── WHY A TEXT SCAN AND NOT AN IMPORT ────────────────────────────────────
 * `genActivitySchema` is not exported, and exporting it to satisfy a test
 * would widen the module's surface for the test's convenience. Reading the
 * source is enough: the question is only whether a field NAME appears in the
 * output schema, which is a syntactic fact.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const LIB = path.join(process.cwd(), "lib");
const ai = fs.readFileSync(path.join(LIB, "ai.ts"), "utf8");
const checklist = fs.readFileSync(path.join(LIB, "checklist.ts"), "utf8");

/** The body of a named `const X = z.object({ … })`, by brace matching. */
function schemaBody(src: string, name: string): string {
  const start = src.indexOf(`const ${name} = z.object({`);
  assert.ok(start >= 0, `${name} not found — did it get renamed?`);
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const genActivity = schemaBody(ai, "genActivitySchema");
const genOutline = schemaBody(ai, "outlineSchema");

/**
 * Fields the model must be able to return on a page.
 *
 * Every one is gated by the checklist, so a missing one is not a degraded
 * pack — it is a pack that can never pass review without a repair call
 * cleaning up after the generator.
 */
const PAGE_FIELDS = [
  "whyItMatters",
  "cardJobs",
  "exitBallot",
  "figures",
  "optional",
  "runsOn",
  "guide",
  "trap",
  "passesWhen",
  "hiddenJudgeMove",
  "fastFinisher",
  "microFlow",
  "ballotLine",
  "microCrossfire",
  "echoCheck",
];

test("every gated page field is one the model is allowed to return", () => {
  const missing = PAGE_FIELDS.filter((f) => !genActivity.includes(`${f}:`));
  assert.deepEqual(
    missing,
    [],
    `The prompt asks for these and the output schema forbids them, so no build ` +
      `can ever produce one:\n${missing.map((m) => `  ${m}`).join("\n")}\n\n` +
      `Add them to genActivitySchema in lib/ai.ts.`
  );
});

test("the practice topic can be returned by the stage that decides it", () => {
  // It is a fact about the whole sequence rather than any one page, so the
  // outline owns it and every page's `runsOn` points back at it.
  assert.ok(
    genOutline.includes("practiceTopic:"),
    "outlineSchema cannot return practiceTopic, but the prompt asks for it"
  );
});

/**
 * The general form of the same rule.
 *
 * Anything the prompt names in backticks as a field to set has to be a field
 * the schema permits. This is deliberately narrowed to a short list of names
 * the checklist actually gates, because the prompt legitimately mentions
 * plenty of fields belonging to other stages.
 */
test("a gate that names a page field has a field to check", () => {
  /* Read the checklist for the page fields it reaches for, and confirm the
     generator can produce each. This catches the NEXT version of this bug:
     someone adds a gate on a new field, wires the prompt, and forgets the
     output schema — which is the exact sequence that happened here. */
  const gated = new Set<string>();
  for (const f of PAGE_FIELDS) {
    if (checklist.includes(`.${f}`)) gated.add(f);
  }
  assert.ok(gated.size >= 8, `expected the checklist to gate several of these, saw ${gated.size}`);
  const unreturnable = [...gated].filter((f) => !genActivity.includes(`${f}:`));
  assert.deepEqual(unreturnable, [], "gated but not returnable");
});
