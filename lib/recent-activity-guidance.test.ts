/**
 * "Don't use the same activities for a long time" — a teacher-facing request,
 * turned into a nudge in the generation prompt: if this teacher's own recent
 * packs leaned on the same activity shapes, say so, so the model reaches for
 * something else. Individually scoped — see `listOwnRecentLessonPacks` in
 * lib/db.ts, which filters on `created_by`, not `org_id`.
 *
 *   node --test lib/recent-activity-guidance.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { recentActivityGuidance } from "./analytics.ts";
import type { MaterialRow } from "./db.ts";

let seq = 0;
function pack(kinds: string[]): MaterialRow {
  return {
    id: ++seq,
    type: "lesson-pack",
    title: "T",
    status: "draft",
    updated_at: "2026-01-01",
    content: {
      activities: kinds.map((kind, i) => ({
        kind,
        title: `A${i}`,
        instructions: "Go.",
        prompts: [],
      })),
    },
  } as unknown as MaterialRow;
}

test("fewer than two prior packs — nothing has had the chance to repeat", () => {
  assert.equal(recentActivityGuidance([]), "");
  assert.equal(recentActivityGuidance([pack(["hook", "drill"])]), "");
});

test("a kind used in most recent packs is flagged", () => {
  const packs = [
    pack(["hook", "drill", "exit-ticket"]),
    pack(["hook", "review"]),
    pack(["hook", "drill"]),
  ];
  const note = recentActivityGuidance(packs);
  assert.match(note, /hook \(3 of the last 3\)/);
  assert.match(note, /drill \(2 of the last 3\)/);
  // Genuinely varied, so it must not be flagged.
  assert.doesNotMatch(note, /exit-ticket/);
  assert.doesNotMatch(note, /review/);
});

test("real variety produces no note at all", () => {
  const packs = [
    pack(["hook", "drill"]),
    pack(["case-study", "sparring"]),
    pack(["review", "exit-ticket"]),
  ];
  assert.equal(recentActivityGuidance(packs), "");
});

test("three drill pages on one pack still count as one pack, not three", () => {
  // If page count leaked through, "drill" would show 3-of-3 here — it only
  // ever appeared in a single PACK, so it must fall below the threshold and
  // not be flagged at all, exactly like a real one-off repeat wouldn't be.
  const packs = [
    pack(["drill", "drill", "drill"]),
    pack(["hook"]),
    pack(["review"]),
  ];
  assert.equal(recentActivityGuidance(packs), "");
});

test("the note never blocks — it is a nudge, not a gate", () => {
  // No assertion needed beyond: it returns a string, never throws, never a
  // structured refusal. This is what makes deliberate spaced repetition safe.
  const note = recentActivityGuidance([pack(["drill"]), pack(["drill"])]);
  assert.equal(typeof note, "string");
});
