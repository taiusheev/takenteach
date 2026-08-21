/**
 * A progress report is shown to a student, and sometimes to a parent, so the
 * cost of it being subtly wrong is higher than anywhere else in the product.
 * The two failures worth guarding are opposite: claiming progress that did not
 * happen, and missing progress that did.
 *
 *   node --test lib/student-report.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { studentReport } from "./student-report.ts";
import type { Observation } from "./students.ts";
import type { RoundRow, SubmissionRow } from "./judging.ts";

const FROM = "2026-08-01";
const TO = "2026-08-31";
const STUDENT = 42;

let seq = 0;
const o = (
  skill: string,
  rating: number,
  on: string,
  note = ""
): Observation => ({
  id: ++seq,
  student_id: STUDENT,
  skill,
  rating,
  note,
  context: "",
  observed_on: on,
  role: "teacher",
});

const report = (observations: Observation[], rounds: RoundRow[] = [], submissions: SubmissionRow[] = []) =>
  studentReport({ from: FROM, to: TO, observations, studentId: STUDENT, rounds, submissions });

// ── movement is measured against what was believed BEFORE the period ─────────

test("improvement is measured against the baseline, not the window's first rating", () => {
  /* THE BUG THIS EXISTS TO PREVENT. A naive trend compares the first and last
     rating INSIDE the window. A student rated 2 in July and 3 in August has
     improved — but with only one August rating, a window-internal trend sees
     no movement at all and the report says nothing happened. */
  const r = report([o("rebuttal", 2, "2026-07-20"), o("rebuttal", 3, "2026-08-10")]);
  assert.equal(r.moved.length, 1);
  assert.equal(r.moved[0].from, 2);
  assert.equal(r.moved[0].to, 3);
  assert.equal(r.moved[0].delta, 1);
});

test("a bad day inside the window is not regression if the baseline was lower", () => {
  // 2 → 4 → 3 across the window still reads as +1 against what was believed
  // coming in. Comparing 4 → 3 would report a slip to a student who improved.
  const r = report([
    o("rebuttal", 2, "2026-07-20"),
    o("rebuttal", 4, "2026-08-05"),
    o("rebuttal", 3, "2026-08-20"),
  ]);
  assert.equal(r.moved[0].delta, 1);
});

test("a genuine slip is reported as one", () => {
  const r = report([o("weighing", 4, "2026-07-10"), o("weighing", 2, "2026-08-12")]);
  assert.equal(r.moved[0].delta, -2);
  assert.equal(r.focus, "Weighing", "a slip is what to work on next");
});

test("a skill seen for the first time is 'new', not 'improved'", () => {
  // With no baseline there is no delta. Reporting +3 from nothing would be
  // inventing progress out of a first observation.
  const r = report([o("crossfire", 3, "2026-08-08")]);
  assert.equal(r.moved.length, 0);
  assert.equal(r.newlySeen.length, 1);
  assert.equal(r.newlySeen[0].delta, null);
  assert.equal(r.newlySeen[0].from, null);
});

// ── stuck ────────────────────────────────────────────────────────────────────

test("a skill seen twice at the same low rating is stuck", () => {
  const r = report([
    o("structure", 2, "2026-07-01"),
    o("structure", 2, "2026-08-05"),
    o("structure", 2, "2026-08-20"),
  ]);
  assert.equal(r.stuck.length, 1);
  assert.equal(r.stuck[0].at, 2);
  assert.equal(r.stuck[0].timesSeen, 2, "counts observations inside the window");
});

test("a skill seen ONCE is not stuck — one observation is not a plateau", () => {
  const r = report([o("structure", 2, "2026-07-01"), o("structure", 2, "2026-08-05")]);
  assert.equal(r.stuck.length, 0);
});

test("sitting at Solid is not a problem to solve", () => {
  /* Listing every unchanged strong skill would bury the one or two that
     actually need attention, which is the whole job of this section. */
  const r = report([
    o("evidence", 4, "2026-07-01"),
    o("evidence", 4, "2026-08-05"),
    o("evidence", 4, "2026-08-20"),
  ]);
  assert.equal(r.stuck.length, 0);
  assert.equal(r.focus, null, "nothing wrong means name nothing");
});

test("a slip outranks a plateau when choosing what to work on", () => {
  const r = report([
    o("structure", 2, "2026-07-01"),
    o("structure", 2, "2026-08-05"),
    o("structure", 2, "2026-08-20"),
    o("weighing", 4, "2026-07-02"),
    o("weighing", 3, "2026-08-15"),
  ]);
  assert.equal(r.focus, "Weighing", "news beats a standing condition");
});

// ── the evidence ─────────────────────────────────────────────────────────────

test("the coach's own words are carried through verbatim, newest first", () => {
  const r = report([
    o("rebuttal", 3, "2026-08-02", "Still answering the easiest version."),
    o("rebuttal", 4, "2026-08-20", "Restated their best argument before answering it."),
  ]);
  assert.equal(r.notes.length, 2);
  assert.equal(r.notes[0].note, "Restated their best argument before answering it.");
  assert.equal(r.notes[0].skillLabel, "Rebuttal");
});

test("observations with no note are not empty rows in the evidence list", () => {
  const r = report([o("rebuttal", 3, "2026-08-02"), o("logic", 4, "2026-08-03", "Good warrant.")]);
  assert.equal(r.notes.length, 1);
});

test("notes from outside the period are not this period's evidence", () => {
  const r = report([o("rebuttal", 3, "2026-07-02", "July note.")]);
  assert.equal(r.notes.length, 0);
});

// ── rounds ───────────────────────────────────────────────────────────────────

const round = (id: number, on: string, side: "pro" | "con"): RoundRow =>
  ({
    id,
    held_on: on,
    pro_student_id: side === "pro" ? STUDENT : 99,
    con_student_id: side === "con" ? STUDENT : 99,
  }) as RoundRow;

const ballot = (roundId: number, winner: "pro" | "con", pro = 0, con = 0): SubmissionRow =>
  ({ id: ++seq, round_id: roundId, winner, speaker_points: { pro, con } }) as SubmissionRow;

test("a panel decides one round, not three", () => {
  /* Counting BALLOTS rather than rounds would let a single three-judge round
     outweigh three separate rounds — and a 2–1 loss would still bank a win. */
  const r = report(
    [],
    [round(1, "2026-08-10", "pro")],
    [ballot(1, "pro"), ballot(1, "con"), ballot(1, "con")]
  );
  assert.equal(r.rounds.rounds, 1);
  assert.equal(r.rounds.wins, 0, "2-1 against is a loss");
});

test("a majority for the student's side is a win", () => {
  const r = report(
    [],
    [round(1, "2026-08-10", "con")],
    [ballot(1, "con"), ballot(1, "con"), ballot(1, "pro")]
  );
  assert.equal(r.rounds.wins, 1);
});

test("speaker points are read from the side the student actually debated", () => {
  // Reading the wrong side's points is invisible in the output and completely
  // wrong: it reports the opponent's performance under the student's name.
  const r = report([], [round(1, "2026-08-10", "con")], [ballot(1, "con", 25, 28)]);
  assert.equal(r.rounds.averageSpeaks, 28);
});

test("rounds outside the period are not counted", () => {
  const r = report([], [round(1, "2026-07-04", "pro")], [ballot(1, "pro", 27, 25)]);
  assert.equal(r.rounds.rounds, 0);
  assert.equal(r.rounds.averageSpeaks, null);
});

test("a round somebody else debated is not this student's round", () => {
  const other = { id: 1, held_on: "2026-08-10", pro_student_id: 7, con_student_id: 8 } as RoundRow;
  const r = report([], [other], [ballot(1, "pro", 27, 25)]);
  assert.equal(r.rounds.rounds, 0);
});

// ── the empty case ───────────────────────────────────────────────────────────

test("a period with nothing in it says so instead of inventing a summary", () => {
  const r = report([o("rebuttal", 3, "2026-07-01")]);
  assert.equal(r.hasData, false);
  assert.match(r.headline, /Nothing logged/);
});

test("a round alone is enough to have something to report", () => {
  const r = report([], [round(1, "2026-08-10", "pro")], [ballot(1, "pro", 28, 25)]);
  assert.equal(r.hasData, true);
  assert.match(r.headline, /1 of 1 round won/);
});
