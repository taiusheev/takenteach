/**
 * The pre-build curriculum checks.
 *
 * These are worth pinning down because of WHEN they run: they are the last
 * thing between a structurally broken plan and a 7–15 minute paid build that
 * faithfully writes it out. A check that stops firing costs a teacher a lesson
 * with no exit ticket; a check that fires wrongly trains them to ignore the
 * panel, which is worse — an ignored warning is the same as no warning, only
 * with more noise.
 *
 * Every `fix` is asserted to actually repair the thing it claims to, because a
 * one-click fix that does not fix is the most expensive kind of button.
 *
 *   node --test lib/outline-review.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { balance, outlineChecks, phaseOf } from "./outline-review.ts";
import type { OutlineEntry } from "./lesson-pack-schema.ts";

function page(
  kind: OutlineEntry["kind"],
  durationMin: number,
  title = kind.toUpperCase(),
  goal = "does something worth doing"
): OutlineEntry {
  return { kind, title, badge: "", durationMin, goal };
}

/** A structurally sound 60-minute lesson: model → guided → solo → assess. */
function goodPlan(): OutlineEntry[] {
  return [
    page("hook", 6, "COLD ATTEMPT"),
    page("i-do", 8, "TEACHER MODELS"),
    page("we-do", 10, "TOGETHER"),
    page("drill", 8, "SPEED SORT"),
    page("scaffolded-build", 10, "WITH FRAMES"),
    page("independent-build", 12, "ON YOUR OWN"),
    page("exit-ticket", 6, "EXIT TICKET"),
  ];
}

test("a sound plan raises nothing", () => {
  const checks = outlineChecks(goodPlan(), 60);
  assert.deepEqual(checks, [], `unexpected: ${checks.map((c) => c.id).join(", ")}`);
});

test("an empty plan is not reported on at all", () => {
  assert.deepEqual(outlineChecks([], 60), []);
});

test("minutes that do not reach the lesson length are caught and rescalable", () => {
  const plan = goodPlan();
  plan[0].durationMin = 20; // 74 total against a 60-minute lesson
  const check = outlineChecks(plan, 60).find((c) => c.id === "timing");
  assert.ok(check, "over-running plan not flagged");
  assert.equal(check.level, "blocker", "23% over should block, not merely warn");

  const fixed = check.fix!.apply(plan);
  assert.equal(
    fixed.reduce((n, p) => n + p.durationMin, 0),
    60,
    "the fix must land exactly on the lesson length"
  );
  assert.equal(fixed.length, plan.length, "rescaling must not add or drop pages");
  assert.deepEqual(
    outlineChecks(fixed, 60).filter((c) => c.id === "timing"),
    [],
    "the fix must silence its own check"
  );
});

test("a small overrun warns rather than blocks", () => {
  const plan = goodPlan();
  plan[0].durationMin = 9; // 63 of 60 — 5% over
  const check = outlineChecks(plan, 60).find((c) => c.id === "timing");
  assert.equal(check?.level, "warn");
});

test("a lesson that never assesses is a blocker, and the fix adds the assessment", () => {
  const plan = goodPlan().filter((p) => p.kind !== "exit-ticket");
  const check = outlineChecks(plan, 60).find((c) => c.id === "no-assessment");
  assert.ok(check);
  assert.equal(check.level, "blocker");

  const fixed = check.fix!.apply(plan);
  assert.ok(
    fixed.some((p) => p.kind === "exit-ticket"),
    "the fix must actually add an exit ticket"
  );
  assert.equal(
    fixed.reduce((n, p) => n + p.durationMin, 0),
    60,
    "adding a page must not push the lesson over its length"
  );
  assert.deepEqual(
    outlineChecks(fixed, 60).filter((c) => c.level === "blocker"),
    [],
    "the repaired plan must clear every blocker"
  );
});

test("guided practice before the model is caught, and the fix reorders it", () => {
  const plan = [
    page("hook", 6),
    page("we-do", 10, "TOGETHER"),
    page("i-do", 8, "TEACHER MODELS"),
    page("independent-build", 20, "ON YOUR OWN"),
    page("exit-ticket", 16, "EXIT TICKET"),
  ];
  const check = outlineChecks(plan, 60).find((c) => c.id === "release-order");
  assert.ok(check, "out-of-order gradual release not flagged");

  const fixed = check.fix!.apply(plan);
  const model = fixed.findIndex((p) => p.kind === "i-do");
  const guided = fixed.findIndex((p) => p.kind === "we-do");
  assert.ok(model < guided, "the model must end up before the guided practice");
  assert.equal(fixed.length, plan.length, "reordering must not lose a page");
});

test("a lesson with no unaided work is caught, and the fix inserts it before the exit ticket", () => {
  const plan = goodPlan().filter((p) => p.kind !== "independent-build");
  const check = outlineChecks(plan, 60).find((c) => c.id === "no-independent");
  assert.ok(check);

  const fixed = check.fix!.apply(plan);
  const added = fixed.findIndex((p) => p.kind === "independent-build");
  const exit = fixed.findIndex((p) => p.kind === "exit-ticket");
  assert.ok(added !== -1, "the fix must add an independent build");
  assert.ok(
    added < exit,
    "unaided practice belongs before the assessment, not after it"
  );
  assert.equal(fixed.reduce((n, p) => n + p.durationMin, 0), 60);
});

test("a teacher-talking lesson is flagged by share of the clock", () => {
  const plan = [
    page("topic-intel", 20, "BRIEFING"),
    page("i-do", 15, "MODEL"),
    page("we-do", 10, "TOGETHER"),
    page("independent-build", 10, "SOLO"),
    page("exit-ticket", 5, "EXIT"),
  ];
  const check = outlineChecks(plan, 60).find((c) => c.id === "teacher-heavy");
  assert.ok(check, "35 of 60 minutes teacher-led should be flagged");
  assert.match(check.title, /58%/, "the share should be stated, not implied");
});

test("two pages with the same title are caught — the pack refuses them at review", () => {
  const plan = goodPlan();
  plan[3].title = plan[1].title;
  const check = outlineChecks(plan, 60).find((c) => c.id === "duplicate-title");
  assert.ok(check);
  assert.equal(check.index, 3, "should point at the second offender, not the first");
});

test("a page with no stated purpose is caught — the build writes from that sentence", () => {
  const plan = goodPlan();
  plan[2].goal = "   ";
  const check = outlineChecks(plan, 60).find((c) => c.id === "no-goal");
  assert.ok(check);
  assert.equal(check.index, 2);
});

test("balance keeps every page at a minute or more", () => {
  const plan = [page("hook", 1), page("i-do", 1), page("exit-ticket", 1)];
  const out = balance(plan, 7);
  assert.equal(out.reduce((n, p) => n + p.durationMin, 0), 7);
  assert.ok(out.every((p) => p.durationMin >= 1), "no page may be rounded to zero");
});

test("balance is a no-op on a plan with no minutes rather than dividing by zero", () => {
  const plan = [page("hook", 0), page("exit-ticket", 0)];
  assert.deepEqual(balance(plan, 60), plan);
});

test("every page kind maps to a phase, so the arc bar can never render a gap", () => {
  // A kind added to the schema without a phase would silently fall through.
  const kinds: OutlineEntry["kind"][] = [
    "hook", "review", "topic-intel", "vocabulary", "i-do", "we-do", "drill",
    "evidence-study", "scaffolded-build", "independent-build", "sparring",
    "bridge", "remix", "exit-ticket", "custom",
  ];
  for (const k of kinds) {
    assert.ok(phaseOf(k), `no phase for ${k}`);
  }
});
