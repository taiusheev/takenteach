"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SUBJECTS, SUBJECT_DEFS, Subject } from "@/lib/subjects";
import { ContentType, typesForSubject } from "@/lib/content-types";
import { GRADE_BANDS, RIGOR_LEVELS, RIGOR_DEFS, RigorLevel } from "@/lib/lesson-quality";
import { formatsForSubject } from "@/lib/lesson-formats";
import { LESSON_DESIGNS } from "@/lib/lesson-designs";
import { DEBATE_FORMATS } from "@/lib/debate-formats";

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

/**
 * Quick Build — brief-first flow. The author writes as much or as little as they
 * want in the brief; AI proposes the whole setup (subject, skill, anchor,
 * format, level) and the full brief is carried into the build as the
 * authoritative prompt. They can paste their own research, or have AI suggest
 * verifiable source leads. Fewer keys, wide structural variety, quality retained.
 */
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

export default function QuickBuildWizard({
  prefillSkillFocus = "",
  prefillSubject,
  prefillResolution = "",
  prefillGradeBand = "",
  prefillDurationMin,
}: {
  prefillSkillFocus?: string;
  prefillSubject?: Subject;
  /** motion wording and age band handed over from the Motion Library */
  prefillResolution?: string;
  prefillGradeBand?: string;
  prefillDurationMin?: number;
} = {}) {
  const router = useRouter();

  const [idea, setIdea] = useState(prefillSkillFocus);
  const [planning, setPlanning] = useState(false);
  const [planned, setPlanned] = useState(false);
  const [formatReason, setFormatReason] = useState("");
  // the competitive format the squad debates — drives crossfire vs POIs vs CX
  const [debateFormat, setDebateFormat] = useState("");

  const [subject, setSubject] = useState<Subject>(prefillSubject ?? "debate");
  const [type, setType] = useState<ContentType>("lesson-pack");
  const [lessonCode, setLessonCode] = useState("");
  const [coverTitle, setCoverTitle] = useState("");
  const [skillFocus, setSkillFocus] = useState(prefillSkillFocus);
  const [series, setSeries] = useState("");
  // A motion arriving from the library is already the anchor — the teacher
  // shouldn't retype a wording the library holds verbatim.
  const [resolution, setResolution] = useState(prefillResolution);
  const [durationMin, setDurationMin] = useState(prefillDurationMin ?? 120);
  const [gradeBand, setGradeBand] = useState<string>(prefillGradeBand || "Grades 6–8");
  const [rigorLevel, setRigorLevel] = useState<RigorLevel>("standard");
  const [format, setFormat] = useState<string>("auto");
  const [design, setDesign] = useState<string>("dossier");

  const [showDetails, setShowDetails] = useState(false);
  const [mode, setMode] = useState<"quick" | "full">("quick");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Research & sources — the teacher's own material grounds the evidence deck.
  const [sourceMaterial, setSourceMaterial] = useState("");
  const [leads, setLeads] = useState<SourceLead[]>([]);
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState("");

  // Teaching detail — optional levers that sharpen the generated lesson.
  const [priorKnowledge, setPriorKnowledge] = useState("");
  const [misconceptions, setMisconceptions] = useState("");
  const [constraints, setConstraints] = useState("");

  const def = SUBJECT_DEFS[subject];
  const formats = formatsForSubject(subject);

  /**
   * Plan, then build, without stopping in between.
   *
   * The two-step flow made every teacher wait twice and click twice to reach the
   * same place, because the plan is almost always right — and when it isn't, the
   * chips are faster to correct on the built pack than a form is to fill before
   * it exists. "Plan first" remains available for the cautious case.
   */
  async function planAndBuild() {
    const plan = await planIt();
    if (plan) await create(plan);
  }

  async function planIt() {
    if (!idea.trim()) return null;
    setPlanning(true);
    setError("");
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
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
      setPlanned(true);
      return p;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Planning failed");
    } finally {
      setPlanning(false);
    }
  }

  /**
   * `plan` is passed explicitly by the one-click path: React state set moments
   * earlier in planIt() has not flushed yet, so reading it here would build the
   * pack from the DEFAULTS the planner just replaced.
   */
  async function create(plan?: LessonPlanFields) {
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
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create material");
      return;
    }
    router.push(
      mode === "quick" ? `/materials/${data.id}/generate` : `/materials/${data.id}/edit`
    );
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
    const line = leadToText(l);
    setSourceMaterial((cur) => (cur.trim() ? `${cur.trim()}\n${line}` : line));
    setLeads((cur) => cur.filter((x) => x !== l));
  }
  function addAllLeads() {
    const lines = leads.map(leadToText).join("\n");
    setSourceMaterial((cur) => (cur.trim() ? `${cur.trim()}\n${lines}` : lines));
    setLeads([]);
  }

  const ready = skillFocus.trim() && resolution.trim();

  return (
    <div>

      {/* the brief — the teacher's own prompt for the whole build */}
      {/* THE BRIEF is the one thing on this screen that matters, so it is the
          one thing that reacts: the border takes the brand when the caret is
          in it. Everything else on the page is quiet by comparison, which is
          how a focal point is made — not by making it bigger. */}
      <div className="card mb-6 p-2 transition-colors focus-within:border-brand/60">
        <span className="block px-3 pt-2 text-[11px] font-bold uppercase tracking-widest text-fg3">
          Lesson brief
        </span>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) planIt();
          }}
          rows={4}
          // Short enough to FIT. The old example ran to six lines in a
          // four-row box, so it truncated mid-word — a placeholder that looks
          // cut off reads as a broken input before anyone has typed anything.
          placeholder={`e.g. 90-minute novice class tomorrow — they're weak on rebuttal and just say "I disagree" instead of attacking the reasoning. Keep it hands-on.`}
          className="w-full resize-none rounded-xl bg-transparent px-4 py-3 text-base text-fg1 outline-none placeholder:text-fg3"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-1">
          <span className="min-w-0 flex-1 text-[11px] text-fg3">
            A sentence or a full spec — the AI uses all of it · ⌘/Ctrl + Enter
          </span>
          <div className="flex shrink-0 items-center gap-3">
            {!planned && (
              <button
                onClick={planIt}
                disabled={planning || busy || !idea.trim()}
                className="whitespace-nowrap text-[11px] font-bold text-fg3 hover:text-fg1 disabled:opacity-40"
              >
                Plan first
              </button>
            )}
            <button
              onClick={planned ? planIt : planAndBuild}
              disabled={planning || busy || !idea.trim()}
              className="btn btn-primary whitespace-nowrap disabled:opacity-40"
            >
              {planning
                ? "Planning…"
                : busy
                  ? "Building…"
                  : planned
                    ? "↻ Re-plan"
                    : "Build my lesson →"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {/* the AI's proposal, as an editable summary */}
      {planned && (
        <div className="mb-6 rounded-xl border border-ok/30 bg-ok/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ok">
            ✨ Proposed plan
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Chip label={SUBJECT_DEFS[subject].label} icon={SUBJECT_DEFS[subject].emoji} />
            <Chip label={skillFocus || "—"} />
            <Chip label={`${formats.find((f) => f.id === format)?.emoji ?? "✨"} ${formats.find((f) => f.id === format)?.label ?? "Auto"}`} />
            <Chip label={`${durationMin} min`} />
            <Chip label={gradeBand} />
            <Chip label={RIGOR_DEFS[rigorLevel].label} />
            {debateFormat && (
              <Chip label={DEBATE_FORMATS.find((f) => f.id === debateFormat)?.short ?? debateFormat} />
            )}
          </div>
          {resolution && (
            <p className="mt-2 text-xs text-fg2">“{resolution}”</p>
          )}
          {formatReason && (
            <p className="mt-1 text-[11px] text-fg3">Format: {formatReason}</p>
          )}
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="mt-2 text-[11px] font-bold text-accent hover:underline"
          >
            {showDetails ? "Hide details" : "Tweak the details"}
          </button>
        </div>
      )}

      {/* details — collapsed by default; the escape hatch to set it by hand */}
      {/* Everything below is opt-in. A teacher who writes one sentence should
          never see a 14-field form before the lesson exists. */}
      <details className="mb-6" open={showDetails}>
        <summary className="mb-3 cursor-pointer text-xs font-bold uppercase tracking-widest text-fg3">
          {planned ? "Adjust anything" : "Or set it up by hand"}
        </summary>

          <div className="flex flex-col gap-5">
            {/* subject */}
            <div>
              <span className="field-label">Track</span>
              <div className="grid gap-2 sm:grid-cols-3">
                {SUBJECTS.map((s) => {
                  const d = SUBJECT_DEFS[s];
                  const active = subject === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSubject(s);
                        if (!typesForSubject(s).some((t) => t.id === type)) setType("lesson-pack");
                        if (!formatsForSubject(s).some((f) => f.id === format)) setFormat("auto");
                      }}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        active ? "border-accent/70 bg-inkcard" : "border-inkline bg-inkmid hover:border-accent/30"
                      }`}
                      style={active ? { borderColor: d.theme.accent } : undefined}
                    >
                      <div className="text-xl">{d.emoji}</div>
                      <div className="mt-0.5 text-sm font-bold text-fg1">{d.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* format gallery — the variety layer */}
            {type === "lesson-pack" && (
              <div>
                <span className="field-label">Lesson format — how the class is shaped</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {formats.map((f) => {
                    const active = format === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFormat(f.id)}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          active ? "border-accent/70 bg-inkcard" : "border-inkline bg-inkmid hover:border-accent/30"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{f.emoji}</span>
                          <span className="text-sm font-bold text-fg1">{f.label}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-snug text-fg3">{f.blurb}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* design gallery — the visual look of the printed pack */}
            {type === "lesson-pack" && (
              <div>
                <span className="field-label">Print design — the visual look</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {LESSON_DESIGNS.map((d) => {
                    const active = design === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDesign(d.id)}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          active ? "border-accent/70 bg-inkcard" : "border-inkline bg-inkmid hover:border-accent/30"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{d.emoji}</span>
                          <span className="text-sm font-bold text-fg1">{d.label}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-snug text-fg3">{d.blurb}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* content type (only when not the default) */}
            {typesForSubject(subject).length > 1 && (
              <label className="block">
                <span className="field-label">Content type</span>
                <select className="field-input" value={type} onChange={(e) => setType(e.target.value as ContentType)}>
                  {typesForSubject(subject).map((t) => (
                    <option key={t.id} value={t.id}>{t.emoji} {t.label} · {t.scale}</option>
                  ))}
                </select>
              </label>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="field-label">Lesson code</span>
                <input className="field-input" value={lessonCode} onChange={(e) => setLessonCode(e.target.value)} placeholder="L2" />
              </label>
              <label className="block sm:col-span-2">
                <span className="field-label">Skill focus</span>
                <input className="field-input" value={skillFocus} onChange={(e) => setSkillFocus(e.target.value)} placeholder="Rebuttal — attacking the warrant" />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="field-label">Cover title</span>
                <input className="field-input" value={coverTitle} onChange={(e) => setCoverTitle(e.target.value)} placeholder="THE COUNTERPUNCH" />
              </label>
              <label className="block">
                <span className="field-label">Series / cohort</span>
                <input className="field-input" value={series} onChange={(e) => setSeries(e.target.value)} placeholder="Novice Debate" />
              </label>
            </div>
            <label className="block">
              <span className="field-label">{def.anchorLabel} (anchors every page)</span>
              <textarea className="field-textarea !min-h-14" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder={def.anchorPlaceholder} />
            </label>
            {subject === "debate" && (
              <label className="block">
                <span className="field-label">
                  Competitive format — decides crossfire vs. POIs vs. cross-ex
                </span>
                <select
                  className="field-input"
                  value={debateFormat}
                  onChange={(e) => setDebateFormat(e.target.value)}
                >
                  <option value="">Format-agnostic</option>
                  {DEBATE_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label} ({f.short})
                    </option>
                  ))}
                </select>
              </label>
            )}
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
          </div>
      </details>

      {/* teaching detail — optional levers that sharpen the lesson */}
      <details className="mb-4 rounded-xl border border-inkline bg-inkcard p-4">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-fg3">
          🎯 Teaching detail (optional) — the more you add, the sharper the lesson
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <label className="block">
            <span className="field-label">What students already know</span>
            <textarea
              className="field-textarea !min-h-14"
              value={priorKnowledge}
              onChange={(e) => setPriorKnowledge(e.target.value)}
              placeholder="e.g. They can already build a basic PEEL argument and know what a claim is. New to rebuttal."
            />
            <span className="mt-1 block text-[11px] text-fg3">
              Calibrates scaffolding and stops the AI re-teaching what they have.
            </span>
          </label>
          <label className="block">
            <span className="field-label">Common mistakes & misconceptions to target</span>
            <textarea
              className="field-textarea !min-h-14"
              value={misconceptions}
              onChange={(e) => setMisconceptions(e.target.value)}
              placeholder="e.g. They just say 'I disagree' instead of attacking the reasoning; they confuse the claim with the evidence."
            />
            <span className="mt-1 block text-[11px] text-fg3">
              The AI aims the drills, answer keys, and exit ticket straight at these.
            </span>
          </label>
          <label className="block">
            <span className="field-label">Classroom constraints</span>
            <textarea
              className="field-textarea !min-h-14"
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder="e.g. 24 students, no printer, one shared screen, desks in fixed rows, 45 min only."
            />
            <span className="mt-1 block text-[11px] text-fg3">
              Keeps every activity actually runnable in your room.
            </span>
          </label>
        </div>
      </details>

      {/* research & sources — the teacher's own material grounds the deck */}
      {resolution.trim() && (
        <div className="mb-6 rounded-xl border border-inkline bg-inkcard p-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-fg3">
              📚 Source material & research
            </span>
            <button
              onClick={research}
              disabled={researching}
              className="rounded-lg border border-accent/50 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent/10 disabled:opacity-40 transition-colors"
            >
              {researching ? "Researching…" : "Suggest sources"}
            </button>
          </div>
          <p className="mb-2 text-[11px] text-fg3">
            Paste real sources, quotes, or stats — the {def.evidenceLabel.toLowerCase()} is built
            from these. Or let AI suggest leads to verify.
          </p>
          <textarea
            value={sourceMaterial}
            onChange={(e) => setSourceMaterial(e.target.value)}
            rows={sourceMaterial ? 6 : 3}
            placeholder={`One source per line, e.g.\nOECD, "Universal Basic Income" policy brief (2017) — pilots didn't reliably raise employment · Limit: not a permanent nationwide UBI`}
            className="w-full resize-y rounded-lg border border-inkline bg-inkmid px-3 py-2 text-xs text-fg1 outline-none placeholder:text-fg3 focus:border-accent/60"
          />

          {researchError && (
            <p className="mt-2 text-[11px] text-danger">{researchError}</p>
          )}

          {leads.length > 0 && (
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-widest text-warn">
                  ⚠️ Leads to verify — confirm each before building
                </span>
                <button
                  onClick={addAllLeads}
                  className="text-[11px] font-bold text-accent hover:underline"
                >
                  ＋ Add all
                </button>
              </div>
              <ul className="flex flex-col gap-2">
                {leads.map((l, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-inkline bg-inkmid p-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-fg1">{l.institution}</span>
                        <span className="text-fg3"> · {l.likelyPublication} · {l.approxYear}</span>
                        <span
                          className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-black text-white ${
                            l.side === "con" ? "bg-danger" : l.side === "pro" ? "bg-ok" : "bg-fg2"
                          }`}
                        >
                          {l.side}
                        </span>
                      </div>
                      <button
                        onClick={() => addLead(l)}
                        className="shrink-0 rounded border border-accent/50 px-2 py-0.5 text-[11px] font-bold text-accent hover:bg-accent/10"
                      >
                        ＋ Add
                      </button>
                    </div>
                    <p className="mt-1 text-fg2">{l.claim}</p>
                    <p className="mt-0.5 text-danger">⛔ {l.limit}</p>
                    <p className="mt-0.5 text-fg3">🔎 {l.findHint}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/*
        The hand-setup path's own build buttons.

        These used to render ALWAYS, which put a second yellow primary ("Build
        it with AI") directly under the box's own "Build my lesson" — two
        equally-weighted calls to action for the same job, on the first screen a
        new user sees. They belong to the manual path: shown once you've opened
        the details or accepted a plan, and hidden while the one-box flow is all
        that's on screen.
      */}
      {(showDetails || planned) && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => { setMode("quick"); create(); }}
              disabled={busy || !ready}
              className="btn btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Creating…" : "Build it with AI →"}
            </button>
            <button
              onClick={() => { setMode("full"); create(); }}
              disabled={busy || !ready}
              className="rounded-lg border border-inkline px-4 py-3 text-sm font-bold text-fg2 hover:text-fg1 disabled:opacity-40 transition-colors"
            >
              Start blank instead
            </button>
          </div>
          {!ready && (
            <p className="mt-2 text-[11px] text-fg3">
              {planned
                ? `Needs a skill focus and ${def.anchorLabel.toLowerCase()} — fill them in above.`
                : "Fill in a skill focus and the details above, or write a brief at the top and let the AI do it."}
            </p>
          )}
        </>
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
