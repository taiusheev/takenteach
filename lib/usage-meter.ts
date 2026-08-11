import { AsyncLocalStorage } from "node:async_hooks";

/**
 * What a build actually cost, accumulated across every model call it made.
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
 * Scoped with AsyncLocalStorage rather than a module global so two builds
 * running at once can't blend their totals.
 */

export interface UsageTotals {
  calls: number;
  /** full-price input tokens */
  input: number;
  /** tokens written to cache — billed at 2x on the 1h TTL */
  cacheWrite: number;
  /** tokens served from cache — billed at 0.1x */
  cacheRead: number;
  /** generated tokens, including thinking */
  output: number;
}

/** Claude Opus 5, $ per million tokens. */
const RATE_IN = 5;
const RATE_OUT = 25;

const store = new AsyncLocalStorage<UsageTotals>();

export function emptyUsage(): UsageTotals {
  return { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
}

/** Run `fn` with a fresh meter; the totals are handed to `onFinish`. */
export function withUsageMeter<T>(
  fn: () => Promise<T>,
  onFinish: (totals: UsageTotals) => void
): Promise<T> {
  const totals = emptyUsage();
  return store.run(totals, async () => {
    try {
      return await fn();
    } finally {
      onFinish(totals);
    }
  });
}

/** Record one response's usage against the active meter, if there is one. */
export function recordUsage(usage: unknown): void {
  const totals = store.getStore();
  if (!totals || !usage || typeof usage !== "object") return;
  const u = usage as Record<string, unknown>;
  const n = (k: string) => (typeof u[k] === "number" ? (u[k] as number) : 0);
  totals.calls += 1;
  totals.input += n("input_tokens");
  totals.cacheWrite += n("cache_creation_input_tokens");
  totals.cacheRead += n("cache_read_input_tokens");
  totals.output += n("output_tokens");
}

/** Estimated cost in USD, applying the cache multipliers. */
export function usageCost(t: UsageTotals): number {
  const inputEquivalent = t.input + t.cacheWrite * 2 + t.cacheRead * 0.1;
  return (inputEquivalent * RATE_IN + t.output * RATE_OUT) / 1e6;
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
  return (
    `${t.calls} model calls · ${k(t.output)} out · ` +
    `${k(t.cacheRead)} cached in (${Math.round(cacheHitRate(t) * 100)}%) · ` +
    `${k(t.cacheWrite)} cache writes · ${k(t.input)} uncached in · ` +
    `~$${usageCost(t).toFixed(2)}${rewrite}`
  );
}
