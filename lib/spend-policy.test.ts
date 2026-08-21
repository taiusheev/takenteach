/**
 * The spend policy, and the arithmetic it is supposed to encode.
 *
 * These figures are the only thing standing between `ai_usage` recording an
 * unbounded bill and something refusing to start the build that would create
 * it. They are also easy to edit into nonsense — a ceiling below the cost of
 * the builds a plan includes reads fine and silently makes the plan unusable —
 * so the relationships between them are asserted, not just the values.
 *
 *   node --test lib/spend-policy.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLANS,
  planFor,
  canStartBuild,
  modeFor,
  cacheHealth,
  CACHE_FLOOR,
  TYPICAL_BUILD_USD,
  WORST_BUILD_USD,
  spendGate,
  enforcedCeiling,
  BILLING_LIVE,
  RUNAWAY_CEILING_USD,
} from "./spend-policy.ts";
import type { UsageTotals } from "./usage-meter.ts";

const totals = (over: Partial<UsageTotals> = {}): UsageTotals => ({
  calls: 12,
  input: 40_000,
  cacheWrite: 0,
  cacheRead: 100_000,
  output: 140_000,
  usd: 5,
  ms: 300_000,
  records: [],
  ...over,
});

// ── the plan table has to be internally coherent ─────────────────────────────

test("every plan's ceiling covers the builds it includes", () => {
  // A ceiling below the cost of the included builds is a plan that stops
  // working in a normal month — the failure this whole file exists to avoid,
  // arriving from the other direction.
  for (const p of Object.values(PLANS)) {
    const includedCost = p.includedBuilds * TYPICAL_BUILD_USD;
    assert.ok(
      p.ceilingUsd >= includedCost,
      `${p.label}: ceiling $${p.ceilingUsd} is below the $${includedCost} its ${p.includedBuilds} included builds cost`
    );
  }
});

test("every plan can afford at least one worst-case build from zero", () => {
  for (const p of Object.values(PLANS)) {
    assert.equal(
      canStartBuild(p, 0).allow,
      true,
      `${p.label} cannot start a single build on an empty month`
    );
  }
});

test("plans get more generous as they get more expensive", () => {
  const ordered = [PLANS.free, PLANS.coach, PLANS.program, PLANS.school];
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(ordered[i].priceUsd > ordered[i - 1].priceUsd);
    assert.ok(ordered[i].includedBuilds > ordered[i - 1].includedBuilds);
    assert.ok(ordered[i].ceilingUsd > ordered[i - 1].ceilingUsd);
    assert.ok(
      ordered[i].modes.length >= ordered[i - 1].modes.length,
      `${ordered[i].label} offers fewer budget modes than ${ordered[i - 1].label}`
    );
  }
});

test("an unknown or missing plan falls back to Free, never to unlimited", () => {
  // The important direction: a bad string in organizations.plan must not become
  // permission to spend.
  assert.equal(planFor(undefined).id, "free");
  assert.equal(planFor("").id, "free");
  assert.equal(planFor("enterprise-unlimited").id, "free");
  assert.equal(planFor("  Coach ").id, "coach");
});

// ── the decision ─────────────────────────────────────────────────────────────

test("a fresh month allows a build and reports what is left", () => {
  const v = canStartBuild(PLANS.program, 0);
  assert.equal(v.allow, true);
  assert.equal(v.remainingUsd, PLANS.program.ceilingUsd);
});

test("a build is refused BEFORE it would die partway through", () => {
  // The case that matters: enough headroom for a typical build, not enough for
  // a worst case. Starting it leaves a teacher with half a pack.
  const mtd = PLANS.program.ceilingUsd - (TYPICAL_BUILD_USD + 1);
  const v = canStartBuild(PLANS.program, mtd);
  assert.equal(v.allow, false);
  assert.match(v.allow === false ? v.reason : "", /stop it partway/);
});

test("a spent month refuses outright", () => {
  const v = canStartBuild(PLANS.coach, PLANS.coach.ceilingUsd);
  assert.equal(v.allow, false);
  assert.equal(v.remainingUsd, 0);
});

test("the warning arrives before the refusal, not with it", () => {
  // At four-fifths spent there is still room for a build; the coach should hear
  // about it then rather than the first time they are turned away.
  const mtd = PLANS.school.ceilingUsd * 0.85;
  const v = canStartBuild(PLANS.school, mtd);
  assert.equal(v.allow, true);
  assert.ok(v.allow === true && v.warn, "expected a warning near the ceiling");
});

test("a cheaper estimate can be allowed where a full build would not", () => {
  // Section rewrites and QA passes cost far less than a build; the caller
  // passes its own estimate so a small job is not blocked by a big one's rule.
  const mtd = PLANS.coach.ceilingUsd - 4;
  assert.equal(canStartBuild(PLANS.coach, mtd).allow, false);
  assert.equal(canStartBuild(PLANS.coach, mtd, 1.0).allow, true);
});

// ── budget mode ──────────────────────────────────────────────────────────────

test("a plan gets the mode it asks for when it is allowed one", () => {
  assert.equal(modeFor(PLANS.school, "max"), "max");
  assert.equal(modeFor(PLANS.program, "balanced"), "balanced");
});

test("an unavailable mode downgrades rather than failing", () => {
  // Refusing the build would be worse than running it a third cheaper: the
  // teacher wanted a lesson, not a lecture about their plan.
  assert.equal(modeFor(PLANS.coach, "max"), "economy");
  assert.equal(modeFor(PLANS.free, "balanced"), "economy");
});

test("every plan allows Economy — it is the floor, not a feature", () => {
  for (const p of Object.values(PLANS)) assert.ok(p.modes.includes("economy"));
});

// ── cache health ─────────────────────────────────────────────────────────────

test("a build reusing its prefix is healthy", () => {
  const h = cacheHealth(totals());
  assert.equal(h.grade, "healthy");
  assert.equal(h.wastedUsd, 0);
});

test("writes with no reads is BROKEN, and the waste is priced", () => {
  // The measured failure: varying `effort` between stages re-keys the prefix,
  // every call writes at 2x, and nothing errors. This is the alarm.
  const h = cacheHealth(totals({ cacheRead: 0, cacheWrite: 150_000 }));
  assert.equal(h.grade, "broken");
  assert.ok(h.wastedUsd > 1, `expected the waste to be material, got $${h.wastedUsd}`);
  assert.match(h.detail, /re-written/);
});

test("a partially invalidated prefix is weak, not broken", () => {
  const h = cacheHealth(totals({ input: 180_000, cacheRead: 20_000, cacheWrite: 0 }));
  assert.equal(h.grade, "weak");
  assert.ok(h.hitRate < CACHE_FLOOR);
});

test("a single-call operation is not graded — it has nothing to reuse", () => {
  // Otherwise every section rewrite and QA pass reports a broken cache.
  const h = cacheHealth(totals({ calls: 1, cacheRead: 0, cacheWrite: 12_000 }));
  assert.equal(h.grade, "n/a");
  assert.equal(h.wastedUsd, 0);
});

test("the floor sits between the measured healthy and broken builds", () => {
  // Real builds measured 0%, 0%, 40% and 57%. A floor outside that spread would
  // either never fire or fire on everything.
  assert.ok(CACHE_FLOOR > 0 && CACHE_FLOOR < 0.4);
});

test("the worst case is dearer than the typical one, or the guard is pointless", () => {
  assert.ok(WORST_BUILD_USD > TYPICAL_BUILD_USD);
});

// ── what is actually ENFORCED, as opposed to what is priced ──────────────────
// The plan ceilings above are the commercial rule and they are right. They are
// not what a request is judged by until someone can pay, and these are the
// tests for that distinction.

test("while billing is off, the enforced ceiling is the runaway stop", () => {
  const c = enforcedCeiling(PLANS.free);
  assert.equal(c.kind, BILLING_LIVE ? "plan" : "runaway");
  if (!BILLING_LIVE) assert.equal(c.usd, RUNAWAY_CEILING_USD);
});

test("the runaway stop clears a real month on every plan, including Free", () => {
  /* THE MEASURED CASE THIS EXISTS FOR. Every organization sits on the `free`
     default nobody chose, and two had spent $6.71 and $4.73 this month against
     a $9 Free ceiling. Enforcing the plan table would have refused both on the
     first request — a permanent lockout, since there is no checkout to move
     off Free. */
  for (const mtd of [4.73, 6.71]) {
    const v = spendGate(PLANS.free, mtd);
    assert.equal(v.allow, true, `$${mtd} spent should not block a build`);
  }
});

test("a genuine runaway is still stopped", () => {
  // The thing the ceiling exists for: not a busy month, a loop.
  const v = spendGate(PLANS.free, RUNAWAY_CEILING_USD + 1);
  assert.equal(v.allow, false);
});

test("a runaway refusal never tells anyone to upgrade", () => {
  /* There is no checkout. Advice to "move to a larger plan" would send someone
     to a page that does not exist, and it would also be the wrong diagnosis —
     reaching this means something is broken, not that someone is popular. */
  const v = spendGate(PLANS.free, RUNAWAY_CEILING_USD + 1);
  assert.equal(v.allow, false);
  if (v.allow === false) {
    assert.doesNotMatch(v.reason, /larger plan/);
    assert.match(v.reason, /loop|leaked/);
    assert.match(v.reason, /Analytics/, "the advice must name a screen that exists");
  }
});

test("a plan refusal DOES name the way out, because there is one", () => {
  const v = canStartBuild(PLANS.coach, PLANS.coach.ceilingUsd);
  assert.equal(v.allow, false);
  if (v.allow === false) assert.match(v.reason, /larger plan/);
});

test("a cheap operation is allowed where a full build would not be", () => {
  // A QA pass costs cents. Refusing one because a BUILD would not fit is the
  // difference between a working product and a locked one at the month's end.
  const nearly = RUNAWAY_CEILING_USD - 2;
  assert.equal(spendGate(PLANS.free, nearly).allow, false, "a build should not fit");
  assert.equal(spendGate(PLANS.free, nearly, 0.5).allow, true, "a QA pass should");
});

test("the runaway stop is above every plan's typical month, or it fires first", () => {
  /* If the tripwire sat below what a plan's included builds cost, the paid
     tiers would be capped by the safety net rather than by what they bought —
     the commercial ceiling would never be reached and the plan table would be
     decoration. Only the two smallest plans need to fit today; the larger ones
     are why BILLING_LIVE has to flip before they are sold. */
  for (const p of [PLANS.free, PLANS.coach]) {
    assert.ok(
      RUNAWAY_CEILING_USD >= p.includedBuilds * TYPICAL_BUILD_USD,
      `${p.label} would hit the runaway stop in a normal month`
    );
  }
});
