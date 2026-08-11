"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContentQa } from "@/lib/ai";
import {
  QaFix,
  isAutoFixableCitation,
  qaFixes,
  qaOptionalFixes,
  qaVerifyOnly,
} from "@/lib/qa-fixes";
import QaFixButton, { FixState } from "@/components/QaFixButton";

const GRADE_TONE: Record<string, string> = {
  A: "bg-ok/12 text-ok",
  B: "bg-ok/12 text-ok",
  C: "bg-warn/12 text-warn",
  D: "bg-danger/12 text-danger",
};
const CITE_TONE: Record<string, string> = {
  verified: "text-ok",
  plausible: "text-ok",
  suspect: "text-warn",
  unsupported: "text-danger",
};
const ACT_TONE: Record<string, string> = {
  strong: "text-ok",
  adequate: "text-ok",
  weak: "text-danger",
};

/**
 * Runs and displays the content-QA report — the fact-check + pedagogy review the
 * deterministic checklist can't do. Author-facing; a coach reads it before
 * sending a pack to review.
 */
export default function ContentQaPanel({
  materialId,
  initial,
  ranAt,
  canRun,
}: {
  materialId: number;
  initial: ContentQa | null;
  ranAt: string;
  canRun: boolean;
}) {
  const router = useRouter();
  const [report, setReport] = useState<ContentQa | null>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [when, setWhen] = useState(ranAt);
  const [states, setStates] = useState<Record<string, FixState>>({});
  const [queue, setQueue] = useState(0);

  const fixes = useMemo(() => qaFixes(report), [report]);
  const optional = useMemo(() => qaOptionalFixes(report), [report]);
  const verifyOnly = useMemo(() => qaVerifyOnly(report), [report]);
  // the pages the reviewer actually asked for work on, in page order
  const needsWork = useMemo(
    () =>
      (report?.activities ?? []).filter((a) =>
        fixes.some((f) => f.key === `activity-${a.index}`)
      ),
    [report, fixes]
  );
  const stateOf = (key: string): FixState => states[key] ?? { status: "idle" };
  const pending = fixes.filter((f) => stateOf(f.key).status === "idle");

  async function run() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/materials/${materialId}/qa`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Content QA failed");
      setReport(data.report as ContentQa);
      setWhen(new Date().toISOString());
      // a fresh report is a fresh set of findings; old outcomes no longer apply
      setStates({});
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Content QA failed");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Apply one finding. Revisions are surgical but they all edit the same pack,
   * so fixes are applied strictly one at a time — running them in parallel would
   * have two passes rewriting the same document from the same stale copy.
   */
  async function applyFix(fix: QaFix): Promise<boolean> {
    setStates((s) => ({ ...s, [fix.key]: { status: "running" } }));
    try {
      const res = await fetch(`/api/materials/${materialId}/revise`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: fix.instruction }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Revision failed");
      const summary = data.summary ?? "";
      // applied === false means the pass could not locate the target; that is a
      // real outcome to show, not an error to hide
      setStates((s) => ({
        ...s,
        [fix.key]: data.applied
          ? { status: "applied", summary }
          : { status: "nothing", summary },
      }));
      return !!data.applied;
    } catch (e) {
      setStates((s) => ({
        ...s,
        [fix.key]: {
          status: "error",
          summary: e instanceof Error ? e.message : "Revision failed",
        },
      }));
      return false;
    }
  }

  async function fixOne(fix: QaFix) {
    if (queue > 0) return;
    setQueue(1);
    const changed = await applyFix(fix);
    setQueue(0);
    if (changed) router.refresh(); // the pack on screen is now stale
  }

  /** Apply everything outstanding, then re-run QA so the grade reflects reality. */
  async function fixAll() {
    if (queue > 0) return;
    const todo = fixes.filter((f) => stateOf(f.key).status === "idle");
    let changed = 0;
    for (let i = 0; i < todo.length; i++) {
      setQueue(todo.length - i);
      if (await applyFix(todo[i])) changed++;
    }
    setQueue(0);
    if (changed > 0) {
      router.refresh();
      await run(); // the previous grade was measured against content that no longer exists
    }
  }

  return (
    <div className="rounded-xl border border-inkline bg-inkcard p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-fg3">
          Content QA · Fact-check &amp; Teaching Review
        </h2>
        <div className="flex items-center gap-2">
          {report && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest ${
                GRADE_TONE[report.overallGrade] ?? "bg-fg3/20 text-fg2"
              }`}
            >
              {report.overallGrade} · {report.readyForReview ? "Ready" : "Needs work"}
            </span>
          )}
          {canRun && (
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className="rounded-md border border-brand/50 px-2.5 py-1 text-[11px] font-bold text-brand hover:bg-brand/10 disabled:opacity-50"
            >
              {busy ? "Reviewing…" : report ? "Re-run QA" : "Run QA"}
            </button>
          )}
        </div>
      </div>

      {err && <p className="mb-2 text-xs text-danger">{err}</p>}

      {!report && !busy && (
        <p className="text-xs text-fg3">
          Not yet reviewed. QA fact-checks every citation and judges whether each activity
          actually teaches the skill — the checks a human editor would make.
        </p>
      )}

      {busy && !report && (
        <p className="text-xs text-fg3">Reading the whole pack — this takes a minute…</p>
      )}

      {report && (
        <div className="flex flex-col gap-3 text-xs">
          <p className="text-fg2">{report.summary}</p>

          {canRun && fixes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2">
              <span className="font-bold text-brand">
                {pending.length > 0
                  ? `${pending.length} finding${pending.length === 1 ? "" : "s"} can be fixed automatically`
                  : "All findings applied"}
              </span>
              {pending.length > 0 && (
                <button
                  onClick={fixAll}
                  disabled={queue > 0 || busy}
                  className="rounded-md bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-brand disabled:opacity-40"
                >
                  {queue > 0 ? `Fixing… ${queue} left` : `Fix all (${pending.length})`}
                </button>
              )}
              <span className="text-[10px] text-fg3">
                Each fix is surgical — one page, one card, nothing else touched. QA re-runs when
                the queue finishes.
              </span>
            </div>
          )}

          {report.topFixes.length > 0 && (
            <div>
              <div className="mb-1 font-bold uppercase tracking-widest text-fg3">Top fixes</div>
              <ol className="ml-4 list-decimal space-y-0.5 text-fg2">
                {report.topFixes.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ol>
            </div>
          )}

          <div>
            <div className="mb-1 font-bold uppercase tracking-widest text-fg3">Citations</div>
            <ul className="space-y-1">
              {report.citations.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  <span className={`shrink-0 font-bold ${CITE_TONE[c.verdict] ?? "text-fg2"}`}>
                    [{c.id}] {c.verdict}
                  </span>
                  <span className="min-w-0 flex-1 text-fg3">{c.note}</span>
                  {canRun &&
                    (isAutoFixableCitation(c.verdict) ? (
                      <QaFixButton
                        fix={fixes.find((f) => f.key === `citation-${c.id}`)!}
                        state={stateOf(`citation-${c.id}`)}
                        disabled={queue > 0 || busy}
                        onFix={fixOne}
                      />
                    ) : c.verdict === "plausible" ? (
                      <span
                        title="The model cannot browse — check this against the real source yourself. Asking it to 'fix' a plausible citation invites an invented replacement."
                        className="shrink-0 rounded border border-inkline px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg3"
                      >
                        You verify
                      </span>
                    ) : null)}
                </li>
              ))}
            </ul>
          </div>

          {report.answerKeyIssues.length > 0 && (
            <div>
              <div className="mb-1 font-bold uppercase tracking-widest text-warn">
                Answer-key issues
              </div>
              <ul className="ml-4 list-disc space-y-0.5 text-fg2">
                {report.answerKeyIssues.map((a, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="min-w-0 flex-1">{a}</span>
                    {canRun && (
                      <QaFixButton
                        fix={{
                          key: `answer-${i}`,
                          kind: "answer-key",
                          label: a,
                          instruction: `Fix this answer key, changing nothing else: ${a}`,
                        }}
                        state={stateOf(`answer-${i}`)}
                        disabled={queue > 0 || busy}
                        onFix={fixOne}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Pages needing work, then — separately — the improvements the
              reviewer volunteered on pages it called strong. Mixing the two put
              a Fix button beside its own praise, and 7 real defects read as 19. */}
          <div>
            <div className="mb-1 font-bold uppercase tracking-widest text-fg3">
              {/* counted as "needs no work", not "isn't weak" — three adequate
                  pages queued for rewriting under a "15/15 solid" header is the
                  kind of number that stops being read */}
              Activities ({report.activities.length - needsWork.length}/
              {report.activities.length} need no work)
            </div>
            <ul className="space-y-1">
              {needsWork.map((a) => (
                <ActivityRow
                  key={a.index}
                  a={a}
                  fix={fixes.find((f) => f.key === `activity-${a.index}`)}
                  canRun={canRun}
                  state={stateOf(`activity-${a.index}`)}
                  disabled={queue > 0 || busy}
                  onFix={fixOne}
                />
              ))}
              {needsWork.length === 0 && (
                <li className="text-ok">
                  Every activity is on-skill and graded solid — nothing needs rewriting.
                </li>
              )}
            </ul>
          </div>

          {optional.length > 0 && (
            <details className="rounded border border-inkline/70 bg-inkmid/30 p-2">
              <summary className="cursor-pointer font-bold uppercase tracking-widest text-fg3">
                Optional polish ({optional.length})
              </summary>
              <p className="mt-1 mb-1.5 text-[11px] text-fg3">
                Ideas the reviewer offered on pages it already rated strong. Not
                defects — apply only if you want them.
              </p>
              <ul className="space-y-1">
                {optional.map((f) => {
                  const a = report.activities.find(
                    (x) => `activity-${x.index}` === f.key
                  );
                  return a ? (
                    <ActivityRow
                      key={a.index}
                      a={a}
                      fix={f}
                      canRun={canRun}
                      state={stateOf(f.key)}
                      disabled={queue > 0 || busy}
                      onFix={fixOne}
                    />
                  ) : null;
                })}
              </ul>
            </details>
          )}

          {verifyOnly.length > 0 && (
            <p className="rounded border border-inkline/70 bg-inkmid/40 p-2 text-[11px] text-fg3">
              <span className="font-bold text-fg2">Needs a human:</span> {verifyOnly.length} citation
              {verifyOnly.length === 1 ? " is" : "s are"} plausible but unconfirmed. Check the real
              source before this goes to a class — the model cannot.
            </p>
          )}

          {when && (
            <p className="text-[10px] text-fg3">
              Reviewed {new Date(when).toLocaleString()} · AI plausibility check — verify flagged
              citations against the real source.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** One reviewed page: its verdict, what the reviewer said, and its Fix button. */
function ActivityRow({
  a,
  fix,
  canRun,
  state,
  disabled,
  onFix,
}: {
  a: ContentQa["activities"][number];
  fix?: QaFix;
  canRun: boolean;
  state: FixState;
  disabled: boolean;
  onFix: (fix: QaFix) => void;
}) {
  return (
    <li className="flex items-start gap-2">
      <span className={`shrink-0 font-bold ${ACT_TONE[a.verdict] ?? "text-fg2"}`}>
        p{a.index} {a.verdict}
        {!a.teachesSkill ? " · off-skill" : ""}
      </span>
      <span className="min-w-0 flex-1 text-fg3">
        <span className="text-fg2">{a.title}</span>
        {a.issue ? ` — ${a.issue}` : ""}
        {a.fix ? <span className="text-brand"> Fix: {a.fix}</span> : null}
      </span>
      {canRun && fix && (
        <QaFixButton fix={fix} state={state} disabled={disabled} onFix={onFix} />
      )}
    </li>
  );
}
