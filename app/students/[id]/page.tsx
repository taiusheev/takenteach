import Link from "next/link";
import { requireActiveSession } from "@/lib/auth/dal";
import { notFound } from "next/navigation";
import { getStudent, listObservations } from "@/lib/db";
import {
  RATINGS,
  ratingLabel,
  recommendations,
  skillStates,
} from "@/lib/students";
import ObservationLogger from "@/components/ObservationLogger";

export const dynamic = "force-dynamic";

/**
 * One student. Three questions, in the order a coach asks them: where are they
 * now, what should I do next, and what have I actually seen?
 */
export default async function StudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { scope } = await requireActiveSession();
  const { id } = await params;
  const student = getStudent(scope, Number(id));
  if (!student) notFound();

  const observations = listObservations(scope, student.id).map((o) => ({ ...o }));
  const states = skillStates(observations);
  const next = recommendations(states);
  const seen = states.filter((s) => s.count > 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/students" className="text-sm font-bold text-fg3 hover:text-fg1">
        ← Students
      </Link>

      <div className="mb-6 mt-3 flex flex-wrap items-center gap-4">
        <div>
          <h1 className="font-display text-4xl text-fg1">{student.name}</h1>
          <p className="text-xs text-fg3">
            {[student.cohort, student.grade_band].filter(Boolean).join(" · ") ||
              "No cohort set"}{" "}
            · {observations.length} observation
            {observations.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* ── Where they are ── */}
      <section className="mb-6 rounded-xl border border-inkline bg-inkcard p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-fg3">
          Skill profile
        </h2>
        <ul className="flex flex-col gap-2.5">
          {states.map((s) => {
            const pct = s.latest ? (s.latest / 5) * 100 : 0;
            return (
              <li key={s.skill} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-xs font-semibold text-fg2">
                  {s.label}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-inkmid">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-[11px] text-fg3">
                  {s.count === 0 ? "not seen" : ratingLabel(s.latest ?? 0)}
                </span>
                <span
                  className={`w-8 shrink-0 text-right text-[11px] font-bold ${
                    (s.trend ?? 0) > 0
                      ? "text-ok"
                      : (s.trend ?? 0) < 0
                        ? "text-danger"
                        : "text-fg3"
                  }`}
                  title={
                    s.trend === null
                      ? "Needs a second observation to show a trend"
                      : "Change since the first observation"
                  }
                >
                  {s.trend === null ? "–" : s.trend > 0 ? `+${s.trend}` : s.trend}
                </span>
              </li>
            );
          })}
        </ul>
        {seen.length === 0 && (
          <p className="mt-3 text-xs text-fg3">
            Nothing logged yet — the profile fills in as you observe.
          </p>
        )}
      </section>

      {/* ── What to do next ── */}
      <section className="mb-6 rounded-xl border border-inkline bg-inkcard p-4">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-fg3">
          Work on next
        </h2>
        <p className="mb-3 text-xs text-fg3">
          Ranked by what the log actually shows — lowest and slipping first.
        </p>
        <ul className="flex flex-col gap-3">
          {next.map((r) => (
            <li
              key={r.skill}
              className="rounded-lg border border-inkline/70 bg-inkmid/40 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-fg1">{r.label}</span>
                <span className="text-[11px] text-fg3">{r.reason}</span>
              </div>
              <p className="mt-1 text-xs text-fg2">{r.action}</p>
              <Link
                href={`/?q=${encodeURIComponent(r.lookFor)}`}
                className="mt-1.5 inline-block text-[11px] font-bold text-accent hover:underline"
              >
                Find material for this →
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Log what you just saw ── */}
      <ObservationLogger studentId={student.id} />

      {/* ── The record ── */}
      <section className="mt-6 rounded-xl border border-inkline bg-inkcard p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-fg3">
          Observation log
        </h2>
        {observations.length === 0 ? (
          <p className="text-xs text-fg3">Nothing logged yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-inkline/60">
            {observations.map((o) => {
              const tone =
                RATINGS.find((r) => r.value === o.rating)?.tone ?? "border-inkline";
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="w-20 shrink-0 text-[11px] text-fg3">
                    {o.observed_on}
                  </span>
                  <span className="w-36 shrink-0 text-xs font-semibold text-fg2">
                    {states.find((s) => s.skill === o.skill)?.label ?? o.skill}
                  </span>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}
                  >
                    {ratingLabel(o.rating)}
                  </span>
                  <span className="min-w-0 flex-1 text-xs text-fg2">
                    {o.note}
                    {o.context && (
                      <span className="text-fg3"> · {o.context}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
