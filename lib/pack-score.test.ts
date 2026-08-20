/**
 * The structural quality scorer, and the spend ceiling.
 *
 * These two are what make a model comparison possible without a person reading
 * twenty pages per pack, and what stops that comparison bankrupting the API
 * account when it runs. Both are pure, so both are testable for free — which is
 * the whole design intent: the evaluation harness must cost nothing to exercise
 * or it will not be exercised.
 *
 *   node --test lib/pack-score.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePack, qualityPerDollar } from "./pack-score.ts";
import { GOLDEN_SET, goldenCase } from "./golden-set.ts";
import {
  BudgetExceededError,
  recordUsage,
  withUsageMeter,
} from "./usage-meter.ts";
import { MODELS } from "./model-policy.ts";
import { emptyLessonPack, lessonPackSchema, type LessonPack } from "./lesson-pack-schema.ts";

/** A pack with the beats, the keys, the cards and the guide — a good one. */
function goodPack(): LessonPack {
  return lessonPackSchema.parse({
    ...emptyLessonPack(),
    title: "THE COUNTERPUNCH",
    resolution: "Resolved: something arguable.",
    skillFocus: "Rebuttal",
    mission: "Break the link.",
    durationMin: 40,
    successCriteria: ["Name the warrant", "Attack it", "Use a card"],
    vocabulary: [
      { term: "Warrant", definition: "The reason.", analogy: "A bridge." },
      { term: "Rebuttal", definition: "An answer.", analogy: "A counterpunch." },
    ],
    evidenceCards: [
      {
        id: "A", side: "pro", institution: "OECD", author: "", year: "2017",
        publication: "UBI policy brief",
        paraphrase: "Pilots did not reliably raise employment.",
        translation: "Money alone did not create jobs.",
        tacticalNote: "Use against the work claim.",
        limit: "Short pilots only. Does NOT prove a permanent nationwide scheme behaves the same.",
        verified: true,
      },
    ],
    activities: [
      {
        kind: "hook", title: "THE ARENA", durationMin: 10,
        instructions: "Try it cold.",
        prompts: [{ label: "Attack this argument.", side: "neutral", expectedAnswer: "Name the warrant, then break it." }],
      },
      {
        kind: "i-do", title: "THE MODEL", durationMin: 10,
        instructions: "Watch me.",
        prompts: [{ label: "What did I attack?", side: "neutral", expectedAnswer: "The warrant, using Card A." }],
      },
      {
        kind: "we-do", title: "TOGETHER", durationMin: 10,
        instructions: "Now with me.",
        prompts: [{ label: "Find the warrant.", side: "neutral", expectedAnswer: "The unstated because-step." }],
      },
      {
        kind: "exit-ticket", title: "EXIT", durationMin: 10,
        instructions: "On your own.",
        steps: [{ text: "Name the warrant", detail: "Then break it" }],
        prompts: [{ label: "Write one rebuttal.", side: "neutral", expectedAnswer: "Attacks the warrant, cites Card A with its limit." }],
      },
    ],
    teacherGuide: {
      cohort: "Novice", assessment: "Exit ticket",
      materialsChecklist: "Printed packs, timer",
      pitfalls: "They restate their own case.",
      timingPlan: [{ startMin: 0, endMin: 40, phase: "All", who: "T+Ss", what: "Runs the arc" }],
      rubric: [{ score: "3 — Meets", descriptor: "Names and answers the warrant" }],
      pageCoaching: [
        { page: "THE ARENA", headTeacher: "Drive", assistant: "Watch", lookForGood: "Warrant named", lookForWeak: "Restating" },
        { page: "THE MODEL", headTeacher: "Model", assistant: "Watch", lookForGood: "Following", lookForWeak: "Copying" },
        { page: "TOGETHER", headTeacher: "Guide", assistant: "Watch", lookForGood: "Trying", lookForWeak: "Silent" },
      ],
    },
  });
}

test("an empty pack scores near zero and says why", () => {
  const s = scorePack(emptyLessonPack());
  assert.ok(s.total < 20, `empty pack scored ${s.total}`);
  assert.equal(s.pages, 0);
  assert.ok(
    s.components.every((c) => c.detail.length > 0),
    "every component must explain itself — a bare number teaches nobody anything"
  );
});

test("a structurally sound pack scores well", () => {
  const s = scorePack(goodPack());
  assert.ok(s.total >= 70, `a sound pack scored only ${s.total}: ` +
    s.components.filter((c) => c.score < 0.8).map((c) => `${c.id}=${c.score.toFixed(2)}`).join(" "));
});

test("removing the answer key is detected and costs points", () => {
  const good = goodPack();
  const s1 = scorePack(good);
  const stripped = lessonPackSchema.parse({
    ...good,
    activities: good.activities.map((a) => ({
      ...a,
      prompts: a.prompts.map((p) => ({ ...p, expectedAnswer: "" })),
    })),
  });
  const s2 = scorePack(stripped);
  assert.ok(s2.total < s1.total, "an unkeyed pack must score lower");
  assert.equal(s2.components.find((c) => c.id === "answer-key")?.score, 0);
});

test("an unused evidence card is caught by the coherence component", () => {
  const good = goodPack();
  const withOrphan = lessonPackSchema.parse({
    ...good,
    evidenceCards: [
      ...good.evidenceCards,
      { ...good.evidenceCards[0], id: "Z" },
    ],
  });
  const coh = scorePack(withOrphan).components.find((c) => c.id === "coherence");
  assert.ok(coh && coh.score < 1, "a card cited nowhere must cost coherence points");
});

test("timing drift is scored proportionally, not as a cliff", () => {
  const good = goodPack();
  const drifted = lessonPackSchema.parse({ ...good, durationMin: 60 }); // pages total 40
  const a = scorePack(good).components.find((c) => c.id === "timing")!.score;
  const b = scorePack(drifted).components.find((c) => c.id === "timing")!.score;
  assert.equal(a, 1, "a pack whose pages match its length scores full marks");
  assert.ok(b < a && b >= 0, "drift reduces the score without going negative");
});

test("quality per dollar is the comparison the whole exercise is for", () => {
  const s = scorePack(goodPack());
  const cheap = qualityPerDollar(s, 1.5);
  const dear = qualityPerDollar(s, 4.5);
  assert.ok(cheap > dear, "the same pack for a third of the price must win");
  assert.equal(qualityPerDollar(s, 0), 0, "a free pack must not divide by zero");
});

test("the golden set covers the cases that actually differ", () => {
  assert.ok(GOLDEN_SET.length >= 10, "too few cases to compare models on");
  const ids = new Set(GOLDEN_SET.map((c) => c.id));
  assert.equal(ids.size, GOLDEN_SET.length, "duplicate case ids");

  const subjects = new Set(GOLDEN_SET.map((c) => c.subject));
  assert.equal(subjects.size, 3, "all three subject tracks must be represented");

  const bands = new Set(GOLDEN_SET.map((c) => c.gradeBand));
  assert.ok(bands.size >= 4, "the age range is what breaks scaffolding — cover it");

  const rigors = new Set(GOLDEN_SET.map((c) => c.rigorLevel));
  assert.ok(rigors.has("foundational") && rigors.has("elite"), "both extremes needed");

  const times = GOLDEN_SET.map((c) => c.durationMin);
  assert.ok(Math.max(...times) - Math.min(...times) >= 60, "time extremes needed");

  for (const c of GOLDEN_SET) {
    assert.ok(c.brief.trim().length > 30, `${c.id}: brief too thin to be realistic`);
    assert.ok(c.probes.trim().length > 0, `${c.id}: no stated reason to exist`);
    assert.ok(c.expect.minScore > 0, `${c.id}: no pass mark`);
  }
  assert.ok(goldenCase("novice-rebuttal"), "lookup by id works");
});

test("the spend ceiling stops a run and names what it cost", async () => {
  let stopped: unknown;
  let attempts = 0;
  let finalCalls = 0;
  await withUsageMeter(
    async () => {
      try {
        // Each call is $30 on Opus; the ceiling is $10.
        for (let i = 0; i < 5; i++) {
          attempts++;
          recordUsage(
            { input_tokens: 1_000_000, output_tokens: 1_000_000 },
            { task: "activities", model: MODELS.opus, effort: "high", ms: 1, promptVersion: "v" }
          );
        }
      } catch (err) {
        stopped = err;
      }
    },
    (t) => {
      finalCalls = t.calls;
      /* The run is marked, so the caller reports a budget stop rather than
         guessing from an exception it may not have seen. */
      assert.equal(t.stoppedOnBudget, true);
    },
    { budgetUsd: 10 }
  );

  assert.ok(stopped instanceof BudgetExceededError, "the ceiling must throw");
  assert.equal(attempts, 1, "the loop must not reach a second call");
  assert.equal(
    finalCalls,
    1,
    "the call that crossed the line is still recorded — it was already paid for"
  );
  assert.ok((stopped as BudgetExceededError).spent > 10);
  assert.match((stopped as Error).message, /saved/, "must say the work is safe");
});

test("a run under its ceiling is untouched", async () => {
  let threw = false;
  let total = 0;
  await withUsageMeter(
    async () => {
      try {
        recordUsage(
          { input_tokens: 100_000, output_tokens: 100_000 },
          { task: "outline", model: MODELS.sonnet, effort: "medium", ms: 1, promptVersion: "v" }
        );
      } catch {
        threw = true;
      }
    },
    (t) => {
      total = t.usd;
    },
    { budgetUsd: 10 }
  );
  assert.equal(threw, false);
  assert.ok(total > 0 && total < 10);
});

test("with no ceiling set, nothing is enforced", async () => {
  let threw = false;
  await withUsageMeter(
    async () => {
      try {
        recordUsage(
          { input_tokens: 10_000_000, output_tokens: 10_000_000 },
          { task: "activities", model: MODELS.opus, effort: "high", ms: 1, promptVersion: "v" }
        );
      } catch {
        threw = true;
      }
    },
    () => {}
  );
  assert.equal(threw, false, "the ceiling is opt-in — an unmetered caller must not break");
});
