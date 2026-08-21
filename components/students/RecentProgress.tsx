import type { StudentReport } from "@/lib/student-report";

/**
 * WHAT CHANGED, AND WHAT THE COACH ACTUALLY WROTE.
 *
 * ── WHY THIS SITS ABOVE THE SKILL PROFILE ────────────────────────────────
 * The profile below it is all-time and it is the right thing to have — but
 * "Rebuttal: Doing it" is equally true of a student who arrived there this
 * month and one who has been stuck there since October, and a coach opening
 * this page before a session is asking the second question, not the first.
 *
 * ── THE NOTES ARE THE POINT ──────────────────────────────────────────────
 * Ratings summarise; the coach's own sentence is what persuades. "Solid"
 * convinces nobody. "Restated the other side's best argument before answering
 * it — first time unprompted" is what a student remembers and a parent
 * believes, and it was already being typed into the log and never read back
 * anywhere except as an undifferentiated list.
 */
export default function RecentProgress({
  report,
  days,
}: {
  report: StudentReport;
  days: number;
}) {
  if (!report.hasData) {
    return (
      <section className="mb-6 rounded-xl border border-inkline bg-inkcard p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-fg3">
          Last {days} days
        </h2>
        <p className="mt-2 text-xs text-fg3">
          Nothing logged in this period. The sections below still show
          everything on record.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-xl border border-inkline bg-inkcard p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xs font-bold uppercase tracking-widest text-fg3">
          Last {days} days
        </h2>
        <p className="text-[12.5px] text-fg2">{report.headline}</p>
      </div>

      {/* Levels first — the only thing here that changes what a student can be
          ASKED to do, and the one a coach says out loud. */}
      {report.milestones.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1.5">
          {report.milestones.map((m) => (
            <li
              key={m.skill}
              className="rounded-lg border border-ok/40 bg-ok/8 px-3 py-2 text-[12.5px] text-fg1"
            >
              <strong className="font-semibold">{m.label}</strong> reached{" "}
              <strong className="font-semibold">{m.levelLabel}</strong>
              <span className="text-fg3"> — up from {m.fromLabel}, on {m.on}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          {report.moved.length > 0 && (
            <>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-fg3">
                Moved
              </h3>
              <ul className="mb-3 flex flex-col gap-1">
                {report.moved.map((m) => (
                  <li key={m.skill} className="flex items-baseline gap-2 text-[12.5px]">
                    <span
                      className={`w-6 shrink-0 font-bold tabular-nums ${
                        (m.delta ?? 0) > 0 ? "text-ok" : "text-danger"
                      }`}
                    >
                      {(m.delta ?? 0) > 0 ? `+${m.delta}` : m.delta}
                    </span>
                    <span className="text-fg2">
                      {m.label}{" "}
                      <span className="text-fg3">
                        {m.fromLabel} → {m.toLabel}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {report.stuck.length > 0 && (
            <>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-fg3">
                Not shifting
              </h3>
              <ul className="mb-3 flex flex-col gap-1">
                {report.stuck.map((s) => (
                  <li key={s.skill} className="text-[12.5px] text-fg2">
                    {s.label}{" "}
                    <span className="text-fg3">
                      — {s.atLabel}, {s.timesSeen} times
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {report.rounds.rounds > 0 && (
            <>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-fg3">
                Rounds
              </h3>
              <p className="text-[12.5px] text-fg2">
                {report.rounds.wins} of {report.rounds.rounds} won
                {report.rounds.averageSpeaks !== null && (
                  <span className="text-fg3">
                    {" "}
                    · {report.rounds.averageSpeaks} speaks average
                  </span>
                )}
              </p>
            </>
          )}
        </div>

        {report.notes.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-fg3">
              What you wrote
            </h3>
            <ul className="flex flex-col gap-2">
              {report.notes.slice(0, 5).map((n, i) => (
                <li key={i} className="border-l-2 border-inkline pl-2.5">
                  <p className="text-[12.5px] leading-snug text-fg2">
                    &ldquo;{n.note}&rdquo;
                  </p>
                  <p className="text-[11px] text-fg3">
                    {n.skillLabel} · {n.date}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
