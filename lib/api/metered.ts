import { logAiUsage, orgSpendThisMonthUsd, type Scope } from "@/lib/db";
import { getOrganization } from "@/lib/auth/store";
import { budgetMode } from "@/lib/model-policy";
import { usageBreakdown, withUsageMeter } from "@/lib/usage-meter";
import { planFor, spendGate, type SpendVerdict } from "@/lib/spend-policy";

/**
 * MAY THIS ORGANIZATION SPEND ANY MORE THIS MONTH?
 *
 * ── THE HOLE THIS CLOSES ─────────────────────────────────────────────────
 * `ai_usage` recorded every dollar and nothing ever read it back, so the only
 * ceiling in the product was `MATERIAL_BUDGET_USD` — which caps ONE LESSON.
 * A loop that spreads across lessons, or a leaked key, had no upper bound at
 * all: each individual build looked reasonable and the month did not.
 *
 * ── ASKED BEFORE THE MONEY, NOT AFTER ────────────────────────────────────
 * Separate from `metered()` on purpose, even though they are used together.
 * `metered` wraps the call and reports what it cost; this decides whether to
 * make it. Folding the check inside would mean the refusal could only be
 * raised as an exception from inside a stream that has already started, which
 * is exactly the half-finished failure the estimate exists to avoid.
 *
 * Two reads, both indexed. Worth it on an operation about to spend dollars.
 */
export async function checkSpend(
  scope: Scope,
  estimateUsd: number
): Promise<SpendVerdict> {
  const org = await getOrganization(scope.orgId);
  /* A missing organization means the session outlived its org, which is not a
     reason to hand out unlimited spend. `planFor` already falls back to the
     most restrictive plan for anything it does not recognise. */
  const plan = planFor(org?.plan);
  return spendGate(plan, await orgSpendThisMonthUsd(scope.orgId), estimateUsd);
}

/**
 * What each operation is expected to cost, for the pre-flight check.
 *
 * Deliberately the WORST case rather than the typical one — the check exists
 * to stop something dying halfway, and a typical-case estimate approves
 * exactly the requests that then run out. The build figure is the measured
 * worst case from `lib/spend-policy.ts`; the rest are single calls against the
 * pack's context and are an order of magnitude smaller.
 */
export const ESTIMATE_USD = {
  build: 9,
  qa: 0.5,
  revise: 0.5,
  section: 0.5,
  design: 0.5,
  plan: 0.1,
  research: 0.1,
} as const;

/**
 * RUN AN AI OPERATION AND RECORD WHAT IT COST.
 *
 * ── THE GAP THIS CLOSES ──────────────────────────────────────────────────
 * Only the build route was metered. Everything else — every section rewrite,
 * every pack-wide revision, every QA re-run, every plan, every research call,
 * every stylesheet — spent real money and left no record of it anywhere.
 *
 * That was survivable when a build was the only expensive thing anyone did. It
 * stopped being survivable the moment the editor grew per-page AI actions:
 * Improve / Simplify / Expand / Shorten are one click each, a teacher will use
 * them dozens of times on one lesson, and each is a full model call against the
 * pack's context. The highest-FREQUENCY spend in the product was the part with
 * no accounting at all — so "what does a lesson really cost" was answerable only
 * for the cheapest half of its life.
 *
 * ── FAILURES ARE RECORDED TOO ────────────────────────────────────────────
 * `ok: false` rather than no row. A call that fails after the model has
 * generated 20k tokens still bills for them, and a cost view that quietly drops
 * failures reports a number lower than the invoice. Retries are the same money.
 *
 * ── AND IT NEVER CHANGES THE OUTCOME ─────────────────────────────────────
 * The original error is always re-thrown, and `logAiUsage` swallows its own
 * failures, so bookkeeping cannot turn a successful rewrite into a 500.
 */
export async function metered<T>(
  opts: {
    scope: Scope;
    materialId?: number | null;
    /** What the user was doing: 'section', 'revise', 'qa', 'plan', 'design'… */
    operation: string;
  },
  fn: () => Promise<T>
): Promise<T> {
  let ok = true;
  /* The catch is INSIDE the metered function, not around it. `withUsageMeter`
     calls `onFinish` from its own `finally`, which runs before an outer catch
     could set this — so wrapping from the outside would have recorded every
     failed call as a success. */
  return withUsageMeter(
    async () => {
      try {
        return await fn();
      } catch (err) {
        ok = false;
        throw err;
      }
    },
    async (totals) => {
      /* A call that never reached the model — a guard refusal, a validation
         throw — spent nothing, and a row of zeroes per rejected request would
         bury the real spend in noise. */
      if (totals.calls === 0) return;
      await logAiUsage({
        orgId: opts.scope.orgId,
        materialId: opts.materialId ?? null,
        operation: opts.operation,
        calls: totals.calls,
        inputTokens: totals.input,
        cacheWriteTokens: totals.cacheWrite,
        cacheReadTokens: totals.cacheRead,
        outputTokens: totals.output,
        usd: totals.usd,
        ms: totals.ms,
        budgetMode: budgetMode(),
        ok,
        breakdown: usageBreakdown(totals),
      });
    }
  );
}
