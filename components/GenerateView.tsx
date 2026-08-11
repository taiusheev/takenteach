"use client";

import Link from "next/link";
import { useEffect, useRef, useMemo, useState } from "react";
import { LessonPack } from "@/lib/lesson-pack-schema";
import { packReadiness } from "@/lib/readiness";
import type { RepairSummary, QaSummary } from "@/lib/ai";
import { Subject, SUBJECT_DEFS } from "@/lib/subjects";
import { contentTypeDef } from "@/lib/content-types";

// Mirrors STAGE_LABELS in lib/ai.ts. Deliberately duplicated rather than
// imported: ai.ts pulls in the Anthropic SDK, and this is a client component.
// Keep the ids in step with the generator — they key the progress rail.
const STAGES: { id: string; label: string }[] = [
  { id: "outline", label: "Lesson outline — page-by-page plan" },
  { id: "foundation", label: "Mission, success criteria & vocabulary" },
  { id: "evidence", label: "Evidence / source deck" },
  { id: "activities-1", label: "The teachable spine — hook, model, practice, exit ticket" },
  { id: "activities-2", label: "The rest of the pages — drills, source work, transfer" },
  { id: "teacher-guide", label: "Teacher guide, timing plan & rubric" },
  { id: "polish", label: "Polish — self-review against the quality rubric" },
  { id: "validate", label: "Validate & auto-fix — the review checklist" },
  { id: "qa", label: "Content QA — fact-check, then fix what it finds" },
  // Runs concurrently from the outline onwards; it appears last because that is
  // where it is collected, not where the work happens.
  { id: "design", label: "Visual identity — one design system for every page" },
];

type StageState = "pending" | "running" | "done";

/**
 * Real-time AI build: stages light up as the model works, and each section's
 * content renders the moment it lands. Everything is saved stage-by-stage, so
 * stopping keeps what's already built.
 */
export default function GenerateView({
  materialId,
  type = "lesson-pack",
  title,
  subject,
  initialPack,
}: {
  materialId: number;
  type?: string;
  title: string;
  subject: Subject;
  initialPack: LessonPack;
}) {
  const def = SUBJECT_DEFS[subject];
  const typeDef = contentTypeDef(type);
  // the lighter content types draft in one stage, then face the same
  // deterministic review checklist a pack does
  const stageList =
    type === "lesson-pack"
      ? STAGES
      : [
          { id: "draft", label: `Drafting the ${typeDef.label.toLowerCase()}` },
          { id: "validate", label: "Validate & auto-fix — the review checklist" },
        ];
  const [pack, setPack] = useState<LessonPack>(initialPack);
  // recomputed from the pack itself on every stage, so a resumed or hand-edited
  // build reports the same truth as a fresh one
  const readiness = useMemo(() => packReadiness(pack), [pack]);
  const [repair, setRepair] = useState<RepairSummary | null>(null);
  const [qa, setQa] = useState<QaSummary | null>(null);
  const [usage, setUsage] = useState<string>("");
  const [cacheHit, setCacheHit] = useState<number | null>(null);
  const [stages, setStages] = useState<Record<string, StageState>>({});
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "stopped" | "error">("idle");
  const [error, setError] = useState("");
  const [regenBusy, setRegenBusy] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** Redo a single section from the build screen, reusing the Builder's engine. */
  async function regenSection(section: "vocabulary" | "evidence" | "teacher-guide") {
    setRegenBusy(section);
    setError("");
    try {
      const res = await fetch(`/api/materials/${materialId}/generate-section`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Redo failed");
      setPack(data.pack);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Redo failed");
    } finally {
      setRegenBusy(null);
    }
  }

  async function start(fresh = false) {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase("running");
    setError("");
    setStages({});
    try {
      const res = await fetch(`/api/materials/${materialId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fresh }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Generation failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue; // skip a malformed/partial line rather than killing the live view
          }
          if (event.type === "stage-start") {
            setStages((s) => ({ ...s, [event.stage]: "running" }));
          } else if (event.type === "stage-done") {
            setStages((s) => ({ ...s, [event.stage]: "done" }));
            if (event.pack) setPack(event.pack);
            if (event.repair) setRepair(event.repair);
            if (event.qa) setQa(event.qa);
          } else if (event.type === "done") {
            if (event.pack) setPack(event.pack);
            if (event.repair) setRepair(event.repair);
            if (event.qa) setQa(event.qa);
            setPhase("done");
          } else if (event.type === "usage") {
            setUsage(event.summary ?? "");
            const u = event.usage;
            const seen = (u?.input ?? 0) + (u?.cacheWrite ?? 0) + (u?.cacheRead ?? 0);
            setCacheHit(seen > 0 ? (u.cacheRead ?? 0) / seen : null);
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }
      setPhase((p) => (p === "running" ? "done" : p));
    } catch (err) {
      if (ctrl.signal.aborted) {
        setPhase("stopped");
      } else {
        setPhase("error");
        setError(err instanceof Error ? err.message : "Generation failed");
      }
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  // Auto-start once on first visit if the pack is still empty. No ref guard:
  // React 19 StrictMode remounts with fresh refs, which defeated the old
  // `autostarted` ref and double-fired the whole (paid) build. Instead we abort
  // the in-flight stream on unmount — the generate route checks req.signal and
  // stops server-side — so the simulated remount cancels the first run and the
  // live instance owns the authoritative one.
  useEffect(() => {
    if (pack.activities.length > 0) return;
    // Firing the streaming build is this effect's whole purpose; the
    // synchronous loading-state setState inside start() is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    start();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = phase === "running";

  /**
   * A running build dies if this component unmounts.
   *
   * That is deliberate — aborting on unmount is what stops React 19's
   * StrictMode remount from double-firing (and double-billing) the whole build.
   * But it also means closing the tab, reloading, or clicking "← Material"
   * silently ends a paid seven-to-fifteen-minute build, and nothing said so.
   * Completed stages are already persisted, so the cost is the remaining work
   * plus the walk back to Resume — worth one confirmation.
   */
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  /** Guards in-app navigation, which never triggers `beforeunload`. */
  function confirmLeave(e: React.MouseEvent) {
    if (!running) return;
    if (
      !window.confirm(
        "The build is still running. Leaving this page stops it.\n\nEverything finished so far is already saved, and you can press Resume to pick up where it left off."
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href={`/materials/${materialId}`}
          onClick={confirmLeave}
          className="text-sm font-bold text-fg3 hover:text-fg1 transition-colors"
        >
          ← Material
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-3xl text-fg1">⚡ Quick Build — {title}</h1>
          <p className="text-xs text-fg3">
            {def.label} · {pack.resolution || "no anchor"} · {pack.durationMin} min
          </p>
        </div>
        {running ? (
          <button onClick={stop} className="rounded-md border border-danger/50 px-4 py-2 text-sm font-bold text-danger hover:bg-danger/10 transition-colors">
            ⏹ Stop (keeps what&apos;s built)
          </button>
        ) : (
          <>
            {phase === "idle" && (
              <button onClick={() => start(false)} className="btn btn-primary">
                ▶ Start AI build
              </button>
            )}
            {(phase === "stopped" || phase === "error") && (
              <>
                <button onClick={() => start(false)} className="btn btn-primary">
                  ▶ Resume build
                </button>
                <button onClick={() => start(true)} className="btn btn-secondary">
                  ↻ Regenerate all
                </button>
              </>
            )}
            {phase === "done" && (
              <button onClick={() => start(true)} className="btn btn-primary">
                ↻ Regenerate all
              </button>
            )}
            <Link href={`/materials/${materialId}/edit`} className="btn btn-secondary">
              ✏️ Open in Builder
            </Link>
            <Link href={`/materials/${materialId}/print`} className="btn btn-secondary">
              🖨 Print Preview
            </Link>
          </>
        )}
      </div>

      {/* What the teacher can do RIGHT NOW. A build takes minutes; a lesson is
          read and taught in order, so the cover and the first pages are useful
          long before the last one exists. */}
      {readiness.level !== "empty" && (
        <div
          className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
            readiness.canTeach
              ? "border-ok/40 bg-ok/10"
              : "border-inkline bg-inkcard"
          }`}
        >
          <span
            className={`text-sm font-bold ${
              readiness.canTeach ? "text-ok" : "text-fg1"
            }`}
          >
            {readiness.canTeach ? "✓ " : ""}
            {readiness.headline}
          </span>

          {readiness.pages > 0 && (
            <Link
              href={`/materials/${materialId}/print`}
              className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                readiness.canTeach
                  ? "bg-ok text-white hover:bg-ok"
                  : "border border-inkline text-fg2 hover:text-fg1"
              }`}
            >
              {readiness.canTeach ? "Print it now" : `Preview ${readiness.pages} pages`}
            </Link>
          )}

          {!readiness.canTeach && readiness.missing.length > 0 && (
            <span className="text-[11px] text-fg3">
              Still needs {readiness.missing.slice(0, 2).join(" and ")}
              {readiness.missing.length > 2 ? ` (+${readiness.missing.length - 2})` : ""}
            </span>
          )}
          {readiness.canTeach && readiness.outstanding > 0 && (
            <span className="text-[11px] text-ok/80">
              The rest keeps building — nothing you print now will be taken away.
            </span>
          )}
        </div>
      )}

      {/* progress bar — how far through the build we are */}
      {phase !== "idle" && (
        <div className="mb-6">
          <div className="mb-1 flex justify-between text-[11px] font-bold uppercase tracking-widest text-fg3">
            <span>
              {phase === "running" ? (
                <>
                  Building…{" "}
                  <span className="font-normal normal-case tracking-normal text-fg3">
                    keep this tab open — every finished stage is saved, so you
                    can Resume if it stops.
                  </span>
                </>
              ) : phase === "done" ? (
                "Complete"
              ) : phase === "stopped" ? (
                "Stopped"
              ) : (
                "Error"
              )}
            </span>
            <span>
              {stageList.filter((s) => stages[s.id] === "done").length}/
              {stageList.length} stages
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-inkmid">
            <div
              className={`h-full transition-all duration-500 ${
                phase === "error" ? "bg-danger" : phase === "done" ? "bg-ok" : "bg-accent"
              }`}
              style={{
                width: `${(stageList.filter((s) => stages[s.id] === "done").length / stageList.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      )}
      {phase === "done" && (
        <div className="mb-6 rounded-xl border border-ok/40 bg-ok/10 p-4 text-sm text-ok">
          Draft complete — {pack.activities.length} activities,{" "}
          {pack.evidenceCards.length} cards, {pack.vocabulary.length} vocabulary
          terms. ⚠️ AI-drafted citations must be verified against real sources
          before this pack goes to review. Refine any section in the Builder.
          {repair && <RepairNote repair={repair} />}
          {qa && <QaNote qa={qa} />}
          {usage && (
            <div className="mt-2 border-t border-ok/25 pt-2">
              <div className="text-ok">💳 {usage}</div>
              {/* A build makes ~10+ calls over one shared prompt prefix. If almost
                  none of the input came from cache, something is invalidating it
                  and this build cost several times what it should have. */}
              {cacheHit !== null && cacheHit < 0.4 && (
                <div className="mt-1 text-warn">
                  ⚠️ Only {Math.round(cacheHit * 100)}% of input was served from
                  cache — the shared prompt prefix is being invalidated between
                  stages, which makes every build cost several times more than it
                  should. Worth investigating before the next run.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* stage rail */}
        <ol className="flex flex-col gap-2 lg:sticky lg:top-6 lg:self-start">
          {stageList.map((s) => {
            const st: StageState = stages[s.id] ?? "pending";
            return (
              <li key={s.id} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs transition-colors ${
                st === "running"
                  ? "border-accent/60 bg-inkcard"
                  : st === "done"
                    ? "border-ok/40 bg-inkcard"
                    : "border-inkline bg-inkmid"
              }`}>
                <span className="mt-0.5">
                  {st === "done" ? "✅" : st === "running" ? (
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-inkline border-t-accent" />
                  ) : "○"}
                </span>
                <span className={st === "pending" ? "text-fg3" : "font-semibold text-fg1"}>
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>

        {/* live content */}
        <div className="flex min-w-0 flex-col gap-4">
          {pack.mission && (
            <Panel
              title="Mission & success criteria"
              action={
                type === "lesson-pack" && !running ? (
                  <RedoButton busy={regenBusy === "vocabulary"} onClick={() => regenSection("vocabulary")} />
                ) : undefined
              }
            >
              <p className="text-sm text-fg1">{pack.mission}</p>
              <ul className="mt-2 grid gap-1 text-xs text-fg2 sm:grid-cols-2">
                {pack.successCriteria.map((c, i) => (
                  <li key={i}>→ {c}</li>
                ))}
              </ul>
            </Panel>
          )}
          {pack.vocabulary.length > 0 && (
            <Panel title={`Vocabulary (${pack.vocabulary.length})`}>
              <div className="flex flex-wrap gap-2">
                {pack.vocabulary.map((v, i) => (
                  <span key={i} title={v.definition} className="rounded-full border border-inkline bg-inkmid px-3 py-1 text-xs font-bold text-fg1">
                    {v.term}
                  </span>
                ))}
              </div>
            </Panel>
          )}
          {pack.evidenceCards.length > 0 && (
            <Panel
              title={`${def.evidenceLabel} (${pack.evidenceCards.length})`}
              action={
                type === "lesson-pack" && !running ? (
                  <RedoButton busy={regenBusy === "evidence"} onClick={() => regenSection("evidence")} />
                ) : undefined
              }
            >
              <div className="flex flex-col gap-2">
                {pack.evidenceCards.map((c) => (
                  <div key={c.id} className="rounded-lg border border-inkline p-2.5 text-xs">
                    <span className={`mr-2 rounded px-1.5 py-0.5 font-black text-white ${c.side === "con" ? "bg-danger" : c.side === "pro" ? "bg-ok" : "bg-fg2"}`}>
                      {c.id}
                    </span>
                    <span className="font-bold text-fg1">
                      {c.institution} · {c.year}
                    </span>
                    <span className="text-fg3"> — {c.publication}</span>
                    <p className="mt-1 text-fg2">{c.paraphrase}</p>
                    <p className="mt-1 text-danger">⛔ {c.limit}</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {pack.activities.length > 0 && (
            <Panel title={`Student activities (${pack.activities.length})`}>
              <ol className="flex flex-col gap-1.5">
                {pack.activities.map((a, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-xs">
                    <span className="w-5 text-right font-bold text-fg3">{i + 1}.</span>
                    <span className="font-bold text-fg1">{a.title}</span>
                    <span className="rounded bg-inkmid px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg3">
                      {a.kind}
                    </span>
                    <span className="text-fg3">{a.durationMin} min</span>
                    {(a.exampleLayers.length > 0 || a.sortItems.length > 0 || a.frames.length > 0 || a.matchPairs.length > 0) && (
                      <span className="text-[10px] text-fg3">
                        {a.exampleLayers.length > 0 && "· worked example "}
                        {a.sortItems.length > 0 && `· ${a.sortItems.length}-item sort `}
                        {a.matchPairs.length > 0 && "· matching "}
                        {a.frames.length > 0 && "· frames "}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </Panel>
          )}
          {pack.teacherGuide.timingPlan.length > 0 && (
            <Panel
              title={`Teacher guide — ${pack.teacherGuide.timingPlan.length} phases${pack.teacherGuide.rubric.length > 0 ? `, ${pack.teacherGuide.rubric.length}-band rubric` : ""}`}
              action={
                type === "lesson-pack" && !running ? (
                  <RedoButton busy={regenBusy === "teacher-guide"} onClick={() => regenSection("teacher-guide")} />
                ) : undefined
              }
            >
              <div className="flex flex-col gap-1 text-xs text-fg2">
                {pack.teacherGuide.timingPlan.map((r, i) => (
                  <div key={i}>
                    <span className="font-mono font-bold text-fg1">
                      {r.startMin}–{r.endMin}
                    </span>{" "}
                    {r.phase} <span className="text-fg3">({r.who})</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {phase === "running" && pack.activities.length === 0 && !pack.mission && (
            <div className="rounded-xl border border-dashed border-inkline p-10 text-center text-sm text-fg3">
              The model is planning the lesson — sections appear here as they land…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** One line on what the validate pass caught, shown under "Draft complete". */
function RepairNote({ repair }: { repair: RepairSummary }) {
  const { fixed, remaining, passedAll } = repair;
  if (fixed.length === 0 && remaining.length === 0) {
    return (
      <div className="mt-2 border-t border-ok/25 pt-2 text-ok">
        ✓ Passed every review check on the first pass.
      </div>
    );
  }
  return (
    <div className="mt-2 border-t border-ok/25 pt-2">
      {fixed.length > 0 && (
        <div className="text-ok">
          🛠 Auto-repaired {fixed.length} checklist{" "}
          {fixed.length === 1 ? "issue" : "issues"}: {fixed.join(", ")}.
        </div>
      )}
      {remaining.length > 0 ? (
        <div className="mt-1 text-warn">
          ⚠️ {remaining.length} still {remaining.length === 1 ? "needs" : "need"} a
          manual look: {remaining.join(", ")}.
        </div>
      ) : (
        passedAll && (
          <div className="mt-1 text-ok">
            The pack now clears the full review checklist.
          </div>
        )
      )}
    </div>
  );
}

/**
 * What content QA graded and repaired on its own, shown under "Draft complete".
 * The grade is the reviewer's post-repair verdict, so it is the number that
 * decides whether the pack can be submitted for human review.
 */
function QaNote({ qa }: { qa: QaSummary }) {
  const good = qa.ready && (qa.grade === "A" || qa.grade === "B");
  return (
    <div className="mt-2 border-t border-ok/25 pt-2">
      <div className={good ? "text-ok" : "text-warn"}>
        📋 Content QA graded this pack <strong>{qa.grade}</strong> —{" "}
        {qa.ready ? "ready for review" : "not yet ready for review"}.
      </div>
      {qa.repaired.length > 0 && (
        <div className="mt-1 text-ok">
          🛠 Fixed {qa.repaired.length} QA{" "}
          {qa.repaired.length === 1 ? "finding" : "findings"} automatically:{" "}
          {qa.repaired.join("; ")}.
        </div>
      )}
      {qa.remaining.length > 0 && (
        <div className="mt-1 text-warn">
          ⚠️ {qa.remaining.length} QA{" "}
          {qa.remaining.length === 1 ? "finding" : "findings"} left for you —
          open Content QA on the material page to fix{" "}
          {qa.remaining.length === 1 ? "it" : "them"} in one click:{" "}
          {qa.remaining.join("; ")}.
        </div>
      )}
      {qa.verify.length > 0 && (
        <div className="mt-1 text-warn">
          🔍 {qa.verify.length}{" "}
          {qa.verify.length === 1 ? "citation needs" : "citations need"} a human
          to check {qa.verify.length === 1 ? "it" : "them"} against the real
          source — no AI can confirm that: {qa.verify.join("; ")}.
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-inkline bg-inkcard p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-fg3">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Small "redo this section" button for the build screen. */
function RedoButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="shrink-0 rounded border border-brand2/50 px-2 py-0.5 text-[11px] font-bold text-brand2 hover:bg-brand2/10 disabled:opacity-40 transition-colors"
    >
      {busy ? "✨ Redoing…" : "↻ Redo"}
    </button>
  );
}
