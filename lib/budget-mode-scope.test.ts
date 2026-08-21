/**
 * THE BUDGET MODE MUST NOT LEAK BETWEEN REQUESTS.
 *
 * It was `let current: BudgetMode` at module scope, which is correct in exactly
 * one deployment — a single process serving one person — and is the deployment
 * we are leaving. docs/DEPLOYMENT.md §4 listed it as work still to do; this is
 * that work, and these are the three ways it went wrong, each of them silent:
 *
 *   · ONE ORGANIZATION SETS ANOTHER'S PRICE. A warm serverless instance is
 *     shared. A school choosing Maximum would decide the bill for whoever
 *     landed on that instance next.
 *   · A BUILD CHANGES PRICE MID-FLIGHT. A build is many requests now, and
 *     nothing pins two legs to one instance, so a run started at Maximum could
 *     finish at Economy with no record either way.
 *   · IT RE-KEYS THE PROMPT CACHE. `effort` is part of the cache key and
 *     `policyFor` reads the mode to choose it — so two legs disagreeing means
 *     the ~12k-token prefix is written at 2x instead of read at 0.1x. That is
 *     the 0%-hit-rate signature arriving from a direction nobody would look.
 *
 * None of that shows up as an error. It shows up on an invoice, which is why
 * it is tested rather than reasoned about.
 *
 *   node --test lib/budget-mode-scope.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  budgetMode,
  withBudgetMode,
  setBudgetMode,
  policyFor,
  runsPolish,
  MODELS,
} from "./model-policy.ts";

test("with no scope at all, the mode is Economy", () => {
  /* The safe default, and the one the standing instruction asks for. A request
     that never declares a mode must not inherit one from whatever ran last. */
  assert.equal(budgetMode(), "economy");
});

test("two concurrent requests do not see each other's mode", async () => {
  /* THE CROSS-TENANT CASE. Interleaved on purpose: both scopes are open at the
     same time, which is exactly what a shared instance looks like and exactly
     what a module variable cannot represent. */
  const seen: string[] = [];
  const slow = withBudgetMode("max", async () => {
    seen.push(`a:${budgetMode()}`);
    await new Promise((r) => setTimeout(r, 20));
    seen.push(`a:${budgetMode()}`); // still Maximum after yielding
    return budgetMode();
  });
  const quick = withBudgetMode("economy", async () => {
    await new Promise((r) => setTimeout(r, 5));
    seen.push(`b:${budgetMode()}`);
    return budgetMode();
  });

  const [a, b] = await Promise.all([slow, quick]);
  assert.equal(a, "max");
  assert.equal(b, "economy");
  assert.deepEqual(seen, ["a:max", "b:economy", "a:max"]);
});

test("a request's mode does not survive it", async () => {
  // The leak that sets the price for the next person on the instance.
  await withBudgetMode("max", async () => {
    assert.equal(budgetMode(), "max");
  });
  assert.equal(budgetMode(), "economy", "the mode outlived the request that set it");
});

test("the mode reaches the policy table, which is the whole point", async () => {
  /* Reading the mode is not the job — pricing a call is. `policyFor` defaults
     its `mode` parameter from the scope, so the ~16 indirect call sites get it
     without being passed anything. */
  await withBudgetMode("economy", async () => {
    assert.equal(policyFor("teacher-guide").model, MODELS.sonnet);
    assert.equal(runsPolish(), false, "Economy drops the polish pass");
  });
  await withBudgetMode("max", async () => {
    assert.equal(policyFor("teacher-guide").model, MODELS.opus);
    assert.equal(runsPolish(), true);
  });
});

test("the staged effort follows the mode, because the cache key depends on it", async () => {
  /* Every staged task must run at ONE effort per mode or the shared prefix is
     re-written instead of read — a measured 0% hit rate and a $4.93 build.
     If the mode is per-request, so is that guarantee. */
  await withBudgetMode("economy", async () => {
    const efforts = new Set(
      (["outline", "foundation", "evidence", "activities", "teacher-guide"] as const).map(
        (t) => policyFor(t).effort
      )
    );
    assert.equal(efforts.size, 1, `staged tasks disagreed on effort: ${[...efforts]}`);
    assert.equal([...efforts][0], "medium");
  });
  await withBudgetMode("max", async () => {
    assert.equal(policyFor("activities").effort, "high");
  });
});

test("nested scopes take the inner mode and restore the outer one", async () => {
  await withBudgetMode("economy", async () => {
    await withBudgetMode("max", async () => assert.equal(budgetMode(), "max"));
    assert.equal(budgetMode(), "economy", "the inner scope leaked outward");
  });
});

test("setBudgetMode outside any scope does nothing, rather than something global", async () => {
  /* It survives for the one caller that cannot wrap — a background run that
     outlives its request. Called with no scope it must be inert: the failure
     to guard against is a stray call quietly repricing every other request on
     the instance. */
  setBudgetMode("max");
  assert.equal(budgetMode(), "economy");
});

test("setBudgetMode inside a scope affects only that scope", async () => {
  await withBudgetMode("economy", async () => {
    setBudgetMode("max");
    assert.equal(budgetMode(), "max");
  });
  assert.equal(budgetMode(), "economy");
});
