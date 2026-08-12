"use client";

/**
 * THE BUILD, AS IT HAPPENS.
 *
 * A pack takes 7–22 minutes to generate. That is long enough that the progress
 * display is not decoration — it is the only thing standing between the teacher
 * and the belief that the app has hung. The brief is right to say "do not simply
 * show a spinner": a spinner claims something is happening without saying what,
 * and after ninety seconds it stops being reassuring and starts being evidence
 * of a bug.
 *
 * So every stage is named and carries one of three states:
 *
 *     ✓   done      finished AND persisted — this part of the pack exists now
 *     ●   running   in flight
 *     ○   pending   not started
 *
 * The rail connecting them is filled behind completed work, so the shape of
 * "how far in am I" is readable without counting.
 *
 * ── WHY "DONE" IS A STRONGER CLAIM HERE THAN IT LOOKS ────────────────────
 * A tick appears only after the route has written that stage to the database.
 * It therefore means "this survives closing the laptop", which is exactly what
 * someone watching a twenty-minute build wants to know — and it is why the
 * build can be abandoned and resumed. Marking a stage done on the event alone
 * would be a quarter-second faster and occasionally a lie.
 */

export type StageState = "pending" | "running" | "done";

export interface BuildStage {
  id: string;
  label: string;
  /** Set when a stage was allowed to fail without sinking the build. */
  skipped?: string;
}

export default function BuildProgress({
  stages,
  state,
  phase,
}: {
  stages: BuildStage[];
  state: Record<string, StageState>;
  phase: "idle" | "running" | "done" | "stopped" | "error";
}) {
  const done = stages.filter((s) => state[s.id] === "done").length;
  const pct = stages.length ? (done / stages.length) * 100 : 0;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-semibold text-fg1">
          {phase === "running"
            ? "Building your lesson"
            : phase === "done"
              ? "Build complete"
              : phase === "stopped"
                ? "Build stopped"
                : phase === "error"
                  ? "Build failed"
                  : "Ready to build"}
        </p>
        <p className="shrink-0 text-[12px] tabular-nums text-fg3">
          {done}/{stages.length} stages
        </p>
      </div>

      {/* One slim bar. The per-stage rail below already says which part is
          happening; a second thick bar would repeat it louder. */}
      <div
        className="mb-5 h-1.5 overflow-hidden rounded-full bg-surface-alt"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={stages.length}
        aria-label="Build progress"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            phase === "error"
              ? "bg-danger"
              : phase === "done"
                ? "bg-ok"
                : "bg-brand"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* `aria-live` on the list, so a screen-reader user is told which stage
          started rather than watching a silent list change colour. */}
      <ol className="relative" aria-live="polite">
        {stages.map((s, i) => {
          const st: StageState = state[s.id] ?? "pending";
          const prevDone = i > 0 && state[stages[i - 1].id] === "done";
          const last = i === stages.length - 1;
          return (
            <li key={s.id} className="relative flex gap-3 pb-3 last:pb-0">
              {/* The connector, drawn behind the marker and stopping at the
                  last row so the rail does not dangle past the final stage. */}
              {!last && (
                <span
                  aria-hidden
                  className={`absolute left-[9px] top-5 h-[calc(100%-12px)] w-px ${
                    st === "done" ? "bg-brand/45" : "bg-inkline"
                  }`}
                />
              )}
              <span className="relative z-[1] mt-0.5 shrink-0">
                <Marker state={st} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[13px] leading-snug ${
                    st === "done"
                      ? "text-fg2"
                      : st === "running"
                        ? "font-semibold text-fg1"
                        : prevDone
                          ? "text-fg3"
                          : "text-fg3"
                  }`}
                >
                  {s.label}
                </span>
                {s.skipped && (
                  /* A stage the build survived without. Silence here would make
                     a skipped fact-check look identical to a passed one. */
                  <span className="mt-0.5 block text-[11.5px] text-warn">
                    Skipped — {s.skipped}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Marker({ state }: { state: StageState }) {
  if (state === "done") {
    return (
      <span className="grid h-[19px] w-[19px] place-items-center rounded-full bg-brand text-onbrand">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="m2.5 6.2 2.4 2.4L9.5 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (state === "running") {
    return (
      <span className="grid h-[19px] w-[19px] place-items-center rounded-full border-2 border-brand">
        <span className="build-pulse h-[7px] w-[7px] rounded-full bg-brand" />
      </span>
    );
  }
  return (
    <span className="block h-[19px] w-[19px] rounded-full border-2 border-line-strong" />
  );
}
