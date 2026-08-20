"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SUBJECT_DEFS } from "@/lib/subjects";
import { formatsForSubject } from "@/lib/lesson-formats";
import { GRADE_BANDS, RIGOR_DEFS, RIGOR_LEVELS, RigorLevel } from "@/lib/lesson-quality";
import type { UnitPlan, UnitLessonStub } from "@/lib/unit-plan";

/**
 * Unit Builder — plan and create a whole class at once. Describe the class in a
 * sentence; AI returns a coherent N-lesson scope-and-sequence plus a distinct
 * design identity. Edit anything, then batch-create every lesson as a draft and
 * land on the unit page to build them.
 */
export default function UnitBuilder() {
  const router = useRouter();

  const [idea, setIdea] = useState("");
  const [count, setCount] = useState(10);
  const [planning, setPlanning] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<UnitPlan | null>(null);

  async function planIt() {
    if (!idea.trim()) return;
    setPlanning(true);
    setError("");
    try {
      const res = await fetch("/api/units/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Planning failed");
      setPlan(data.plan as UnitPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Planning failed");
    } finally {
      setPlanning(false);
    }
  }

  async function createUnit() {
    if (!plan) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the unit");
      router.push(`/units/${data.key}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the unit");
      setCreating(false);
    }
  }

  // ── editing helpers ──
  function patch(p: Partial<UnitPlan>) {
    setPlan((cur) => (cur ? { ...cur, ...p } : cur));
  }
  function patchDesign(d: Partial<UnitPlan["design"]>) {
    setPlan((cur) => (cur ? { ...cur, design: { ...cur.design, ...d } } : cur));
  }
  function patchLesson(i: number, l: Partial<UnitLessonStub>) {
    setPlan((cur) => {
      if (!cur) return cur;
      const lessons = cur.lessons.map((x, j) => (j === i ? { ...x, ...l } : x));
      return { ...cur, lessons };
    });
  }
  function removeLesson(i: number) {
    setPlan((cur) =>
      cur ? { ...cur, lessons: cur.lessons.filter((_, j) => j !== i) } : cur
    );
  }

  const def = plan ? SUBJECT_DEFS[plan.subject] : null;
  const formats = plan ? formatsForSubject(plan.subject) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <h1 className="font-display text-5xl text-fg1">Build a class</h1>
        <p className="mt-2 text-sm text-fg2">
          Describe the class in a sentence. It plans the whole arc — a coherent
          sequence of lessons with its own design — you tweak, then build them
          all.
        </p>
      </div>

      {/* the one input */}
      <div className="mb-4 rounded-2xl border border-inkline bg-inkcard p-2 shadow-lg focus-within:border-accent/60 transition-colors">
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) planIt();
          }}
          rows={3}
          placeholder="e.g. A novice debate course on universal basic income — from first arguments to a full practice round, for middle-schoolers"
          className="w-full resize-none rounded-xl bg-transparent px-4 py-3 text-base text-fg1 outline-none placeholder:text-fg3"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-1">
          <label className="flex items-center gap-2 text-[11px] text-fg3">
            Lessons
            <input
              type="number"
              min={2}
              max={16}
              value={count}
              onChange={(e) =>
                setCount(Math.max(2, Math.min(16, Number(e.target.value) || 10)))
              }
              className="w-16 rounded-md border border-inkline bg-inkmid px-2 py-1 text-center text-sm font-bold text-fg1 outline-none"
            />
            <span className="text-fg3">· ⌘/Ctrl + Enter</span>
          </label>
          <button
            onClick={planIt}
            disabled={planning || !idea.trim()}
            className="btn btn-primary disabled:opacity-40"
          >
            {planning ? "Planning the class…" : plan ? "↻ Re-plan" : "✨ Plan the class"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {plan && def && (
        <div className="flex flex-col gap-5">
          {/* design identity + unit meta */}
          <section
            className="overflow-hidden rounded-2xl border border-inkline bg-inkcard"
            style={{ boxShadow: `inset 4px 0 0 ${plan.design.accentColor}` }}
          >
            <div className="flex items-start gap-4 p-5">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-3xl text-white"
                style={{ background: plan.design.accentColor }}
              >
                {plan.design.coverEmoji}
              </div>
              <div className="min-w-0 flex-1">
                <input
                  value={plan.unitTitle}
                  onChange={(e) => patch({ unitTitle: e.target.value })}
                  className="w-full bg-transparent font-display text-2xl text-fg1 outline-none"
                />
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <Chip icon={def.emoji} label={def.label} />
                  <Chip label={plan.gradeBand} />
                  <Chip label={RIGOR_DEFS[plan.rigorLevel as RigorLevel]?.label ?? plan.rigorLevel} />
                  <Chip label={`${plan.lessons.length} lessons`} />
                </div>
                <p className="mt-2 text-xs text-fg2">
                  <span className="font-bold text-fg1">Through-line:</span> {plan.bigIdea}
                </p>
                <p className="mt-1 text-xs text-fg3">
                  🎨 <span className="font-bold text-fg2">{plan.design.motif}</span> — {plan.design.motifBlurb}
                </p>
              </div>
            </div>

            {/* editable unit-level knobs */}
            <div className="grid gap-3 border-t border-inkline bg-inkmid/40 p-5 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="field-label">{def.anchorLabel} — anchors every lesson</span>
                <textarea
                  className="field-textarea !min-h-14"
                  value={plan.resolution}
                  onChange={(e) => patch({ resolution: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="field-label">Series / cohort name</span>
                <input
                  className="field-input"
                  value={plan.series}
                  onChange={(e) => patch({ series: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="field-label">Grade band</span>
                  <select
                    className="field-input"
                    value={plan.gradeBand}
                    onChange={(e) => patch({ gradeBand: e.target.value })}
                  >
                    {GRADE_BANDS.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="field-label">Rigor</span>
                  <select
                    className="field-input"
                    value={plan.rigorLevel}
                    onChange={(e) => patch({ rigorLevel: e.target.value as RigorLevel })}
                  >
                    {RIGOR_LEVELS.map((r) => (
                      <option key={r} value={r}>{RIGOR_DEFS[r].label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-3">
                <span className="field-label !mb-0">Accent</span>
                <input
                  type="color"
                  value={plan.design.accentColor}
                  onChange={(e) => patchDesign({ accentColor: e.target.value })}
                  className="h-9 w-14 cursor-pointer rounded-md border border-inkline bg-inkmid"
                />
                <input
                  value={plan.design.motif}
                  onChange={(e) => patchDesign({ motif: e.target.value })}
                  className="field-input !mb-0 flex-1"
                  placeholder="Theming world"
                />
              </label>
            </div>
          </section>

          {/* the sequence */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-fg3">
                Scope & sequence — {plan.lessons.length} lessons
              </h2>
            </div>
            <ol className="flex flex-col gap-2">
              {plan.lessons.map((l, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-inkline bg-inkcard p-3"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex h-8 w-10 shrink-0 items-center justify-center rounded-md text-xs font-black text-white"
                      style={{ background: plan.design.accentColor }}
                    >
                      {l.lessonCode || i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
                        <input
                          value={l.coverTitle}
                          onChange={(e) => patchLesson(i, { coverTitle: e.target.value })}
                          placeholder="COVER TITLE"
                          className="w-full bg-transparent text-sm font-bold text-fg1 outline-none placeholder:text-fg3"
                        />
                        <input
                          value={l.skillFocus}
                          onChange={(e) => patchLesson(i, { skillFocus: e.target.value })}
                          placeholder="Skill focus"
                          className="w-full bg-transparent text-sm text-fg2 outline-none placeholder:text-fg3"
                        />
                      </div>
                      <p className="mt-1 text-xs text-fg3">{l.goal}</p>
                      {l.buildsOn && (
                        <p className="mt-0.5 text-[11px] text-fg3">↳ builds on: {l.buildsOn}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                          value={l.format}
                          onChange={(e) => patchLesson(i, { format: e.target.value })}
                          className="rounded-md border border-inkline bg-inkmid px-2 py-1 text-[11px] font-semibold text-fg1 outline-none"
                        >
                          <option value="auto">✨ Auto</option>
                          {formats
                            .filter((f) => f.id !== "auto")
                            .map((f) => (
                              <option key={f.id} value={f.id}>{f.emoji} {f.label}</option>
                            ))}
                        </select>
                        <label className="flex items-center gap-1 text-[11px] text-fg3">
                          <input
                            type="number"
                            value={l.durationMin}
                            onChange={(e) =>
                              patchLesson(i, {
                                durationMin: Math.max(30, Number(e.target.value) || 90),
                              })
                            }
                            className="w-16 rounded-md border border-inkline bg-inkmid px-2 py-1 text-center text-fg1 outline-none"
                          />
                          min
                        </label>
                        <button
                          onClick={() => removeLesson(i)}
                          className="ml-auto text-[11px] font-bold text-fg3 hover:text-danger"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* create */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={createUnit}
              disabled={creating || plan.lessons.length === 0 || !plan.series.trim() || !plan.resolution.trim()}
              className="btn btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {creating
                ? "Creating the class…"
                : `⚡ Create unit — ${plan.lessons.length} drafts →`}
            </button>
            <span className="text-[11px] text-fg3">
              Creates all lessons as drafts; you build each on the unit page.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ label, icon }: { label: string; icon?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-inkline bg-inkmid px-2.5 py-1 font-semibold text-fg1">
      {icon && <span>{icon}</span>}
      {label}
    </span>
  );
}
