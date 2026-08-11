import Link from "next/link";
import {
  listAllSubmissions,
  listCorrections,
  listMaterials,
  listRounds,
} from "@/lib/db";
import { submissionQuality } from "@/lib/judging";
import { computeTeachingSignal } from "@/lib/teaching-signal";
import { computeInsights, recurringCorrections } from "@/lib/analytics";
import { requireActiveSession } from "@/lib/auth/dal";
import { STATUS_LABELS, Status } from "@/lib/workflow";
import { SUBJECT_DEFS, SUBJECTS, Subject } from "@/lib/subjects";
import { contentTypeDef } from "@/lib/content-types";
import { correctionLabel } from "@/lib/correction-tags";

export const dynamic = "force-dynamic";

/** The same four states the chips use, in the same four colours — draft quiet,
 *  in_review warn, approved ok, published brand. See .chip-* in globals.css:
 *  a status that is amber in a chip and slate in a chart is two statuses. */
const STATUS_BAR: Record<Status, string> = {
  draft: "bg-fg3",
  in_review: "bg-warn",
  approved: "bg-ok",
  published: "bg-brand",
};

export default async function AnalyticsPage() {
  const { legacyRole: role, scope } = await requireActiveSession();
  const materials = await listMaterials(scope);
  const corrections = await listCorrections(scope);
  const ins = computeInsights(materials, corrections);

  // What the AI builder now actively avoids: recurring correction patterns per
  // track, fed back into generation (the Memory Engine's closed loop).
  const learned = SUBJECTS.map((s) => ({
    subject: s,
    items: recurringCorrections(corrections, s),
  })).filter((x) => x.items.length > 0);

  // judging roll-up
  const rounds = await listRounds(scope);
  const allSubs = await listAllSubmissions(scope);
  const secs = allSubs
    .map((s) => s.seconds_taken)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const teaching = computeTeachingSignal(rounds, allSubs, materials);
  const judging = {
    rounds: rounds.length,
    ballots: allSubs.length,
    medianSeconds: secs.length ? secs[Math.floor(secs.length / 2)] : 0,
    thin: allSubs.filter((s) => !submissionQuality(s).ok).length,
    splitRounds: rounds.filter((r) => {
      const subs = allSubs.filter((s) => s.round_id === r.id);
      if (subs.length < 2) return false;
      const pro = subs.filter((s) => s.winner === "pro").length;
      return pro > 0 && pro < subs.length;
    }).length,
  };

  const canView = role === "founder" || role === "coach";
  if (!canView) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-sm text-fg2">
          You&apos;re acting as {role} — Quality Insights is for founders and
          coaches.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm font-bold text-accent hover:underline">
          ← Back to library
        </Link>
      </div>
    );
  }

  const maxTag = ins.tagStats[0]?.count ?? 1;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-4xl text-fg1">Quality Insights</h1>
      <p className="mb-8 mt-1 text-sm text-fg2">
        The measurable side of &ldquo;gets better over time&rdquo; — the review
        funnel, what gets corrected most, and which failure modes are worth
        automating.
      </p>

      {/* headline numbers */}
      <div className="mb-8 grid gap-3 sm:grid-cols-4">
        <Stat label="Materials" value={ins.totalMaterials} />
        <Stat label="Published" value={ins.published} />
        <Stat
          label="Clean first pass"
          value={
            ins.cleanPublishRate === null
              ? "—"
              : `${Math.round(ins.cleanPublishRate * 100)}%`
          }
          hint="published without ever being sent back"
        />
        <Stat
          label="Corrections logged"
          value={ins.correctionCount}
          hint={`${ins.bySource.review} from reviews · ${ins.bySource.edit} from edits`}
        />
      </div>

      {/* funnel */}
      <Card title="Review funnel">
        <div className="flex flex-col gap-2">
          {ins.funnel.map((f) => {
            const pct = ins.totalMaterials
              ? (f.count / ins.totalMaterials) * 100
              : 0;
            return (
              <div key={f.status} className="flex items-center gap-3 text-xs">
                <span className="w-24 shrink-0 text-fg2">
                  {STATUS_LABELS[f.status]}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-inkmid">
                  <div
                    className={`h-full ${STATUS_BAR[f.status]}`}
                    style={{ width: `${Math.max(pct, f.count ? 4 : 0)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-bold text-fg1">
                  {f.count}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* promotion candidates — the bridge to automated checks */}
      {ins.promotionCandidates.length > 0 && (
        <div className="mb-6 rounded-xl border border-accent/40 bg-accent/5 p-4">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-accent">
            ⚙ Candidates for an automated check
          </h2>
          <p className="mb-3 text-xs text-fg3">
            These failure modes recur and aren&apos;t yet caught automatically —
            prime candidates to turn into checklist rules.
          </p>
          <div className="flex flex-wrap gap-2">
            {ins.promotionCandidates.map((t) => (
              <span key={t.id} className="rounded-full border border-accent/40 bg-inkcard px-3 py-1 text-xs font-semibold text-fg1">
                {t.label} · {t.count}×
              </span>
            ))}
          </div>
        </div>
      )}

      {/* what the builder now avoids — the Memory Engine's closed loop */}
      {learned.length > 0 && (
        <div className="mb-6 rounded-xl border border-ok/40 bg-ok/5 p-4">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-ok">
            🧠 The builder is learning to avoid these
          </h2>
          <p className="mb-3 text-xs text-fg3">
            Recurring corrections are now fed back into AI generation as
            &ldquo;don&rsquo;t repeat these&rdquo; guidance — so new drafts steer
            clear of the mistakes coaches keep fixing. This grows as more reviews
            and edits accumulate.
          </p>
          <div className="flex flex-col gap-3">
            {learned.map(({ subject, items }) => (
              <div key={subject}>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-fg2">
                  {SUBJECT_DEFS[subject]?.emoji} {SUBJECT_DEFS[subject]?.label}
                </div>
                <div className="flex flex-wrap gap-2">
                  {items.map((it) => (
                    <span
                      key={it.id}
                      title={it.description}
                      className="rounded-full border border-ok/30 bg-inkcard px-3 py-1 text-xs font-semibold text-fg1"
                    >
                      {it.label} · {it.count}×
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* most-common corrections */}
      <Card title="Most-common corrections">
        {ins.tagStats.length === 0 ? (
          <p className="text-xs text-fg3">
            No corrections logged yet. When a reviewer sends a material back,
            the tagged reasons show up here.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {ins.tagStats.map((t) => (
              <div key={t.id} className="flex items-center gap-3 text-xs">
                <span className="flex w-56 shrink-0 items-center gap-1 text-fg2">
                  {t.label}
                  {t.hasAutomatedCheck && (
                    <span title="Already caught by an automated check" className="opacity-60">⚙</span>
                  )}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-inkmid">
                  <div
                    className="h-full bg-danger/12"
                    style={{ width: `${(t.count / maxTag) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-bold text-fg1">
                  {t.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* per-subject and per-type */}
      <div className="mb-6 grid gap-6 sm:grid-cols-2">
        <Card title="Corrections by track">
          <BreakdownList
            rows={ins.bySubject.map((r) => ({
              label: `${SUBJECT_DEFS[r.subject as Subject]?.emoji ?? ""} ${SUBJECT_DEFS[r.subject as Subject]?.label ?? r.subject}`,
              corrections: r.corrections,
              materials: r.materials,
            }))}
          />
        </Card>
        <Card title="Corrections by type">
          <BreakdownList
            rows={ins.byType.map((r) => ({
              label: `${contentTypeDef(r.type).emoji} ${contentTypeDef(r.type).label}`,
              corrections: r.corrections,
              materials: r.materials,
            }))}
          />
        </Card>
      </div>

      {/* teaching signal — rounds telling you what to build next */}
      {teaching.hasData && (
        <div className="mb-6 rounded-xl border border-brand/40 bg-brand/5 p-4">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-brand">
            📡 Teaching signal — what rounds say to build next
          </h2>
          <p className="mb-3 text-xs text-fg3">
            Judged performance across {teaching.roundCount} round
            {teaching.roundCount === 1 ? "" : "s"} ({teaching.ballotCount} ballots),
            mapped to the lessons that teach each skill.
          </p>

          <div className="flex flex-col gap-2">
            {teaching.signals.map((s) => {
              const pct = Math.round(s.pct * 100);
              const weak = s.pct < 0.7;
              return (
                <div key={s.criterion} className="text-xs">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-semibold text-fg1">{s.criterion}</span>
                    <span className={weak ? "text-warn" : "text-ok"}>
                      {pct}%
                    </span>
                  </div>
                  <div className="mb-1 h-2 overflow-hidden rounded bg-inkmid">
                    <div
                      className={`h-full ${weak ? "bg-warn" : "bg-ok"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-fg3">
                    {s.isGap ? (
                      <span className="text-warn">
                        ⚠ No lesson in the library teaches this — curriculum gap.
                      </span>
                    ) : (
                      <>
                        Taught by{" "}
                        {s.lessons.map((l, i) => (
                          <span key={l.id}>
                            {i > 0 && ", "}
                            <Link
                              href={`/materials/${l.id}`}
                              className="text-accent hover:underline"
                            >
                              {l.code || l.title}
                            </Link>
                          </span>
                        ))}
                        {weak && " — likely needs strengthening."}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {(teaching.weakest.length > 0 || teaching.gaps.length > 0) && (
            <div className="mt-4 border-t border-inkline pt-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-fg3">
                Recommended next builds
              </div>
              <div className="flex flex-wrap gap-2">
                {[...teaching.gaps, ...teaching.weakest]
                  .filter((s, i, arr) => arr.findIndex((x) => x.criterion === s.criterion) === i)
                  .slice(0, 4)
                  .map((s) => (
                    <Link
                      key={s.criterion}
                      href={`/materials/new?skillFocus=${encodeURIComponent(s.criterion)}&subject=debate`}
                      className="rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent/20 transition-colors"
                    >
                      + Build a lesson for {s.criterion}
                      {s.isGap ? " (gap)" : ` (${Math.round(s.pct * 100)}%)`}
                    </Link>
                  ))}
              </div>
              <p className="mt-2 text-[11px] text-fg3">
                Quick Build reads this evidence — generated lessons target these
                specific weaknesses and quote what judges actually wrote.
              </p>
            </div>
          )}
        </div>
      )}

      {/* judging */}
      <Card title="Judging">
        {judging.ballots === 0 ? (
          <p className="text-xs text-fg3">
            No ballots submitted yet. Once judges submit, consistency and
            turnaround show up here.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <MiniStat label="Rounds" value={judging.rounds} />
              <MiniStat label="Ballots" value={judging.ballots} />
              <MiniStat
                label="Median time"
                value={
                  judging.medianSeconds
                    ? `${Math.floor(judging.medianSeconds / 60)}m ${judging.medianSeconds % 60}s`
                    : "—"
                }
                hint="target: under 2 min"
              />
              <MiniStat
                label="Thin ballots"
                value={judging.thin}
                hint="missing or vague RFD"
              />
            </div>
            {judging.splitRounds > 0 && (
              <p className="text-xs text-fg2">
                <strong className="text-fg1">{judging.splitRounds}</strong> round
                {judging.splitRounds === 1 ? " was" : "s were"} split decisions —
                worth reviewing for judge calibration.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* most-corrected materials */}
      {ins.mostCorrected.length > 0 && (
        <Card title="Most-corrected materials">
          <ul className="flex flex-col gap-1.5">
            {ins.mostCorrected.map((m) => (
              <li key={m.materialId} className="flex items-center justify-between gap-2 text-xs">
                <Link href={`/materials/${m.materialId}`} className="truncate font-semibold text-fg1 hover:text-accent">
                  {m.title}
                </Link>
                <span className="shrink-0 rounded-full bg-danger/12 px-2 py-0.5 font-bold text-danger">
                  {m.count}×
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* recent corrections */}
      {ins.recent.length > 0 && (
        <Card title="Recent corrections">
          <ul className="flex flex-col gap-2.5">
            {ins.recent.map((c) => (
              <li key={c.id} className="text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link href={`/materials/${c.material_id}`} className="font-bold text-fg1 hover:text-accent">
                    #{c.material_id}
                  </Link>
                  <span className="text-fg3">
                    {c.role} · {c.action.replace("_", " ")} · {c.created_at}
                  </span>
                </div>
                {c.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <span key={t} className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger">
                        {correctionLabel(t)}
                      </span>
                    ))}
                  </div>
                )}
                {c.note && <p className="mt-1 text-fg2">“{c.note}”</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-inkline bg-inkcard p-4">
      <div className="font-display text-3xl text-fg1">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-widest text-fg3">
        {label}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-fg3">{hint}</div>}
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-inkline bg-inkmid p-3">
      <div className="font-display text-2xl text-fg1">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-fg3">
        {label}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-fg3">{hint}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-inkline bg-inkcard p-4">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-fg3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function BreakdownList({
  rows,
}: {
  rows: { label: string; corrections: number; materials: number }[];
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-fg3">Nothing yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate text-fg2">{r.label}</span>
          <span className="shrink-0 text-fg3">
            <span className="font-bold text-fg1">{r.corrections}</span> corr ·{" "}
            {r.materials} mat
          </span>
        </li>
      ))}
    </ul>
  );
}
