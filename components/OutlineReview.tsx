"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ACTIVITY_KINDS,
  LessonPack,
  OutlineEntry,
} from "@/lib/lesson-pack-schema";
import { Subject, SUBJECT_DEFS } from "@/lib/subjects";

/**
 * Shared in-flight outline requests, keyed by material id. React 19 StrictMode
 * remounts this component on first mount (fresh state + refs), so the auto-plan
 * effect runs twice. Without this, that fired the (slow, paid) outline call
 * twice AND stranded the live instance on "Planning…" when the dead instance's
 * request resolved first. Sharing the promise means one API call, and every
 * live instance attached to it renders the result.
 */
const outlineInFlight = new Map<number, Promise<{ pack: LessonPack; outline: { activities: OutlineEntry[]; subtitle?: string; emoji?: string } }>>();

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
    // Clear once settled so a later manual re-plan can fetch a fresh outline.
    p.finally(() => {
      if (outlineInFlight.get(materialId) === p) outlineInFlight.delete(materialId);
    });
  }
  return p;
}

/**
 * Step 1 of the build — steer the outline. The AI plans the page-by-page arc;
 * the author reorders, retitles, retimes, and re-goals it before committing to
 * the full ~20-page write. Course-correcting the skeleton here is far cheaper
 * than regenerating whole pages later.
 */
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
  // Start straight in "planning" for a fresh pack so the auto-plan effect never
  // has to setState synchronously in its body (it kicks off the fetch and only
  // setStates in the async callbacks).
  const [phase, setPhase] = useState<"idle" | "planning" | "ready" | "error">(
    hasSavedOutline ? "ready" : "planning"
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function plan_it() {
    setPhase("planning");
    setError("");
    try {
      const res = await fetch(`/api/materials/${materialId}/outline`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Outline planning failed");
      setPlan(
        (data.pack.outlinePlan as OutlineEntry[]) ?? data.outline.activities
      );
      setSubtitle(data.pack.subtitle || subtitle);
      setEmoji(data.pack.emoji || emoji);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Outline planning failed");
      setPhase("error");
    }
  }

  // Auto-plan on first visit when there's no reviewed outline yet. Uses a
  // shared in-flight request (see fetchOutline) so StrictMode's double-mount
  // makes one API call, and an `alive` guard so only the mounted instance
  // updates state — the stranded-on-"Planning…" bug lived here.
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
  }
  function remove(i: number) {
    setPlan((cur) => cur.filter((_, j) => j !== i));
  }
  function add() {
    setPlan((cur) => [
      ...cur,
      { kind: "custom", title: "", badge: "", durationMin: 10, goal: "" },
    ]);
  }
  /** Proportionally rescale page durations so they sum to the lesson length. */
  function balanceDurations() {
    const cur = plan.reduce((n, e) => n + (e.durationMin || 0), 0);
    if (cur <= 0 || plan.length === 0) return;
    const scaled = plan.map((e) =>
      Math.max(1, Math.round(((e.durationMin || 0) * target) / cur))
    );
    // hand the rounding remainder to the longest pages, a minute at a time
    let diff = target - scaled.reduce((a, b) => a + b, 0);
    const order = scaled.map((_, i) => i).sort((a, b) => scaled[b] - scaled[a]);
    let k = 0;
    let guard = 2000;
    while (diff !== 0 && guard-- > 0) {
      const i = order[k % order.length];
      if (diff > 0) {
        scaled[i] += 1;
        diff -= 1;
      } else if (scaled[i] > 1) {
        scaled[i] -= 1;
        diff += 1;
      }
      k += 1;
    }
    setPlan((p) => p.map((e, i) => ({ ...e, durationMin: scaled[i] })));
  }

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
        throw new Error(data.error ?? "Could not save the outline");
      }
      onConfirm(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the outline");
      setSaving(false);
    }
  }

  const total = plan.reduce((n, e) => n + (e.durationMin || 0), 0);
  const target = initialPack.durationMin;
  const off = total - target;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href={`/materials/${materialId}`} className="text-sm font-bold text-fg3 hover:text-fg1 transition-colors">
          ← Material
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-3xl text-fg1">🧭 Review the outline — {title}</h1>
          <p className="text-xs text-fg3">
            {def.label} · Step 1 of 2 — shape the page-by-page arc, then build the full pack.
          </p>
        </div>
        <button
          onClick={plan_it}
          disabled={phase === "planning" || saving}
          className="rounded-md border border-inkline bg-inkcard px-3 py-2 text-xs font-bold text-fg2 hover:text-fg1 disabled:opacity-40 transition-colors"
        >
          {phase === "planning" ? "Planning…" : "↻ Re-plan"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-xs text-danger">
          <p>{error}</p>
          {phase === "error" && plan.length === 0 && (
            <button
              onClick={() => buildWith([])}
              disabled={saving}
              className="mt-2 rounded-md border border-danger/50 px-3 py-1.5 font-bold text-danger hover:bg-danger/12 disabled:opacity-40 transition-colors"
            >
              {saving ? "Starting…" : "Build without an outline →"}
            </button>
          )}
        </div>
      )}

      {phase === "planning" && (
        <div className="rounded-xl border border-dashed border-inkline p-10 text-center text-sm text-fg3">
          Planning the page-by-page arc…
        </div>
      )}

      {plan.length > 0 && (
        <>
          {/* cover subtitle + emoji */}
          <div className="mb-4 flex gap-3">
            <label className="w-24 shrink-0">
              <span className="field-label">Cover emoji</span>
              <input className="field-input text-center" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
            </label>
            <label className="flex-1">
              <span className="field-label">Cover subtitle</span>
              <input className="field-input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Topic Intro & The PEEL Argument" />
            </label>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-fg3">
              {plan.length} pages
            </span>
            <div className="flex items-center gap-2">
              {off !== 0 && (
                <button
                  onClick={balanceDurations}
                  className="rounded border border-accent/50 px-2 py-0.5 text-[11px] font-bold text-accent hover:bg-accent/10 transition-colors"
                >
                  ⚖ Balance to {target}
                </button>
              )}
              <span className={`text-xs font-bold ${Math.abs(off) > 5 ? "text-warn" : "text-fg3"}`}>
                {total} / {target} min{off !== 0 ? ` (${off > 0 ? "+" : ""}${off})` : " ✓"}
              </span>
            </div>
          </div>

          <ol className="flex flex-col gap-2">
            {plan.map((e, i) => (
              <li key={i} className="rounded-xl border border-inkline bg-inkcard p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2 w-5 shrink-0 text-right text-xs font-bold text-fg3">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2">
                      <select
                        className="rounded-md border border-inkline bg-inkmid px-2 py-1.5 text-[11px] font-semibold text-fg1 outline-none"
                        value={e.kind}
                        onChange={(ev) => patch(i, { kind: ev.target.value as OutlineEntry["kind"] })}
                        aria-label="Page kind"
                      >
                        {ACTIVITY_KINDS.map((k) => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </select>
                      <input
                        className="flex-1 min-w-40 rounded-md border border-inkline bg-inkmid px-2 py-1.5 text-sm font-bold text-fg1 outline-none focus:border-accent/60"
                        value={e.title}
                        onChange={(ev) => patch(i, { title: ev.target.value })}
                        placeholder="PAGE TITLE"
                      />
                      <input
                        className="w-44 rounded-md border border-inkline bg-inkmid px-2 py-1.5 text-[11px] text-fg2 outline-none focus:border-accent/60"
                        value={e.badge}
                        onChange={(ev) => patch(i, { badge: ev.target.value })}
                        placeholder="BADGE · 12 MIN"
                      />
                      <label className="flex items-center gap-1 text-[11px] text-fg3">
                        <input
                          type="number"
                          className="w-16 rounded-md border border-inkline bg-inkmid px-2 py-1.5 text-center text-fg1 outline-none"
                          value={e.durationMin}
                          onChange={(ev) => patch(i, { durationMin: Math.max(0, Number(ev.target.value) || 0) })}
                          aria-label="Minutes"
                        />
                        min
                      </label>
                    </div>
                    <input
                      className="mt-2 w-full rounded-md border border-inkline bg-inkmid px-2 py-1.5 text-xs text-fg2 outline-none focus:border-accent/60"
                      value={e.goal}
                      onChange={(ev) => patch(i, { goal: ev.target.value })}
                      placeholder="Goal — the cognitive move (recall / apply / analyze / create)"
                    />
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button onClick={() => move(i, -1)} aria-label="Move up" className="rounded border border-inkline px-1.5 text-xs text-fg2 hover:text-fg1">↑</button>
                    <button onClick={() => move(i, 1)} aria-label="Move down" className="rounded border border-inkline px-1.5 text-xs text-fg2 hover:text-fg1">↓</button>
                    <button onClick={() => remove(i)} aria-label="Remove" className="rounded border border-inkline px-1.5 text-xs text-danger hover:bg-danger/10">✕</button>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <button
            onClick={add}
            className="mt-2 rounded-md border border-dashed border-inkline px-3 py-1.5 text-xs font-bold text-fg2 hover:border-accent/50 hover:text-fg1 transition-colors"
          >
            + Add page
          </button>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-inkline pt-5">
            <button
              onClick={() => buildWith(plan)}
              disabled={saving || plan.length === 0}
              className="btn btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "⚡ Build the full pack →"}
            </button>
            <button
              onClick={() => buildWith([])}
              disabled={saving}
              className="text-xs font-bold text-fg3 hover:text-fg1 disabled:opacity-40 transition-colors"
            >
              Skip review — let AI decide the structure
            </button>
          </div>
        </>
      )}
    </div>
  );
}
