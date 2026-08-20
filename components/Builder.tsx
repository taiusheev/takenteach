"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Activity,
  EvidenceCard,
  LessonPack,
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
import SourcesPanel from "@/components/build/SourcesPanel";
import AiActions from "@/components/build/AiActions";
import EditorBar from "@/components/build/EditorBar";
import PageCard, { pageIssues } from "@/components/build/PageCard";
import PageOutline, {
  type OutlineSection,
} from "@/components/build/PageOutline";
import RailTabs from "@/components/build/RailTabs";
import { AddButton, Field, RemoveButton, Section } from "@/components/build/fields";
import { useAutosave } from "@/components/build/useAutosave";
import { useDragOrder } from "@/components/build/useDragOrder";
import { useToast } from "@/components/shell/Toaster";

/**
 * Maps each checklist rule id to the DOM anchor of the field it polices, so a
 * failing item in the right rail can scroll the author straight to the fix.
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
  translation: "sec-evidence",
  rubric: "check-rubric",
  "activity-count": "sec-activities",
  "answer-key": "sec-activities",
  "timing-plan": "check-timing",
};

/** The builder's sections in author order, each mapped to the rules it owns. */
const SECTION_NAV: { id: string; label: string; checks: string[] }[] = [
  /* Author order, and the order the outline lists them in. `sec-brief` used to
     sit second — the authoring context a teacher touches once, above the
     lesson content they edit every time, pushing the actual pages down two
     screens. It is now where it belongs: after the lesson, before the guide. */
  { id: "sec-cover", label: "Cover & identity", checks: ["anchor-present"] },
  { id: "sec-mission", label: "Mission & criteria", checks: ["success-criteria"] },
  { id: "sec-vocab", label: "Vocabulary", checks: ["word-bank", "word-bank-definitions"] },
  {
    id: "sec-evidence",
    label: "Evidence deck",
    checks: [
      "evidence-present",
      "citation-fields",
      "citation-year",
      "paraphrase-length",
      "scope-limits",
      "translation",
    ],
  },
  { id: "sec-activities", label: "Pages", checks: ["activity-count", "answer-key"] },
  { id: "sec-brief", label: "Brief & context", checks: [] },
  { id: "sec-teacher", label: "Teacher guide", checks: ["rubric", "timing-plan"] },
];

type RegenTarget = "vocabulary" | "evidence" | "teacher-guide" | "activity";

/** What was replaced by the last AI rewrite, so it can be put back. */
interface UndoPoint {
  label: string;
  where: string;
  pack: LessonPack;
}

export default function Builder({
  materialId,
  subject = "debate",
  initialTitle,
  initialPack,
  initialChecklist = null,
}: {
  materialId: number;
  subject?: Subject;
  initialTitle: string;
  initialPack: LessonPack;
  /** Run on the server so the rail is populated on first paint. */
  initialChecklist?: ChecklistResult | null;
}) {
  const def = SUBJECT_DEFS[subject];
  const { toast } = useToast();
  const [title, setTitle] = useState(initialTitle);
  const [pack, setPack] = useState<LessonPack>(initialPack);
  const [checklist, setChecklist] = useState<ChecklistResult | null>(initialChecklist);
  const [regenBusy, setRegenBusy] = useState<string | null>(null);
  const [undoPoint, setUndoPoint] = useState<UndoPoint | null>(null);
  /* Which page is expanded. One at a time: two open pages is already more than
     fits on a screen, and "which one am I editing" stops being obvious. */
  const [openPage, setOpenPage] = useState<number | null>(null);
  /* Outline first — navigating is the commonest thing anyone does in the rail. */
  const [railTab, setRailTab] = useState("outline");
  const undoBusy = useRef(false);

  /* ── autosave ──
     The value is memoised so its identity changes only when the document does;
     see the contract at the top of useAutosave. */
  const doc = useMemo(() => ({ title, pack }), [title, pack]);
  const save = useAutosave({
    value: doc,
    save: async ({ title: t, pack: p }, { keepalive }) => {
      const res = await fetch(`/api/materials/${materialId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, content: p }),
        keepalive,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      /* A page closing does not get to update React state. */
      if (!keepalive) setChecklist(data.checklist);
    },
  });

  const set = useCallback(
    <K extends keyof LessonPack>(key: K, value: LessonPack[K]) =>
      setPack((p) => ({ ...p, [key]: value })),
    []
  );

  /** Scroll an anchor into view, briefly flag it, and focus its first field. */
  const scrollToId = useCallback((anchorId: string) => {
    const el = document.getElementById(anchorId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.querySelector<HTMLElement>("input, textarea, select")?.focus({
      preventScroll: true,
    });
    el.classList.add("check-flash");
    window.setTimeout(() => el.classList.remove("check-flash"), 1400);
  }, []);

  /** Open a page and scroll to it — the outline's whole job. */
  const jumpToPage = useCallback(
    (index: number) => {
      setOpenPage(index);
      /* After the state flush, so the card has grown before we measure it. */
      requestAnimationFrame(() =>
        document
          .getElementById(`page-${index}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    },
    []
  );

  const jumpToCheck = useCallback(
    (checkId: string) => {
      const anchor = CHECK_ANCHOR[checkId];
      if (anchor) scrollToId(anchor);
    },
    [scrollToId]
  );

  /**
   * Rewrite one section with AI.
   *
   * The pack the route returns is already persisted, so the editor adopts it as
   * the saved baseline (`markSaved`) rather than writing it straight back — and
   * keeps the version it replaced, so Undo is one click rather than a trip to
   * Version history on another page.
   */
  async function regen(
    section: RegenTarget,
    instruction: string,
    actionLabel: string,
    activityIndex?: number
  ) {
    const key = section + (activityIndex !== undefined ? `-${activityIndex}` : "");
    const where =
      activityIndex !== undefined
        ? `page ${activityIndex + 1}`
        : section === "teacher-guide"
          ? "the teacher guide"
          : `the ${section}`;
    setRegenBusy(key);
    const before = pack;
    try {
      const res = await fetch(`/api/materials/${materialId}/generate-section`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, activityIndex, instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Rewrite failed");
      save.markSaved();
      setPack(data.pack);
      setChecklist(data.checklist);
      setUndoPoint({ label: actionLabel, where, pack: before });
      toast(`${actionLabel} applied to ${where}.`, "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Rewrite failed", "error");
    } finally {
      setRegenBusy(null);
    }
  }

  /** Put back what the last AI rewrite replaced. */
  function undo() {
    if (!undoPoint || undoBusy.current) return;
    undoBusy.current = true;
    setPack(undoPoint.pack);
    setUndoPoint(null);
    /* Deliberately NOT markSaved: this version is not on the server, so it must
       be written back like any other edit. */
    save.saveNow();
    toast("Reverted.", "info");
    undoBusy.current = false;
  }

  const activityDrag = useDragOrder(pack.activities, (next) => {
    set("activities", next);
    setOpenPage(null); // indices moved; an open card would now be a different page
  });

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

  function addPage() {
    const next = [...pack.activities, emptyActivity()];
    set("activities", next);
    jumpToPage(next.length - 1);
  }

  function duplicatePage(i: number) {
    const source = pack.activities[i];
    const copy: Activity = {
      ...structuredClone(source),
      title: source.title ? `${source.title} (copy)` : "",
    };
    const next = [...pack.activities];
    next.splice(i + 1, 0, copy);
    set("activities", next);
    jumpToPage(i + 1);
  }

  const paraphraseMax = 40;
  const coherence = coherenceReport(pack);
  const failing = checklist
    ? checklist.items.filter((i) => !i.passed).length
    : null;
  /* Cards a human has not yet signed off. Surfaced on the Sources tab so the
     count is visible from whichever panel is open — an unverified citation is
     the one defect in this product that a teacher can be held responsible for. */
  const unverified = pack.evidenceCards.filter((c) => !c.verified).length;

  const outlineSections: OutlineSection[] = useMemo(() => {
    const byId = new Map(checklist?.items.map((i) => [i.id, i]) ?? []);
    return SECTION_NAV.map((sec) => {
      const relevant = sec.checks
        .map((c) => byId.get(c))
        .filter((i): i is NonNullable<typeof i> => i !== undefined);
      const failingHere = relevant.filter((i) => !i.passed).length;
      return {
        id: sec.id,
        label: sec.label,
        failing: failingHere,
        status:
          relevant.length === 0
            ? ("neutral" as const)
            : failingHere === 0
              ? ("done" as const)
              : ("incomplete" as const),
      };
    });
  }, [checklist]);

  return (
    <div className="mx-auto max-w-7xl">
      <EditorBar
        materialId={materialId}
        title={title}
        onTitleChange={setTitle}
        save={save}
        failingChecks={failing}
        onJumpToQuality={() => {
          setRailTab("quality");
          scrollToId("sec-quality");
        }}
      />

      {/* The undo bar for the last AI rewrite. It sits above the document
          rather than inside a toast, because a toast that has faded is an undo
          the teacher no longer has. */}
      {undoPoint && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand2/35 bg-brand2/8 px-4 py-2.5">
          <span className="min-w-0 flex-1 text-[13px] text-fg1">
            <strong className="font-semibold">{undoPoint.label}</strong> applied
            to {undoPoint.where}.
          </span>
          <button
            type="button"
            onClick={undo}
            className="shrink-0 rounded-md border border-brand2/50 bg-surface px-3 py-1 text-[12px] font-semibold text-brand2ink transition-colors hover:bg-brand2/10"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => setUndoPoint(null)}
            className="shrink-0 text-[12px] font-semibold text-fg3 hover:text-fg1"
          >
            Keep
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* ── Cover & identity ─────────────────────────────── */}
          <Section
            id="sec-cover"
            title="Cover & identity"
            hint="What the cover page and the library card show."
          >
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
            <Field
              id="check-anchor"
              label={`${def.anchorLabel} — must match every artifact in the unit`}
            >
              <textarea className="field-textarea !min-h-14" value={pack.resolution} onChange={(e) => set("resolution", e.target.value)} placeholder={def.anchorPlaceholder} />
            </Field>
            {/* Sits directly under the anchor, because the only way to
                understand it is next to the thing it hands over to. */}
            <Field label="Practice topic (optional) — a no-research topic the new skill is taught on first, before the anchor carries it">
              <input
                className="field-input"
                value={pack.practiceTopic ?? ""}
                onChange={(e) => set("practiceTopic", e.target.value)}
                placeholder="Our school should ban student phones for the entire school day"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Duration (minutes)">
                <input type="number" className="field-input" value={pack.durationMin} onChange={(e) => set("durationMin", Math.max(0, Number(e.target.value) || 0))} />
              </Field>
              <Field label="Accent colour">
                <input type="color" className="field-input !h-10 !p-1" value={pack.accentColor} onChange={(e) => set("accentColor", e.target.value)} />
              </Field>
              <Field label="Cover emoji">
                <input className="field-input" value={pack.emoji} onChange={(e) => set("emoji", e.target.value)} placeholder="🌏" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Grade band" hint="Reading level — guides every AI rewrite.">
                <select className="field-input" value={pack.gradeBand} onChange={(e) => set("gradeBand", e.target.value)}>
                  {GRADE_BANDS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </Field>
              <Field label="Rigor level" hint="How much the pack expects of students.">
                <select className="field-input" value={pack.rigorLevel} onChange={(e) => set("rigorLevel", e.target.value)}>
                  {RIGOR_LEVELS.map((r) => (
                    <option key={r} value={r}>{RIGOR_DEFS[r].label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Lesson format" hint="The class's structural shape — guides AI rewrites.">
              <select className="field-input" value={pack.format} onChange={(e) => set("format", e.target.value)}>
                {formatsForSubject(subject).map((f) => (
                  <option key={f.id} value={f.id}>{f.label} — {f.blurb}</option>
                ))}
              </select>
            </Field>
            <Field label="Print design" hint="The pack's whole visual look on paper.">
              <select className="field-input" value={pack.design} onChange={(e) => set("design", e.target.value)}>
                {LESSON_DESIGNS.map((d) => (
                  <option key={d.id} value={d.id}>{d.label} — {d.blurb}</option>
                ))}
              </select>
            </Field>
          </Section>

          {/* ── Objectives ───────────────────────────────────── */}
          <Section
            id="sec-mission"
            title="Mission & success criteria"
            hint="The cover's “Today's Mission” and “By the end of today I can…” boxes."
            action={
              <AiActions
                busy={regenBusy === "vocabulary"}
                onRun={(i, l) => regen("vocabulary", i, l)}
              />
            }
          >
            <Field label="Today's mission">
              <textarea className="field-textarea" value={pack.mission} onChange={(e) => set("mission", e.target.value)} />
            </Field>
            <div id="check-success">
              <span className="field-label">
                Success criteria — one per line, at least three
              </span>
              <div className="flex flex-col gap-2">
                {/* Every repeated row carries its own accessible name. A
                    placeholder is not one: it disappears the moment there is a
                    value, so a screen-reader user editing this pack heard
                    "edit text" twenty-six times with no way to tell which
                    criterion, term or rubric band they were standing in. */}
                {pack.successCriteria.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className="field-input"
                      aria-label={`Success criterion ${i + 1}`}
                      value={c}
                      onChange={(e) => set("successCriteria", pack.successCriteria.map((x, j) => (j === i ? e.target.value : x)))}
                      placeholder="Label all four PEEL layers in an argument"
                    />
                    <RemoveButton onClick={() => set("successCriteria", removeAt(pack.successCriteria, i))} title={`Remove criterion ${i + 1}`} />
                  </div>
                ))}
                <AddButton label="+ Add criterion" onClick={() => set("successCriteria", [...pack.successCriteria, ""])} />
              </div>
            </div>
          </Section>

          {/* ── Vocabulary ───────────────────────────────────── */}
          <Section
            id="sec-vocab"
            title="Vocabulary"
            hint="At least four defined terms, each with a kid-friendly analogy. An AI action here also refreshes the mission and criteria."
            action={
              <AiActions
                busy={regenBusy === "vocabulary"}
                onRun={(i, l) => regen("vocabulary", i, l)}
              />
            }
          >
            {pack.vocabulary.map((v: VocabTerm, i) => (
              <div key={i} className="rounded-lg border border-inkline p-3">
                <div className="mb-2 flex items-center gap-2">
                  <input className="field-input !w-56 font-semibold" aria-label={`Term ${i + 1}`} value={v.term} onChange={(e) => set("vocabulary", updateAt(pack.vocabulary, i, { term: e.target.value }))} placeholder="Term" />
                  <div className="flex-1" />
                  <RemoveButton onClick={() => set("vocabulary", removeAt(pack.vocabulary, i))} title={`Remove ${v.term || `term ${i + 1}`}`} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Definition">
                    <textarea className="field-textarea !min-h-16" value={v.definition} onChange={(e) => set("vocabulary", updateAt(pack.vocabulary, i, { definition: e.target.value }))} />
                  </Field>
                  <Field label="“Think of it like…” analogy">
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
            hint="Citations are structural: institution, year and publication are separate required fields, and every card carries a limit — what it cannot prove. AI-drafted citations must be verified before review."
            action={
              <AiActions
                busy={regenBusy === "evidence"}
                onRun={(i, l) => regen("evidence", i, l)}
              />
            }
          >
            {pack.evidenceCards.map((c: EvidenceCard, i) => (
              <div key={i} className="rounded-lg border border-inkline p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <input className="field-input !w-16 text-center font-semibold" value={c.id} onChange={(e) => set("evidenceCards", updateAt(pack.evidenceCards, i, { id: e.target.value }))} placeholder="A" aria-label="Card ID" />
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
                <Field label={`Paraphrase (${countWords(c.paraphrase)}/${paraphraseMax} words) *`}>
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
                <Field label="Limit — what this card CANNOT prove *">
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
                  { id: String.fromCharCode(65 + pack.evidenceCards.length), side: "pro", institution: "", author: "", year: "", publication: "", paraphrase: "", translation: "", tacticalNote: "", limit: "", event: "", quote: "", quoteAttribution: "", roundApplication: "", url: "", verified: false },
                ])
              }
            />
          </Section>

          {/* ── The pages ────────────────────────────────────── */}
          <section id="sec-activities" className="scroll-mt-[calc(var(--header-h)+4.5rem)]">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg1">
                  Pages
                </h2>
                <p className="mt-0.5 text-[12px] text-fg3">
                  {pack.activities.length === 0
                    ? "The student-facing pages, in the order they are taught."
                    : `${pack.activities.length} pages, in the order they are taught. Click one to open it.`}
                </p>
              </div>
              {pack.activities.length > 1 && (
                <button
                  type="button"
                  onClick={() => setOpenPage(null)}
                  className="text-[12px] font-semibold text-fg3 transition-colors hover:text-fg1"
                >
                  Collapse all
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {pack.activities.map((a: Activity, i) => (
                <PageCard
                  practiceTopic={pack.practiceTopic ?? ""}
                  key={i}
                  activity={a}
                  index={i}
                  total={pack.activities.length}
                  open={openPage === i}
                  onToggle={() => setOpenPage(openPage === i ? null : i)}
                  onChange={(patch) => set("activities", updateAt(pack.activities, i, patch))}
                  onRemove={() => {
                    set("activities", removeAt(pack.activities, i));
                    setOpenPage(null);
                  }}
                  onDuplicate={() => duplicatePage(i)}
                  onMove={(dir) => {
                    set("activities", moveAt(pack.activities, i, dir));
                    setOpenPage(null);
                  }}
                  onAi={(instruction, label) => regen("activity", instruction, label, i)}
                  aiBusy={regenBusy === `activity-${i}`}
                  rowProps={activityDrag.rowProps(i)}
                  handleProps={activityDrag.handleProps(i)}
                />
              ))}

              {pack.activities.length === 0 && (
                <div className="rounded-xl border border-dashed border-line-strong px-5 py-10 text-center">
                  <p className="text-[14px] font-semibold text-fg1">
                    This pack has no pages yet.
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-fg2">
                    The AI build writes the whole sequence — hook, model, guided
                    practice, drills and exit ticket — from the brief above. You
                    can also add pages one at a time.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <a href={`/materials/${materialId}/generate`} className="btn btn-primary btn-sm">
                      Build it with AI
                    </a>
                    <button type="button" onClick={addPage} className="btn btn-secondary btn-sm">
                      Add a page by hand
                    </button>
                  </div>
                </div>
              )}

              {pack.activities.length > 0 && (
                <AddButton label="+ Add page" onClick={addPage} />
              )}
            </div>
          </section>

          {/* ── Brief, research & teaching detail ────────────── */}
          <Section
            id="sec-brief"
            title="Brief & context"
            hint="Never printed — this is what the AI builds from. Edit it, then use any AI action to re-generate against it."
          >
            <Field label="Lesson brief — the authoritative spec for this pack">
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

          {/* ── Teacher guide ────────────────────────────────── */}
          <Section
            id="sec-teacher"
            title="Teacher guide"
            hint="The teacher-only pages: info strip, materials, and the minute-by-minute plan."
            action={
              <AiActions
                busy={regenBusy === "teacher-guide"}
                onRun={(i, l) => regen("teacher-guide", i, l)}
              />
            }
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
            <div id="check-timing">
              <span className="field-label">
                Minute-by-minute plan — must reach minute {pack.durationMin}
              </span>
              <div className="flex flex-col gap-2">
                {pack.teacherGuide.timingPlan.map((row: TimingRow, i) => (
                  <div key={i} className="flex flex-wrap items-start gap-2">
                    <input type="number" className="field-input !w-18" value={row.startMin} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, timingPlan: updateAt(pack.teacherGuide.timingPlan, i, { startMin: Math.max(0, Number(e.target.value) || 0) }) })} aria-label="Start minute" />
                    <input type="number" className="field-input !w-18" value={row.endMin} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, timingPlan: updateAt(pack.teacherGuide.timingPlan, i, { endMin: Math.max(0, Number(e.target.value) || 0) }) })} aria-label="End minute" />
                    <input className="field-input !w-48" aria-label={`Phase ${i + 1} name`} value={row.phase} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, timingPlan: updateAt(pack.teacherGuide.timingPlan, i, { phase: e.target.value }) })} placeholder="Phase" />
                    <select className="field-input !w-20" value={row.who} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, timingPlan: updateAt(pack.teacherGuide.timingPlan, i, { who: e.target.value as TimingRow["who"] }) })} aria-label="Who leads">
                      <option value="T">T</option>
                      <option value="Ss">Ss</option>
                      <option value="T+Ss">T+Ss</option>
                    </select>
                    <textarea className="field-textarea !min-h-10 min-w-52 flex-1" aria-label={`What happens in phase ${i + 1}`} value={row.what} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, timingPlan: updateAt(pack.teacherGuide.timingPlan, i, { what: e.target.value }) })} placeholder="What happens" />
                    <RemoveButton onClick={() => set("teacherGuide", { ...pack.teacherGuide, timingPlan: removeAt(pack.teacherGuide.timingPlan, i) })} title={`Remove phase ${i + 1}`} />
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
              </div>
            </div>
            <Field label="Prep & pitfalls / check-for-understanding notes">
              <textarea className="field-textarea" value={pack.teacherGuide.pitfalls} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, pitfalls: e.target.value })} />
            </Field>
            <div id="check-rubric">
              <span className="field-label">Grading rubric bands</span>
              <div className="flex flex-col gap-2">
                {pack.teacherGuide.rubric.map((band, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="field-input !w-40" aria-label={`Rubric band ${i + 1} score`} value={band.score} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, rubric: updateAt(pack.teacherGuide.rubric, i, { score: e.target.value }) })} placeholder="4 — Exceeds" />
                    <input className="field-input flex-1" aria-label={`Rubric band ${i + 1} descriptor`} value={band.descriptor} onChange={(e) => set("teacherGuide", { ...pack.teacherGuide, rubric: updateAt(pack.teacherGuide.rubric, i, { descriptor: e.target.value }) })} placeholder="Descriptor" />
                    <RemoveButton onClick={() => set("teacherGuide", { ...pack.teacherGuide, rubric: removeAt(pack.teacherGuide.rubric, i) })} title={`Remove rubric band ${i + 1}`} />
                  </div>
                ))}
                <AddButton label="+ Add band" onClick={() => set("teacherGuide", { ...pack.teacherGuide, rubric: [...pack.teacherGuide.rubric, { score: "", descriptor: "" }] })} />
              </div>
            </div>
          </Section>
        </div>

        {/* ── Right rail ── */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-[calc(var(--header-h)+4.25rem)] lg:max-h-[calc(100vh-var(--header-h)-5.5rem)] lg:self-start">
          {/* One panel at a time. Stacked, these five ran to 4,557px inside a
              656px window — see the note in RailTabs. */}
          <div id="sec-quality" className="min-h-0 scroll-mt-[calc(var(--header-h)+4.5rem)]">
            <RailTabs
              active={railTab}
              onChange={setRailTab}
              tabs={[
                {
                  id: "outline",
                  label: "Outline",
                  content: (
                    <PageOutline
                      sections={outlineSections}
                      pages={pack.activities.map((a, i) => ({
                        index: i,
                        kind: a.kind,
                        title: a.title,
                        durationMin: a.durationMin,
                        issues: pageIssues(a).length,
                      }))}
                      durationMin={pack.durationMin}
                      activePage={openPage}
                      onJumpSection={scrollToId}
                      onJumpPage={jumpToPage}
                      onAddPage={addPage}
                    />
                  ),
                },
                {
                  id: "quality",
                  label: "Quality",
                  badge: failing === null ? undefined : failing > 0 ? String(failing) : "✓",
                  tone: failing && failing > 0 ? "bad" : "good",
                  content: (
                    <div className="flex flex-col gap-3 p-3">
                      {checklist ? (
                        <ChecklistPanel result={checklist} onJumpTo={jumpToCheck} />
                      ) : (
                        <p className="text-xs text-fg3">
                          Checklist runs on the next save…
                        </p>
                      )}

                      {pack.activities.length > 0 &&
                        (coherence.unusedEvidence.length > 0 ||
                          coherence.unusedVocab.length > 0) && (
                          <div className="rounded-xl border border-warn/40 bg-warn/5 p-3.5">
                            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-warn">
                              Used, not just present
                            </h3>
                            <p className="mb-2 text-[11px] leading-relaxed text-fg3">
                              Advisory — these are defined but never deployed on
                              a page. A strong pack puts every card and term back
                              to work.
                            </p>
                            {coherence.unusedEvidence.length > 0 && (
                              <button
                                onClick={() => scrollToId("sec-evidence")}
                                className="block text-[11.5px] font-semibold text-warn hover:underline"
                              >
                                {coherence.unusedEvidence.length} of{" "}
                                {coherence.evidenceCount}{" "}
                                {def.evidenceLabel.toLowerCase()} card
                                {coherence.unusedEvidence.length === 1 ? "" : "s"}{" "}
                                unused →
                              </button>
                            )}
                            {coherence.unusedVocab.length > 0 && (
                              <button
                                onClick={() => scrollToId("sec-activities")}
                                className="mt-1 block text-[11.5px] font-semibold text-warn hover:underline"
                              >
                                {coherence.unusedVocab.length} of{" "}
                                {coherence.vocabCount} vocabulary term
                                {coherence.unusedVocab.length === 1 ? "" : "s"}{" "}
                                unused →
                              </button>
                            )}
                          </div>
                        )}
                    </div>
                  ),
                },
                {
                  id: "sources",
                  label: "Sources",
                  badge: unverified > 0 ? String(unverified) : undefined,
                  tone: "warn",
                  content: (
                    <SourcesPanel
                      pack={pack}
                      onChange={(cards) => set("evidenceCards", cards)}
                    />
                  ),
                },
                {
                  id: "assistant",
                  label: "Assistant",
                  content: <AiPanel materialId={materialId} />,
                },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
