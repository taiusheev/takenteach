"use client";

import { useEffect, useState } from "react";

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

/** When each stage started and finished, for the per-stage timings. */
export interface StageTiming {
  start: number;
  end?: number;
}

export default function BuildProgress({
  stages,
  state,
  phase,
  startedAt = null,
  timings = {},
}: {
  stages: BuildStage[];
  state: Record<string, StageState>;
  phase: "idle" | "running" | "done" | "stopped" | "error";
  /** When this build began, for the elapsed clock. */
  startedAt?: number | null;
  timings?: Record<string, StageTiming>;
}) {
  const done = stages.filter((s) => state[s.id] === "done").length;
  const pct = stages.length ? (done / stages.length) * 100 : 0;
  const now = useNow(phase === "running");
  /* Elapsed is a real number, so it is shown. A build runs 7–22 minutes and the
     single most common thought at minute four is "has this frozen?" — a clock
     that is visibly moving answers it in a way no animation can, because it
     shows the work is progressing rather than that a div is. */
  const elapsed = startedAt && now ? Math.max(0, now - startedAt) : 0;

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
          {startedAt ? `${clock(elapsed)} · ` : ""}
          {done}/{stages.length}
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
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span
                  className={`min-w-0 flex-1 text-[13px] leading-snug ${
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
                {/* What each stage actually cost. Over a long build this is the
                    difference between "it is slow" and "the evidence deck is
                    slow", which is the only version of that complaint anyone
                    can act on. */}
                <StageClock timing={timings[s.id]} state={st} now={now} />
              </span>
              {s.skipped && (
                /* A stage the build survived without. Silence here would make
                   a skipped fact-check look identical to a passed one. */
                <span className="absolute left-8 top-5 text-[11.5px] text-warn">
                  Skipped — {s.skipped}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {phase === "running" && (
        /* Said once, plainly, where the waiting happens. Every ticked stage is
           already written to the database — so this is not reassurance, it is a
           fact the teacher can act on by closing the laptop. */
        <p className="mt-4 border-t border-inkline pt-3 text-[11.5px] leading-relaxed text-fg3">
          Every finished stage is saved as it lands. You can stop and resume
          later without losing it — but leaving this page ends the run.
        </p>
      )}
    </div>
  );
}

/** mm:ss, or h:mm:ss past an hour. */
function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

function StageClock({
  timing,
  state,
  now,
}: {
  timing?: StageTiming;
  state: StageState;
  now: number;
}) {
  if (!timing) return null;
  if (state === "done" && timing.end) {
    return (
      <span className="shrink-0 text-[11px] tabular-nums text-fg3">
        {clock(timing.end - timing.start)}
      </span>
    );
  }
  if (state === "running") {
    return (
      <span className="shrink-0 text-[11px] tabular-nums text-fg2">
        {clock(now ? Math.max(0, now - timing.start) : 0)}
      </span>
    );
  }
  return null;
}

/**
 * A once-a-second clock, running only while the build is.
 *
 * The interval callback is the only place state is set — a synchronous setState
 * in an effect body would be a cascading render, and reading `Date.now()` during
 * render would make the component non-idempotent.
 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
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
