import { MODELS, RATES, type BudgetMode } from "./model-policy";
import { cacheHitRate, type UsageTotals } from "./usage-meter";

/**
 * WHAT A PLAN IS ALLOWED TO SPEND, AND WHEN A BUILD IS COSTING TOO MUCH.
 *
 * Everything here follows from one measured number: a lesson pack costs
 * **$4.50–$5.85** to generate in Economy on a clean pass, and up to ~$8.83 when
 * the repair loop works hard (four real builds, `activity_log`, 2026-07-31 →
 * 08-04). Model it at $5.00 typical.
 *
 * That number is why this file exists at all. The two comparable products —
 * MagicSchool and Eduaide — sell UNLIMITED generation at $50–100 per teacher
 * per YEAR, because their artifact is one fast call for a worksheet. Ours is a
 * 10–17 call staged pipeline with citation checking and a print-grade design
 * system. A coach who builds a semester of lessons costs more in raw model
 * spend than a year of MagicSchool. Flat-unlimited is not available to us, so
 * the ceilings below are not a pricing preference; they are arithmetic.
 *
 * ── WHAT A CEILING IS FOR, AND WHAT IT IS NOT ─────────────────────────────
 * A ceiling is a RUNAWAY STOP, not the margin model. It is deliberately set
 * well above what a plan's included builds cost, because a plan that cuts a
 * coach off at exactly their allowance during a prep period has failed at the
 * one moment it mattered. What it exists to prevent is the other case: a
 * compromised account, a retry loop, or one user discovering they can press the
 * button forever. Today nothing stops that — `ai_usage` records every dollar
 * and nothing reads it back — so the bill has no upper bound at all.
 *
 * Blended margin across real users is the number that has to hold, and it is
 * NOT knowable from this file. It comes out of `ai_usage` once real schools are
 * on it. Re-derive these figures from that data rather than defending them.
 */

/** Measured mean cost of one full pack build, Economy, clean pass. */
export const TYPICAL_BUILD_USD = 5.0;
/** A heavily repaired build in the top budget mode. The planning worst case. */
export const WORST_BUILD_USD = 9.0;

export interface Plan {
  id: string;
  label: string;
  /** what the customer pays, per month */
  priceUsd: number;
  /** full pack builds included before overage */
  includedBuilds: number;
  /**
   * The hard monthly stop, in model spend. Set at 1.5x the included builds'
   * cost: enough headroom that a normal month never touches it, low enough that
   * a runaway is caught the same day rather than at the end of the month.
   */
  ceilingUsd: number;
  /**
   * Which budget modes this plan may run. The mix is worth about a third of
   * build cost, so leaving it unconstrained means one customer on Maximum can
   * put a tier under water on their own.
   */
  modes: BudgetMode[];
}

export const PLANS: Record<string, Plan> = {
  free: {
    id: "free",
    label: "Free",
    priceUsd: 0,
    includedBuilds: 1,
    // One build, and a little room for the repair loop on it. A free tier that
    // can run two full packs is a free tier that costs $10 a signup.
    ceilingUsd: 9,
    modes: ["economy"],
  },
  coach: {
    id: "coach",
    label: "Coach",
    priceUsd: 29,
    includedBuilds: 6,
    ceilingUsd: 45,
    modes: ["economy"],
  },
  program: {
    id: "program",
    label: "Program",
    priceUsd: 99,
    includedBuilds: 25,
    ceilingUsd: 188,
    modes: ["economy", "balanced"],
  },
  school: {
    id: "school",
    label: "School",
    priceUsd: 249,
    includedBuilds: 75,
    ceilingUsd: 563,
    modes: ["economy", "balanced", "max"],
  },
};

/** Unknown or unset plan strings fall back to Free — never to unlimited. */
export function planFor(id: string | null | undefined): Plan {
  return PLANS[(id ?? "").trim().toLowerCase()] ?? PLANS.free;
}

export type SpendVerdict =
  | { allow: true; warn?: string; remainingUsd: number }
  | { allow: false; reason: string; remainingUsd: 0 };

/* ── WHAT IS ACTUALLY ENFORCED TODAY ────────────────────────────────────────
   The plan ceilings above are the commercial rule and they are correct. They
   are ALSO not the thing to enforce yet, and wiring them as-is would have been
   a bug rather than a feature.

   The reason is one sentence: THERE IS NO WAY TO PAY. No Stripe, no checkout,
   nothing that can move an organization off the default plan. So a refusal
   reading "Builds resume next month, or on a larger plan" is a lie — there is
   no larger plan to move to — and a teacher who hits it is stopped
   permanently, with no action available to them. That is strictly worse than
   no limit at all, because at least an unbounded bill can be noticed and
   fixed.

   Measured, this was not hypothetical. Every organization in the database sits
   on the `free` default that nobody chose, and two of them had already spent
   $6.71 and $4.73 this month against a $9 free ceiling. Enforcing the plan
   table would have locked both out of building on the first request.

   So the ENFORCED limit is a runaway stop: high enough that no legitimate
   month reaches it, low enough that a retry loop or a stolen key is caught the
   same day. The commercial ceilings stay exactly where they are, fully tested,
   and `BILLING_LIVE` is the one line that turns them on the day checkout
   exists. */

/**
 * Is there a way for a customer to actually pay for more?
 *
 * Flip to `true` when checkout and the plan-change webhook are live. Nothing
 * else needs to change: the plan ceilings are already the enforced ones from
 * that moment on.
 */
export const BILLING_LIVE = false;

/**
 * The absolute monthly stop per organization, in model spend.
 *
 * Not a plan and not a budget to plan against — the tripwire. At a measured
 * $5 typical build this is roughly a dozen lessons a month, well past any real
 * teacher's use and well short of a loop that runs all night. It is the
 * organization-level twin of `MATERIAL_BUDGET_USD`, which caps one LESSON and
 * therefore cannot see a runaway that spreads across many.
 */
export const RUNAWAY_CEILING_USD = Number(process.env.ORG_BUDGET_USD ?? 60);

export interface Ceiling {
  usd: number;
  /** "plan" once billing is live; "runaway" while it is not */
  kind: "plan" | "runaway";
  label: string;
}

/** The ceiling a request is actually judged against right now. */
export function enforcedCeiling(plan: Plan): Ceiling {
  return BILLING_LIVE
    ? { usd: plan.ceilingUsd, kind: "plan", label: plan.label }
    : { usd: RUNAWAY_CEILING_USD, kind: "runaway", label: plan.label };
}

/**
 * May this organization start another build?
 *
 * Pure: it takes the month-to-date spend rather than reading the database, so
 * the decision is testable and the caller owns the query. `ai_usage` is already
 * org-scoped and indexed on `(org_id, id DESC)`, so the sum is one statement.
 *
 * The check is made BEFORE a build starts, against the WORST case rather than
 * the typical one. A build that begins with $6 of headroom and needs $9 does
 * not fail politely — it dies partway through `BudgetExceededError`, and the
 * teacher is left with half a pack.
 */
export function canStartBuild(
  plan: Plan,
  monthToDateUsd: number,
  estimateUsd: number = WORST_BUILD_USD
): SpendVerdict {
  return verdictFor(
    { usd: plan.ceilingUsd, kind: "plan", label: plan.label },
    monthToDateUsd,
    estimateUsd
  );
}

/**
 * THE DECISION A REQUEST IS ACTUALLY JUDGED BY.
 *
 * Same arithmetic as `canStartBuild`, against `enforcedCeiling` rather than
 * the plan's — see the block above for why those are different things until
 * checkout exists. This is what routes call; `canStartBuild` is the commercial
 * rule it becomes the day `BILLING_LIVE` flips.
 */
export function spendGate(
  plan: Plan,
  monthToDateUsd: number,
  estimateUsd: number = WORST_BUILD_USD
): SpendVerdict {
  return verdictFor(enforcedCeiling(plan), monthToDateUsd, estimateUsd);
}

/**
 * One implementation, two policies.
 *
 * The refusal wording differs by `kind` and that is the whole point: a plan
 * ceiling is something a customer can act on ("move to a larger plan"), and a
 * runaway stop is not — it means something has gone wrong, and telling someone
 * to upgrade would send them to a checkout that does not exist.
 */
function verdictFor(
  ceiling: Ceiling,
  monthToDateUsd: number,
  estimateUsd: number
): SpendVerdict {
  const remaining = Math.max(0, ceiling.usd - monthToDateUsd);
  const wayOut =
    ceiling.kind === "plan"
      ? `Builds resume next month, or on a larger plan.`
      : `Nothing should reach this in a normal month, so this usually means a build is retrying in a loop or a key has leaked. Check what spent it under Analytics before raising ORG_BUDGET_USD.`;

  if (monthToDateUsd >= ceiling.usd) {
    return {
      allow: false,
      reason: `This month's AI spend has reached the $${ceiling.usd} limit for this organization. ${wayOut}`,
      remainingUsd: 0,
    };
  }
  if (remaining < estimateUsd) {
    return {
      allow: false,
      reason: `Only $${remaining.toFixed(2)} of this month's $${ceiling.usd} limit is left, and this can cost up to $${estimateUsd.toFixed(2)}. Starting it would stop it partway through. ${wayOut}`,
      remainingUsd: 0,
    };
  }
  // Warn at four-fifths, so a coach finds out before the prep period where it
  // would matter rather than during it.
  if (monthToDateUsd > ceiling.usd * 0.8) {
    return {
      allow: true,
      remainingUsd: remaining,
      warn: `$${remaining.toFixed(2)} of this month's $${ceiling.usd} limit remains — about ${Math.floor(remaining / TYPICAL_BUILD_USD)} more build(s).`,
    };
  }
  return { allow: true, remainingUsd: remaining };
}

/** The mode this plan actually gets, downgraded rather than refused. */
export function modeFor(plan: Plan, requested: BudgetMode): BudgetMode {
  return plan.modes.includes(requested) ? requested : plan.modes[plan.modes.length - 1];
}

/* ── CACHE HEALTH ───────────────────────────────────────────────────────────
   The single most expensive thing that can go wrong without anything breaking.
   A build fires 10–17 calls sharing one ~12k-token system prefix. When the
   prefix caches, reads bill at 0.1x; when something re-keys it — a stray
   timestamp, a reordered key, a changed exemplar, a differing `effort` between
   stages — every call re-WRITES it at 2x instead. Nothing errors. The pack is
   fine. The bill roughly triples, and the measured spread on real builds is
   0%–57% hit rate against a ~$1/build swing.

   `cacheHitRate` and a re-write detector already existed, and both fed a
   SENTENCE on the build screen. A sentence nobody parses is not a control. This
   turns the same arithmetic into a verdict something can act on. */

export type CacheGrade = "healthy" | "weak" | "broken" | "n/a";

export interface CacheHealth {
  grade: CacheGrade;
  hitRate: number;
  /** what the wasted cache writes cost this build, in dollars */
  wastedUsd: number;
  detail: string;
}

/**
 * Below this, a multi-call build is not reusing its prefix properly. Set from
 * the real spread: healthy builds measured 40–57%, broken ones 0%.
 */
export const CACHE_FLOOR = 0.25;

export function cacheHealth(t: UsageTotals): CacheHealth {
  const hitRate = cacheHitRate(t);
  // One call cannot reuse a prefix it just created, so there is nothing to grade.
  if (t.calls < 2) return { grade: "n/a", hitRate, wastedUsd: 0, detail: "Single call — nothing to reuse." };

  /* What the repeated writes cost over what reads would have. Writes bill at
     2x input and reads at 0.1x, so a re-written prefix costs 20x what a reused
     one would — priced at the dearest rate in the table, because attributing
     this to a specific model would need per-call inspection and the point is
     an alarm, not an invoice. */
  const rate = RATES[MODELS.opus].in;
  const wastedUsd =
    t.cacheRead === 0 && t.cacheWrite > 0
      ? (t.cacheWrite * (2 - 0.1) * rate) / 1e6
      : 0;

  if (t.cacheWrite > 0 && t.cacheRead === 0) {
    return {
      grade: "broken",
      hitRate,
      wastedUsd,
      detail: `The system prefix was re-written on all ${t.calls} calls and never read back. Cache writes bill at 2x, so this build paid roughly $${wastedUsd.toFixed(2)} for nothing. Something is re-keying the prefix between stages.`,
    };
  }
  if (hitRate < CACHE_FLOOR) {
    return {
      grade: "weak",
      hitRate,
      wastedUsd,
      detail: `Only ${Math.round(hitRate * 100)}% of input came from cache across ${t.calls} calls, against a floor of ${Math.round(CACHE_FLOOR * 100)}%. Part of the prefix is being invalidated.`,
    };
  }
  return {
    grade: "healthy",
    hitRate,
    wastedUsd: 0,
    detail: `${Math.round(hitRate * 100)}% of input served from cache across ${t.calls} calls.`,
  };
}
