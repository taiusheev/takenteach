"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SUBJECTS, SUBJECT_DEFS, Subject } from "@/lib/subjects";
import { ContentType, typesForSubject } from "@/lib/content-types";
import { GRADE_BANDS, RIGOR_LEVELS, RIGOR_DEFS, RigorLevel } from "@/lib/lesson-quality";
import { formatsForSubject } from "@/lib/lesson-formats";
import { LESSON_DESIGNS } from "@/lib/lesson-designs";
import { DEBATE_FORMATS } from "@/lib/debate-formats";
import { IconSpark } from "@/components/shell/icons";

/** A candidate source the research helper proposes — a lead to verify. */
interface SourceLead {
  institution: string;
  likelyPublication: string;
  approxYear: string;
  side: "pro" | "con" | "neutral";
  claim: string;
  limit: string;
  findHint: string;
}

/** What /api/plan infers — passed straight into create() so nothing is lost. */
interface LessonPlanFields {
  subject: Subject;
  lessonCode?: string;
  coverTitle?: string;
  skillFocus?: string;
  series?: string;
  resolution?: string;
  durationMin?: number;
  gradeBand?: string;
  rigorLevel?: RigorLevel;
  format?: string;
  debateFormat?: string;
}

/**
 * QUICK BUILD — one box, then a plan you can correct.
 *
 * ── WHY THE CHIPS ARE EDITABLE NOW ───────────────────────────────────────
 * The AI infers eleven things from one sentence and it gets most of them right.
 * This screen used to show them as read-only chips with a link underneath
 * captioned "Tweak the details" — which opened the fourteen-field form the whole
 * flow exists to avoid. So the common case (the AI guessed 120 minutes and the
 * class is 90) cost a teacher an expanded form and a hunt for the right input,
 * to change one number they were already looking at.
 *
 * Each chip is now the control for the thing it displays. Tap "120 min", pick
 * 90, done. The form survives underneath for the teacher who would rather set
 * everything by hand, which is a genuinely different intention and not the
 * default one.
 *
 * ── ONE PRIMARY ACTION ───────────────────────────────────────────────────
 * There used to be two. The brief box carried "Build my lesson →" and, once a
 * plan existed, a second row appeared below with "Build it with AI →" and
 * "Start blank instead" — two gradient-filled primaries for the same job on one
 * screen, and a teacher choosing between them is choosing between things they
 * cannot tell apart. There is one build button on this page now.
 */
export default function QuickBuildWizard({
  prefillSkillFocus = "",
  prefillSubject,
  prefillResolution = "",
  prefillGradeBand = "",
  prefillDurationMin,
  prefillPriorKnowledge = "",
  prefillMisconceptions = "",
  prefillConstraints = "",
}: {
  prefillSkillFocus?: string;
  prefillSubject?: Subject;
  /** motion wording and age band handed over from the Motion Library */
  prefillResolution?: string;
  prefillGradeBand?: string;
  prefillDurationMin?: number;
  /** this teacher's saved class defaults — see lib/auth/preferences.ts */
  prefillPriorKnowledge?: string;
  prefillMisconceptions?: string;
  prefillConstraints?: string;
} = {}) {
  const router = useRouter();

  const [idea, setIdea] = useState(prefillSkillFocus);
  const [planning, setPlanning] = useState(false);
  const [planned, setPlanned] = useState(false);
  const [formatReason, setFormatReason] = useState("");
  const [debateFormat, setDebateFormat] = useState("");

  const [subject, setSubject] = useState<Subject>(prefillSubject ?? "debate");
  const [type, setType] = useState<ContentType>("lesson-pack");
  const [lessonCode, setLessonCode] = useState("");
  const [coverTitle, setCoverTitle] = useState("");
  const [skillFocus, setSkillFocus] = useState(prefillSkillFocus);
  const [series, setSeries] = useState("");
  const [resolution, setResolution] = useState(prefillResolution);
  const [durationMin, setDurationMin] = useState(prefillDurationMin ?? 120);
  const [gradeBand, setGradeBand] = useState<string>(prefillGradeBand || "Grades 6–8");
  const [rigorLevel, setRigorLevel] = useState<RigorLevel>("standard");
  const [format, setFormat] = useState<string>("auto");
  const [design, setDesign] = useState<string>("dossier");

  const [showManual, setShowManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Research & sources — the teacher's own material grounds the evidence deck.
  const [sourceMaterial, setSourceMaterial] = useState("");
  const [leads, setLeads] = useState<SourceLead[]>([]);
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState("");

  // Teaching detail — optional levers that sharpen the generated lesson.
  const [priorKnowledge, setPriorKnowledge] = useState(prefillPriorKnowledge);
  const [misconceptions, setMisconceptions] = useState(prefillMisconceptions);
  const [constraints, setConstraints] = useState(prefillConstraints);
  // Sharp, specific questions the planner couldn't answer from the idea alone
  // — see the note on `clarifyingQuestions` in lib/ai.ts. Answered by typing
  // into the three fields below, not by a separate Q&A flow.
  const [clarifyingQuestions, setClarifyingQuestions] = useState<string[]>([]);

  const def = SUBJECT_DEFS[subject];
  const formats = formatsForSubject(subject);

  /** Plan, then build, without stopping in between. */
  async function planAndBuild() {
    const plan = await planIt();
    if (plan) await create(plan);
  }

  async function planIt(): Promise<LessonPlanFields | null> {
    if (!idea.trim()) return null;
    setPlanning(true);
    setError("");
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // What the teacher already told us — either just now (they typed into
        // "Add teaching detail" before planning) or on file from Settings — so
        // the planner doesn't ask a clarifying question already answered.
        body: JSON.stringify({
          idea,
          known: { priorKnowledge, misconceptions, constraints },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Planning failed");
      const p = data.plan;
      setSubject(p.subject);
      setLessonCode(p.lessonCode ?? "");
      setCoverTitle(p.coverTitle ?? "");
      setSkillFocus(p.skillFocus ?? "");
      setSeries(p.series ?? "");
      setResolution(p.resolution ?? "");
      setDurationMin(p.durationMin || 120);
      setGradeBand(p.gradeBand ?? "Grades 6–8");
      setRigorLevel(p.rigorLevel ?? "standard");
      setFormat(p.format ?? "auto");
      setFormatReason(p.formatReason ?? "");
      setDebateFormat(p.debateFormat ?? "");
      setClarifyingQuestions(p.clarifyingQuestions ?? []);
      setPlanned(true);
      return p;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Planning failed");
      return null;
    } finally {
      setPlanning(false);
    }
  }

  /**
   * `plan` is passed explicitly by the one-click path: React state set moments
   * earlier in planIt() has not flushed yet, so reading it here would build the
   * pack from the DEFAULTS the planner just replaced.
   */
  async function create(plan?: LessonPlanFields, openBlank = false) {
    setBusy(true);
    setError("");
    const v = {
      subject: plan?.subject ?? subject,
      lessonCode: plan?.lessonCode ?? lessonCode,
      coverTitle: plan?.coverTitle ?? coverTitle,
      skillFocus: plan?.skillFocus ?? skillFocus,
      series: plan?.series ?? series,
      resolution: plan?.resolution ?? resolution,
      durationMin: plan?.durationMin ?? durationMin,
      gradeBand: plan?.gradeBand ?? gradeBand,
      rigorLevel: plan?.rigorLevel ?? rigorLevel,
      format: plan?.format ?? format,
      debateFormat: plan?.debateFormat ?? debateFormat,
    };
    const title = `${v.lessonCode ? v.lessonCode + " · " : ""}${v.coverTitle || v.skillFocus || "Untitled lesson pack"}`;
    try {
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, type, design, ...v,
          brief: idea, sourceMaterial,
          priorKnowledge, misconceptions, constraints,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create material");
        setBusy(false);
        return;
      }
      router.push(
        openBlank ? `/materials/${data.id}/edit` : `/materials/${data.id}/generate`
      );
    } catch {
      setError("Network error — the lesson was not created.");
      setBusy(false);
    }
  }

  async function research() {
    if (!resolution.trim()) return;
    setResearching(true);
    setResearchError("");
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, anchor: resolution, skillFocus, brief: idea }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Research failed");
      setLeads(data.leads ?? []);
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : "Research failed");
    } finally {
      setResearching(false);
    }
  }

  function leadToText(l: SourceLead): string {
    return `${l.institution}, "${l.likelyPublication}" (${l.approxYear}) [${l.side}] — ${l.claim} · Limit: ${l.limit} · Verify: ${l.findHint}`;
  }
  function addLead(l: SourceLead) {
    setSourceMaterial((cur) => {
      const line = leadToText(l);
      return cur.trim() ? `${cur.trim()}\n${line}` : line;
    });
    setLeads((cur) => cur.filter((x) => x !== l));
  }
  function addAllLeads() {
    const lines = leads.map(leadToText).join("\n");
    setSourceMaterial((cur) => (cur.trim() ? `${cur.trim()}\n${lines}` : lines));
    setLeads([]);
  }

  const ready = skillFocus.trim() && resolution.trim();
  const working = planning || busy;

  return (
    <div className="flex flex-col gap-5">
      {/* ── THE BRIEF ──
          The one thing on this screen that matters, so the one thing that
          reacts: the border takes the brand when the caret is in it. */}
      <div className="card p-2 transition-colors focus-within:border-brand/60">
        <label
          htmlFor="brief"
          className="block px-3 pt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-fg3"
        >
          What do you need?
        </label>
        <textarea
          id="brief"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && idea.trim() && !working) {
              void (planned ? create() : planAndBuild());
            }
          }}
          rows={4}
          placeholder={`e.g. 90-minute novice class tomorrow — they're weak on rebuttal and just say "I disagree" instead of attacking the reasoning. Keep it hands-on.`}
          className="w-full resize-none rounded-xl bg-transparent px-4 py-3 text-[15px] leading-relaxed text-fg1 outline-none placeholder:text-fg3"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-1">
          <span className="min-w-0 flex-1 text-[11.5px] text-fg3">
            A sentence or a full spec — the AI reads all of it.{" "}
            <span className="whitespace-nowrap">
              <kbd>⌘</kbd>
              <kbd>↵</kbd> to build
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-3">
            {!planned && (
              <button
                onClick={() => void planIt()}
                disabled={working || !idea.trim()}
                className="whitespace-nowrap text-[12px] font-semibold text-fg3 transition-colors hover:text-fg1 disabled:opacity-40"
              >
                Show me the plan first
              </button>
            )}
            <button
              onClick={() => void (planned ? create() : planAndBuild())}
              disabled={working || !idea.trim() || (planned && !ready)}
              className="btn btn-primary whitespace-nowrap"
            >
              {planning
                ? "Planning…"
                : busy
                  ? "Starting the build…"
                  : planned
                    ? "Build this lesson →"
                    : "Build my lesson →"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      {/* ── THE PLAN, AS CONTROLS ── */}
      {planned && (
        <div className="card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-fg1">
              <IconSpark size={14} className="text-brand2" />
              Here&apos;s the plan
            </h2>
            <button
              onClick={() => void planIt()}
              disabled={working}
              className="text-[12px] font-semibold text-fg3 transition-colors hover:text-fg1 disabled:opacity-40"
            >
              {planning ? "Re-planning…" : "Plan it again"}
            </button>
          </div>

          <p className="mb-3 text-[11.5px] text-fg3">
            Tap anything to change it — nothing is built yet.
          </p>

          <div className="flex flex-wrap gap-2">
            <PlanChip label="Track" value={SUBJECT_DEFS[subject].label}>
              <select
                className="field-input"
                value={subject}
                onChange={(e) => {
                  const s = e.target.value as Subject;
                  setSubject(s);
                  if (!typesForSubject(s).some((t) => t.id === type)) setType("lesson-pack");
                  if (!formatsForSubject(s).some((f) => f.id === format)) setFormat("auto");
                }}
              >
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>{SUBJECT_DEFS[s].label}</option>
                ))}
              </select>
            </PlanChip>

            <PlanChip label="Skill focus" value={skillFocus || "Not set"} wide>
              <input
                className="field-input"
                value={skillFocus}
                onChange={(e) => setSkillFocus(e.target.value)}
                placeholder="Rebuttal — attacking the warrant"
              />
            </PlanChip>

            <PlanChip
              label="Shape"
              value={formats.find((f) => f.id === format)?.label ?? "Auto"}
              wide
            >
              <select
                className="field-input"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                {formats.map((f) => (
                  <option key={f.id} value={f.id}>{f.label} — {f.blurb}</option>
                ))}
              </select>
              {formatReason && (
                <p className="mt-1.5 text-[11px] leading-snug text-fg3">
                  The AI chose {formats.find((f) => f.id === format)?.label}: {formatReason}
                </p>
              )}
            </PlanChip>

            <PlanChip label="Length" value={`${durationMin} min`}>
              <select
                className="field-input"
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
              >
                {[30, 45, 60, 75, 90, 105, 120, 150, 180].map((m) => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </PlanChip>

            <PlanChip label="Year group" value={gradeBand}>
              <select
                className="field-input"
                value={gradeBand}
                onChange={(e) => setGradeBand(e.target.value)}
              >
                {GRADE_BANDS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </PlanChip>

            <PlanChip label="Rigor" value={RIGOR_DEFS[rigorLevel].label}>
              <select
                className="field-input"
                value={rigorLevel}
                onChange={(e) => setRigorLevel(e.target.value as RigorLevel)}
              >
                {RIGOR_LEVELS.map((r) => (
                  <option key={r} value={r}>{RIGOR_DEFS[r].label}</option>
                ))}
              </select>
            </PlanChip>

            {subject === "debate" && (
              <PlanChip
                label="Competition format"
                value={
                  DEBATE_FORMATS.find((f) => f.id === debateFormat)?.short ??
                  "Format-agnostic"
                }
              >
                <select
                  className="field-input"
                  value={debateFormat}
                  onChange={(e) => setDebateFormat(e.target.value)}
                >
                  <option value="">Format-agnostic</option>
                  {DEBATE_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>{f.label} ({f.short})</option>
                  ))}
                </select>
              </PlanChip>
            )}

            <PlanChip
              label="Look on paper"
              value={LESSON_DESIGNS.find((d) => d.id === design)?.label ?? "Dossier"}
              wide
            >
              <select
                className="field-input"
                value={design}
                onChange={(e) => setDesign(e.target.value)}
              >
                {LESSON_DESIGNS.map((d) => (
                  <option key={d.id} value={d.id}>{d.label} — {d.blurb}</option>
                ))}
              </select>
            </PlanChip>
          </div>

          {/* The anchor is a sentence, not a chip — it is the thing every page
              in the pack has to agree with, so it is shown at full length. */}
          <div className="mt-3.5 border-t border-inkline pt-3">
            <label className="field-label" htmlFor="anchor">
              {def.anchorLabel} — every page is built against this
            </label>
            <textarea
              id="anchor"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={2}
              placeholder={def.anchorPlaceholder}
              className={`field-textarea !min-h-14 ${resolution.trim() ? "" : "!border-warn/60"}`}
            />
            {!ready && (
              <p className="mt-1.5 text-[11.5px] text-warn">
                {!skillFocus.trim() && !resolution.trim()
                  ? `A skill focus and ${def.anchorLabel.toLowerCase()} are needed before building.`
                  : !resolution.trim()
                    ? `Add the ${def.anchorLabel.toLowerCase()} above — it anchors every page.`
                    : "Add a skill focus — tap the chip above."}
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-inkline pt-3 text-[11.5px] text-fg3">
            <span>
              Cover: <strong className="font-semibold text-fg2">{coverTitle || "AI will name it"}</strong>
            </span>
            {series && <span>Series: <strong className="font-semibold text-fg2">{series}</strong></span>}
            <div className="flex-1" />
            <button
              onClick={() => void create(undefined, true)}
              disabled={working || !ready}
              className="font-semibold text-fg3 transition-colors hover:text-fg1 disabled:opacity-40"
            >
              Skip the AI and write it myself
            </button>
          </div>
        </div>
      )}

      {/* ── Optional detail. Collapsed unless there's already something in it
          or the planner has questions — then it opens on its own, because a
          question nobody sees never gets answered. ── */}
      <Disclosure
        title="Add teaching detail"
        note="What they already know, what they get wrong, what your room allows"
        open={
          clarifyingQuestions.length > 0 ||
          !!(priorKnowledge || misconceptions || constraints)
        }
      >
        <div className="flex flex-col gap-3.5">
          {clarifyingQuestions.length > 0 && (
            <div className="rounded-lg border border-brand/30 bg-brandsoft/40 px-3.5 py-3">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-brandink">
                A few things that would sharpen this
              </p>
              <ul className="flex flex-col gap-1 text-[12.5px] leading-snug text-fg2">
                {clarifyingQuestions.map((q, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span aria-hidden className="text-brand2">·</span>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label className="block">
            <span className="field-label">What students already know</span>
            <textarea
              className="field-textarea !min-h-14"
              value={priorKnowledge}
              onChange={(e) => setPriorKnowledge(e.target.value)}
              placeholder="e.g. They can already build a basic PEEL argument. New to rebuttal."
            />
            <span className="mt-1 block text-[11px] text-fg3">
              Calibrates scaffolding and stops the AI re-teaching what they have.
            </span>
          </label>
          <label className="block">
            <span className="field-label">Mistakes and misconceptions to target</span>
            <textarea
              className="field-textarea !min-h-14"
              value={misconceptions}
              onChange={(e) => setMisconceptions(e.target.value)}
              placeholder="e.g. They just say 'I disagree' instead of attacking the reasoning."
            />
            <span className="mt-1 block text-[11px] text-fg3">
              The drills, answer keys and exit ticket aim straight at these.
            </span>
          </label>
          <label className="block">
            <span className="field-label">Classroom constraints</span>
            <textarea
              className="field-textarea !min-h-14"
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder="e.g. 24 students, no printer, one shared screen, 45 min only."
            />
            <span className="mt-1 block text-[11px] text-fg3">
              Keeps every activity runnable in your actual room.
            </span>
          </label>
        </div>
      </Disclosure>

      {/* ── Sources. Only once there is an anchor to research. ── */}
      {resolution.trim() && (
        <Disclosure
          title="Ground it in real sources"
          note={`Paste your own, or have the AI suggest leads to verify`}
          open={sourceMaterial.trim().length > 0 || leads.length > 0}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 flex-1 text-[11.5px] text-fg3">
              The {def.evidenceLabel.toLowerCase()} is built from these. Anything
              you paste is used verbatim rather than invented.
            </p>
            <button
              onClick={() => void research()}
              disabled={researching}
              className="btn btn-secondary btn-sm shrink-0"
            >
              {researching ? "Researching…" : "Suggest sources"}
            </button>
          </div>
          <textarea
            value={sourceMaterial}
            onChange={(e) => setSourceMaterial(e.target.value)}
            rows={sourceMaterial ? 6 : 3}
            placeholder={`One source per line, e.g.\nOECD, "Universal Basic Income" policy brief (2017) — pilots didn't reliably raise employment · Limit: not a permanent nationwide UBI`}
            className="field-textarea !min-h-16 text-[12.5px]"
          />

          {researchError && (
            <p className="mt-2 text-[11.5px] text-danger">{researchError}</p>
          )}

          {leads.length > 0 && (
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-warn">
                  Leads to verify — confirm each before building
                </span>
                <button
                  onClick={addAllLeads}
                  className="text-[11.5px] font-semibold text-accent hover:underline"
                >
                  Add all
                </button>
              </div>
              <ul className="flex flex-col gap-2">
                {leads.map((l, i) => (
                  <li key={i} className="rounded-lg border border-inkline bg-surface-alt/50 p-2.5 text-[12px]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-semibold text-fg1">{l.institution}</span>
                        <span className="text-fg3"> · {l.likelyPublication} · {l.approxYear}</span>
                        <span
                          className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            l.side === "con"
                              ? "bg-danger/12 text-danger"
                              : l.side === "pro"
                                ? "bg-ok/12 text-ok"
                                : "bg-surface-alt text-fg3"
                          }`}
                        >
                          {l.side}
                        </span>
                      </div>
                      <button
                        onClick={() => addLead(l)}
                        className="shrink-0 rounded-md border border-inkline px-2 py-0.5 text-[11.5px] font-semibold text-fg2 hover:text-fg1"
                      >
                        Add
                      </button>
                    </div>
                    <p className="mt-1 text-fg2">{l.claim}</p>
                    <p className="mt-0.5 text-danger">Limit: {l.limit}</p>
                    <p className="mt-0.5 text-fg3">Find it: {l.findHint}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Disclosure>
      )}

      {/* ── The manual path. An escape hatch, not a second front door. ── */}
      {!planned && (
        <div>
          <button
            onClick={() => setShowManual((v) => !v)}
            className="text-[12.5px] font-semibold text-fg3 transition-colors hover:text-fg1"
          >
            {showManual ? "Hide manual setup" : "Or set it up by hand instead →"}
          </button>

          {showManual && (
            <div className="card mt-3 flex flex-col gap-4 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="field-label">Track</span>
                  <select
                    className="field-input"
                    value={subject}
                    onChange={(e) => {
                      const s = e.target.value as Subject;
                      setSubject(s);
                      if (!typesForSubject(s).some((t) => t.id === type)) setType("lesson-pack");
                      if (!formatsForSubject(s).some((f) => f.id === format)) setFormat("auto");
                    }}
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s}>{SUBJECT_DEFS[s].label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="field-label">Lesson code</span>
                  <input className="field-input" value={lessonCode} onChange={(e) => setLessonCode(e.target.value)} placeholder="L2" />
                </label>
                <label className="block">
                  <span className="field-label">Series / cohort</span>
                  <input className="field-input" value={series} onChange={(e) => setSeries(e.target.value)} placeholder="Novice Debate" />
                </label>
              </div>

              {typesForSubject(subject).length > 1 && (
                <label className="block">
                  <span className="field-label">Content type</span>
                  <select className="field-input" value={type} onChange={(e) => setType(e.target.value as ContentType)}>
                    {typesForSubject(subject).map((t) => (
                      <option key={t.id} value={t.id}>{t.label} · {t.scale}</option>
                    ))}
                  </select>
                </label>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">Skill focus</span>
                  <input className="field-input" value={skillFocus} onChange={(e) => setSkillFocus(e.target.value)} placeholder="Rebuttal — attacking the warrant" />
                </label>
                <label className="block">
                  <span className="field-label">Cover title</span>
                  <input className="field-input" value={coverTitle} onChange={(e) => setCoverTitle(e.target.value)} placeholder="THE COUNTERPUNCH" />
                </label>
              </div>

              <label className="block">
                <span className="field-label">{def.anchorLabel} (anchors every page)</span>
                <textarea className="field-textarea !min-h-14" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder={def.anchorPlaceholder} />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="field-label">Duration (min)</span>
                  <input type="number" className="field-input" value={durationMin} onChange={(e) => setDurationMin(Math.max(30, Number(e.target.value) || 120))} />
                </label>
                <label className="block">
                  <span className="field-label">Grade band</span>
                  <select className="field-input" value={gradeBand} onChange={(e) => setGradeBand(e.target.value)}>
                    {GRADE_BANDS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="field-label">Rigor</span>
                  <select className="field-input" value={rigorLevel} onChange={(e) => setRigorLevel(e.target.value as RigorLevel)}>
                    {RIGOR_LEVELS.map((r) => <option key={r} value={r}>{RIGOR_DEFS[r].label}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">Lesson format</span>
                  <select className="field-input" value={format} onChange={(e) => setFormat(e.target.value)}>
                    {formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="field-label">Print design</span>
                  <select className="field-input" value={design} onChange={(e) => setDesign(e.target.value)}>
                    {LESSON_DESIGNS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-inkline pt-3">
                <button
                  onClick={() => void create()}
                  disabled={busy || !ready}
                  className="btn btn-primary"
                >
                  {busy ? "Creating…" : "Build it with AI →"}
                </button>
                <button
                  onClick={() => void create(undefined, true)}
                  disabled={busy || !ready}
                  className="btn btn-secondary"
                >
                  Start blank
                </button>
                {!ready && (
                  <span className="text-[11.5px] text-fg3">
                    Needs a skill focus and {def.anchorLabel.toLowerCase()}.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A chip that IS the control for the thing it shows.
 *
 * Closed, it reads as a fact about the lesson. Open, it is the field. That
 * equivalence is the point: the teacher never has to work out which form
 * control corresponds to the chip they are looking at, because it is the same
 * object.
 */
function PlanChip({
  label,
  value,
  wide,
  children,
}: {
  label: string;
  value: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close();
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
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        /* CAPPED, because the AI's best answers are the long ones.
           A precise skill focus — "Evidence analysis — distinguishing
           statistical scope from claimed conclusion, and attacking the warrant
           behind a card" — measured 829px and took a whole row to itself,
           pushing the other seven chips onto a second line. The plan card is
           the moment this product proves it understood the brief, and it was
           being unbalanced by the very thing that proves it. The value
           truncates; the full text is on hover and in the popover, which is
           where it is edited anyway. */
        title={`${label}: ${value}`}
        className={`group inline-flex max-w-[17rem] items-baseline gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
          open
            ? "border-brand bg-brandsoft/60"
            : "border-inkline bg-surface-alt/60 hover:border-line-strong"
        }`}
      >
        <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wider text-fg3">
          {label}
        </span>
        <span className="min-w-0 truncate font-semibold text-fg1">{value}</span>
        <span
          aria-hidden
          className="shrink-0 text-[9px] text-fg3 transition-colors group-hover:text-fg1"
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          className={`absolute left-0 top-full z-30 mt-1.5 rounded-xl border border-line-strong bg-surface p-2.5 shadow-[var(--elev-lg)] ${
            wide ? "w-80" : "w-56"
          }`}
        >
          <span className="field-label">{label}</span>
          {children}
        </div>
      )}
    </div>
  );
}

/** A titled, collapsed panel. Replaces the emoji-labelled <details> blocks. */
function Disclosure({
  title,
  note,
  open = false,
  children,
}: {
  title: string;
  note: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="card overflow-hidden [&[open]>summary]:border-b [&[open]>summary]:border-inkline" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-fg1">{title}</span>
          <span className="block text-[11.5px] text-fg3">{note}</span>
        </span>
        <span aria-hidden className="shrink-0 text-[11px] text-fg3">
          ＋
        </span>
      </summary>
      <div className="p-4">{children}</div>
    </details>
  );
}
