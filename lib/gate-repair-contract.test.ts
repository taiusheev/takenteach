/**
 * EVERY BLOCKING GATE NEEDS A WAY THROUGH IT.
 *
 * The checklist is the review gate: `applyTransition` refuses to move a pack
 * into review until it passes. So a gate with no repair is not a warning — it
 * is a locked door, and the only way past it is for a human to hand-edit the
 * field the model was never asked to fix.
 *
 * This has already happened once at scale in this codebase: five blocking gates
 * shipped with no repair branch at all, because the checklist grew gates faster
 * than the repair pass grew rungs. Nothing detected it, because both files were
 * individually correct — the defect lived in the gap between them.
 *
 * This test is that detector. It reads the two files as text rather than
 * importing them, deliberately: the repair pass is a thousand-line generator
 * function with model calls in it and cannot be executed here, but the
 * association it encodes — which gate ids does it branch on — is plainly
 * visible in the source.
 *
 * It is a RATCHET, not a demand for perfection. Twelve pre-existing gates have
 * no repair; they are listed below rather than silently tolerated, and the test
 * fails when a NEW gate joins them.
 *
 *   node --test lib/gate-repair-contract.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (f: string) => fs.readFileSync(path.join(HERE, f), "utf8");

/**
 * Gates repaired OUTSIDE the model loop. Each is fixed by code that runs before
 * the repair pass can see it, so a branch there would be dead — and, in three
 * cases, would spend a model call to do what arithmetic already did.
 */
const CODE_REPAIRED = new Map<string, string>([
  ["timing-plan", "reflowTimingPlan() rewrites the plan the moment the guide is written"],
  ["duration-adds-up", "same reflow — an arithmetic fault fixed by arithmetic, not by a model"],
  ["oral-task-placement", "misplacedOralPages() moves the field for free; regenerating a page to DELETE a line is the most expensive possible way to do nothing"],
  ["design-mono-safe", "the design pass and houseFloor own this, not the content repair"],
  ["design-type-scale", "as above — a stylesheet fault, repaired by re-running the design stage"],
  ["design-space-budget", "as above"],
]);

/**
 * Pre-existing locked doors. Real debt, listed so it is visible and so the
 * ratchet has something to hold. Adding to this list should require the same
 * argument as adding a gate with no repair, because it is the same thing.
 */
const KNOWN_UNREPAIRED = new Set([
  "activity-count",
  "anchor-present",
  "attempt-consolidation",
  "citation-ids-exist",
  "cover-title",
  "lesson-arc",
  "no-placeholders",
  "page-titles-unique",
  "production-scaffold",
  "quiz-answerable",
  "series-vocab-unique",
  "word-bank-distractors",
]);

/** Gate ids, read as the first string argument to every `add(...)` call. */
function gateIds(): string[] {
  const src = read("checklist.ts");
  return [...new Set([...src.matchAll(/add\(\s*"([a-z0-9-]+)"/g)].map((m) => m[1]))];
}

/** Gate ids the repair pass branches on, including its named groups. */
function repairedIds(): Set<string> {
  const src = read("ai.ts");
  const ids = new Set(
    [...src.matchAll(/failed\(\[([^\]]+)\]\)/g)].flatMap((m) =>
      [...m[1].matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1])
    )
  );
  // `failed(EVIDENCE)` and friends — the group's members count as repaired.
  for (const name of ["EVIDENCE", "FOUNDATION", "TEACHER"]) {
    const i = src.indexOf(`const ${name} = [`);
    if (i < 0) continue;
    const j = src.indexOf("];", i);
    for (const x of src.slice(i, j).matchAll(/"([a-z0-9-]+)"/g)) ids.add(x[1]);
  }
  return ids;
}

test("the audit can actually see both sides — guards against a regex that matches nothing", () => {
  // Without this, a refactor that changed `add(` or `failed(` would make every
  // other assertion in this file pass vacuously.
  const gates = gateIds();
  const repairs = repairedIds();
  assert.ok(gates.length > 40, `expected the full checklist, found ${gates.length} gates`);
  assert.ok(repairs.size > 20, `expected the full repair pass, found ${repairs.size} branches`);
  assert.ok(gates.includes("student-coaching"), "a known gate should be visible");
  assert.ok(repairs.has("student-coaching"), "a known repair should be visible");
});

test("every repair targets a gate that exists", () => {
  // The mirror failure: a repair aimed at an id nothing produces never fires,
  // and reads in review as though the gate were covered.
  const gates = new Set(gateIds());
  const orphans = [...repairedIds()].filter((r) => !gates.has(r));
  assert.deepEqual(
    orphans,
    [],
    `repairs targeting gates that do not exist:\n${orphans.join("\n")}`
  );
});

test("no NEW gate is a locked door", () => {
  const repairs = repairedIds();
  const unrepaired = gateIds().filter(
    (g) => !repairs.has(g) && !CODE_REPAIRED.has(g) && !KNOWN_UNREPAIRED.has(g)
  );
  assert.deepEqual(
    unrepaired,
    [],
    `These gates block review and nothing can fix them automatically:\n` +
      unrepaired.map((g) => `  ${g}`).join("\n") +
      `\n\nAdd a rung to the repair ladder in lib/ai.ts, or — if it is genuinely ` +
      `fixed by code elsewhere — add it to CODE_REPAIRED with the reason.`
  );
});

test("the allowlists do not rot", () => {
  // A gate that gained a repair, or was deleted, should leave the allowlist —
  // otherwise the lists slowly stop describing anything true.
  const gates = new Set(gateIds());
  const repairs = repairedIds();

  const goneFromChecklist = [...CODE_REPAIRED.keys(), ...KNOWN_UNREPAIRED].filter(
    (g) => !gates.has(g)
  );
  assert.deepEqual(goneFromChecklist, [], `allowlisted gates that no longer exist: ${goneFromChecklist.join(", ")}`);

  const nowRepaired = [...KNOWN_UNREPAIRED].filter((g) => repairs.has(g));
  assert.deepEqual(
    nowRepaired,
    [],
    `these gained a repair and should come off KNOWN_UNREPAIRED: ${nowRepaired.join(", ")}`
  );
});

test("this session's gates all carry a repair", () => {
  // Named explicitly rather than left to the ratchet, because these are the
  // ones whose repair branches were written alongside them and the pairing is
  // the thing most likely to be broken by a later edit to either file.
  const repairs = repairedIds();
  for (const id of [
    "student-coaching",
    "coaching-is-not-the-key",
    "page-does-something",
    "why-this-page",
    "exit-ballot",
    "ballot-tests-what-was-taught",
    "cards-have-jobs",
    "card-jobs-resolve",
    "practice-transfers",
    "practice-topic-declared",
  ]) {
    assert.ok(repairs.has(id), `${id} blocks review with no repair`);
  }
});
