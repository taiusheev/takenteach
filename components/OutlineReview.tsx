"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ACTIVITY_KINDS,
  LessonPack,
  OutlineEntry,
} from "@/lib/lesson-pack-schema";
import { Subject, SUBJECT_DEFS } from "@/lib/subjects";
import {
  PHASE_LABEL,
  kindLabel,
  outlineChecks,
  phaseOf,
  type ArcPhase,
  type OutlineCheck,
} from "@/lib/outline-review";
import { IconGrip, IconSpark } from "@/components/shell/icons";
import { useDragOrder } from "@/components/build/useDragOrder";
import { Field, RemoveButton } from "@/components/build/fields";

/**
 * STEP 1 — READ THE PLAN BEFORE PAYING FOR IT.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────
 * This screen was measured at 110 form controls: thirteen rows, each with a
 * fifteen-option `<select>`, three text inputs and three buttons. The AI had
 * just produced a genuinely good thirteen-page arc — cold attempt, name the
 * concept, model it, guided practice, two drills, evidence study, scaffolded
 * build, bridge, solo, sparring, transfer, timed exit ticket — and the screen
 * rendered it as a wall of dropdowns. The teacher could not see the lesson. To
 * find out whether the plan was any good they had to read across input boxes.
 *
 * That matters more here than anywhere else in the product, because this is the
 * screen where someone decides to spend ten minutes and a dollar. A plan you
 * cannot read is a plan you cannot approve, so the honest options were "press
 * Build and hope" or "skip review" — and both make this step pointless.
 *
 * ── WHAT IT IS NOW ───────────────────────────────────────────────────────
 * The plan reads as a lesson: one line per page, its purpose underneath, and a
 * proportional arc bar across the top showing where the sixty minutes actually
 * go. Editing is still complete — every field is still here — but it opens on
 * the row you click, so nothing is a form until you want it to be.
 *
 * Above the pages sit the checks (lib/outline-review.ts): the questions a head
 * of department would ask reading this over your shoulder, each with the repair
 * where the plan itself justifies one. Fixing a missing exit ticket costs one
 * click here and a rebuild later.
 */

/**
 * Shared in-flight outline requests, keyed by material id. React 19 StrictMode
 * remounts this component on first mount (fresh state + refs), so the auto-plan
 * effect runs twice. Without this, that fired the (slow, paid) outline call
 * twice AND stranded the live instance on "Planning…" when the dead instance's
 * request resolved first. Sharing the promise means one API call, and every
 * live instance attached to it renders the result.
 */
const outlineInFlight = new Map<
  number,
  Promise<{
    pack: LessonPack;
    outline: { activities: OutlineEntry[]; subtitle?: string; emoji?: string };
  }>
>();

function fetchOutline(materialId: number) {
  let p = outlineInFlight.get(materialId);
  if (!p) {
    p = fetch(`/api/materials/${materialId}/outline`, { method: "POST" }).then(
      async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Outline planning failed");
        return data;
      }
    );
    outlineInFlight.set(materialId, p);
    p.finally(() => {
      if (outlineInFlight.get(materialId) === p) outlineInFlight.delete(materialId);
    });
  }
  return p;
}

const PHASE_STYLE: Record<ArcPhase, { bar: string; dot: string; text: string }> = {
  open: { bar: "bg-brand2/70", dot: "bg-brand2", text: "text-brand2ink" },
  teach: { bar: "bg-brand/70", dot: "bg-brand", text: "text-brandink" },
  practise: { bar: "bg-brand/40", dot: "bg-brand/60", text: "text-fg2" },
  apply: { bar: "bg-ok/60", dot: "bg-ok", text: "text-ok" },
  assess: { bar: "bg-warn/60", dot: "bg-warn", text: "text-warn" },
};

export default function OutlineReview({
  materialId,
  title,
  subject,
  initialPack,
  onConfirm,
}: {
  materialId: number;
  title: string;
  subject: Subject;
  initialPack: LessonPack;
  onConfirm: (pack: LessonPack) => void;
}) {
  const def = SUBJECT_DEFS[subject];
  const [plan, setPlan] = useState<OutlineEntry[]>(initialPack.outlinePlan ?? []);
  const [subtitle, setSubtitle] = useState(initialPack.subtitle);
  const [emoji, setEmoji] = useState(initialPack.emoji);
  const hasSavedOutline = (initialPack.outlinePlan ?? []).length > 0;
  const [phase, setPhase] = useState<"idle" | "planning" | "ready" | "error">(
    hasSavedOutline ? "ready" : "planning"
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

  async function replan() {
    setPhase("planning");
    setError("");
    try {
      const res = await fetch(`/api/materials/${materialId}/outline`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Outline planning failed");
      setPlan((data.pack.outlinePlan as OutlineEntry[]) ?? data.outline.activities);
      setSubtitle(data.pack.subtitle || subtitle);
      setEmoji(data.pack.emoji || emoji);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Outline planning failed");
      setPhase("error");
    }
  }

  useEffect(() => {
    if (hasSavedOutline) return;
    let alive = true;
    fetchOutline(materialId)
      .then((data) => {
        if (!alive) return;
        setPlan((data.pack.outlinePlan as OutlineEntry[]) ?? data.outline.activities);
        setSubtitle(data.pack.subtitle || subtitle);
        setEmoji(data.pack.emoji || emoji);
        setPhase("ready");
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Outline planning failed");
        setPhase("error");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── edit helpers ──
  function patch(i: number, p: Partial<OutlineEntry>) {
    setPlan((cur) => cur.map((e, j) => (j === i ? { ...e, ...p } : e)));
  }
  function move(i: number, dir: -1 | 1) {
    setPlan((cur) => {
      const j = i + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setOpenRow(null);
  }
  function remove(i: number) {
    setPlan((cur) => cur.filter((_, j) => j !== i));
    setOpenRow(null);
  }
  function add() {
    setPlan((cur) => [
      ...cur,
      { kind: "custom", title: "", badge: "", durationMin: 10, goal: "" },
    ]);
    setOpenRow(plan.length);
  }

  const drag = useDragOrder(plan, (next) => {
    setPlan(next);
    setOpenRow(null);
  });

  async function buildWith(outlinePlan: OutlineEntry[]) {
    setSaving(true);
    setError("");
    const updated = { ...initialPack, subtitle, emoji, outlinePlan };
    try {
      const res = await fetch(`/api/materials/${materialId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content: updated }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not save the plan");
      }
      onConfirm(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the plan");
      setSaving(false);
    }
  }

  const target = initialPack.durationMin;
  const total = plan.reduce((n, e) => n + (e.durationMin || 0), 0);
  const checks = useMemo(
    () => outlineChecks(plan, target).filter((c) => !dismissed.includes(c.id)),
    [plan, target, dismissed]
  );
  const blockers = checks.filter((c) => c.level === "blocker");

  function applyFix(check: OutlineCheck) {
    if (!check.fix) return;
    setPlan((cur) => check.fix!.apply(cur));
    setOpenRow(null);
  }

  function jumpTo(i?: number) {
    if (i === undefined) return;
    setOpenRow(i);
    requestAnimationFrame(() =>
      document
        .getElementById(`outline-row-${i}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <Link
          href={`/materials/${materialId}`}
          className="mt-1 shrink-0 text-[13px] font-semibold text-fg3 transition-colors hover:text-fg1"
        >
          ← Lesson
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-fg3">
            Step 1 of 2 · the plan
          </p>
          <h1 className="mt-0.5 truncate text-[22px] font-semibold tracking-[-0.02em] text-fg1">
            {title}
          </h1>
          <p className="mt-0.5 text-[12.5px] text-fg2">
            {def.label} · {target} minutes. Nothing has been written yet — read
            it, change what you disagree with, then build.
          </p>
        </div>
        <button
          onClick={() => void replan()}
          disabled={phase === "planning" || saving}
          className="btn btn-secondary btn-sm shrink-0"
        >
          {phase === "planning" ? "Planning…" : "Plan it again"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[12.5px] text-danger">
          <p>{error}</p>
          {phase === "error" && plan.length === 0 && (
            <button
              onClick={() => void buildWith([])}
              disabled={saving}
              className="mt-2 rounded-md border border-danger/50 px-3 py-1.5 font-semibold hover:bg-danger/12 disabled:opacity-40"
            >
              {saving ? "Starting…" : "Build without a plan →"}
            </button>
          )}
        </div>
      )}

      {phase === "planning" && <PlanningState />}

      {plan.length > 0 && (
        <>
          <ArcBar plan={plan} total={total} target={target} />

          {checks.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-fg3">
                Before you build
              </h2>
              <ul className="flex flex-col gap-2">
                {checks.map((c) => (
                  <li
                    key={c.id}
                    className={`flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 ${
                      c.level === "blocker"
                        ? "border-danger/40 bg-danger/8"
                        : c.level === "warn"
                          ? "border-warn/40 bg-warn/8"
                          : "border-inkline bg-surface"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-[13px] font-semibold ${
                          c.level === "blocker"
                            ? "text-danger"
                            : c.level === "warn"
                              ? "text-warn"
                              : "text-fg1"
                        }`}
                      >
                        {c.title}
                      </p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-fg2">
                        {c.detail}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {c.index !== undefined && (
                        <button
                          onClick={() => jumpTo(c.index)}
                          className="btn btn-ghost btn-sm"
                        >
                          Show me
                        </button>
                      )}
                      {c.fix && (
                        <button
                          onClick={() => applyFix(c)}
                          className="btn btn-secondary btn-sm"
                        >
                          {c.fix.label}
                        </button>
                      )}
                      {!c.fix && c.level !== "blocker" && (
                        <button
                          onClick={() => setDismissed((d) => [...d, c.id])}
                          className="btn btn-ghost btn-sm"
                          title="I know — build it anyway"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-fg3">
              {plan.length} pages
            </h2>
            <span className="text-[11.5px] text-fg3">
              Click a page to change it
            </span>
          </div>

          <ol className="flex flex-col gap-1.5">
            {plan.map((e, i) => {
              const p = phaseOf(e.kind);
              const open = openRow === i;
              return (
                <li
                  key={i}
                  id={`outline-row-${i}`}
                  {...drag.rowProps(i)}
                  className="card scroll-mt-24 overflow-hidden data-[dragging=true]:opacity-45 data-[drop-target=true]:border-brand data-[drop-target=true]:shadow-[0_0_0_2px_var(--brand)]"
                >
                  <div className="flex items-start gap-2.5 px-3 py-2.5">
                    <span
                      {...drag.handleProps(i)}
                      aria-hidden
                      title="Drag to reorder"
                      className="mt-0.5 cursor-grab rounded p-0.5 text-fg3 transition-colors hover:text-fg1 active:cursor-grabbing"
                    >
                      <IconGrip size={14} />
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenRow(open ? null : i)}
                      aria-expanded={open}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="w-5 shrink-0 text-right text-[12px] tabular-nums text-fg3">
                          {i + 1}
                        </span>
                        <span
                          aria-hidden
                          className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${PHASE_STYLE[p].dot}`}
                        />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg1">
                          {e.title || (
                            <span className="text-fg3">Untitled page</span>
                          )}
                        </span>
                        <span className="shrink-0 text-[11px] uppercase tracking-wider text-fg3">
                          {kindLabel(e.kind)}
                        </span>
                        <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-fg2">
                          {e.durationMin} min
                        </span>
                      </span>
                      {/* The goal is the whole reason this screen is worth
                          reading: it is what the build writes the page against. */}
                      {e.goal && !open && (
                        <span className="mt-1 block pl-[1.9rem] pr-16 text-[12px] leading-relaxed text-fg2">
                          {e.goal}
                        </span>
                      )}
                    </button>
                  </div>

                  {open && (
                    <div className="flex flex-col gap-3 border-t border-inkline bg-surface-alt/40 px-4 py-3.5">
                      <div className="grid gap-3 sm:grid-cols-[1fr_11rem_6rem]">
                        <Field label="Page title">
                          <input
                            className="field-input font-semibold"
                            value={e.title}
                            onChange={(ev) => patch(i, { title: ev.target.value })}
                            placeholder="PUNCH THE ARGUMENT"
                          />
                        </Field>
                        <Field label="What kind of page">
                          <select
                            className="field-input"
                            value={e.kind}
                            onChange={(ev) =>
                              patch(i, {
                                kind: ev.target.value as OutlineEntry["kind"],
                              })
                            }
                          >
                            {ACTIVITY_KINDS.map((k) => (
                              <option key={k} value={k}>
                                {kindLabel(k)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Minutes">
                          <input
                            type="number"
                            className="field-input"
                            value={e.durationMin}
                            onChange={(ev) =>
                              patch(i, {
                                durationMin: Math.max(
                                  0,
                                  Number(ev.target.value) || 0
                                ),
                              })
                            }
                          />
                        </Field>
                      </div>
                      <Field
                        label="Purpose"
                        hint="The build writes this page against this sentence — it is the most useful thing on the row to correct."
                      >
                        <textarea
                          className="field-textarea !min-h-14"
                          value={e.goal}
                          onChange={(ev) => patch(i, { goal: ev.target.value })}
                          placeholder="What students do here, and what it is for."
                        />
                      </Field>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          className="btn btn-ghost btn-sm disabled:opacity-30"
                        >
                          Move up
                        </button>
                        <button
                          onClick={() => move(i, 1)}
                          disabled={i === plan.length - 1}
                          className="btn btn-ghost btn-sm disabled:opacity-30"
                        >
                          Move down
                        </button>
                        <div className="flex-1" />
                        <RemoveButton
                          onClick={() => remove(i)}
                          title="Remove this page"
                        />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <button
            onClick={add}
            className="mt-2 rounded-md border border-dashed border-line-strong px-3 py-1.5 text-[12px] font-semibold text-fg2 transition-colors hover:border-brand/50 hover:text-fg1"
          >
            + Add a page
          </button>

          {/* The cosmetic fields, last and folded away. They were at the TOP of
              this screen — a cover emoji asked for before the teacher had read
              a single page of the lesson it goes on. */}
          <details className="mt-4 rounded-xl border border-inkline px-4 py-2.5">
            <summary className="cursor-pointer text-[12.5px] font-semibold text-fg2">
              Cover details
            </summary>
            <div className="mt-3 flex gap-3">
              <label className="w-24 shrink-0">
                <span className="field-label">Emoji</span>
                <input
                  className="field-input text-center"
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                />
              </label>
              <label className="flex-1">
                <span className="field-label">Subtitle</span>
                <input
                  className="field-input"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Topic Intro & The PEEL Argument"
                />
              </label>
            </div>
          </details>

          <div className="sticky bottom-0 mt-6 -mx-4 border-t border-inkline bg-surface/90 px-4 py-3.5 backdrop-blur-md sm:-mx-6 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                onClick={() => void buildWith(plan)}
                disabled={saving || plan.length === 0}
                className="btn btn-primary"
              >
                <IconSpark size={15} />
                {saving ? "Starting the build…" : `Build these ${plan.length} pages`}
              </button>
              <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-fg3">
                {/* Said before the money is spent, not after. */}
                Writes every page, the evidence deck and the teacher guide —
                about 7–15 minutes. Each stage is saved as it finishes, so you
                can leave and come back.
                {blockers.length > 0 && (
                  <span className="block font-semibold text-danger">
                    {blockers.length} problem
                    {blockers.length === 1 ? "" : "s"} above will still be there
                    in the finished pack.
                  </span>
                )}
              </p>
              <button
                onClick={() => void buildWith([])}
                disabled={saving}
                className="btn btn-ghost btn-sm shrink-0"
                title="Discard this plan and let the build decide the structure itself"
              >
                Discard the plan
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The arc — where the minutes actually go.
 *
 * One bar, segmented by page and coloured by what the ROOM is doing. It answers
 * in a glance the question the list of pages takes a minute to answer: is this
 * lesson front-loaded with me talking, and does it end with them working?
 */
function ArcBar({
  plan,
  total,
  target,
}: {
  plan: OutlineEntry[];
  total: number;
  target: number;
}) {
  const byPhase = new Map<ArcPhase, number>();
  for (const e of plan) {
    const p = phaseOf(e.kind);
    byPhase.set(p, (byPhase.get(p) ?? 0) + (e.durationMin || 0));
  }
  const order: ArcPhase[] = ["open", "teach", "practise", "apply", "assess"];

  return (
    <div className="card mb-5 p-4">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-fg3">
          The shape of the lesson
        </h2>
        <span
          className={`text-[12px] tabular-nums ${
            total === target ? "text-fg3" : "font-semibold text-warn"
          }`}
        >
          {total} of {target} min
        </span>
      </div>

      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-alt">
        {plan.map((e, i) => {
          const pct = total > 0 ? ((e.durationMin || 0) / total) * 100 : 0;
          return (
            <span
              key={i}
              title={`${e.title || "Untitled"} · ${e.durationMin} min`}
              className={`${PHASE_STYLE[phaseOf(e.kind)].bar} border-r border-surface last:border-r-0`}
              style={{ width: `${pct}%` }}
            />
          );
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {order.map((p) => {
          const mins = byPhase.get(p) ?? 0;
          if (mins === 0) return null;
          return (
            <span key={p} className="flex items-center gap-1.5 text-[11.5px]">
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${PHASE_STYLE[p].dot}`}
              />
              <span className="text-fg2">{PHASE_LABEL[p]}</span>
              <span className="tabular-nums text-fg3">
                {mins}m · {total > 0 ? Math.round((mins / total) * 100) : 0}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The wait for the outline — 60–90 seconds of one model call.
 *
 * It said "Planning the page-by-page arc…" in grey and nothing else, which is
 * the spinner problem in text form. This names what is being decided, so the
 * wait reads as work rather than as a hang.
 */
function PlanningState() {
  const steps = [
    "Reading your brief and the resolution",
    "Choosing the lesson's shape for this skill",
    "Sequencing the pages — model, practise, apply, assess",
    "Setting a purpose and a length for each page",
  ];
  return (
    <div className="card p-6">
      <div className="flex items-center gap-2.5">
        <IconSpark size={16} className="build-pulse text-brand2" />
        <p className="text-[14px] font-semibold text-fg1">
          Planning the lesson
        </p>
      </div>
      <p className="mt-1 text-[12.5px] text-fg2">
        About a minute. Nothing is written yet — this is the outline you get to
        change before the pages are built.
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {steps.map((s) => (
          <li key={s} className="flex items-center gap-2.5">
            <span className="skeleton h-1.5 w-1.5 shrink-0 rounded-full" />
            <span className="text-[12.5px] text-fg3">{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
