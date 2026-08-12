"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTIVITY_KINDS,
  Activity,
  EvidenceCard,
  LessonPack,
  Prompt,
  SIDES,
  TimingRow,
  VocabTerm,
  countWords,
  emptyActivity,
} from "@/lib/lesson-pack-schema";
import { Subject, SUBJECT_DEFS } from "@/lib/subjects";
import { GRADE_BANDS, RIGOR_LEVELS, RIGOR_DEFS } from "@/lib/lesson-quality";
import { formatsForSubject } from "@/lib/lesson-formats";
import { LESSON_DESIGNS } from "@/lib/lesson-designs";
import { ChecklistResult } from "@/lib/checklist";
import { coherenceReport } from "@/lib/coherence";
import ChecklistPanel from "./ChecklistPanel";
import AiPanel from "@/components/build/AiPanel";

/**
 * Maps each checklist rule id to the DOM anchor of the field it polices, so a
 * failing item in the right rail can scroll the author straight to the fix.
 * Several rules share a section (all evidence rules → the evidence deck).
 */
const CHECK_ANCHOR: Record<string, string> = {
  "anchor-present": "check-anchor",
  "success-criteria": "check-success",
  "word-bank": "sec-vocab",
  "word-bank-definitions": "sec-vocab",
  "evidence-present": "sec-evidence",
  "citation-fields": "sec-evidence",
  "citation-year": "sec-evidence",
  "paraphrase-length": "sec-evidence",
  "scope-limits": "sec-evidence",
  "translation": "sec-evidence",
  "rubric": "check-rubric",
  "activity-count": "sec-activities",
  "answer-key": "sec-activities",
  "timing-plan": "check-timing",
};

/**
 * The builder's sections in author order, each mapped to the checklist rules it
 * owns. Drives the sticky jump-nav and its per-section completion dots. A
 * section with no applicable rules (its `checks` all absent from the result —
 * e.g. rubric on a non-Writing pack) reads as neutral rather than complete.
 */
const SECTION_NAV: { id: string; label: string; checks: string[] }[] = [
  { id: "sec-cover", label: "Cover & Identity", checks: ["anchor-present"] },
  { id: "sec-brief", label: "Brief & Detail", checks: [] },
  { id: "sec-mission", label: "Mission & Criteria", checks: ["success-criteria"] },
  { id: "sec-vocab", label: "Vocabulary", checks: ["word-bank", "word-bank-definitions"] },
  {
    id: "sec-evidence",
    label: "Evidence Deck",
    checks: [
      "evidence-present",
      "citation-fields",
      "citation-year",
      "paraphrase-length",
      "scope-limits",
      "translation",
    ],
  },
  { id: "sec-activities", label: "Activities", checks: ["activity-count", "answer-key"] },
  { id: "sec-teacher", label: "Teacher Guide", checks: ["rubric", "timing-plan"] },
];

/**
 * Full Build mode for the Debate Lesson Pack. Every field is structured — no
 * blank-page authoring, no free-typed citations. Autosaves on change; the
 * evidence-integrity checklist re-runs on every save and shows live in the
 * right rail.
 */
export default function Builder({
  materialId,
  subject = "debate",
  initialTitle,
  initialPack,
}: {
  materialId: number;
  subject?: Subject;
  initialTitle: string;
  initialPack: LessonPack;
}) {
  const def = SUBJECT_DEFS[subject];
  const [title, setTitle] = useState(initialTitle);
  const [pack, setPack] = useState<LessonPack>(initialPack);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [checklist, setChecklist] = useState<ChecklistResult | null>(null);
  const [regenBusy, setRegenBusy] = useState<string | null>(null);
  const [regenError, setRegenError] = useState("");
  const firstRender = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Rewrite one section with AI, optionally steered by an author instruction. */
  async function regen(
    section: "vocabulary" | "evidence" | "teacher-guide" | "activity",
    instruction: string,
    activityIndex?: number
  ) {
    const key = section + (activityIndex !== undefined ? `-${activityIndex}` : "");
    setRegenBusy(key);
    setRegenError("");
    try {
      const res = await fetch(`/api/materials/${materialId}/generate-section`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, activityIndex, instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Regeneration failed");
      setPack(data.pack);
      setChecklist(data.checklist);
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setRegenBusy(null);
    }
  }

  const save = useCallback(
    async (nextTitle: string, nextPack: LessonPack) => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/materials/${materialId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextTitle, content: nextPack }),
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
      // run the checklist once on load so the rail isn't empty
      save(title, pack);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(title, pack), 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, pack]);

  /** Scroll an anchor into view, briefly flag it, and focus its first field. */
  const scrollToId = useCallback((anchorId: string) => {
    const el = document.getElementById(anchorId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.querySelector<HTMLElement>("input, textarea, select")?.focus({
      preventScroll: true,
    });
    el.classList.add("check-flash");
    window.setTimeout(() => el.classList.remove("check-flash"), 1400);
  }, []);

  /** Jump to the field a failing checklist item points at. */
  const jumpToCheck = useCallback(
    (checkId: string) => {
      const anchor = CHECK_ANCHOR[checkId];
      if (anchor) scrollToId(anchor);
    },
    [scrollToId]
  );

  const set = <K extends keyof LessonPack>(key: K, value: LessonPack[K]) =>
    setPack((p) => ({ ...p, [key]: value }));

  // ── array helpers ──
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

  const paraphraseMax = 40;
  // Advisory: cards / terms defined but never actually used in an activity.
  const coherence = coherenceReport(pack);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* header */}
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
          placeholder="Material title (shown in the library)"
        />
        <span
          className={`text-xs font-bold uppercase tracking-widest ${
            saveState === "error"
              ? "text-danger"
              : saveState === "saving"
                ? "text-warn"
                : "text-fg3"
          }`}
        >
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved"
              ? "Saved"
              : saveState === "error"
                ? saveError
                : ""}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* ── Cover & identity ─────────────────────────────── */}
          <Section id="sec-cover" title="Cover & Identity" hint="What the cover page and library card show.">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Lesson code">
                <input className="field-input" value={pack.lessonCode} onChange={(e) => set("lessonCode", e.target.value)} placeholder="L1" />
              </Field>
              <Field label="Skill focus">
                <input className="field-input" value={pack.skillFocus} onChange={(e) => set("skillFocus", e.target.value)} placeholder="PEEL Structure" />
              </Field>
              <Field label="Series / cohort">
                <input className="field-input" value={pack.series} onChange={(e) => set("series", e.target.value)} placeholder="UBI Novice" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cover title">
                <input className="field-input" value={pack.title} onChange={(e) => set("title", e.target.value)} placeholder="THE ARGUMENT SANDWICH" />
              </Field>
              <Field label="Subtitle">
                <input className="field-input" value={pack.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="Topic Intro & The PEEL Argument" />
              </Field>
            </div>
            <Field id="check-anchor" label="Resolution (must match every artifact in the unit)">
              <textarea className="field-textarea !min-h-14" value={pack.resolution} onChange={(e) => set("resolution", e.target.value)} placeholder="Resolved: …" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Duration (minutes)">
                <input type="number" className="field-input" value={pack.durationMin} onChange={(e) => set("durationMin", Math.max(0, Number(e.target.value) || 0))} />
              </Field>
              <Field label="Accent color">
                <input type="color" className="field-input !h-10 !p-1" value={pack.accentColor} onChange={(e) => set("accentColor", e.target.value)} />
              </Field>
              <Field label="Cover emoji">
                <input className="field-input" value={pack.emoji} onChange={(e) => set("emoji", e.target.value)} placeholder="🌏" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Grade band (reading level — guides AI rewrites)">
                <select className="field-input" value={pack.gradeBand} onChange={(e) => set("gradeBand", e.target.value)}>
                  {GRADE_BANDS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </Field>
              <Field label="Rigor level (guides AI rewrites)">
                <select className="field-input" value={pack.rigorLevel} onChange={(e) => set("rigorLevel", e.target.value)}>
                  {RIGOR_LEVELS.map((r) => (
                    <option key={r} value={r}>{RIGOR_DEFS[r].label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Lesson format (the class's structural shape — guides AI rewrites)">
              <select className="field-input" value={pack.format} onChange={(e) => set("format", e.target.value)}>
                {formatsForSubject(subject).map((f) => (
                  <option key={f.id} value={f.id}>{f.emoji} {f.label} — {f.blurb}</option>
                ))}
              </select>
            </Field>
            <Field label="Print design (the pack's whole visual look)">
              <select className="field-input" value={pack.design} onChange={(e) => set("design", e.target.value)}>
                {LESSON_DESIGNS.map((d) => (
                  <option key={d.id} value={d.id}>{d.emoji} {d.label} — {d.blurb}</option>
                ))}
              </select>
            </Field>
          </Section>

          {/* ── Brief, research & teaching detail ────────────────
              These aren't printed — they're the authoring context the AI
              draws on. Editing them here re-grounds any "✨ AI rewrite". */}
          <Section
            id="sec-brief"
            title="Brief, Research & Detail"
            hint="Not printed — this is the context the AI builds from. Edit it, then use ✨ AI rewrite on any section to re-generate against it."
          >
            <Field label="Lesson brief (the authoritative spec for this pack)">
              <textarea className="field-textarea" value={pack.brief} onChange={(e) => set("brief", e.target.value)} placeholder="Everything the lesson should cover — goals, must-cover points, examples, angle, constraints." />
            </Field>
            <Field label={`Source material — grounds the ${def.evidenceLabel.toLowerCase()} (one source per line)`}>
              <textarea className="field-textarea !min-h-24" value={pack.sourceMaterial} onChange={(e) => set("sourceMaterial", e.target.value)} placeholder={`OECD, "Universal Basic Income" policy brief (2017) — pilots didn't reliably raise employment · Limit: not a permanent nationwide UBI`} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Students already know">
                <textarea className="field-textarea !min-h-16" value={pack.priorKnowledge} onChange={(e) => set("priorKnowledge", e.target.value)} placeholder="Assumed background — the AI won't re-teach it." />
              </Field>
              <Field label="Mistakes to target">
                <textarea className="field-textarea !min-h-16" value={pack.misconceptions} onChange={(e) => set("misconceptions", e.target.value)} placeholder="Common errors — drills & exit ticket aim here." />
              </Field>
              <Field label="Classroom constraints">
                <textarea className="field-textarea !min-h-16" value={pack.constraints} onChange={(e) => set("constraints", e.target.value)} placeholder="Room, materials, tech, grouping, time." />
              </Field>
            </div>
          </Section>

          {regenError && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
              {regenError}
            </div>
          )}

          {/* ── Objectives ───────────────────────────────────── */}
          <Section id="sec-mission" title="Mission & Success Criteria" hint='The cover’s "Today’s Mission" and "By the end of today I can…" boxes.'>
            <Field label="Today's mission">
              <textarea className="field-textarea" value={pack.mission} onChange={(e) => set("mission", e.target.value)} />
            </Field>
            <Field id="check-success" label="Success criteria (one per line — checklist needs ≥3)">
              {pack.successCriteria.map((c, i) => (
                <div key={i} className="mb-2 flex gap-2">
                  <input
                    className="field-input"
                    value={c}
                    onChange={(e) => set("successCriteria", pack.successCriteria.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder="Label all four PEEL layers in an argument"
                  />
                  <RemoveButton onClick={() => set("successCriteria", removeAt(pack.successCriteria, i))} />
                </div>
              ))}
              <AddButton label="+ Add criterion" onClick={() => set("successCriteria", [...pack.successCriteria, ""])} />
            </Field>
          </Section>

          {/* ── Vocabulary ───────────────────────────────────── */}
          <Section
            id="sec-vocab"
            title="Vocabulary Set"
            hint="Word-bank rule: at least 4 defined terms, each with a kid-friendly analogy. AI rewrite also refreshes the mission & criteria."
            action={<RegenControl busy={regenBusy === "vocabulary"} onRun={(instruction) => regen("vocabulary", instruction)} />}
          >
            {pack.vocabulary.map((v: VocabTerm, i) => (
              <div key={i} className="mb-3 rounded-lg border border-inkline p-3">
                <div className="mb-2 flex items-center gap-2">
                  <input className="field-input !w-56 font-bold" value={v.term} onChange={(e) => set("vocabulary", updateAt(pack.vocabulary, i, { term: e.target.value }))} placeholder="Term" />
                  <div className="flex-1" />
                  <RemoveButton onClick={() => set("vocabulary", removeAt(pack.vocabulary, i))} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Definition">
                    <textarea className="field-textarea !min-h-16" value={v.definition} onChange={(e) => set("vocabulary", updateAt(pack.vocabulary, i, { definition: e.target.value }))} />
                  </Field>
                  <Field label='"Think of it like…" analogy'>
                    <textarea className="field-textarea !min-h-16" value={v.analogy} onChange={(e) => set("vocabulary", updateAt(pack.vocabulary, i, { analogy: e.target.value }))} />
                  </Field>
                </div>
              </div>
            ))}
            <AddButton label="+ Add term" onClick={() => set("vocabulary", [...pack.vocabulary, { term: "", definition: "", analogy: "" }])} />
          </Section>

          {/* ── Evidence deck ────────────────────────────────── */}
          <Section
            id="sec-evidence"
            title={def.evidenceLabel}
            hint="Citations are structural: institution, year, publication are separate required fields. Every card carries a ⛔ LIMIT — what it cannot prove. AI-drafted citations must be verified before review."
            action={<RegenControl busy={regenBusy === "evidence"} onRun={(instruction) => regen("evidence", instruction)} />}
          >
            {pack.evidenceCards.map((c: EvidenceCard, i) => (
              <div key={i} className="mb-4 rounded-lg border border-inkline p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <input className="field-input !w-16 text-center font-bold" value={c.id} onChange={(e) => set("evidenceCards", updateAt(pack.evidenceCards, i, { id: e.target.value }))} placeholder="A" aria-label="Card ID" />
                  <select className="field-input !w-28" value={c.side} onChange={(e) => set("evidenceCards", updateAt(pack.evidenceCards, i, { side: e.target.value as EvidenceCard["side"] }))} aria-label="Side">
                    {SIDES.map((s) => (
                      <option key={s} value={s}>{s.toUpperCase()}</option>
                    ))}
                  </select>
                  <div className="flex-1" />
                  <RemoveButton onClick={() => set("evidenceCards", removeAt(pack.evidenceCards, i))} />
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Field label="Institution *">
                    <input className="field-input" value={c.institution} onChange={(e) => set("evidenceCards", updateAt(pack.evidenceCards, i, { institution: e.target.value }))} placeholder="World Bank Group" />
                  </Field>
                  <Field label="Named author (if any)">
                    <input className="field-input" value={c.author} onChange={(e) => set("evidenceCards", updateAt(pack.evidenceCards, i, { author: e.target.value }))} />
                  </Field>
                  <Field label="Year *">
                    <input className="field-input" value={c.year} onChange={(e) => set("evidenceCards", updateAt(pack.evidenceCards, i, { year: e.target.value }))} placeholder="2025" />
                  </Field>
                </div>
                <Field label="Publication title *">
                  <input className="field-input" value={c.publication} onChange={(e) => set("evidenceCards", updateAt(pack.evidenceCards, i, { publication: e.target.value }))} />
                </Field>
                <Field
                  label={`Paraphrase (${countWords(c.paraphrase)}/${paraphraseMax} words) *`}
                >
                  <textarea
                    className={`field-textarea ${countWords(c.paraphrase) > paraphraseMax ? "!border-danger" : ""}`}
                    value={c.paraphrase}
                    onChange={(e) => set("evidenceCards", updateAt(pack.evidenceCards, i, { paraphrase: e.target.value }))}
                  />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Translation — plain English *">
                    <textarea className="field-textarea" value={c.translation} onChange={(e) => set("evidenceCards", updateAt(pack.evidenceCards, i, { translation: e.target.value }))} />
                  </Field>
                  <Field label="How to use in round">
                    <textarea className="field-textarea" value={c.tacticalNote} onChange={(e) => set("evidenceCards", updateAt(pack.evidenceCards, i, { tacticalNote: e.target.value }))} />
                  </Field>
                </div>
                <Field label="⛔ LIMIT — what this card CANNOT prove *">
                  <textarea
                    className={`field-textarea !border-danger/60 ${countWords(c.limit) < 8 ? "!border-danger" : ""}`}
                    value={c.limit}
                    onChange={(e) => set("evidenceCards", updateAt(pack.evidenceCards, i, { limit: e.target.value }))}
                    placeholder='e.g. "Covers 5 ASEAN countries 2018–2022 only. Does NOT prove …"'
                  />
                </Field>
              </div>
            ))}
            <AddButton
              label="+ Add evidence card"
              onClick={() =>
                set("evidenceCards", [
                  ...pack.evidenceCards,
                  { id: String.fromCharCode(65 + pack.evidenceCards.length), side: "pro", institution: "", author: "", year: "", publication: "", paraphrase: "", translation: "", tacticalNote: "", limit: "", event: "", quote: "", quoteAttribution: "", roundApplication: "" },
                ])
              }
            />
          </Section>

          {/* ── Activities ───────────────────────────────────── */}
          <Section id="sec-activities" title="Student Activities" hint="The ordered student-facing pages. Every prompt needs an expected answer — it feeds the teacher answer key.">
            {pack.activities.map((a: Activity, i) => (
              <div key={i} className="mb-4 rounded-lg border border-inkline p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <select className="field-input !w-44" value={a.kind} onChange={(e) => set("activities", updateAt(pack.activities, i, { kind: e.target.value as Activity["kind"] }))} aria-label="Activity kind">
                    {ACTIVITY_KINDS.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                  <input className="field-input flex-1 min-w-40 font-bold" value={a.title} onChange={(e) => set("activities", updateAt(pack.activities, i, { title: e.target.value }))} placeholder="THE ARENA" />
                  <input className="field-input !w-52" value={a.badge} onChange={(e) => set("activities", updateAt(pack.activities, i, { badge: e.target.value }))} placeholder="BASELINE HOOK · 12 MIN" />
                  <input type="number" className="field-input !w-20" value={a.durationMin} onChange={(e) => set("activities", updateAt(pack.activities, i, { durationMin: Math.max(0, Number(e.target.value) || 0) }))} aria-label="Minutes" />
                  <RegenControl busy={regenBusy === `activity-${i}`} onRun={(instruction) => regen("activity", instruction, i)} label="✨" compact />
                  <MoveButtons onUp={() => set("activities", moveAt(pack.activities, i, -1))} onDown={() => set("activities", moveAt(pack.activities, i, 1))} />
                  <RemoveButton onClick={() => set("activities", removeAt(pack.activities, i))} />
                </div>
                <Field label="Instructions banner (what students read first)">
                  <textarea className="field-textarea !min-h-14" value={a.instructions} onChange={(e) => set("activities", updateAt(pack.activities, i, { instructions: e.target.value }))} />
                </Field>
                <Field label="Body / explainer content">
                  <textarea className="field-textarea !min-h-14" value={a.body} onChange={(e) => set("activities", updateAt(pack.activities, i, { body: e.target.value }))} />
                </Field>
                <Field label="Student prompts + expected answers">
                  {a.prompts.map((p: Prompt, pi) => (
                    <div key={pi} className="mb-2 rounded-md border border-inkline/70 p-2">
                      <div className="mb-1 flex gap-2">
                        <input className="field-input" value={p.label} onChange={(e) => set("activities", updateAt(pack.activities, i, { prompts: updateAt(a.prompts, pi, { label: e.target.value }) }))} placeholder="Prompt students see" />
                        <select className="field-input !w-28" value={p.side} onChange={(e) => set("activities", updateAt(pack.activities, i, { prompts: updateAt(a.prompts, pi, { side: e.target.value as Prompt["side"] }) }))} aria-label="Prompt side">
                          {SIDES.map((s) => (
                            <option key={s} value={s}>{s.toUpperCase()}</option>
                          ))}
                        </select>
                        <RemoveButton onClick={() => set("activities", updateAt(pack.activities, i, { prompts: removeAt(a.prompts, pi) }))} />
                      </div>
                      <input className="field-input !border-warn/60" value={p.expectedAnswer} onChange={(e) => set("activities", updateAt(pack.activities, i, { prompts: updateAt(a.prompts, pi, { expectedAnswer: e.target.value }) }))} placeholder="Expected answer (teacher answer key)" />
                    </div>
                  ))}
                  <AddButton label="+ Add prompt" onClick={() => set("activities", updateAt(pack.activities, i, { prompts: [...a.prompts, { label: "", side: "neutral", expectedAnswer: "" }] }))} />
                </Field>
                <Field label="⚡ Key idea box (optional — 'write this down')">
                  <textarea className="field-textarea !min-h-12" value={a.keyIdea} onChange={(e) => set("activities", updateAt(pack.activities, i, { keyIdea: e.target.value }))} />
                </Field>
                <Field label="Stand & Deliver (closing oral micro-task, optional)">
                  <textarea className="field-textarea !min-h-12" value={a.standAndDeliver} onChange={(e) => set("activities", updateAt(pack.activities, i, { standAndDeliver: e.target.value }))} />
                </Field>

                {/* typed content blocks */}
                <details className="rounded-md border border-inkline/70 p-2" open={a.exampleLayers.length > 0}>
                  <summary className="cursor-pointer text-xs font-bold text-fg2">
                    Worked example layers ({a.exampleLayers.length}) — for I Do / mentor text
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
                    {a.exampleLayers.map((l, li) => (
                      <div key={li} className="flex flex-wrap gap-2">
                        <input className="field-input !w-36" value={l.label} onChange={(e) => set("activities", updateAt(pack.activities, i, { exampleLayers: updateAt(a.exampleLayers, li, { label: e.target.value }) }))} placeholder="POINT" />
                        <textarea className="field-textarea flex-1 min-w-48 !min-h-10" value={l.text} onChange={(e) => set("activities", updateAt(pack.activities, i, { exampleLayers: updateAt(a.exampleLayers, li, { text: e.target.value }) }))} placeholder="Model text for this layer" />
                        <input className="field-input !w-64" value={l.note} onChange={(e) => set("activities", updateAt(pack.activities, i, { exampleLayers: updateAt(a.exampleLayers, li, { note: e.target.value }) }))} placeholder="Why this works" />
                        <RemoveButton onClick={() => set("activities", updateAt(pack.activities, i, { exampleLayers: removeAt(a.exampleLayers, li) }))} />
                      </div>
                    ))}
                    <AddButton label="+ Add layer" onClick={() => set("activities", updateAt(pack.activities, i, { exampleLayers: [...a.exampleLayers, { label: "", text: "", note: "" }] }))} />
                  </div>
                </details>

                <details className="rounded-md border border-inkline/70 p-2" open={a.sortItems.length > 0}>
                  <summary className="cursor-pointer text-xs font-bold text-fg2">
                    Sort drill items ({a.sortItems.length}) — statement → category
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
                    {a.sortItems.map((s, si) => (
                      <div key={si} className="flex flex-wrap gap-2">
                        <textarea className="field-textarea flex-1 min-w-48 !min-h-10" value={s.statement} onChange={(e) => set("activities", updateAt(pack.activities, i, { sortItems: updateAt(a.sortItems, si, { statement: e.target.value }) }))} placeholder="Statement to sort" />
                        <input className="field-input !w-40" value={s.category} onChange={(e) => set("activities", updateAt(pack.activities, i, { sortItems: updateAt(a.sortItems, si, { category: e.target.value }) }))} placeholder="FACT / OPINION" />
                        <input className="field-input !w-64" value={s.explanation} onChange={(e) => set("activities", updateAt(pack.activities, i, { sortItems: updateAt(a.sortItems, si, { explanation: e.target.value }) }))} placeholder="Why (teacher-facing)" />
                        <RemoveButton onClick={() => set("activities", updateAt(pack.activities, i, { sortItems: removeAt(a.sortItems, si) }))} />
                      </div>
                    ))}
                    <AddButton label="+ Add item" onClick={() => set("activities", updateAt(pack.activities, i, { sortItems: [...a.sortItems, { statement: "", category: "", explanation: "" }] }))} />
                  </div>
                </details>

                <details className="rounded-md border border-inkline/70 p-2" open={a.matchPairs.length > 0}>
                  <summary className="cursor-pointer text-xs font-bold text-fg2">
                    Matching pairs ({a.matchPairs.length})
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
                    {a.matchPairs.map((m, mi) => (
                      <div key={mi} className="flex flex-wrap gap-2">
                        <input className="field-input flex-1 min-w-40" value={m.left} onChange={(e) => set("activities", updateAt(pack.activities, i, { matchPairs: updateAt(a.matchPairs, mi, { left: e.target.value }) }))} placeholder="Left" />
                        <input className="field-input flex-1 min-w-40" value={m.right} onChange={(e) => set("activities", updateAt(pack.activities, i, { matchPairs: updateAt(a.matchPairs, mi, { right: e.target.value }) }))} placeholder="Right" />
                        <RemoveButton onClick={() => set("activities", updateAt(pack.activities, i, { matchPairs: removeAt(a.matchPairs, mi) }))} />
                      </div>
                    ))}
                    <AddButton label="+ Add pair" onClick={() => set("activities", updateAt(pack.activities, i, { matchPairs: [...a.matchPairs, { left: "", right: "" }] }))} />
                  </div>
                </details>

                <details className="rounded-md border border-inkline/70 p-2" open={a.frames.length > 0}>
                  <summary className="cursor-pointer text-xs font-bold text-fg2">
                    Scaffold frames ({a.frames.length}) — sentence starters
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
                    {a.frames.map((f, fi) => (
                      <div key={fi} className="flex flex-wrap gap-2">
                        <input className="field-input !w-36" value={f.label} onChange={(e) => set("activities", updateAt(pack.activities, i, { frames: updateAt(a.frames, fi, { label: e.target.value }) }))} placeholder="POINT" />
                        <input className="field-input flex-1 min-w-48" value={f.starter} onChange={(e) => set("activities", updateAt(pack.activities, i, { frames: updateAt(a.frames, fi, { starter: e.target.value }) }))} placeholder="My first reason is ____ because ____." />
                        <RemoveButton onClick={() => set("activities", updateAt(pack.activities, i, { frames: removeAt(a.frames, fi) }))} />
                      </div>
                    ))}
                    <AddButton label="+ Add frame" onClick={() => set("activities", updateAt(pack.activities, i, { frames: [...a.frames, { label: "", starter: "" }] }))} />
                  </div>
                </details>
              </div>
            ))}
            <AddButton
              label="+ Add activity"
              onClick={() => set("activities", [...pack.activities, emptyActivity()])}
            />
          </Section>

          {/* ── Teacher guide ────────────────────────────────── */}
          <Section
            id="sec-teacher"
            title="Teacher Guide"
            hint="The red-bordered teacher pages: info strip, materials, minute-by-minute plan."
            action={<RegenControl busy={regenBusy === "teacher-guide"} onRun={(instruction) => regen("teacher-guide", instruction)} />}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Cohort">
                <input className="field-input" value={pack.teacherGuide.cohort} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, cohort: e.target.value })} placeholder="Novice · Zero Prior Exp." />
              </Field>
              <Field label="Assessment">
                <input className="field-input" value={pack.teacherGuide.assessment} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, assessment: e.target.value })} placeholder="PEEL + Exit Ticket" />
              </Field>
              <Field label="Next lesson">
                <input className="field-input" value={pack.teacherGuide.nextLesson} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, nextLesson: e.target.value })} placeholder="L2: Full Contention" />
              </Field>
            </div>
            <Field label="Materials checklist">
              <textarea className="field-textarea" value={pack.teacherGuide.materialsChecklist} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, materialsChecklist: e.target.value })} />
            </Field>
            <Field id="check-timing" label={`Minute-by-minute plan (must reach minute ${pack.durationMin})`}>
              {pack.teacherGuide.timingPlan.map((row: TimingRow, i) => (
                <div key={i} className="mb-2 flex flex-wrap items-start gap-2">
                  <input type="number" className="field-input !w-18" value={row.startMin} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, timingPlan: updateAt(pack.teacherGuide.timingPlan, i, { startMin: Math.max(0, Number(e.target.value) || 0) }) })} aria-label="Start minute" />
                  <input type="number" className="field-input !w-18" value={row.endMin} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, timingPlan: updateAt(pack.teacherGuide.timingPlan, i, { endMin: Math.max(0, Number(e.target.value) || 0) }) })} aria-label="End minute" />
                  <input className="field-input !w-48" value={row.phase} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, timingPlan: updateAt(pack.teacherGuide.timingPlan, i, { phase: e.target.value }) })} placeholder="Phase" />
                  <select className="field-input !w-20" value={row.who} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, timingPlan: updateAt(pack.teacherGuide.timingPlan, i, { who: e.target.value as TimingRow["who"] }) })} aria-label="Who leads">
                    <option value="T">T</option>
                    <option value="Ss">Ss</option>
                    <option value="T+Ss">T+Ss</option>
                  </select>
                  <textarea className="field-textarea flex-1 min-w-52 !min-h-10" value={row.what} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, timingPlan: updateAt(pack.teacherGuide.timingPlan, i, { what: e.target.value }) })} placeholder="What happens" />
                  <RemoveButton onClick={() => set("teacherGuide", { ...pack.teacherGuide, timingPlan: removeAt(pack.teacherGuide.timingPlan, i) })} />
                </div>
              ))}
              <AddButton
                label="+ Add phase"
                onClick={() => {
                  const plan = pack.teacherGuide.timingPlan;
                  const start = plan.length > 0 ? plan[plan.length - 1].endMin : 0;
                  set("teacherGuide", { ...pack.teacherGuide, timingPlan: [...plan, { startMin: start, endMin: start + 10, phase: "", who: "T", what: "" }] });
                }}
              />
            </Field>
            <Field label="Prep & pitfalls / CFU notes">
              <textarea className="field-textarea" value={pack.teacherGuide.pitfalls} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, pitfalls: e.target.value })} />
            </Field>
            <Field id="check-rubric" label="Grading rubric bands">
              {pack.teacherGuide.rubric.map((band, i) => (
                <div key={i} className="mb-2 flex gap-2">
                  <input className="field-input !w-40" value={band.score} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, rubric: updateAt(pack.teacherGuide.rubric, i, { score: e.target.value }) })} placeholder="4 — Exceeds" />
                  <input className="field-input flex-1" value={band.descriptor} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, rubric: updateAt(pack.teacherGuide.rubric, i, { descriptor: e.target.value }) })} placeholder="Descriptor" />
                  <RemoveButton onClick={() => set("teacherGuide", { ...pack.teacherGuide, rubric: removeAt(pack.teacherGuide.rubric, i) })} />
                </div>
              ))}
              <AddButton label="+ Add band" onClick={() => set("teacherGuide", { ...pack.teacherGuide, rubric: [...pack.teacherGuide.rubric, { score: "", descriptor: "" }] })} />
            </Field>
          </Section>
        </div>

        {/* ── Right rail: section nav + live checklist ── */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
          <SectionNav checklist={checklist} onJump={scrollToId} />
          <AiPanel materialId={materialId} />
          {checklist ? (
            <ChecklistPanel result={checklist} onJumpTo={jumpToCheck} />
          ) : (
            <div className="rounded-xl border border-inkline bg-inkcard p-4 text-xs text-fg3">
              Checklist runs on first save…
            </div>
          )}

          {pack.activities.length > 0 &&
            (coherence.unusedEvidence.length > 0 || coherence.unusedVocab.length > 0) && (
              <div className="rounded-xl border border-warn/40 bg-warn/5 p-4">
                <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-warn">
                  ⚠ Coherence — use it, don&apos;t just present it
                </h2>
                <p className="mb-2 text-[11px] leading-relaxed text-fg3">
                  Advisory (won&apos;t block review): these are defined but never
                  deployed in an activity. A great pack puts every card and term
                  back to work.
                </p>
                {coherence.unusedEvidence.length > 0 && (
                  <div className="mb-2">
                    <button
                      onClick={() => scrollToId("sec-evidence")}
                      className="text-[11px] font-bold text-warn hover:underline"
                    >
                      {coherence.unusedEvidence.length} of {coherence.evidenceCount}{" "}
                      {def.evidenceLabel.toLowerCase()} card
                      {coherence.unusedEvidence.length === 1 ? "" : "s"} never used →
                    </button>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {coherence.unusedEvidence.map((c) => (
                        <span key={c.id} className="rounded border border-warn/30 bg-inkcard px-1.5 py-0.5 text-[10px] text-fg2">
                          Card {c.id} · {c.institution || "—"}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {coherence.unusedVocab.length > 0 && (
                  <div>
                    <button
                      onClick={() => scrollToId("sec-activities")}
                      className="text-[11px] font-bold text-warn hover:underline"
                    >
                      {coherence.unusedVocab.length} of {coherence.vocabCount} vocabulary term
                      {coherence.unusedVocab.length === 1 ? "" : "s"} never used →
                    </button>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {coherence.unusedVocab.map((t) => (
                        <span key={t} className="rounded border border-warn/30 bg-inkcard px-1.5 py-0.5 text-[10px] text-fg2">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

          <p className="mt-3 text-[11px] leading-relaxed text-fg3">
            The pack can&apos;t be submitted for review until every rule passes.
            Rules mirror the approved UBI Novice practice: structural citations,
            ≤40-word paraphrases, mandatory ⛔ limits, 4-term word bank, keyed
            answers, full timing coverage.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── small presentational helpers ─────────────────────────────────────────────

/**
 * Sticky jump-nav for the builder's long form. Each row scrolls to its section
 * and shows a completion dot derived from the live checklist: green when every
 * rule the section owns passes, a red count when some fail, neutral when the
 * checklist hasn't run yet or the section has no applicable rules.
 */
function SectionNav({
  checklist,
  onJump,
}: {
  checklist: ChecklistResult | null;
  onJump: (id: string) => void;
}) {
  const byId = new Map(checklist?.items.map((i) => [i.id, i]) ?? []);

  return (
    <nav className="rounded-xl border border-inkline bg-inkcard p-3">
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-fg3">
        Sections
      </h2>
      <ul className="flex flex-col">
        {SECTION_NAV.map((sec) => {
          const relevant = sec.checks
            .map((c) => byId.get(c))
            .filter((i): i is NonNullable<typeof i> => i !== undefined);
          const failing = relevant.filter((i) => !i.passed).length;
          const status: "done" | "incomplete" | "neutral" =
            relevant.length === 0
              ? "neutral"
              : failing === 0
                ? "done"
                : "incomplete";

          return (
            <li key={sec.id}>
              <button
                type="button"
                onClick={() => onJump(sec.id)}
                className="group flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-inkmid"
              >
                <span
                  aria-hidden
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                    status === "done"
                      ? "bg-ok/12 text-ok"
                      : status === "incomplete"
                        ? "bg-danger/12 text-danger"
                        : "border border-inkline text-fg3"
                  }`}
                >
                  {status === "done" ? "✓" : status === "incomplete" ? failing : ""}
                </span>
                <span className="flex-1 text-fg2 group-hover:text-fg1">
                  {sec.label}
                </span>
                <span
                  aria-hidden
                  className="text-fg3 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  →
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Section({
  id,
  title,
  hint,
  action,
  children,
}: {
  id?: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 rounded-xl border border-inkline bg-inkcard p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-fg1">{title}</h2>
        {action}
      </div>
      {hint && <p className="mb-3 mt-0.5 text-xs text-fg3">{hint}</p>}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/**
 * AI-rewrite trigger with an inline instruction popover — replaces the old
 * blocking window.prompt(). Click opens a small box where the author can
 * (optionally) steer the rewrite; Cancel/Escape/outside-click dismiss it, and
 * ⌘/Ctrl+Enter runs. An empty instruction just improves the section as-is.
 */
function RegenControl({
  busy,
  onRun,
  label = "✨ AI rewrite",
  compact = false,
}: {
  busy: boolean;
  onRun: (instruction: string) => void;
  label?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setInstruction("");
  }, []);

  const run = () => {
    onRun(instruction.trim());
    close();
  };

  // dismiss on outside click or Escape while open
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (busy ? undefined : setOpen((o) => !o))}
        disabled={busy}
        aria-expanded={open}
        className="rounded-md border border-brand2/50 px-2.5 py-1 text-xs font-bold text-brand2 hover:bg-brand2/10 disabled:opacity-40 transition-colors"
      >
        {busy ? "✨ Rewriting…" : label}
      </button>
      {open && !busy && (
        <div
          className={`absolute right-0 top-full z-20 mt-1.5 rounded-lg border border-inkline bg-inkmid p-3 shadow-xl ${compact ? "w-72" : "w-80"}`}
        >
          <span className="field-label">Steer the rewrite (optional)</span>
          <textarea
            autoFocus
            className="field-textarea !min-h-16 text-sm"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                run();
              }
            }}
            placeholder="e.g. make analogies sports-themed · simplify to grade 5 · add a pro-side card on cost"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-fg3">⌘/Ctrl+↵ to run</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-md border border-inkline px-2.5 py-1 text-xs font-bold text-fg2 hover:text-fg1 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={run}
                className="rounded-md border border-brand2/60 bg-brand2/10 px-2.5 py-1 text-xs font-bold text-brand2 hover:bg-brand2/12 transition-colors"
              >
                ✨ Rewrite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id?: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label id={id} className="block scroll-mt-6">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-dashed border-inkline px-3 py-1.5 text-xs font-bold text-fg2 hover:border-accent/50 hover:text-fg1 transition-colors"
    >
      {label}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove"
      className="rounded-md border border-inkline px-2 py-1.5 text-xs font-bold text-danger hover:bg-danger/10 transition-colors"
    >
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
