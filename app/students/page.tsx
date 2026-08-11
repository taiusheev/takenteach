import Link from "next/link";
import { listAllObservations, listStudents } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/dal";
import { canCreate } from "@/lib/workflow";
import { SUBJECT_DEFS } from "@/lib/subjects";
import { headline, skillStates } from "@/lib/students";
import { squadLessonIdea, squadSignal } from "@/lib/squad-signal";
import NewStudentForm from "@/components/NewStudentForm";

export const dynamic = "force-dynamic";

/**
 * The roster. Deliberately a list, not a dashboard of charts: the job here is
 * to get to one student in one click, and to see at a glance who hasn't been
 * observed lately.
 */
export default async function StudentsPage() {
  const { legacyRole: role, scope } = await requireActiveSession();
  const students = await listStudents(scope);
  const all = await listAllObservations(scope);

  const byStudent = new Map<number, typeof all>();
  for (const o of all) {
    byStudent.set(o.student_id, [...(byStudent.get(o.student_id) ?? []), o]);
  }
  const cohorts = [...new Set(students.map((s) => s.cohort || "No cohort"))];

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6">
        <h1 className="font-display text-4xl text-fg1">Students</h1>
        <p className="mt-1 max-w-2xl text-sm text-fg3">
          One tap per skill after a round or a practice. Progress, next steps and
          reports are computed from that log — there is no separate assessment to
          fill in.
        </p>
      </div>

      {canCreate(role) && <NewStudentForm />}

      {students.length === 0 ? (
        <p className="rounded-xl border border-dashed border-inkline px-5 py-10 text-center text-sm text-fg3">
          No students yet. Add the squad above and start logging what you see.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {cohorts.map((cohort) => {
            // the log itself writes the brief — no typing, no AI needed to
            // decide what this cohort should be taught next
            const signal = squadSignal(cohort, students, all);
            const idea = squadLessonIdea(signal);
            return (
            <section key={cohort}>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-fg3">
                  {cohort}
                </h2>
                {idea && (
                  <>
                    <Link
                      href={`/materials/new?${new URLSearchParams({ skillFocus: idea }).toString()}`}
                      className="btn btn-primary btn-sm"
                    >
                      Build the lesson this cohort needs
                    </Link>
                    <span className="text-[11px] text-fg3">
                      Weakest: {signal.priorities[0]?.label}
                      {signal.priorities[0]?.slipping.length
                        ? ` · slipping for ${signal.priorities[0].slipping.length}`
                        : ""}
                    </span>
                  </>
                )}
              </div>
              <ul className="flex flex-col gap-2">
                {students
                  .filter((s) => (s.cohort || "No cohort") === cohort)
                  .map((s) => {
                    const obs = byStudent.get(s.id) ?? [];
                    const states = skillStates(obs);
                    const last = obs[0]?.observed_on;
                    return (
                      <li key={s.id}>
                        <Link
                          href={`/students/${s.id}`}
                          className="flex items-center gap-4 rounded-xl border border-inkline bg-inkcard px-5 py-4 transition-colors hover:border-accent/40"
                        >
                          <div
                            className="font-display grid h-11 w-11 shrink-0 place-items-center rounded-lg text-lg text-white"
                            style={{
                              background:
                                SUBJECT_DEFS[s.subject as keyof typeof SUBJECT_DEFS]
                                  ?.theme.accent ?? "#0f766e",
                            }}
                          >
                            {s.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-bold text-fg1">
                                {s.name}
                              </span>
                              {s.grade_band && (
                                <span className="shrink-0 rounded bg-inkmid px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg3">
                                  {s.grade_band}
                                </span>
                              )}
                            </div>
                            <div className="truncate text-xs text-fg3">
                              {headline(states)}
                            </div>
                          </div>
                          <span className="shrink-0 text-[11px] text-fg3">
                            {last ? `seen ${last}` : "never observed"}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
