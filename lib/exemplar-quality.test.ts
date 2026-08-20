/**
 * The quality bar has to clear the bar.
 *
 * The exemplar rides in the cached system prefix of every call in a build and
 * is framed to the model as the standard to match. Eligibility used to ask only
 * for a review tier and at least one activity, so the pack teaching every new
 * build what "good" looks like could be one that its own content QA had refused
 * to pass. That is a ratchet pointing the wrong way: the next pack learns from
 * it, and then becomes eligible itself.
 *
 *   node --test lib/exemplar-quality.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { exemplarQuality, pickExemplar, isExemplarEligible } from "./memory.ts";
import type { MaterialRow } from "./db.ts";

let seq = 0;
function row(over: Record<string, unknown> = {}, content: Record<string, unknown> = {}): MaterialRow {
  return {
    id: ++seq,
    type: "lesson-pack",
    title: "T",
    status: "in_review",
    updated_at: "2026-01-01",
    content: {
      activities: [{ kind: "hook", title: "A", instructions: "Go.", prompts: [] }],
      ...content,
    },
    ...over,
  } as unknown as MaterialRow;
}

const qa = (grade: string, ready: boolean) =>
  JSON.stringify({ overallGrade: grade, readyForReview: ready });

test("a pack its own QA refused to pass ranks below an unknown one", () => {
  // Negative rather than zero on purpose: zero means "no evidence", and a
  // reviewer pass that read the pack and refused it is worse than no evidence.
  const rejected = exemplarQuality(row({}, { contentQaJson: qa("B", false) }));
  const unknown = exemplarQuality(row({}, { contentQaJson: "" }));
  assert.ok(rejected < 0, `expected a negative score, got ${rejected}`);
  assert.ok(rejected < unknown);
});

test("a graded pack scores by its grade", () => {
  assert.equal(exemplarQuality(row({}, { contentQaJson: qa("A", true) })), 3);
  assert.equal(exemplarQuality(row({}, { contentQaJson: qa("B", true) })), 2);
  assert.equal(exemplarQuality(row({}, { contentQaJson: qa("C", true) })), 1);
});

test("a malformed QA report is treated as no evidence, not as a failure", () => {
  // Otherwise one bad JSON write silently demotes a good pack out of the pool.
  const m = row({}, { contentQaJson: "{not json" });
  assert.ok(exemplarQuality(m) >= 0);
});

test("an ungraded pack falls back to how much student-facing work it carries", () => {
  const bare = row({}, { contentQaJson: "" });
  const rich = row(
    {},
    {
      contentQaJson: "",
      activities: [
        {
          kind: "independent-build",
          title: "B",
          instructions: "Go.",
          whyItMatters: "A judge votes for something.",
          prompts: [{ label: "Write it.", side: "neutral", expectedAnswer: "x", guide: "Name the move." }],
        },
      ],
    }
  );
  assert.ok(
    exemplarQuality(rich) > exemplarQuality(bare),
    "a pack that coaches its students should outrank one that does not"
  );
  // …but never above a QA-graded A, because a completeness heuristic is weaker
  // evidence than a reviewer pass that read the whole pack.
  assert.ok(exemplarQuality(rich) < exemplarQuality(row({}, { contentQaJson: qa("A", true) })));
});

test("review tier still outranks quality — a human vouching is the stronger signal", () => {
  const publishedWeak = row({ status: "published", updated_at: "2026-01-01" }, { contentQaJson: qa("C", true) });
  const reviewStrong = row({ status: "in_review", updated_at: "2026-06-01" }, { contentQaJson: qa("A", true) });
  const picked = pickExemplar([reviewStrong, publishedWeak], {});
  assert.equal(picked?.id, publishedWeak.id);
});

test("within a tier, the better pack wins even when the worse one matches the format", () => {
  // This is the case the old ranking got wrong: relevance beat everything below
  // tier, so a closely-matched weak pack became the house standard.
  const weakButMatching = row(
    { status: "in_review", updated_at: "2026-06-01" },
    { contentQaJson: qa("C", true), format: "skill-drill", gradeBand: "Grades 9–10", rigorLevel: "advanced" }
  );
  const strongButDistant = row(
    { status: "in_review", updated_at: "2026-01-01" },
    { contentQaJson: qa("A", true), format: "debate-lab" }
  );
  const picked = pickExemplar([weakButMatching, strongButDistant], {
    format: "skill-drill",
    gradeBand: "Grades 9–10",
    rigorLevel: "advanced",
  });
  assert.equal(picked?.id, strongButDistant.id);
});

test("a pack QA rejected loses to one with no report at all", () => {
  const rejected = row({ updated_at: "2026-06-01" }, { contentQaJson: qa("A", false) });
  const unreviewed = row({ updated_at: "2026-01-01" }, { contentQaJson: "" });
  assert.equal(pickExemplar([rejected, unreviewed], {})?.id, unreviewed.id);
});

test("the pool never empties just because everything scores badly", () => {
  // The comment in getBestExemplar records what happened last time the pool ran
  // dry: the lookup fell through to a query with no type filter and handed every
  // build a judge ballot as its quality bar. Quality ranks; it must not exclude.
  const allBad = [
    row({ updated_at: "2026-01-01" }, { contentQaJson: qa("F", false) }),
    row({ updated_at: "2026-02-01" }, { contentQaJson: qa("F", false) }),
  ];
  assert.ok(allBad.every(isExemplarEligible), "quality is a ranking, not an eligibility rule");
  assert.ok(pickExemplar(allBad, {}), "a weak standard still beats no standard");
});

test("drafts remain ineligible however good they are", () => {
  const draft = row({ status: "draft" }, { contentQaJson: qa("A", true) });
  assert.equal(isExemplarEligible(draft), false);
  assert.equal(pickExemplar([draft], {}), null);
});
