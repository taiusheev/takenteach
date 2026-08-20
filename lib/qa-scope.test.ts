/**
 * Which pages a stored content-QA verdict still covers.
 *
 * The dangerous direction is over-claiming: reporting a page as "still
 * reviewed" when something it depends on has moved would put a false
 * reassurance in front of the one gate that protects a classroom. So most of
 * these tests assert that cover is WITHDRAWN, and the one that asserts cover is
 * kept (a page reorder) is the case where nothing reviewable changed at all.
 *
 *   node --test lib/qa-scope.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  captureQaScope,
  qaCoverage,
  describeCoverage,
  pageContentHash,
} from "./qa-scope.ts";
import {
  emptyLessonPack,
  lessonPackSchema,
  type LessonPack,
} from "./lesson-pack-schema.ts";

function pack(): LessonPack {
  return lessonPackSchema.parse({
    ...emptyLessonPack(),
    title: "T",
    skillFocus: "Rebuttal",
    resolution: "Resolved: something.",
    mission: "Break the link.",
    successCriteria: ["Name the warrant"],
    vocabulary: [{ term: "Warrant", definition: "The reason.", analogy: "A bridge." }],
    evidenceCards: [
      {
        id: "A", side: "pro", institution: "OECD", author: "", year: "2017",
        publication: "Brief", paraphrase: "A finding.", translation: "Plainly.",
        tacticalNote: "", limit: "Pilots only; does not prove the general case.",
        verified: false,
      },
    ],
    activities: [
      { kind: "hook", title: "ARENA", durationMin: 8, instructions: "Try it cold.",
        prompts: [{ label: "Attack.", side: "neutral", expectedAnswer: "Name the warrant." }] },
      { kind: "i-do", title: "MODEL", durationMin: 10, instructions: "Watch me." },
      { kind: "exit-ticket", title: "EXIT", durationMin: 8, instructions: "Alone now." },
    ],
    teacherGuide: { cohort: "N", assessment: "Exit", materialsChecklist: "Packs" },
  });
}

const setPage = (p: LessonPack, i: number, patch: Record<string, unknown>) =>
  lessonPackSchema.parse({
    ...p,
    activities: p.activities.map((a, j) => (j === i ? { ...a, ...patch } : a)),
  });

test("an untouched pack is fully covered", () => {
  const p = pack();
  const c = qaCoverage(p, captureQaScope(p));
  assert.equal(c.current, true);
  assert.deepEqual(c.changedPages, []);
  assert.deepEqual(c.stillCovered, [0, 1, 2]);
  assert.equal(describeCoverage(c, 3), "");
});

test("editing one page withdraws cover from that page only", () => {
  const p = pack();
  const scope = captureQaScope(p);
  const after = setPage(p, 1, { instructions: "Now watch closely." });

  const c = qaCoverage(after, scope);
  assert.equal(c.current, false);
  assert.deepEqual(c.changedPages, [1]);
  assert.deepEqual(c.stillCovered, [0, 2], "the other two verdicts still hold");
  assert.match(describeCoverage(c, 3), /1 of 3 pages changed/);
});

test("a cosmetic edit does not withdraw cover — the reviewer cannot see it", () => {
  const p = pack();
  const scope = captureQaScope(p);
  const after = setPage(p, 0, { badge: "WARM UP", durationMin: 99 });
  assert.equal(qaCoverage(after, scope).current, true);
});

test("changing the evidence deck withdraws cover from EVERY page", () => {
  // A page verdict rests on the cards it cites; the cards moved under it.
  const p = pack();
  const scope = captureQaScope(p);
  const after = lessonPackSchema.parse({
    ...p,
    evidenceCards: p.evidenceCards.map((c) => ({ ...c, year: "2019" })),
  });

  const c = qaCoverage(after, scope);
  assert.equal(c.globalChanged, true);
  assert.deepEqual(c.stillCovered, [], "no page may still claim to be reviewed");
  assert.deepEqual(c.changedPages, [0, 1, 2]);
  assert.match(describeCoverage(c, 3), /cited across the whole pack/);
});

test("changing the mission or criteria is global too", () => {
  const p = pack();
  const scope = captureQaScope(p);
  for (const patch of [
    { mission: "Something else." },
    { successCriteria: ["A different promise"] },
    { resolution: "Resolved: a different motion." },
  ]) {
    const after = lessonPackSchema.parse({ ...p, ...patch });
    assert.equal(
      qaCoverage(after, scope).globalChanged,
      true,
      `${Object.keys(patch)[0]} must be global`
    );
  }
});

test("reordering pages keeps every verdict — nothing reviewable changed", () => {
  // Matching by index would report every page after a move as unreviewed.
  const p = pack();
  const scope = captureQaScope(p);
  const reordered = lessonPackSchema.parse({
    ...p,
    activities: [p.activities[1], p.activities[0], p.activities[2]],
  });
  const c = qaCoverage(reordered, scope);
  assert.equal(c.current, true, "a reorder is not a content change");
  assert.equal(c.stillCovered.length, 3);
});

test("an added page is reported as never reviewed", () => {
  const p = pack();
  const scope = captureQaScope(p);
  const after = lessonPackSchema.parse({
    ...p,
    activities: [...p.activities, { kind: "drill", title: "NEW", instructions: "Do it." }],
  });
  const c = qaCoverage(after, scope);
  assert.deepEqual(c.newPages, [3]);
  assert.ok(c.changedPages.includes(3));
  assert.equal(c.current, false);
});

test("a deleted page is reported, not silently forgotten", () => {
  const p = pack();
  const scope = captureQaScope(p);
  const after = lessonPackSchema.parse({
    ...p,
    activities: p.activities.filter((_, i) => i !== 1),
  });
  const c = qaCoverage(after, scope);
  assert.deepEqual(c.removedPages, ["MODEL"]);
  assert.equal(c.current, false, "the report describes a pack that no longer exists");
});

test("with no stored scope, nothing is claimed as covered", () => {
  const p = pack();
  const c = qaCoverage(p, null);
  assert.equal(c.current, false);
  assert.deepEqual(c.stillCovered, [], "absence of evidence is never cover");
  assert.equal(c.globalChanged, true);
});

test("two pages with identical content hash identically — cover is per content, not per slot", () => {
  const p = pack();
  const a = { ...p.activities[0] };
  const twin = lessonPackSchema.parse({ ...p, activities: [a, { ...a }] });
  assert.equal(
    pageContentHash(twin.activities[0]),
    pageContentHash(twin.activities[1])
  );
});
