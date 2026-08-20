import type { AiUsageRow } from "./db";

/**
 * THE AI BUDGET, AS A SET OF ANSWERABLE QUESTIONS.
 *
 * Every figure here is summed from `ai_usage` rows written by the meter — no
 * modelling, no extrapolation, no per-token guess. That matters more than it
 * sounds: the previous state of this system was a cost estimate calibrated
 * against four builds read by hand out of an activity log, and a meter that
 * priced every token at Opus rates while the default budget mode ran most of a
 * build on Sonnet. Both were reasonable and both were wrong, and neither could
 * be checked without doing arithmetic on prose.
 *
 * The questions this is built to answer, in the order they get asked:
 *   what have we spent · what does one lesson cost · where does it go ·
 *   which operation is the dearest · is the prompt cache still working
 */

export interface SpendSummary {
  rows: number;
  usd: number;
  calls: number;
  outputTokens: number;
  /** How much input came from cache — the leading indicator of a cost blowout. */
  cacheHitRate: number;
  /** Lessons that had any spend at all. */
  lessons: number;
  /** Total spend ÷ lessons touched. The number that decides whether this scales. */
  usdPerLesson: number;
  failedUsd: number;
  failedCalls: number;
  /** Share of spend that is NOT the initial build — edits, QA, revisions. */
  editorShare: number;
  byOperation: { operation: string; usd: number; calls: number; rows: number }[];
  byTask: { task: string; usd: number; calls: number }[];
  byModel: { model: string; usd: number; calls: number }[];
  /** Most recent first, for the detail list. */
  recent: AiUsageRow[];
}

interface Breakdown {
  byTask?: { t: string; n: number; usd: number; out: number }[];
  byModel?: { m: string; n: number; usd: number }[];
}

export function summarizeSpend(rows: AiUsageRow[]): SpendSummary {
  let usd = 0;
  let calls = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let inputAll = 0;
  let failedUsd = 0;
  let failedCalls = 0;
  const lessons = new Set<number>();
  const byOperation = new Map<string, { usd: number; calls: number; rows: number }>();
  const byTask = new Map<string, { usd: number; calls: number }>();
  const byModel = new Map<string, { usd: number; calls: number }>();

  for (const r of rows) {
    const rowUsd = r.usd_micros / 1e6;
    usd += rowUsd;
    calls += r.calls;
    outputTokens += r.output_tokens;
    cacheRead += r.cache_read_tokens;
    inputAll += r.input_tokens + r.cache_write_tokens + r.cache_read_tokens;
    if (r.material_id !== null) lessons.add(r.material_id);
    if (!r.ok) {
      failedUsd += rowUsd;
      failedCalls += r.calls;
    }

    const op = byOperation.get(r.operation) ?? { usd: 0, calls: 0, rows: 0 };
    op.usd += rowUsd;
    op.calls += r.calls;
    op.rows += 1;
    byOperation.set(r.operation, op);

    /* The per-task and per-model detail rides in the row as JSON. Parsed
       defensively: a row written by an older version of the meter, or one whose
       breakdown was truncated, must not take the whole cost view down. */
    let b: Breakdown = {};
    try {
      b = JSON.parse(r.breakdown || "{}") as Breakdown;
    } catch {
      b = {};
    }
    for (const t of b.byTask ?? []) {
      const g = byTask.get(t.t) ?? { usd: 0, calls: 0 };
      g.usd += t.usd;
      g.calls += t.n;
      byTask.set(t.t, g);
    }
    for (const m of b.byModel ?? []) {
      const g = byModel.get(m.m) ?? { usd: 0, calls: 0 };
      g.usd += m.usd;
      g.calls += m.n;
      byModel.set(m.m, g);
    }
  }

  const sortUsd = <T extends { usd: number }>(a: T, b: T) => b.usd - a.usd;

  const buildUsd = (byOperation.get("build")?.usd ?? 0);
  return {
    rows: rows.length,
    editorShare: usd === 0 ? 0 : Math.max(0, (usd - buildUsd) / usd),
    usd,
    calls,
    outputTokens,
    cacheHitRate: inputAll === 0 ? 0 : cacheRead / inputAll,
    lessons: lessons.size,
    usdPerLesson: lessons.size === 0 ? 0 : usd / lessons.size,
    failedUsd,
    failedCalls,
    byOperation: [...byOperation.entries()]
      .map(([operation, g]) => ({ operation, ...g }))
      .sort(sortUsd),
    byTask: [...byTask.entries()].map(([task, g]) => ({ task, ...g })).sort(sortUsd),
    byModel: [...byModel.entries()].map(([model, g]) => ({ model, ...g })).sort(sortUsd),
    recent: rows.slice(0, 12),
  };
}

/** "$1.24" · "12.4¢" — cents below a dollar, because most edits are cents. */
export function money(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 1) return `${(usd * 100).toFixed(1)}¢`;
  return `$${usd.toFixed(2)}`;
}

/**
 * OUTPUT DISTRIBUTIONS PER TASK — how the ceilings stop being guesses.
 *
 * The per-task output ceilings currently sit at roughly 2.5x the figure the
 * cost estimator was calibrated to, because that was the only evidence
 * available. That is a defensible starting point and a bad permanent answer: a
 * ceiling set from an aggregate cannot know that the teacher guide's p95 is
 * three times its p50 while the outline barely varies.
 *
 * This computes the real distribution from recorded calls. Once a few dozen
 * builds have run, `suggestedCeiling` is p99 with a margin — derived from what
 * the task actually does rather than from a multiplier applied to everything.
 *
 * Reported per task rather than blended, because that is the whole point: one
 * global multiplier is exactly what this replaces.
 */
export interface TaskOutputStats {
  task: string;
  calls: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  /** p99 plus 25% headroom, rounded to the nearest 1k. */
  suggestedCeiling: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

/**
 * Per-task output percentiles from the recorded breakdowns.
 *
 * Note the honest limitation: a stored breakdown carries the SUM of output for
 * a task within one operation, not each call separately, so a task called twice
 * in one build contributes one averaged sample. That is accurate enough to set
 * a ceiling and is stated here rather than papered over — a per-call table
 * would be the fix if these numbers ever need to be tighter.
 */
export function outputStatsByTask(rows: AiUsageRow[]): TaskOutputStats[] {
  const samples = new Map<string, number[]>();
  for (const r of rows) {
    let b: Breakdown = {};
    try {
      b = JSON.parse(r.breakdown || "{}") as Breakdown;
    } catch {
      continue;
    }
    for (const t of b.byTask ?? []) {
      if (!t.n) continue;
      const per = t.out / t.n;
      const list = samples.get(t.t) ?? [];
      for (let i = 0; i < t.n; i++) list.push(per);
      samples.set(t.t, list);
    }
  }

  return [...samples.entries()]
    .map(([task, list]) => {
      const sorted = [...list].sort((a, b) => a - b);
      const p99 = percentile(sorted, 99);
      return {
        task,
        calls: sorted.length,
        p50: Math.round(percentile(sorted, 50)),
        p75: Math.round(percentile(sorted, 75)),
        p90: Math.round(percentile(sorted, 90)),
        p95: Math.round(percentile(sorted, 95)),
        p99: Math.round(p99),
        max: Math.round(sorted[sorted.length - 1] ?? 0),
        suggestedCeiling: Math.max(2000, Math.ceil((p99 * 1.25) / 1000) * 1000),
      };
    })
    .sort((a, b) => b.p95 - a.p95);
}
