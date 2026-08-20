import { money, type SpendSummary } from "@/lib/ai-spend";

/**
 * WHERE THE AI BUDGET WENT.
 *
 * Not a chart. Every line is a figure someone would act on:
 *
 *   cost per lesson    decides whether this scales to a thousand lessons
 *   cache hit rate     the leading indicator — it fell to 0% once and
 *                      quadrupled the price of a build before anyone noticed
 *   dearest operation  where to spend an optimization afternoon
 *   spent on failures  money that bought nothing, which is the first thing to
 *                      fix and the easiest to never look at
 *
 * Empty until something has been generated, and it says so rather than
 * rendering a wall of zeroes that looks like a broken page.
 */
export default function AiSpend({ spend }: { spend: SpendSummary }) {
  if (spend.rows === 0) {
    return (
      <section className="card p-5">
        <h2 className="text-[15px] font-semibold text-fg1">AI spend</h2>
        <p className="mt-1.5 max-w-prose text-[12.5px] leading-relaxed text-fg2">
          Nothing has been generated yet. Every build, rewrite and quality
          review records what it cost, and this becomes the answer to
          &ldquo;what does a lesson cost us&rdquo; — measured, not estimated.
        </p>
      </section>
    );
  }

  const cacheOk = spend.cacheHitRate >= 0.4;

  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-fg1">AI spend</h2>
        <span className="text-[11.5px] text-fg3">
          {spend.rows} operations · {spend.calls} model calls
        </span>
      </div>

      <dl className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Spent" value={money(spend.usd)} />
        <Figure
          label="Per lesson"
          value={money(spend.usdPerLesson)}
          hint={`${spend.lessons} ${spend.lessons === 1 ? "lesson" : "lessons"}`}
        />
        <Figure
          label="Served from cache"
          value={`${Math.round(spend.cacheHitRate * 100)}%`}
          hint={cacheOk ? "healthy" : "check the prefix"}
          tone={cacheOk ? "default" : "bad"}
        />
        <Figure
          label="Spent on failures"
          value={money(spend.failedUsd)}
          hint={spend.failedCalls > 0 ? `${spend.failedCalls} calls` : "none"}
          tone={spend.failedUsd > spend.usd * 0.05 ? "bad" : "default"}
        />
      </dl>

      <div className="grid gap-5 sm:grid-cols-2">
        <Breakdown
          title="By operation"
          note="what the teacher was doing"
          rows={spend.byOperation.map((r) => ({
            label: r.operation,
            usd: r.usd,
            detail: `${r.rows}×`,
          }))}
          total={spend.usd}
        />
        <Breakdown
          title="By stage"
          note="which model call inside it"
          rows={spend.byTask.map((r) => ({
            label: r.task,
            usd: r.usd,
            detail: `${r.calls} calls`,
          }))}
          total={spend.usd}
        />
      </div>

      {spend.byModel.length > 0 && (
        <div className="mt-5 border-t border-inkline pt-3.5">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-fg3">
            By model
          </h3>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {spend.byModel.map((m) => (
              <span key={m.model} className="text-[12px] text-fg2">
                <span className="font-mono text-fg3">{m.model}</span>{" "}
                <strong className="font-semibold text-fg1">{money(m.usd)}</strong>{" "}
                <span className="text-fg3">({m.calls} calls)</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Figure({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "bad";
}) {
  return (
    <div className="rounded-lg border border-inkline bg-surface-alt/40 px-3 py-2.5">
      <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-fg3">
        {label}
      </dt>
      <dd className="mt-1 flex items-baseline gap-1.5">
        <span
          className={`text-[19px] font-semibold leading-none tabular-nums ${
            tone === "bad" ? "text-warn" : "text-fg1"
          }`}
        >
          {value}
        </span>
        {hint && <span className="truncate text-[11px] text-fg3">{hint}</span>}
      </dd>
    </div>
  );
}

/** A ranked list with proportional bars — the shape of the spend at a glance. */
function Breakdown({
  title,
  note,
  rows,
  total,
}: {
  title: string;
  note: string;
  rows: { label: string; usd: number; detail: string }[];
  total: number;
}) {
  if (rows.length === 0) return null;
  const top = rows[0]?.usd || 1;
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-fg3">
        {title}
      </h3>
      <p className="mb-2 text-[11px] text-fg3">{note}</p>
      <ul className="flex flex-col gap-1.5">
        {rows.slice(0, 7).map((r) => (
          <li key={r.label}>
            <div className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="min-w-0 truncate font-medium text-fg2">
                {r.label}
              </span>
              <span className="shrink-0 tabular-nums text-fg1">
                {money(r.usd)}
                <span className="ml-1.5 text-fg3">
                  {total > 0 ? `${Math.round((r.usd / total) * 100)}%` : ""}
                </span>
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-alt">
              <div
                className="h-full rounded-full bg-brand/60"
                style={{ width: `${Math.max(2, (r.usd / top) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
