/**
 * The timing plan, repaired by arithmetic instead of by a model call.
 *
 * The `timing-plan` review rule asks whether the phases run in order and reach
 * the end of the lesson. That is addition. The build asked a model for it
 * anyway, and when the sums did not land, the validate pass regenerated the
 * ENTIRE teacher guide — the largest call in the build, roughly 8k output
 * tokens — to fix a column of integers.
 *
 * These tests exist to prove the replacement is lossless. If `reflowTimingPlan`
 * could ever alter a phase name, a leader, or a teacher move, it would be
 * trading money for quality and the whole justification collapses. So that is
 * the property most of these assert.
 *
 *   node --test lib/timing-reflow.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { reflowTimingPlan, type PlanRow } from "./activity-batches.ts";

const row = (
  startMin: number,
  endMin: number,
  phase: string,
  what = `run ${phase}`
): PlanRow => ({ startMin, endMin, phase, who: "T+Ss", what });

const total = (rows: PlanRow[]) => rows[rows.length - 1]?.endMin ?? 0;

const runsInOrder = (rows: PlanRow[]) =>
  rows.every(
    (r, i) => r.endMin > r.startMin && (i === 0 ? r.startMin === 0 : r.startMin === rows[i - 1].endMin)
  );

test("a plan that stops short is stretched to the full lesson", () => {
  // The commonest real failure: the model wrote 40 minutes of a 60-minute lesson.
  const out = reflowTimingPlan(
    [row(0, 10, "Hook"), row(10, 25, "Model"), row(25, 40, "Practice")],
    60
  );
  assert.equal(total(out), 60);
  assert.ok(runsInOrder(out));
});

test("a plan that overruns is compressed to the lesson", () => {
  const out = reflowTimingPlan(
    [row(0, 30, "Hook"), row(30, 60, "Model"), row(60, 90, "Practice")],
    60
  );
  assert.equal(total(out), 60);
  assert.ok(runsInOrder(out));
});

test("a plan with gaps and overlaps is made continuous", () => {
  // Rows that neither meet nor stay in order — what a bad draft looks like.
  const out = reflowTimingPlan(
    [row(0, 10, "Hook"), row(15, 25, "Model"), row(20, 30, "Practice")],
    45
  );
  assert.ok(runsInOrder(out), JSON.stringify(out));
  assert.equal(total(out), 45);
});

test("NOTHING the model wrote is altered — only the numbers", () => {
  const before = [
    row(0, 9, "COLD ATTEMPT", "Students try it with no instruction."),
    row(9, 30, "TEACHER MODELS", "Model finding the warrant, then cold-call."),
    row(30, 41, "EXIT", "Silent, timed, against the criteria."),
  ];
  const after = reflowTimingPlan(before, 60);

  assert.equal(after.length, before.length);
  after.forEach((r, i) => {
    assert.equal(r.phase, before[i].phase, "phase name must survive");
    assert.equal(r.what, before[i].what, "the teacher move must survive verbatim");
    assert.equal(r.who, before[i].who, "who leads must survive");
  });
});

test("the shape of the lesson survives — a long phase stays long", () => {
  // 5 / 20 / 5 across 30 → the middle phase must still dominate at 60.
  const out = reflowTimingPlan(
    [row(0, 5, "Hook"), row(5, 25, "Model"), row(25, 30, "Exit")],
    60
  );
  const lengths = out.map((r) => r.endMin - r.startMin);
  assert.equal(total(out), 60);
  assert.ok(
    lengths[1] > lengths[0] + lengths[2],
    `the deliberately long phase was flattened: ${lengths.join("/")}`
  );
});

test("rows with no usable length are given what is left over", () => {
  const out = reflowTimingPlan(
    [row(0, 20, "Hook"), row(0, 0, "Model"), row(0, 0, "Exit")],
    60
  );
  assert.equal(total(out), 60);
  assert.ok(runsInOrder(out));
  assert.ok(out.every((r) => r.endMin - r.startMin >= 1), "no zero-length phase");
});

test("a plan with no usable numbers at all is divided evenly", () => {
  const out = reflowTimingPlan(
    [row(0, 0, "A"), row(0, 0, "B"), row(0, 0, "C"), row(0, 0, "D")],
    40
  );
  assert.equal(total(out), 40);
  assert.deepEqual(
    out.map((r) => r.endMin - r.startMin),
    [10, 10, 10, 10]
  );
});

test("no phase is ever rounded out of existence", () => {
  // Twelve phases across nine minutes: rounding must not produce a zero row.
  const rows = Array.from({ length: 12 }, (_, i) => row(i * 10, i * 10 + 10, `P${i}`));
  const out = reflowTimingPlan(rows, 9);
  assert.ok(out.every((r) => r.endMin > r.startMin), "a zero-length phase is unrunnable");
  assert.ok(runsInOrder(out));
});

test("an already-correct plan is left alone", () => {
  const before = [row(0, 20, "Hook"), row(20, 40, "Model"), row(40, 60, "Exit")];
  assert.deepEqual(reflowTimingPlan(before, 60), before);
});

test("degenerate inputs are returned untouched rather than invented", () => {
  assert.deepEqual(reflowTimingPlan([], 60), []);
  const one = [row(0, 10, "Only")];
  assert.deepEqual(reflowTimingPlan(one, 0), one, "no duration means nothing to fit to");
});
