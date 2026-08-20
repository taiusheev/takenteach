import { logAiUsage, type Scope } from "@/lib/db";
import { budgetMode } from "@/lib/model-policy";
import { usageBreakdown, withUsageMeter } from "@/lib/usage-meter";

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
