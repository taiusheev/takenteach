/**
 * What invalidates a content-QA verdict, and what must not.
 *
 * Invalidating this hash forces a full whole-pack review — an Opus call at
 * roughly 26¢, and the single largest post-build cost in the product. So the
 * boundary matters in both directions:
 *
 *   too broad   a cosmetic edit buys a re-review that cannot change its mind
 *   too narrow  a real content edit slips past the review gate unchecked
 *
 * The second is a correctness bug and far worse than the first, which is why
 * most of these tests assert that things DO invalidate.
 *
 *   node --test lib/qa-hash.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyLessonPack,
  lessonPackSchema,
  packContentHash,
  type LessonPack,
} from "./lesson-pack-schema.ts";

function pack(): LessonPack {
  return lessonPackSchema.parse({
    ...emptyLessonPack(),
    title: "THE COUNTERPUNCH",
    skillFocus: "Rebuttal",
    resolution: "Resolved: something arguable.",
    mission: "Break the link.",
    successCriteria: ["Name the warrant"],
    vocabulary: [{ term: "Warrant", definition: "The reason.", analogy: "A bridge." }],
    evidenceCards: [
      {
        id: "A", side: "pro", institution: "OECD", author: "", year: "2017",
        publication: "Brief", paraphrase: "A finding.", translation: "Plainly.",
        tacticalNote: "", limit: "Short pilots only, does not prove the general case.",
        verified: false,
      },
    ],
    activities: [
      {
        kind: "hook", title: "THE ARENA", badge: "COLD OPEN · 8 MIN", durationMin: 8,
        instructions: "Try it cold.",
        prompts: [{ label: "Attack this.", side: "neutral", expectedAnswer: "Name the warrant." }],
      },
    ],
    teacherGuide: { cohort: "Novice", assessment: "Exit", materialsChecklist: "Packs" },
  });
}

const edit = (p: LessonPack, patch: Partial<LessonPack["activities"][number]>) =>
  lessonPackSchema.parse({
    ...p,
    activities: p.activities.map((a, i) => (i === 0 ? { ...a, ...patch } : a)),
  });

test("the same pack always hashes the same", () => {
  assert.equal(packContentHash(pack()), packContentHash(pack()));
});

test("retiming a page does NOT invalidate the review", () => {
  // The reviewer is never shown a minute figure; the deterministic checklist
  // owns timing. Re-reviewing would return the verdict it just gave.
  const before = pack();
  assert.equal(
    packContentHash(edit(before, { durationMin: 12 })),
    packContentHash(before),
    "a duration change forced a 26¢ whole-pack re-review for nothing"
  );
});

test("changing a decorative badge does NOT invalidate the review", () => {
  const before = pack();
  assert.equal(
    packContentHash(edit(before, { badge: "WARM UP · 8 MIN" })),
    packContentHash(before)
  );
});

test("changing what students are told to DO invalidates it", () => {
  const before = pack();
  assert.notEqual(
    packContentHash(edit(before, { instructions: "Now do it in pairs." })),
    packContentHash(before)
  );
});

test("changing an expected answer invalidates it — the answer key is reviewed", () => {
  const before = pack();
  const after = lessonPackSchema.parse({
    ...before,
    activities: before.activities.map((a) => ({
      ...a,
      prompts: a.prompts.map((p) => ({ ...p, expectedAnswer: "Something else." })),
    })),
  });
  assert.notEqual(packContentHash(after), packContentHash(before));
});

test("touching an evidence card invalidates it — citations are the point of QA", () => {
  const before = pack();
  const after = lessonPackSchema.parse({
    ...before,
    evidenceCards: before.evidenceCards.map((c) => ({ ...c, year: "2019" })),
  });
  assert.notEqual(packContentHash(after), packContentHash(before));
});

test("rigor mechanics still invalidate, even though QA cannot see them yet", () => {
  // Deliberate: narrowing the hash to the reviewer's current blind spots would
  // silently bless real teaching content that nobody checked.
  const before = pack();
  const after = edit(before, {
    microCrossfire: {
      seconds: 30,
      listenerRole: "Ask one question at the warrant.",
      questions: [{ stem: "Why does that follow?", targets: "warrant" }],
    },
  });
  assert.notEqual(packContentHash(after), packContentHash(before));
});

test("adding a whole page invalidates it", () => {
  const before = pack();
  const after = lessonPackSchema.parse({
    ...before,
    activities: [
      ...before.activities,
      { kind: "exit-ticket", title: "EXIT", instructions: "Alone now." },
    ],
  });
  assert.notEqual(packContentHash(after), packContentHash(before));
});

test("the mission and criteria are content, not metadata", () => {
  const before = pack();
  assert.notEqual(
    packContentHash(lessonPackSchema.parse({ ...before, mission: "Something else." })),
    packContentHash(before)
  );
  assert.notEqual(
    packContentHash(
      lessonPackSchema.parse({ ...before, successCriteria: ["Do a different thing"] })
    ),
    packContentHash(before)
  );
});

test("the printed stylesheet is not content", () => {
  const before = pack();
  assert.equal(
    packContentHash(lessonPackSchema.parse({ ...before, designCss: ".x{color:red}" })),
    packContentHash(before)
  );
});
