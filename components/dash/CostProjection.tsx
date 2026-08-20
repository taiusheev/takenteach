import { money } from "@/lib/ai-spend";
import { BUDGET_MODES, type BudgetMode } from "@/lib/model-policy";

/**
 * WHAT THIS COSTS AT SCALE.
 *
 * The measured cost of one lesson is an engineering number. The cost of a
 * thousand is a business decision, and until you can read the second off the
 * first, "can we afford to let every teacher build freely" is answered by
 * instinct.
 *
 * ── THE PER-LESSON FIGURE IS OBSERVED, NOT MODELLED ──────────────────────
 * The multiplication is trivial; being honest about the multiplicand is not.
 * This uses the real recorded average when there is enough data to mean
 * something, and says plainly when it is falling back on the calibration
 * figures instead. A projection built on an invented per-unit cost is a
 * spreadsheet that gives bad news late.
 *
 * The editor multiplier is the part people forget: a lesson is not built once
 * and left. It is built, then rewritten a few times, then QA'd again — and
 * those calls are now metered, so the ratio between build spend and everything
 * else is measured rather than assumed.
 */
export default function CostProjection({
  usdPerLesson,
  observedLessons,
  editorShare,
  mode,
}: {
  /** Measured mean spend per lesson touched, or 0 when nothing is recorded. */
  usdPerLesson: number;
  observedLessons: number;
  /** Share of spend that is NOT the initial build — edits, QA, revisions. */
  editorShare: number;
  mode: BudgetMode;
}) {
  /* Calibration fallback: four logged builds ran $4.50–5.85 in Maximum mode,
     and Economy routes most stages to the cheaper model. Used only until real
     rows exist, and labelled as such wherever it appears. */
  const FALLBACK: Record<BudgetMode, number> = {
    economy: 1.8,
    balanced: 3.2,
    max: 5.1,
  };
  const enoughData = observedLessons >= 5 && usdPerLesson > 0;
  const perLesson = enoughData ? usdPerLesson : FALLBACK[mode];
  const modeLabel = BUDGET_MODES.find((m) => m.id === mode)?.label ?? mode;

  const volumes = [100, 500, 1000];

  return (
    <section className="card p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-fg1">If this scales</h2>
        <span className="text-[11.5px] text-fg3">{modeLabel} mode</span>
      </div>
      <p className="mb-4 max-w-prose text-[12px] leading-relaxed text-fg2">
        {enoughData ? (
          <>
            Based on <strong>{money(perLesson)} per lesson</strong> measured
            across {observedLessons} lessons — including the edits and quality
            reviews after the build, which are{" "}
            {Math.round(editorShare * 100)}% of spend.
          </>
        ) : (
          <>
            Based on <strong>{money(perLesson)} per lesson</strong> from the
            calibration figures, because fewer than five lessons have been
            generated since metering began. This will switch to your own
            measured average automatically.
          </>
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-[12.5px]">
          <thead>
            <tr className="border-b border-inkline text-left text-[11px] uppercase tracking-[0.08em] text-fg3">
              <th className="pb-2 font-semibold">Lessons / month</th>
              <th className="pb-2 text-right font-semibold">Monthly</th>
              <th className="pb-2 text-right font-semibold">Yearly</th>
            </tr>
          </thead>
          <tbody>
            {volumes.map((v) => (
              <tr key={v} className="border-b border-inkline/60 last:border-0">
                <td className="py-2 tabular-nums text-fg2">{v.toLocaleString()}</td>
                <td className="py-2 text-right font-semibold tabular-nums text-fg1">
                  {money(perLesson * v)}
                </td>
                <td className="py-2 text-right tabular-nums text-fg2">
                  {money(perLesson * v * 12)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-fg3">
        {/* The lever, stated where the number is read. */}
        Economy mode is roughly a third of Maximum, and the overnight queue is
        half price again — a thousand lessons a month is a different business at{" "}
        {money(perLesson * 1000)} than at {money(perLesson * 1000 * 2.8)}.
      </p>
    </section>
  );
}
