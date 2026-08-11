"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChecklistResult } from "@/lib/checklist";
import { AnyContent, contentTypeDef } from "@/lib/content-types";
import { ClassPlan } from "@/lib/class-plan-schema";
import { VocabSet } from "@/lib/vocab-set-schema";
import { JudgeBallot } from "@/lib/judge-ballot-schema";
import { SUBJECT_DEFS, Subject } from "@/lib/subjects";
import ChecklistPanel from "./ChecklistPanel";

/**
 * Builder for the lighter content types (Class Plan, Vocabulary Set, Judge
 * Ballot). Same contract as the Lesson Pack builder — autosave, live checklist
 * in the right rail — but each type renders its own field set.
 */
export default function SimpleBuilder({
  materialId,
  type,
  subject,
  initialTitle,
  initialContent,
}: {
  materialId: number;
  type: string;
  subject: Subject;
  initialTitle: string;
  initialContent: AnyContent;
}) {
  const def = contentTypeDef(type);
  const subj = SUBJECT_DEFS[subject];
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState<AnyContent>(initialContent);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [checklist, setChecklist] = useState<ChecklistResult | null>(null);
  const firstRender = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (nextTitle: string, nextContent: AnyContent) => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/materials/${materialId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextTitle, content: nextContent }),
        });
        const data = await res.json();
        if (!res.ok) {
          setSaveState("error");
          setSaveError(data.error ?? "Save failed");
          return;
        }
        setChecklist(data.checklist);
        setSaveState("saved");
      } catch {
        setSaveState("error");
        setSaveError("Network error — changes not saved");
      }
    },
    [materialId]
  );

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      save(title, content);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(title, content), 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content]);

  // generic helpers over the untyped content bag
  const c = content as Record<string, unknown>;
  const set = (key: string, value: unknown) =>
    setContent((prev) => ({ ...(prev as object), [key]: value }) as AnyContent);
  const str = (key: string) => (c[key] as string) ?? "";
  const num = (key: string) => (c[key] as number) ?? 0;

  function updateAt<T>(arr: T[], i: number, patch: Partial<T>): T[] {
    return arr.map((item, j) => (j === i ? { ...item, ...patch } : item));
  }
  function removeAt<T>(arr: T[], i: number): T[] {
    return arr.filter((_, j) => j !== i);
  }
  function moveAt<T>(arr: T[], i: number, dir: -1 | 1): T[] {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href={`/materials/${materialId}`}
          className="text-sm font-bold text-fg3 hover:text-fg1 transition-colors"
        >
          ← Back
        </Link>
        <input
          aria-label="Material title"
          className="field-input !bg-transparent !border-transparent hover:!border-inkline focus:!border-accent/60 !text-lg !font-bold flex-1 min-w-60"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Material title"
        />
        <span className="rounded bg-inkmid px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-fg3">
          {def.emoji} {def.label}
        </span>
        <span
          className={`text-xs font-bold uppercase tracking-widest ${
            saveState === "error" ? "text-danger" : saveState === "saving" ? "text-warn" : "text-fg3"
          }`}
        >
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? saveError : ""}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* ── shared identity ── */}
          <Section title="Identity">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Code">
                <input className="field-input" value={str("lessonCode")} onChange={(e) => set("lessonCode", e.target.value)} placeholder="L1" />
              </Field>
              <Field label="Skill focus">
                <input className="field-input" value={str("skillFocus")} onChange={(e) => set("skillFocus", e.target.value)} />
              </Field>
              <Field label="Series / cohort">
                <input className="field-input" value={str("series")} onChange={(e) => set("series", e.target.value)} />
              </Field>
            </div>
            <Field label="Title (printed)">
              <input className="field-input" value={str("title")} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label={`${subj.anchorLabel} (anchors this artifact to its unit)`}>
              <textarea className="field-textarea !min-h-14" value={str("resolution")} onChange={(e) => set("resolution", e.target.value)} placeholder={subj.anchorPlaceholder} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Duration (minutes)">
                <input type="number" className="field-input" value={num("durationMin")} onChange={(e) => set("durationMin", Math.max(0, Number(e.target.value) || 0))} />
              </Field>
              <Field label="Accent colour">
                <input type="color" className="field-input !h-10 !p-1" value={str("accentColor") || "#0f766e"} onChange={(e) => set("accentColor", e.target.value)} />
              </Field>
              <Field label="Emoji">
                <input className="field-input" value={str("emoji")} onChange={(e) => set("emoji", e.target.value)} />
              </Field>
            </div>
          </Section>

          {/* ── CLASS PLAN ── */}
          {type === "class-plan" && (
            <>
              <Section title="Session Frame">
                <Field label="Objective — students will be able to…">
                  <textarea className="field-textarea !min-h-14" value={str("objective")} onChange={(e) => set("objective", e.target.value)} />
                </Field>
                <Field label="Materials">
                  <textarea className="field-textarea !min-h-14" value={str("materials")} onChange={(e) => set("materials", e.target.value)} placeholder="Printed packets · timer · whiteboard markers…" />
                </Field>
                <Field label="Do Now / warm-up (on the board as students arrive)">
                  <textarea className="field-textarea !min-h-14" value={str("doNow")} onChange={(e) => set("doNow", e.target.value)} />
                </Field>
              </Section>

              <Section title="Segments" hint={`The minute-by-minute spine — must reach minute ${num("durationMin")}.`}>
                {((c.segments as ClassPlan["segments"]) ?? []).map((s, i) => (
                  <div key={i} className="flex flex-wrap items-start gap-2">
                    <input type="number" className="field-input !w-20" value={s.startMin} aria-label="Start minute"
                      onChange={(e) => set("segments", updateAt(c.segments as ClassPlan["segments"], i, { startMin: Math.max(0, Number(e.target.value) || 0) }))} />
                    <input type="number" className="field-input !w-20" value={s.endMin} aria-label="End minute"
                      onChange={(e) => set("segments", updateAt(c.segments as ClassPlan["segments"], i, { endMin: Math.max(0, Number(e.target.value) || 0) }))} />
                    <input className="field-input !w-48" value={s.title} placeholder="Segment title"
                      onChange={(e) => set("segments", updateAt(c.segments as ClassPlan["segments"], i, { title: e.target.value }))} />
                    <select className="field-input !w-20" value={s.who} aria-label="Who leads"
                      onChange={(e) => set("segments", updateAt(c.segments as ClassPlan["segments"], i, { who: e.target.value as "T" | "Ss" | "T+Ss" }))}>
                      <option value="T">T</option><option value="Ss">Ss</option><option value="T+Ss">T+Ss</option>
                    </select>
                    <textarea className="field-textarea flex-1 min-w-52 !min-h-10" value={s.what} placeholder="What actually happens"
                      onChange={(e) => set("segments", updateAt(c.segments as ClassPlan["segments"], i, { what: e.target.value }))} />
                    <MoveButtons onUp={() => set("segments", moveAt(c.segments as ClassPlan["segments"], i, -1))} onDown={() => set("segments", moveAt(c.segments as ClassPlan["segments"], i, 1))} />
                    <RemoveButton onClick={() => set("segments", removeAt(c.segments as ClassPlan["segments"], i))} />
                  </div>
                ))}
                <AddButton label="+ Add segment" onClick={() => {
                  const segs = (c.segments as ClassPlan["segments"]) ?? [];
                  const start = segs.length ? segs[segs.length - 1].endMin : 0;
                  set("segments", [...segs, { startMin: start, endMin: start + 10, title: "", who: "T" as const, what: "" }]);
                }} />
              </Section>

              <Section title="Questions & Follow-up">
                <Field label="Key / check-for-understanding questions (need ≥3)">
                  {((c.keyQuestions as string[]) ?? []).map((qq, i) => (
                    <div key={i} className="mb-2 flex gap-2">
                      <input className="field-input" value={qq}
                        onChange={(e) => set("keyQuestions", (c.keyQuestions as string[]).map((x, j) => (j === i ? e.target.value : x)))} />
                      <RemoveButton onClick={() => set("keyQuestions", removeAt(c.keyQuestions as string[], i))} />
                    </div>
                  ))}
                  <AddButton label="+ Add question" onClick={() => set("keyQuestions", [...((c.keyQuestions as string[]) ?? []), ""])} />
                </Field>
                <Field label="Differentiation (optional)">
                  <textarea className="field-textarea !min-h-12" value={str("differentiation")} onChange={(e) => set("differentiation", e.target.value)} />
                </Field>
                <Field label="Homework (optional)">
                  <textarea className="field-textarea !min-h-12" value={str("homework")} onChange={(e) => set("homework", e.target.value)} />
                </Field>
                <Field label="Teacher notes (optional)">
                  <textarea className="field-textarea !min-h-12" value={str("teacherNotes")} onChange={(e) => set("teacherNotes", e.target.value)} />
                </Field>
              </Section>
            </>
          )}

          {/* ── VOCABULARY SET ── */}
          {type === "vocabulary-set" && (
            <>
              <Section title="Set Frame">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Grade band (optional)">
                    <input className="field-input" value={str("gradeBand")} onChange={(e) => set("gradeBand", e.target.value)} placeholder="Novice · Grades 6–8" />
                  </Field>
                </div>
                <Field label="Introduction (why these words matter)">
                  <textarea className="field-textarea !min-h-14" value={str("introduction")} onChange={(e) => set("introduction", e.target.value)} />
                </Field>
              </Section>

              <Section title="Terms" hint="Each term needs a definition, an analogy, and an example sentence.">
                {((c.terms as VocabSet["terms"]) ?? []).map((t, i) => (
                  <div key={i} className="rounded-lg border border-inkline p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <input className="field-input !w-52 font-bold" value={t.term} placeholder="Term"
                        onChange={(e) => set("terms", updateAt(c.terms as VocabSet["terms"], i, { term: e.target.value }))} />
                      <input className="field-input !w-32" value={t.partOfSpeech} placeholder="noun"
                        onChange={(e) => set("terms", updateAt(c.terms as VocabSet["terms"], i, { partOfSpeech: e.target.value }))} />
                      <div className="flex-1" />
                      <MoveButtons onUp={() => set("terms", moveAt(c.terms as VocabSet["terms"], i, -1))} onDown={() => set("terms", moveAt(c.terms as VocabSet["terms"], i, 1))} />
                      <RemoveButton onClick={() => set("terms", removeAt(c.terms as VocabSet["terms"], i))} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Definition">
                        <textarea className="field-textarea !min-h-14" value={t.definition}
                          onChange={(e) => set("terms", updateAt(c.terms as VocabSet["terms"], i, { definition: e.target.value }))} />
                      </Field>
                      <Field label='"Think of it like…" analogy'>
                        <textarea className="field-textarea !min-h-14" value={t.analogy}
                          onChange={(e) => set("terms", updateAt(c.terms as VocabSet["terms"], i, { analogy: e.target.value }))} />
                      </Field>
                      <Field label="Example sentence">
                        <textarea className="field-textarea !min-h-12" value={t.exampleSentence}
                          onChange={(e) => set("terms", updateAt(c.terms as VocabSet["terms"], i, { exampleSentence: e.target.value }))} />
                      </Field>
                      <Field label="Common error to pre-empt">
                        <textarea className="field-textarea !min-h-12" value={t.commonError}
                          onChange={(e) => set("terms", updateAt(c.terms as VocabSet["terms"], i, { commonError: e.target.value }))} />
                      </Field>
                    </div>
                  </div>
                ))}
                <AddButton label="+ Add term" onClick={() => set("terms", [...((c.terms as VocabSet["terms"]) ?? []), { term: "", partOfSpeech: "", definition: "", analogy: "", exampleSentence: "", commonError: "" }])} />
              </Section>

              <PracticeSection label="Practice items (need ≥4)" listKey="practice" c={c} set={set} removeAt={removeAt} updateAt={updateAt} />
              <PracticeSection label="Quick-fire items (optional)" listKey="quickFire" c={c} set={set} removeAt={removeAt} updateAt={updateAt} />

              <Section title="Teacher notes">
                <textarea className="field-textarea !min-h-12" value={str("teacherNotes")} onChange={(e) => set("teacherNotes", e.target.value)} />
              </Section>
            </>
          )}

          {/* ── JUDGE BALLOT ── */}
          {type === "judge-ballot" && (
            <>
              <Section title="Round Frame">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Format">
                    <input className="field-input" value={str("format")} onChange={(e) => set("format", e.target.value)} placeholder="Public Forum" />
                  </Field>
                  <Field label="Division (optional)">
                    <input className="field-input" value={str("division")} onChange={(e) => set("division", e.target.value)} placeholder="Novice" />
                  </Field>
                </div>
                <Field label="Decision rules — how a winner is decided">
                  <textarea className="field-textarea !min-h-14" value={str("decisionRules")} onChange={(e) => set("decisionRules", e.target.value)} />
                </Field>
              </Section>

              <Section title="Judging Criteria" hint="Each criterion must say what the judge is actually looking for — vague criteria produce inconsistent ballots.">
                {((c.criteria as JudgeBallot["criteria"]) ?? []).map((cr, i) => (
                  <div key={i} className="flex flex-wrap items-start gap-2">
                    <input className="field-input !w-44 font-bold" value={cr.name} placeholder="Argumentation"
                      onChange={(e) => set("criteria", updateAt(c.criteria as JudgeBallot["criteria"], i, { name: e.target.value }))} />
                    <textarea className="field-textarea flex-1 min-w-52 !min-h-10" value={cr.description} placeholder="What the judge looks for"
                      onChange={(e) => set("criteria", updateAt(c.criteria as JudgeBallot["criteria"], i, { description: e.target.value }))} />
                    <input type="number" className="field-input !w-20" value={cr.maxPoints} aria-label="Max points"
                      onChange={(e) => set("criteria", updateAt(c.criteria as JudgeBallot["criteria"], i, { maxPoints: Math.max(1, Number(e.target.value) || 10) }))} />
                    <MoveButtons onUp={() => set("criteria", moveAt(c.criteria as JudgeBallot["criteria"], i, -1))} onDown={() => set("criteria", moveAt(c.criteria as JudgeBallot["criteria"], i, 1))} />
                    <RemoveButton onClick={() => set("criteria", removeAt(c.criteria as JudgeBallot["criteria"], i))} />
                  </div>
                ))}
                <AddButton label="+ Add criterion" onClick={() => set("criteria", [...((c.criteria as JudgeBallot["criteria"]) ?? []), { name: "", description: "", maxPoints: 10 }])} />
              </Section>

              <Section title="Speaker Points">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Minimum">
                    <input type="number" className="field-input" value={(c.speakerPoints as JudgeBallot["speakerPoints"])?.min ?? 20}
                      onChange={(e) => set("speakerPoints", { ...(c.speakerPoints as JudgeBallot["speakerPoints"]), min: Number(e.target.value) || 0 })} />
                  </Field>
                  <Field label="Maximum">
                    <input type="number" className="field-input" value={(c.speakerPoints as JudgeBallot["speakerPoints"])?.max ?? 30}
                      onChange={(e) => set("speakerPoints", { ...(c.speakerPoints as JudgeBallot["speakerPoints"]), max: Number(e.target.value) || 0 })} />
                  </Field>
                </div>
                <Field label="Scoring guidance (what a 27 vs a 29 means)">
                  <textarea className="field-textarea !min-h-14" value={(c.speakerPoints as JudgeBallot["speakerPoints"])?.guidance ?? ""}
                    onChange={(e) => set("speakerPoints", { ...(c.speakerPoints as JudgeBallot["speakerPoints"]), guidance: e.target.value })} />
                </Field>
              </Section>

              <PromptSection label="Reason For Decision prompts (need ≥2)" listKey="rfdPrompts" c={c} set={set} removeAt={removeAt} updateAt={updateAt} />
              <PromptSection label="Debater feedback prompts (need ≥2)" listKey="feedbackPrompts" c={c} set={set} removeAt={removeAt} updateAt={updateAt} />
            </>
          )}
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          {checklist ? (
            <ChecklistPanel result={checklist} />
          ) : (
            <div className="rounded-xl border border-inkline bg-inkcard p-4 text-xs text-fg3">
              Checklist runs on first save…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── shared sub-editors ───────────────────────────────────────────────────────

function PracticeSection({
  label, listKey, c, set, removeAt, updateAt,
}: {
  label: string;
  listKey: string;
  c: Record<string, unknown>;
  set: (k: string, v: unknown) => void;
  removeAt: <T>(a: T[], i: number) => T[];
  updateAt: <T>(a: T[], i: number, p: Partial<T>) => T[];
}) {
  type Item = { prompt: string; expectedAnswer: string };
  const list = (c[listKey] as Item[]) ?? [];
  return (
    <Section title={label}>
      {list.map((p, i) => (
        <div key={i} className="flex flex-wrap gap-2">
          <input className="field-input flex-1 min-w-52" value={p.prompt} placeholder="Prompt students see"
            onChange={(e) => set(listKey, updateAt(list, i, { prompt: e.target.value }))} />
          <input className="field-input flex-1 min-w-40 !border-warn/60" value={p.expectedAnswer} placeholder="Expected answer"
            onChange={(e) => set(listKey, updateAt(list, i, { expectedAnswer: e.target.value }))} />
          <RemoveButton onClick={() => set(listKey, removeAt(list, i))} />
        </div>
      ))}
      <AddButton label="+ Add item" onClick={() => set(listKey, [...list, { prompt: "", expectedAnswer: "" }])} />
    </Section>
  );
}

function PromptSection({
  label, listKey, c, set, removeAt, updateAt,
}: {
  label: string;
  listKey: string;
  c: Record<string, unknown>;
  set: (k: string, v: unknown) => void;
  removeAt: <T>(a: T[], i: number) => T[];
  updateAt: <T>(a: T[], i: number, p: Partial<T>) => T[];
}) {
  type Item = { label: string; hint: string; lines: number };
  const list = (c[listKey] as Item[]) ?? [];
  return (
    <Section title={label}>
      {list.map((p, i) => (
        <div key={i} className="flex flex-wrap gap-2">
          <input className="field-input flex-1 min-w-48" value={p.label} placeholder="Prompt the judge answers"
            onChange={(e) => set(listKey, updateAt(list, i, { label: e.target.value }))} />
          <input className="field-input flex-1 min-w-40" value={p.hint} placeholder="Hint (keeps feedback specific)"
            onChange={(e) => set(listKey, updateAt(list, i, { hint: e.target.value }))} />
          <input type="number" className="field-input !w-20" value={p.lines} aria-label="Writing lines"
            onChange={(e) => set(listKey, updateAt(list, i, { lines: Math.max(1, Number(e.target.value) || 3) }))} />
          <RemoveButton onClick={() => set(listKey, removeAt(list, i))} />
        </div>
      ))}
      <AddButton label="+ Add prompt" onClick={() => set(listKey, [...list, { label: "", hint: "", lines: 3 }])} />
    </Section>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-inkline bg-inkcard p-4">
      <h2 className="font-display text-2xl text-fg1">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-xs text-fg3">{hint}</p>}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-md border border-dashed border-inkline px-3 py-1.5 text-xs font-bold text-fg2 hover:border-accent/50 hover:text-fg1 transition-colors">
      {label}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Remove"
      className="rounded-md border border-inkline px-2 py-1.5 text-xs font-bold text-danger hover:bg-danger/10 transition-colors">
      ✕
    </button>
  );
}

function MoveButtons({ onUp, onDown }: { onUp: () => void; onDown: () => void }) {
  return (
    <div className="flex gap-1">
      <button type="button" onClick={onUp} aria-label="Move up" className="rounded-md border border-inkline px-2 py-1.5 text-xs text-fg2 hover:text-fg1">↑</button>
      <button type="button" onClick={onDown} aria-label="Move down" className="rounded-md border border-inkline px-2 py-1.5 text-xs text-fg2 hover:text-fg1">↓</button>
    </div>
  );
}
