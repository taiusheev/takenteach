import { AsyncLocalStorage } from "node:async_hooks";
import { MODELS, RATES, type AiTask } from "./model-policy";

/**
 * WHAT A BUILD ACTUALLY COST, PER CALL, AT THE PRICE THE CALL ACTUALLY PAID.
 *
 * This exists because the expensive parts of the pipeline are invisible. A pack
 * build fires ~10–17 requests that share one cached system prefix; if that cache
 * silently stops being hit — a stray timestamp in the prompt, a reordered key, a
 * changed exemplar — nothing breaks and nothing warns. The bill just triples.
 * Measured on the real corpus the prefix is ~11k tokens, so the difference
 * between "cache working" and "cache broken" is roughly $1 per build.
 *
 * Cache reads bill at 0.1x input and writes at 2x (the 1-hour TTL this pipeline
 * uses), so reporting the three input numbers separately is what makes a broken
 * cache obvious at a glance rather than a slow leak.
 *
 * ── THE BUG THIS FILE USED TO HAVE, AND WHY IT MATTERED MOST OF ALL ──────
 * `usageCost()` priced every token at Opus 5's $5/$25, with the rates written
 * into this file as two constants. That was true when every call ran on Opus.
 * It stopped being true the day lib/model-policy.ts started routing planning,
 * outlines, the teacher guide and the design to Sonnet — and the DEFAULT budget
 * mode is Economy, where most of a build runs on Sonnet at $3/$15.
 *
 * So the one number the whole cost discipline rests on — the figure on the build
 * screen, the figure written to the activity log, the figure the estimate was
 * calibrated against — was overstating a default build by roughly 40%. Every
 * conclusion drawn from it was drawn from a number that had drifted away from
 * the architecture. A meter that is confidently wrong is worse than no meter:
 * it makes the wrong optimization look justified.
 *
 * The fix is not a better constant. It is that the meter must be told which
 * model ran, because only the caller knows, and the price table already exists
 * in one place (model-policy). Per-call records also answer the questions
 * totals never could: which task costs the most, which model the budget goes
 * to, which stage is slow.
 *
 * Scoped with AsyncLocalStorage rather than a module global so two builds
 * running at once can't blend their totals.
 */

/** One model call, priced at its own model's rate. */
export interface CallRecord {
  task: AiTask;
  model: string;
  effort: string;
  /** full-price input tokens */
  input: number;
  /** tokens written to cache — billed at 2x on the 1h TTL */
  cacheWrite: number;
  /** tokens served from cache — billed at 0.1x */
  cacheRead: number;
  /** generated tokens, including thinking */
  output: number;
  /** wall-clock milliseconds for the call */
  ms: number;
  /** which revision of the prompt produced this — see PROMPT_VERSIONS */
  promptVersion: string;
  /** true when the call was submitted through the 50%-priced batch API */
  batched: boolean;
  usd: number;
}

export interface UsageTotals {
  calls: number;
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  /** Summed from the per-call records, each at its own model's rate. */
  usd: number;
  ms: number;
  /** Every call, in order, so a build can be broken down after the fact. */
  records: CallRecord[];
  /** The ceiling this run must not cross, if one was set. */
  budgetUsd?: number;
  /** True once the ceiling was hit — so the caller can report it, not guess. */
  stoppedOnBudget?: boolean;
}

const store = new AsyncLocalStorage<UsageTotals>();

export function emptyUsage(): UsageTotals {
  return {
    calls: 0,
    input: 0,
    cacheWrite: 0,
    cacheRead: 0,
    output: 0,
    usd: 0,
    ms: 0,
    records: [],
  };
}

/**
 * Cost of one call, applying the cache multipliers at that model's rate.
 *
 * The batch API is half price for everything, which is why the overnight queue
 * exists at all — so a batched call must not be billed here as if it ran live.
 */
export function priceCall(
  model: string,
  t: { input: number; cacheWrite: number; cacheRead: number; output: number },
  batched = false
): number {
  const rate = RATES[model] ?? RATES[MODELS.opus];
  const inputEquivalent = t.input + t.cacheWrite * 2 + t.cacheRead * 0.1;
  const usd = (inputEquivalent * rate.in + t.output * rate.out) / 1e6;
  return batched ? usd / 2 : usd;
}

/**
 * The spend ceiling was crossed. Deliberately its own class so the retry logic
 * can recognise it as permanent: retrying a job that has already spent too much
 * is the exact behaviour the ceiling exists to prevent.
 */
export class BudgetExceededError extends Error {
  /* Declared as fields rather than constructor parameter properties: the test
     runner strips types rather than compiling them (see scripts/test-resolver),
     and `constructor(readonly spent: number)` is syntax it cannot strip. */
  spent: number;
  limit: number;

  constructor(spent: number, limit: number) {
    super(
      `This run reached its spending limit ($${spent.toFixed(2)} of $${limit.toFixed(2)}). ` +
        `Everything finished so far has been saved.`
    );
    this.name = "BudgetExceededError";
    this.spent = spent;
    this.limit = limit;
  }
}

export function withUsageMeter<T>(
  fn: () => Promise<T>,
  onFinish: (totals: UsageTotals) => void | Promise<void>,
  opts: {
    /**
     * Hard ceiling for this run, in USD.
     *
     * ── WHY A CEILING AT ALL ─────────────────────────────────────────────
     * Nothing in the pipeline could previously stop itself spending. The stall
     * guard catches a build that makes no progress, and the retry limit caps
     * one stage — but a build that keeps making progress, or a loop that keeps
     * legitimately finishing stages, had no upper bound at all. The failure
     * mode is not theoretical: an eight-page repair pass, a QA revision round
     * and a resumed leg can each be justified individually while the total runs
     * away, and the first anyone knows is the invoice.
     *
     * Checked after each call rather than before, because the cost of a call is
     * not known until it returns. That means the limit can be overshot by one
     * call — which is the honest guarantee, and why the default sits well above
     * a normal build rather than close to it.
     */
    budgetUsd?: number;
  } = {}
): Promise<T> {
  const totals = emptyUsage();
  totals.budgetUsd = opts.budgetUsd;
  return store.run(totals, async () => {
    try {
      return await fn();
    } finally {
      await onFinish(totals);
    }
  });
}

/**
 * Record one response against the active meter.
 *
 * `task`, `model` and `effort` come from the caller because only the caller
 * knows them — the API response carries token counts and nothing about which of
 * this product's fourteen jobs asked for them.
 */
export function recordUsage(
  usage: unknown,
  meta: {
    task: AiTask;
    model: string;
    effort: string;
    ms: number;
    promptVersion: string;
    batched?: boolean;
  }
): void {
  const totals = store.getStore();
  if (!totals || !usage || typeof usage !== "object") return;
  const u = usage as Record<string, unknown>;
  const n = (k: string) => (typeof u[k] === "number" ? (u[k] as number) : 0);

  const call = {
    input: n("input_tokens"),
    cacheWrite: n("cache_creation_input_tokens"),
    cacheRead: n("cache_read_input_tokens"),
    output: n("output_tokens"),
  };
  const usd = priceCall(meta.model, call, meta.batched);

  totals.calls += 1;
  totals.input += call.input;
  totals.cacheWrite += call.cacheWrite;
  totals.cacheRead += call.cacheRead;
  totals.output += call.output;
  totals.usd += usd;
  totals.ms += meta.ms;
  totals.records.push({
    task: meta.task,
    model: meta.model,
    effort: meta.effort,
    ...call,
    ms: meta.ms,
    promptVersion: meta.promptVersion,
    batched: !!meta.batched,
    usd,
  });

  /* Enforced HERE, at the one point every call in the product passes through,
     rather than at each of the sixteen call sites — a ceiling that has to be
     remembered is a ceiling that will be forgotten. The call that crossed it is
     already paid for and already recorded; what this stops is the next one. */
  if (totals.budgetUsd !== undefined && totals.usd > totals.budgetUsd) {
    totals.stoppedOnBudget = true;
    throw new BudgetExceededError(totals.usd, totals.budgetUsd);
  }
}

/** Estimated cost in USD — summed per call, each at its own model's rate. */
export function usageCost(t: UsageTotals): number {
  return t.usd;
}

/**
 * How much of the input was served from cache. Near zero on a build that made
 * several calls means the cached prefix is being invalidated — the one number
 * worth alerting on.
 */
export function cacheHitRate(t: UsageTotals): number {
  const total = t.input + t.cacheWrite + t.cacheRead;
  return total === 0 ? 0 : t.cacheRead / total;
}

/** The build's spend grouped by task, most expensive first. */
export function costByTask(
  t: UsageTotals
): { task: AiTask; calls: number; usd: number; output: number }[] {
  const by = new Map<AiTask, { calls: number; usd: number; output: number }>();
  for (const r of t.records) {
    const g = by.get(r.task) ?? { calls: 0, usd: 0, output: 0 };
    g.calls += 1;
    g.usd += r.usd;
    g.output += r.output;
    by.set(r.task, g);
  }
  return [...by.entries()]
    .map(([task, g]) => ({ task, ...g }))
    .sort((a, b) => b.usd - a.usd);
}

/** The build's spend grouped by model. */
export function costByModel(
  t: UsageTotals
): { model: string; calls: number; usd: number }[] {
  const by = new Map<string, { calls: number; usd: number }>();
  for (const r of t.records) {
    const g = by.get(r.model) ?? { calls: 0, usd: 0 };
    g.calls += 1;
    g.usd += r.usd;
    by.set(r.model, g);
  }
  return [...by.entries()]
    .map(([model, g]) => ({ model, ...g }))
    .sort((a, b) => b.usd - a.usd);
}

/**
 * One line for the build screen.
 *
 * Cache WRITES are reported separately from uncached input on purpose. They used
 * to be added together as "fresh in", which hid the single most diagnostic
 * number in the system: a build showing 0% hits and a big fresh figure could
 * mean the prefix was never cacheable, OR that it was re-written on every call —
 * and those have completely different causes. (It was the second: varying
 * `effort` between stages re-keys the cache, and writes bill at 2x, so the
 * repeated writes were what made a $1.20 build cost $4.93.) Repeated writes with
 * no reads is now visible at a glance.
 */
export function describeUsage(t: UsageTotals): string {
  const k = (n: number) => `${(n / 1000).toFixed(1)}k`;
  const rewrite =
    t.cacheWrite > 0 && t.cacheRead === 0 && t.calls > 1
      ? " — prefix re-written every call, cache is not being reused"
      : "";
  const top = costByTask(t)[0];
  return (
    `${t.calls} model calls · ${k(t.output)} out · ` +
    `${k(t.cacheRead)} cached in (${Math.round(cacheHitRate(t) * 100)}%) · ` +
    `${k(t.cacheWrite)} cache writes · ${k(t.input)} uncached in · ` +
    `~$${t.usd.toFixed(2)}` +
    (top ? ` · dearest: ${top.task} $${top.usd.toFixed(2)}` : "") +
    rewrite
  );
}

/**
 * A compact, machine-readable breakdown for the cost history.
 *
 * Stored alongside the human line so the analytics page can aggregate real
 * numbers instead of parsing prose back out of an activity log.
 */
export function usageBreakdown(t: UsageTotals): string {
  return JSON.stringify({
    calls: t.calls,
    usd: Number(t.usd.toFixed(4)),
    ms: t.ms,
    in: t.input,
    cw: t.cacheWrite,
    cr: t.cacheRead,
    out: t.output,
    byTask: costByTask(t).map((r) => ({
      t: r.task,
      n: r.calls,
      usd: Number(r.usd.toFixed(4)),
      out: r.output,
    })),
    byModel: costByModel(t).map((r) => ({
      m: r.model,
      n: r.calls,
      usd: Number(r.usd.toFixed(4)),
    })),
  });
}
