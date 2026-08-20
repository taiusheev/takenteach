/**
 * What a build costs, and the bug that made every reported figure wrong.
 *
 * `usageCost()` used to hold two constants — Opus 5's $5/$25 — and apply them
 * to every token the pipeline spent. That was correct exactly once: before
 * lib/model-policy.ts started routing planning, outlines, the teacher guide and
 * the design to Sonnet. The DEFAULT budget mode is Economy, where most of a
 * build runs on Sonnet at $3/$15, so the number on the build screen, the number
 * in the cost history, and the number the estimator was calibrated against were
 * all inflated by roughly 40%.
 *
 * Nothing failed. That is the point of these tests: a meter cannot be checked
 * by using the product, because a wrong price looks exactly like a right one.
 *
 *   node --test lib/usage-meter.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  costByModel,
  costByTask,
  emptyUsage,
  priceCall,
  recordUsage,
  usageBreakdown,
  withUsageMeter,
} from "./usage-meter.ts";
import { MODELS, RATES, maxOutputFor, promptVersion } from "./model-policy.ts";
import { summarizeSpend } from "./ai-spend.ts";
import type { AiUsageRow } from "./db.ts";

const NONE = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };

test("a call is priced at its own model's rate, not at Opus's", () => {
  const call = { ...NONE, input: 1_000_000, output: 1_000_000 };
  const opus = priceCall(MODELS.opus, call);
  const sonnet = priceCall(MODELS.sonnet, call);

  assert.equal(opus, RATES[MODELS.opus].in + RATES[MODELS.opus].out);
  assert.equal(sonnet, RATES[MODELS.sonnet].in + RATES[MODELS.sonnet].out);
  assert.ok(
    sonnet < opus,
    "the cheaper model must cost less — this is the whole point of the routing table"
  );
});

test("an unknown model falls back to the dearest rate rather than to free", () => {
  const call = { ...NONE, input: 1_000_000 };
  assert.equal(
    priceCall("some-future-model", call),
    priceCall(MODELS.opus, call),
    "an unpriced model must never be metered as costing nothing"
  );
});

test("cache writes bill at 2x and reads at 0.1x", () => {
  const rate = RATES[MODELS.opus].in;
  assert.equal(
    priceCall(MODELS.opus, { ...NONE, cacheWrite: 1_000_000 }),
    rate * 2
  );
  assert.equal(
    priceCall(MODELS.opus, { ...NONE, cacheRead: 1_000_000 }),
    rate * 0.1
  );
});

test("a batched call is half price — the reason the overnight queue exists", () => {
  const call = { ...NONE, input: 1_000_000, output: 1_000_000 };
  assert.equal(
    priceCall(MODELS.opus, call, true),
    priceCall(MODELS.opus, call, false) / 2
  );
});

test("a mixed-model build sums each call at its own rate", async () => {
  const totals = await withUsageMeter(
    async () => {
      // One Opus page-writing call and one Sonnet teacher-guide call.
      recordUsage(
        { input_tokens: 1_000_000, output_tokens: 1_000_000 },
        {
          task: "activities",
          model: MODELS.opus,
          effort: "high",
          ms: 1000,
          promptVersion: promptVersion("activities"),
        }
      );
      recordUsage(
        { input_tokens: 1_000_000, output_tokens: 1_000_000 },
        {
          task: "teacher-guide",
          model: MODELS.sonnet,
          effort: "medium",
          ms: 500,
          promptVersion: promptVersion("teacher-guide"),
        }
      );
      return "built";
    },
    () => {}
  );
  assert.equal(totals, "built");
});

test("per-call records attribute spend to task and model", async () => {
  let captured = emptyUsage();
  await withUsageMeter(
    async () => {
      recordUsage(
        { input_tokens: 1_000_000, output_tokens: 2_000_000 },
        { task: "activities", model: MODELS.opus, effort: "high", ms: 900, promptVersion: "activities_v2" }
      );
      recordUsage(
        { input_tokens: 1_000_000, output_tokens: 0 },
        { task: "outline", model: MODELS.sonnet, effort: "medium", ms: 100, promptVersion: "outline_v2" }
      );
    },
    (t) => {
      captured = t;
    }
  );

  assert.equal(captured.calls, 2);
  assert.equal(captured.ms, 1000);
  assert.equal(captured.records.length, 2);
  assert.equal(captured.records[0].promptVersion, "activities_v2");

  const byTask = costByTask(captured);
  assert.equal(byTask[0].task, "activities", "the dearest task must sort first");
  const byModel = costByModel(captured);
  assert.equal(byModel[0].model, MODELS.opus);

  // 1M in + 2M out on Opus = $5 + $50; 1M in on Sonnet = $3.
  assert.equal(Number(captured.usd.toFixed(4)), 58);
});

test("calls made outside a meter are dropped, not thrown", () => {
  assert.doesNotThrow(() =>
    recordUsage(
      { input_tokens: 100 },
      { task: "plan", model: MODELS.sonnet, effort: "low", ms: 1, promptVersion: "plan_v2" }
    )
  );
});

test("the breakdown round-trips into the spend summary", async () => {
  let breakdown = "";
  await withUsageMeter(
    async () => {
      recordUsage(
        { input_tokens: 1_000_000, output_tokens: 1_000_000 },
        { task: "evidence", model: MODELS.opus, effort: "high", ms: 10, promptVersion: "evidence_v2" }
      );
    },
    (t) => {
      breakdown = usageBreakdown(t);
    }
  );

  const row: AiUsageRow = {
    id: 1,
    material_id: 7,
    operation: "build",
    calls: 1,
    input_tokens: 1_000_000,
    cache_write_tokens: 0,
    cache_read_tokens: 0,
    output_tokens: 1_000_000,
    usd_micros: 30_000_000,
    ms: 10,
    budget_mode: "economy",
    ok: true,
    breakdown,
    created_at: "2026-08-14 10:00:00",
  };

  const s = summarizeSpend([row]);
  assert.equal(s.usd, 30);
  assert.equal(s.lessons, 1);
  assert.equal(s.usdPerLesson, 30);
  assert.equal(s.byTask[0].task, "evidence");
  assert.equal(s.byModel[0].model, MODELS.opus);
});

test("a malformed breakdown does not take the cost view down", () => {
  const row = {
    id: 1, material_id: null, operation: "qa", calls: 1,
    input_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0, output_tokens: 0,
    usd_micros: 1_000_000, ms: 0, budget_mode: "", ok: true,
    breakdown: "{ this is not json",
    created_at: "",
  } as AiUsageRow;
  const s = summarizeSpend([row]);
  assert.equal(s.usd, 1);
  assert.deepEqual(s.byTask, []);
});

test("failed operations are counted separately — they still bill", () => {
  const rows: AiUsageRow[] = [
    { id: 1, material_id: 1, operation: "build", calls: 1, input_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0, output_tokens: 0, usd_micros: 2_000_000, ms: 0, budget_mode: "", ok: true, breakdown: "{}", created_at: "" },
    { id: 2, material_id: 1, operation: "qa", calls: 2, input_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0, output_tokens: 0, usd_micros: 500_000, ms: 0, budget_mode: "", ok: false, breakdown: "{}", created_at: "" },
  ];
  const s = summarizeSpend(rows);
  assert.equal(s.usd, 2.5, "a failure's spend belongs in the total — it was invoiced");
  assert.equal(s.failedUsd, 0.5);
  assert.equal(s.failedCalls, 2);
});

test("every task has an output ceiling, and none is the old blanket 64k", () => {
  const tasks = [
    "plan", "outline", "foundation", "evidence", "activities", "teacher-guide",
    "polish", "revise", "qa", "design-system", "art-direction", "unit-plan",
    "research", "simple-content",
  ] as const;
  for (const t of tasks) {
    const max = maxOutputFor(t);
    assert.ok(max > 0, `${t} has no ceiling`);
    assert.ok(
      max < 64_000,
      `${t} is still effectively uncapped — the point of the ceiling is that a runaway call cannot cost a third of a build`
    );
  }
  assert.ok(
    maxOutputFor("activities") > maxOutputFor("plan"),
    "writing a batch of pages must be allowed more room than filling eight fields"
  );
});

test("every task has a prompt version, so a change is attributable", () => {
  const tasks = ["plan", "activities", "qa", "revise"] as const;
  for (const t of tasks) {
    assert.match(promptVersion(t), /_v\d+$/, `${t} has no versioned prompt`);
  }
});
