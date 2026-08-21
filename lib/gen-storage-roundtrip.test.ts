/**
 * WHAT THE MODEL RETURNS HAS TO BE WHAT THE PACK STORES.
 *
 * ── THE FAILURE THIS CATCHES ─────────────────────────────────────────────
 * genActivitySchema (lib/ai.ts) constrains the model's output; activitySchema
 * (lib/lesson-pack-schema.ts) is what the result is parsed into a line later.
 * They describe the same page and they are maintained separately, so they
 * drift — and when they do, the build does not degrade, it THROWS, after the
 * pages have been generated and paid for.
 *
 * Writing this found two live ones immediately, both introduced in the same
 * change that widened the output schema:
 *
 *   - repairs was emitted as objects and stored as strings;
 *   - ratioCount was emitted as 0 on every non-ratio figure, and storage
 *     requires >= 1 — so any pack containing a unit chart would have failed
 *     to parse.
 *
 * Neither is visible to the type checker: both schemas type-check perfectly on
 * their own, and the mismatch only exists at runtime, in the seam between them.
 *
 *   node --test lib/gen-storage-roundtrip.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { activitySchema } from "./lesson-pack-schema.ts";

/**
 * A page in exactly the shape genActivitySchema permits, with every field the
 * model may now return populated — including the ones only a specific kind of
 * page uses, because those are where the two schemas disagree most easily.
 */
const emitted = {
  kind: "exit-ticket", title: "THE BALLOT", badge: "EXIT · 10 MIN", durationMin: 10,
  instructions: "Mark your partner, then fix one thing.",
  scene: { setup: "", turns: [], twist: "" },
  steps: [], compare: { leftLabel: "", rightLabel: "", rows: [] }, callouts: [],
  argumentChains: [], hiddenJudgeMove: "The team that names the measuring stick first wins.",
  quiz: [], wordBank: { words: [], distractors: [] },
  microFlow: { target: "", captures: 0, exemplar: { claim: "", warrant: "", data: "" } },
  ballotLine: { ourImpact: "", theirImpact: "", weighing: "", line: "" },
  microCrossfire: { seconds: 0, listenerRole: "", questions: [] },
  echoCheck: { cardId: "", tests: [], mechanism: "" },
  fastFinisher: "Write the version you would say if you had ten seconds.",
  keyIdea: "A ballot is a decision, not a score.", standAndDeliver: "Say your repaired sentence.",
  prompts: [{ label: "Write your claim.", side: "neutral", expectedAnswer: "A clear side.",
              guide: "Name the side first, then the reason.", trap: "Do not restate the motion." }],
  exampleLayers: [{ label: "Point", text: "Schools should ban phones.", note: "States a side.",
                    passesWhen: "A stranger could repeat it after hearing it once." }],
  whyItMatters: "A judge trusts the debater who can say what the other side gets right.",
  cardJobs: [{ cardId: "A", job: "THE LIMIT", instruction: "Say what this does not show." }],
  figures: [{ kind: "unit-chart", title: "Who has one", caption: "Most, not all.",
              exact: "68 of every 100", source: "Ofcom, 2024", filled: 68, total: 100,
              thenFilled: 41, nowLabel: "2024", thenLabel: "2015", stages: [],
              ratioLeft: "", ratioRight: "", ratioCount: 1, subject: "", bringsLabel: "",
              costsLabel: "", brings: [], costs: [] }],
  exitBallot: { rows: [{ criterion: "Clear side and claim", test: "You can say it back in one line." }],
                scale: ["Yes", "Almost", "Not yet"], errors: ["No warrant"],
                repairs: ["Add the because — say why it happens"],
                product: "a rewritten sentence, not a score" },
  optional: false, runsOn: "anchor",
  sortItems: [], matchPairs: [], frames: [],
};


test("a fully populated generated page stores without loss", () => {
  const r = activitySchema.safeParse(emitted);
  assert.ok(
    r.success,
    r.success
      ? ""
      : "the generator output does not parse into a stored page: " +
        r.error.issues.map((i) => i.path.join(".") + ": " + i.message).join(" | ")
  );
  if (!r.success) return;
  const a = r.data;

  // Field by field, because a schema can accept a shape and still drop it.
  assert.match(a.whyItMatters, /other side gets right/);
  assert.ok(a.prompts[0].guide && a.prompts[0].trap, "student coaching was dropped");
  assert.match(a.exampleLayers[0].passesWhen, /stranger/);
  assert.equal(a.cardJobs[0].job, "THE LIMIT");
  assert.equal(a.exitBallot.rows.length, 1);
  assert.equal(a.exitBallot.repairs.length, 1);
  assert.equal(a.runsOn, "anchor");
  assert.equal(a.optional, false);
});

test("a figure keeps the numbers that make it a figure", () => {
  /* The most fragile part of the seam: a figure carries fields for four
     different kinds at once, so the idle values a non-ratio figure sends are
     as load-bearing as the real ones. ratioCount is min(1) in storage, which
     is why the idle value cannot be 0. */
  const a = activitySchema.parse(emitted);
  const f = a.figures[0];
  assert.equal(f.kind, "unit-chart");
  assert.equal(f.filled, 68);
  assert.equal(f.thenFilled, 41, "the second series was dropped");
  assert.equal(f.exact, "68 of every 100", "the exact figure is what stops a chart rounding");
  assert.equal(f.source, "Ofcom, 2024");
});

test("the idle values a page sends for blocks it does not use are storable", () => {
  // Every unused block is emitted empty rather than omitted — the output
  // format has no optional fields — so "empty" has to be a legal value for
  // all of them, on every page kind.
  const bare = activitySchema.safeParse({
    ...emitted,
    figures: [],
    cardJobs: [],
    exitBallot: { rows: [], scale: [], errors: [], repairs: [], product: "" },
    prompts: [],
    exampleLayers: [],
    whyItMatters: "",
  });
  assert.ok(bare.success, bare.success ? "" : bare.error.message);
});

/**
 * THE FIXTURE ABOVE IS HAND-WRITTEN, WHICH IS THIS FILE'S ONE WEAKNESS.
 *
 * It describes what genActivitySchema permits; it is not derived from it. So
 * a field added to the output schema and not to the fixture would leave the
 * roundtrip untested for exactly the field most likely to be wrong — the new
 * one. (Proved: reverting the `repairs` fix does not fail the tests above,
 * because the fixture still carries the corrected shape.)
 *
 * Exporting genActivitySchema to derive the fixture would widen a module's
 * surface for a test's convenience. Reading its field names out of the source
 * closes the same loop without that: if the two lists disagree, this fails and
 * whoever added the field has to say what it stores as.
 */
test("the fixture covers every field the model can return", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib", "ai.ts"), "utf8");
  const start = src.indexOf("const genActivitySchema = z.object({");
  assert.ok(start >= 0, "genActivitySchema not found — renamed?");
  let depth = 0;
  let body = "";
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    body += src[i];
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  // Two-space indentation is the schema's own top level; anything deeper
  // belongs to a nested object and is covered through its parent.
  const fields = [...body.matchAll(/\n {2}([a-zA-Z]+):/g)].map((m) => m[1]);
  assert.ok(fields.length > 20, `expected the whole schema, parsed ${fields.length} fields`);

  const missing = fields.filter((f) => !(f in emitted));
  assert.deepEqual(
    missing,
    [],
    `genActivitySchema can return these and the fixture never exercises them, ` +
      `so nothing checks that they store:\n${missing.map((m) => `  ${m}`).join("\n")}`
  );
});
