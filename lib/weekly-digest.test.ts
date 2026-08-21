/**
 * The week, and the four ways a digest lies.
 *
 * A weekly summary is read quickly and trusted completely, which makes a wrong
 * one worse than none: it either invents work that did not happen, or quietly
 * drops work that did. Each test here is one of those failures.
 *
 *   node --test lib/weekly-digest.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { weeklyDigest, daysAgo, teachingFeedbackForPrompt } from "./weekly-digest.ts";
import type { MaterialRow, ObservationRow, StudentRow, TaughtRow } from "./db.ts";

const TODAY = "2026-08-20";

let seq = 0;
function taught(over: Partial<TaughtRow> = {}): TaughtRow {
  return {
    id: ++seq,
    material_id: 1,
    taught_by: 1,
    lesson_title: "L1 · REBUTTAL",
    cohort: "Novice",
    taught_on: TODAY,
    pacing: "",
    rating: 0,
    note: "",
    skipped: [],
    created_at: TODAY,
    ...over,
  };
}

function material(over: Partial<MaterialRow> = {}, pages = 4): MaterialRow {
  return {
    id: 1,
    type: "lesson-pack",
    title: "L1 · REBUTTAL",
    status: "published",
    updated_at: `${TODAY} 10:00:00`,
    content: {
      series: "Novice",
      activities: Array.from({ length: pages }, (_, i) => ({
        kind: "drill",
        title: `PAGE ${i + 1}`,
        instructions: "Go.",
        prompts: [],
        optional: false,
      })),
    },
    ...over,
  } as unknown as MaterialRow;
}

const student = (id: number, name: string): StudentRow =>
  ({ id, name, cohort: "Novice", archived: 0 }) as StudentRow;

const obs = (studentId: number, on: string): ObservationRow =>
  ({ id: ++seq, student_id: studentId, observed_on: on, skill: "rebuttal", rating: 3 }) as ObservationRow;

const digest = (over: Partial<Parameters<typeof weeklyDigest>[0]> = {}) =>
  weeklyDigest({
    today: TODAY,
    taught: [],
    materials: [],
    students: [],
    observations: [],
    ...over,
  });

// ── the window ───────────────────────────────────────────────────────────────

test("a lesson taught before the window is not this week's work", () => {
  // The failure this catches: a digest that pads itself with older rows. One
  // padded week and nobody trusts the section again.
  const d = digest({ taught: [taught({ taught_on: daysAgo(TODAY, 30) })] });
  assert.equal(d.taught.length, 0);
});

test("a lesson taught today is in the window — the boundary is inclusive", () => {
  // Off-by-one at the near edge means the lesson you just taught is missing
  // from the summary you open straight afterwards.
  assert.equal(digest({ taught: [taught({ taught_on: TODAY })] }).taught.length, 1);
});

test("the far edge of the window is inclusive too", () => {
  const d = digest({ taught: [taught({ taught_on: daysAgo(TODAY, 7) })] });
  assert.equal(d.taught.length, 1);
});

// ── what you HAVEN'T done ────────────────────────────────────────────────────

test("a finished lesson never taught is surfaced once it has waited", () => {
  const old = `${daysAgo(TODAY, 20)} 10:00:00`;
  const d = digest({ materials: [material({ updated_at: old })] });
  assert.equal(d.unused.length, 1);
  assert.equal(d.unused[0].daysWaiting, 20);
});

test("a lesson built yesterday is new, not neglected", () => {
  // Without the grace period every freshly built pack appears as a reproach,
  // which teaches the reader to skim past the section that matters.
  const d = digest({ materials: [material({ updated_at: `${daysAgo(TODAY, 1)} 10:00:00` })] });
  assert.equal(d.unused.length, 0);
});

test("a lesson that WAS taught never counts as unused, however long ago", () => {
  const d = digest({
    materials: [material({ id: 7, updated_at: `${daysAgo(TODAY, 60)} 10:00:00` })],
    taught: [taught({ material_id: 7, taught_on: daysAgo(TODAY, 55) })],
  });
  assert.equal(d.unused.length, 0);
});

test("an empty draft is not an unused lesson — it belongs on the unfinished list", () => {
  const d = digest({
    materials: [material({ status: "draft", updated_at: `${daysAgo(TODAY, 30)} 10:00:00` }, 0)],
  });
  assert.equal(d.unused.length, 0);
});

// ── pacing: the only feedback loop on generated durations ────────────────────

test("one or two lessons is not a pattern", () => {
  const d = digest({
    taught: [taught({ pacing: "behind" }), taught({ pacing: "behind" })],
  });
  assert.equal(d.pacing.behind, 2);
  assert.equal(d.pacing.note, null, "two lessons must not produce a verdict");
});

test("a majority running out of time is stated plainly", () => {
  const d = digest({
    taught: [
      taught({ pacing: "behind" }),
      taught({ pacing: "behind" }),
      taught({ pacing: "behind" }),
      taught({ pacing: "on" }),
    ],
  });
  assert.match(d.pacing.note ?? "", /3 of 4/);
  assert.match(d.pacing.note ?? "", /longer than this class gets through/);
});

test("a majority finishing early is stated too — the loop runs both ways", () => {
  const d = digest({
    taught: [taught({ pacing: "ahead" }), taught({ pacing: "ahead" }), taught({ pacing: "ahead" })],
  });
  assert.match(d.pacing.note ?? "", /finished early/);
});

test("unanswered pacing is not counted as 'on time'", () => {
  // Silence is not evidence that the durations are right. If "" counted as
  // "on", every coach who skipped the question would be telling us the
  // generator's timings are correct.
  const d = digest({
    taught: [taught({ pacing: "" }), taught({ pacing: "" }), taught({ pacing: "" }), taught({ pacing: "behind" })],
  });
  assert.equal(d.pacing.on, 0);
  assert.equal(d.pacing.note, null, "one answered lesson is not a pattern");
});

// ── skipped pages ────────────────────────────────────────────────────────────

test("a page cut twice is a pattern; a page cut once is a Tuesday", () => {
  const d = digest({
    taught: [
      taught({ skipped: ["PAGE 3"] }),
      taught({ skipped: ["PAGE 3"] }),
      taught({ skipped: ["PAGE 4"] }),
    ],
    materials: [material()],
  });
  assert.equal(d.skipped.length, 1);
  assert.equal(d.skipped[0].title, "PAGE 3");
  assert.equal(d.skipped[0].count, 2);
});

test("whether the pack MEANT that page to be droppable is recorded", () => {
  /* The whole point of the distinction: a page the author already marked
     optional being cut is the cut path working. A page marked core being cut
     repeatedly is the pack being wrong about its own priorities. */
  const m = material();
  (m.content as { activities: { title: string; optional: boolean }[] }).activities[0].optional = true;
  const d = digest({
    taught: [taught({ skipped: ["PAGE 1"] }), taught({ skipped: ["PAGE 1"] })],
    materials: [m],
  });
  assert.equal(d.skipped[0].wasMarkedOptional, true);
});

test("a page cut from a since-deleted pack still counts", () => {
  // material_id goes NULL when a pack is deleted. The record of skipping it is
  // still a fact about the week, and must not vanish with the lesson.
  const d = digest({
    taught: [
      taught({ material_id: null, skipped: ["PAGE 3"] }),
      taught({ material_id: null, skipped: ["PAGE 3"] }),
    ],
  });
  assert.equal(d.skipped.length, 1);
  assert.equal(d.skipped[0].wasMarkedOptional, false, "nothing left to say it was optional");
});

// ── students ─────────────────────────────────────────────────────────────────

test("students with no observation this week are named", () => {
  const d = digest({
    students: [student(1, "Ada"), student(2, "Bo")],
    observations: [obs(1, TODAY)],
  });
  assert.deepEqual(d.unseenStudents, ["Bo"]);
});

test("an archived student is not an unseen student", () => {
  const d = digest({
    students: [student(1, "Ada"), { ...student(2, "Bo"), archived: 1 }],
    observations: [],
  });
  assert.deepEqual(d.unseenStudents, ["Ada"]);
});

// ── the empty case ───────────────────────────────────────────────────────────

test("a quiet week says so rather than assembling one from older rows", () => {
  const d = digest({ taught: [taught({ taught_on: daysAgo(TODAY, 40) })] });
  assert.equal(d.hasData, false);
  assert.match(d.headline, /Nothing logged/);
});

test("the headline counts both halves — done, and not done", () => {
  const d = digest({
    taught: [taught()],
    materials: [material({ id: 9, updated_at: `${daysAgo(TODAY, 30)} 10:00:00` })],
  });
  assert.match(d.headline, /1 lesson taught this week/);
  assert.match(d.headline, /1 finished lesson still waiting/);
});

// ── the loop back into generation ────────────────────────────────────────────
// Without these, the digest reports "four of five ran out of time" every week
// for a term while the generator keeps planning fifteen pages for ninety
// minutes, because nothing carries the observation anywhere it can be used.

test("a room that keeps running out of time tells the next build to plan shorter", () => {
  const s = teachingFeedbackForPrompt(
    [taught({ pacing: "behind" }), taught({ pacing: "behind" }), taught({ pacing: "on" })],
    TODAY
  );
  assert.match(s, /OUT OF TIME/);
  assert.match(s, /2 of the last 3/);
  assert.match(s, /fewer pages/, "the instruction has to be actionable, not a complaint");
});

test("a room that keeps finishing early is told the opposite", () => {
  const s = teachingFeedbackForPrompt(
    [taught({ pacing: "ahead" }), taught({ pacing: "ahead" }), taught({ pacing: "ahead" })],
    TODAY
  );
  assert.match(s, /FINISHED EARLY/);
  assert.doesNotMatch(s, /fewer pages/);
});

test("a mixed record says nothing — a prompt full of guesses is worse than a gap", () => {
  const s = teachingFeedbackForPrompt(
    [taught({ pacing: "behind" }), taught({ pacing: "on" }), taught({ pacing: "ahead" })],
    TODAY
  );
  assert.equal(s, "");
});

test("two lessons is not enough evidence to change how packs are built", () => {
  const s = teachingFeedbackForPrompt(
    [taught({ pacing: "behind" }), taught({ pacing: "behind" })],
    TODAY
  );
  assert.equal(s, "");
});

test("a term-old pattern is not evidence about the class in the room now", () => {
  // These students have moved on. Calibrating against them would make the
  // generator confidently wrong about a different cohort.
  const old = daysAgo(TODAY, 200);
  const s = teachingFeedbackForPrompt(
    [
      taught({ pacing: "behind", taught_on: old }),
      taught({ pacing: "behind", taught_on: old }),
      taught({ pacing: "behind", taught_on: old }),
    ],
    TODAY
  );
  assert.equal(s, "");
});

test("unanswered pacing never reaches the prompt", () => {
  const s = teachingFeedbackForPrompt(
    [taught({ pacing: "" }), taught({ pacing: "" }), taught({ pacing: "" })],
    TODAY
  );
  assert.equal(s, "");
});
