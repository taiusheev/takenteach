"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMonoSafeText } from "@/lib/use-mono-safe";
import DownloadMenu from "@/components/DownloadMenu";
import { StyleKitConfig } from "@/lib/db";
import { AnyContent, commonFields, contentTypeDef } from "@/lib/content-types";
import { ClassPlan } from "@/lib/class-plan-schema";
import { VocabSet } from "@/lib/vocab-set-schema";
import { JudgeBallot } from "@/lib/judge-ballot-schema";
import { SUBJECT_DEFS, Subject } from "@/lib/subjects";
import { fontVar, resolveAccent } from "@/lib/style-kit";
import { BASE_THEME_CSS } from "@/lib/print-theme";
import { HOUSE_DESIGN_CSS, HOUSE_NOVICE_CSS, HOUSE_ELITE_CSS } from "@/lib/house-design";
import { DEFAULT_DESIGN_ID, lessonDesign, usesNoviceHouse, usesEliteHouse } from "@/lib/lesson-designs";
import { sanitizeDesignCss } from "@/lib/sanitize-design";

/**
 * Print rendering for the lighter content types. Shares the Lesson Pack's
 * print machinery — letter pages, kit-driven palette and typography, page
 * numbering, answer toggle, overfull detection.
 */
export default function SimplePrintView({
  materialId,
  type,
  content,
  kit,
  subject,
  lockedFields = [],
  inheritedCss = "",
  inheritedFrom = "",
  designId = DEFAULT_DESIGN_ID,
}: {
  materialId: number;
  type: string;
  content: AnyContent;
  kit: StyleKitConfig;
  subject: Subject;
  lockedFields?: string[];
  /** the design system of the lesson pack this material's unit belongs to */
  inheritedCss?: string;
  /** which pack it came from, for the toolbar note */
  inheritedFrom?: string;
  /** the HOUSE design of the unit's first lesson pack — see unitHouseDesignId */
  designId?: string;
}) {
  const design = lessonDesign(designId);
  const def = contentTypeDef(type);
  const subj = SUBJECT_DEFS[subject];
  const common = commonFields(content);
  const [showAnswers, setShowAnswers] = useState(false);
  const stackRef = useRef<HTMLDivElement>(null);
  const [overfull, setOverfull] = useState<number[]>([]);
  const [monoProof, setMonoProof] = useState(false);
  const lowContrast = useMonoSafeText(stackRef, [content, showAnswers]);

  const accent = resolveAccent(
    kit.palette.accent,
    common.accentColor,
    lockedFields,
    subj.theme.accent
  );

  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    // These sheets are the same fixed A4 frame a lesson pack uses, but they were
    // measured against a LETTER constant (11in = 1056px vs A4's 1123px), so every
    // page permanently reported "runs past the bottom" — and since the frame
    // clips, genuinely overlong pages were silently cut off with no shrink pass
    // to save them. Now: measure the real content, and zoom it down to fit.
    // A lesson pack scales one inner .pk-fit column; these pages have no such
    // wrapper, so the same factor goes on every direct child — in normal flow
    // that scales the stack identically, without touching the sheet frame.
    const FLOOR = 0.85;
    const measure = () => {
      const pages = Array.from(stack.querySelectorAll<HTMLElement>(".print-page"));
      const over: number[] = [];
      pages.forEach((page, i) => {
        const kids = Array.from(page.children) as HTMLElement[];
        kids.forEach((k) => {
          k.style.zoom = "1";
        });
        const cs = getComputedStyle(page);
        const avail =
          page.clientHeight -
          parseFloat(cs.paddingTop) -
          parseFloat(cs.paddingBottom);
        const height = () =>
          kids.reduce((sum, k) => sum + k.getBoundingClientRect().height, 0);
        const h = height();
        if (avail > 0 && h > avail + 2) {
          const factor = Math.max(FLOOR, (avail - 6) / h);
          kids.forEach((k) => {
            k.style.zoom = String(factor);
          });
          const stillOver = height() > avail + 2;
          page.classList.toggle("is-overfull", stillOver);
          if (stillOver) over.push(i + 1);
        } else {
          page.classList.remove("is-overfull");
        }
      });
      setOverfull(over);
    };
    measure();
    const t = setTimeout(measure, 350);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => clearTimeout(t);
  }, [content, showAnswers]);

  const hasAnswers = type === "vocabulary-set";

  return (
    <div
      className={`pk-root ${showAnswers ? "" : "answers-hidden"}${monoProof ? " mono-proof" : ""}`}
    >
      {/* The SAME layer stack a Lesson Pack uses, in the same order, and that
          matters more here than anywhere: this component prints the class plans,
          word banks and ballots that go out in the same envelope as the packs.
          It used to inject BASE_THEME_CSS and nothing else — no house standard —
          so a lesson pack printed in the academy's own design and the class plan
          beside it printed in bare defaults. Two products in one folder, which
          is precisely the "different design on different pages" complaint,
          one component further along than anyone was looking.

          base defaults → house standard → novice overlay → kit fonts + design
          tokens → the unit's inherited stylesheet. Fonts and tokens go in a
          STYLESHEET, never inline: an inline custom property cannot be
          overridden, and setting them on the element silently discarded a design
          system's typography. That trap has now appeared four times in this
          codebase; it is why none of these values live in a style prop. */}
      <style dangerouslySetInnerHTML={{ __html: BASE_THEME_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: HOUSE_DESIGN_CSS }} />
      {usesNoviceHouse(design.id) && (
        <style dangerouslySetInnerHTML={{ __html: HOUSE_NOVICE_CSS }} />
      )}
      {usesEliteHouse(design.id) && (
        <style dangerouslySetInnerHTML={{ __html: HOUSE_ELITE_CSS }} />
      )}
      <style
        dangerouslySetInnerHTML={{
          __html: `.pk-root{
  --pk-display: ${fontVar("display", kit.fonts.display)};
  --pk-body: ${fontVar("body", kit.fonts.body)};
  --pk-mono: ${fontVar("mono", kit.fonts.mono)};
  --pk-hand: ${fontVar("handwritten", kit.fonts.handwritten)};
${Object.entries(design.vars)
  .map(([k, v]) => `  ${k}: ${v};`)
  .join("\n")}
}`,
        }}
      />
      {inheritedCss && (
        <style dangerouslySetInnerHTML={{ __html: sanitizeDesignCss(inheritedCss) }} />
      )}
      <div className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-inkline bg-inkmid px-5 py-3">
        <Link href={`/materials/${materialId}`} className="text-sm font-bold text-fg3 hover:text-fg1 transition-colors">
          ← Back
        </Link>
        <span className="mx-2 text-xs uppercase tracking-widest text-fg3">
          {def.emoji} {def.label}
        </span>
        {inheritedFrom && (
          <span
            title="This material adopts the design system of the lesson pack its unit is built around, so the week prints as one publication."
            className="rounded-md border border-inkline px-2 py-1 text-[11px] text-fg3"
          >
            Unit look from {inheritedFrom}
          </span>
        )}
        <button
          onClick={() => setMonoProof((v) => !v)}
          title="Preview exactly what a black-and-white printer will produce"
          className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
            monoProof ? "bg-accent text-ink" : "border border-inkline text-fg2 hover:text-fg1"
          }`}
        >
          B/W proof
        </button>
        {monoProof && (
          <span
            className={`text-xs font-bold ${lowContrast > 0 ? "text-red-700" : "text-emerald-700"}`}
          >
            {lowContrast > 0
              ? `${lowContrast} auto-corrected for print — outlined`
              : "All text readable in mono"}
          </span>
        )}
        <div className="flex-1" />
        {hasAnswers && (
          <button
            onClick={() => setShowAnswers((v) => !v)}
            className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
              showAnswers ? "bg-amber-400 text-ink" : "border border-inkline text-fg2 hover:text-fg1"
            }`}
          >
            🔑 {showAnswers ? "Answers ON" : "Answers OFF"}
          </button>
        )}
        <DownloadMenu materialId={materialId} showAnswers={showAnswers} />
        <button
          onClick={() => window.print()}
          className="rounded-md bg-sky-700 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-sky-600 transition-colors"
        >
          🖨 Print
        </button>
      </div>

      {overfull.length > 0 && (
        <div className="no-print border-b border-amber-500/40 bg-amber-500/10 px-5 py-2.5 text-xs text-amber-700">
          ⚠️ {overfull.length === 1 ? "Page" : "Pages"} <strong>{overfull.join(", ")}</strong>{" "}
          {overfull.length === 1 ? "runs" : "run"} past the bottom of the sheet — trim content in the Builder.
        </div>
      )}

      <div
        ref={stackRef}
        className="print-stack flex flex-col items-center gap-10 bg-[#1e293b] py-10 print:bg-white print:py-0 print:gap-0"
      >
        {type === "class-plan" && (
          <ClassPlanPages plan={content as ClassPlan} kit={kit} accent={accent} subj={subj} />
        )}
        {type === "vocabulary-set" && (
          <VocabSetPages set={content as VocabSet} kit={kit} accent={accent} subj={subj} />
        )}
        {type === "judge-ballot" && (
          <JudgeBallotPages ballot={content as JudgeBallot} kit={kit} accent={accent} />
        )}
      </div>
    </div>
  );
}

const displayFont = { fontFamily: "var(--pk-display), sans-serif", letterSpacing: "1px" };
const monoFont = { fontFamily: "var(--pk-mono), monospace" };

// Hook names are deliberately the SAME vocabulary a Lesson Pack uses
// (pk-masthead / pk-title / pk-badge / pk-section-label / pk-card / pk-timing …),
// so a unit's design system styles these pages without knowing they are a
// different content type. That is what makes the identity transfer free.
function Header({ title, badge }: { title: string; badge: string }) {
  return (
    <div className="pk-masthead pk-headrule mb-3 flex items-center justify-between pb-1.5">
      <h2 className="pk-title text-3xl">{title}</h2>
      {badge && (
        <span className="pk-badge pk-ink-auto px-3 py-1 text-[11px] font-bold uppercase tracking-widest">
          {badge}
        </span>
      )}
    </div>
  );
}

function Footer({ text, accent }: { text: string; accent?: string }) {
  return (
    <div className="print-footer" style={accent ? { borderTopColor: accent, color: accent } : undefined}>
      <span className="truncate">{text}</span>
    </div>
  );
}

function AnchorBox({ label, text }: { label: string; text: string }) {
  return (
    <div className="pk-cover-anchor avoid-break mb-3 rounded-xl border-2 p-3">
      <div className="pk-bigq-label mb-1 text-xs uppercase tracking-widest">{label}</div>
      <p className="pk-cover-anchor-text pk-ink-auto text-sm font-bold leading-snug">{text || "—"}</p>
    </div>
  );
}

// ── Class Plan ───────────────────────────────────────────────────────────────

function ClassPlanPages({
  plan, kit, accent, subj,
}: { plan: ClassPlan; kit: StyleKitConfig; accent: string; subj: (typeof SUBJECT_DEFS)[Subject] }) {
  // pk-page, NOT pk-cover. This sheet carries the whole class plan — the kicker
  // and title at the top are a document HEAD, not a title page — and while it
  // claimed `pk-cover` the house standard's cover treatment applied to it in
  // full: a five-segment class plan printed as a dark navy title sheet in a gold
  // frame. It wants the same paper a lesson pack's content pages get. The
  // pk-cover-* hooks on the children stay; that styling is what they do want.
  return (
    <div className="pk-page print-page">
      <div className="pk-cover-kicker mb-3 flex items-center justify-between border-b-2 pb-2" style={{ borderColor: `${accent}66` }}>
        <span className="text-xs uppercase tracking-[3px]">
          {kit.brand} · {subj.theme.trackLabel} · CLASS PLAN
        </span>
        <span className="pk-cover-tag pk-bar pk-ink-auto px-3 py-1 text-sm font-black tracking-[2px]">
          {plan.lessonCode || "—"} · {plan.durationMin} MIN
        </span>
      </div>

      <h1 className="pk-cover-title mb-1 text-4xl leading-none">
        {plan.title || "Untitled class plan"}
      </h1>
      <p className="pk-cover-subtitle mb-3 text-xs uppercase tracking-wide">
        {plan.series} {plan.skillFocus ? `· ${plan.skillFocus}` : ""}
      </p>

      <AnchorBox label={subj.anchorLabel} text={plan.resolution} />

      <div className="pk-key avoid-break mb-3 rounded-xl p-3">
        <p className="pk-key-label mb-1 text-xs font-black uppercase tracking-widest">Objective</p>
        <p className="pk-key-text text-sm">{plan.objective || "—"}</p>
      </div>

      <div className="avoid-break mb-3 grid grid-cols-2 gap-2">
        <div className="pk-box pk-box--pad rounded-lg text-xs">
          <p className="pk-section-label mb-1 font-black uppercase tracking-widest">Materials</p>
          <p>{plan.materials || "—"}</p>
        </div>
        <div className="pk-say rounded-lg p-2 text-xs">
          <p className="pk-say-label mb-1 font-black uppercase tracking-widest">Do Now</p>
          <p className="pk-say-text">{plan.doNow || "—"}</p>
        </div>
      </div>

      {plan.segments.length > 0 && (
        <div className="pk-timing pk-box avoid-break overflow-hidden">
          <div className="pk-timing-head pk-bar pk-ink-auto px-3 py-1 text-xs font-bold tracking-widest">
            RUN SHEET — {plan.durationMin} MINUTES
          </div>
          <table className="w-full border-collapse bg-white text-[10px]">
            <thead>
              <tr className="border-b border-gray-300 bg-gray-100 text-left">
                <th className="w-16 border-r border-gray-300 p-1">TIME</th>
                <th className="w-36 border-r border-gray-300 p-1">SEGMENT</th>
                <th className="w-12 border-r border-gray-300 p-1">WHO</th>
                <th className="p-1">WHAT HAPPENS</th>
              </tr>
            </thead>
            <tbody>
              {plan.segments.map((s, i) => (
                <tr key={i} className={`border-b border-gray-200 ${i % 2 ? "bg-gray-50" : ""}`}>
                  <td className="pk-timing-min border-r border-gray-200 p-1 font-bold">
                    {s.startMin}–{s.endMin}
                  </td>
                  <td className="border-r border-gray-200 p-1 font-bold">{s.title}</td>
                  <td className="border-r border-gray-200 p-1">{s.who}</td>
                  <td className="p-1">{s.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {plan.keyQuestions.length > 0 && (
        <div className="pk-box pk-box--pad avoid-break mt-3 rounded-xl">
          <p className="pk-section-label mb-1 text-xs font-black uppercase tracking-widest">Key Questions</p>
          <ol className="list-inside list-decimal text-xs">
            {plan.keyQuestions.map((q, i) => <li key={i}>{q}</li>)}
          </ol>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {plan.differentiation && (
          <div className="pk-box pk-box--pad rounded-lg">
            <p className="pk-section-label font-black uppercase tracking-widest">Differentiation</p>
            <p>{plan.differentiation}</p>
          </div>
        )}
        {plan.homework && (
          <div className="pk-box pk-box--pad rounded-lg">
            <p className="pk-section-label font-black uppercase tracking-widest">Homework</p>
            <p>{plan.homework}</p>
          </div>
        )}
      </div>

      <Footer text={`${kit.brand} · ${plan.series || kit.seriesLabel} · CLASS PLAN ${plan.lessonCode}`} />
    </div>
  );
}

// ── Vocabulary Set ───────────────────────────────────────────────────────────

function VocabSetPages({
  set, kit, accent, subj,
}: { set: VocabSet; kit: StyleKitConfig; accent: string; subj: (typeof SUBJECT_DEFS)[Subject] }) {
  // page 1 also carries the title block, anchor and intro, so it holds fewer
  // term cards than the continuation pages
  const FIRST_PAGE = 4;
  const PER_PAGE = 6;
  const pages: VocabSet["terms"][] = [];
  if (set.terms.length <= FIRST_PAGE) {
    pages.push(set.terms);
  } else {
    pages.push(set.terms.slice(0, FIRST_PAGE));
    for (let i = FIRST_PAGE; i < set.terms.length; i += PER_PAGE) {
      pages.push(set.terms.slice(i, i + PER_PAGE));
    }
  }
  if (pages.length === 0) pages.push([]);
  // practice gets its own sheet so students have room to write
  const practicePage = set.practice.length > 0 || set.quickFire.length > 0;

  return (
    <>
      {pages.map((terms, pi) => (
        <div key={pi} className="pk-page print-page">
          {pi === 0 ? (
            <>
              <div className="mb-3 flex items-center justify-between border-b-2 pb-2" style={{ borderColor: `${accent}66` }}>
                <span className="text-xs uppercase tracking-[3px] text-slate-600" style={monoFont}>
                  {kit.brand} · {subj.theme.trackLabel} · WORD BANK
                </span>
                <span className="px-3 py-1 text-sm font-black tracking-[2px] text-black"
                  style={{ background: kit.palette.warningYellow, ...monoFont }}>
                  {set.terms.length} TERMS
                </span>
              </div>
              <h1 className="mb-1 text-4xl leading-none text-slate-900" style={displayFont}>
                {set.title || "Vocabulary Set"}
              </h1>
              <p className="mb-3 text-xs uppercase tracking-wide text-slate-600" style={monoFont}>
                {set.series} {set.gradeBand ? `· ${set.gradeBand}` : ""}
              </p>
              <AnchorBox label={subj.anchorLabel} text={set.resolution} />
              {set.introduction && (
                <div className="avoid-break mb-3 rounded-lg border-2 border-black bg-white p-2 text-xs" style={monoFont}>
                  {set.introduction}
                </div>
              )}
            </>
          ) : (
            <Header title="WORD BANK" badge={`PAGE ${pi + 1}`} />
          )}

          <div className="grid grid-cols-2 gap-2">
            {terms.map((t, i) => (
              <div key={i} className="avoid-break rounded-xl border-4 border-black bg-white p-2.5"
                style={{ boxShadow: "3px 3px 0 #000" }}>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-black" style={{ color: accent, ...displayFont }}>
                    {t.term.toUpperCase()}
                  </span>
                  {t.partOfSpeech && (
                    <span className="text-[10px] italic text-slate-500">{t.partOfSpeech}</span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-gray-700">{t.definition}</p>
                {t.analogy && (
                  <p className="mt-1.5 rounded bg-yellow-50 p-1.5 text-[11px] text-gray-700">
                    <strong>Think of it like:</strong> {t.analogy}
                  </p>
                )}
                {t.exampleSentence && (
                  <p className="mt-1.5 border-l-4 pl-2 text-[11px] italic text-gray-700" style={{ borderColor: accent }}>
                    “{t.exampleSentence}”
                  </p>
                )}
                {t.commonError && (
                  <p className="mt-1.5 rounded bg-red-50 p-1.5 text-[10px] text-red-800">
                    <strong>Watch out:</strong> {t.commonError}
                  </p>
                )}
              </div>
            ))}
          </div>

          <Footer text={`${kit.brand} · ${set.series || kit.seriesLabel} · WORD BANK`} />
        </div>
      ))}

      {practicePage && (
        <div className="pk-page print-page">
          <Header title="PRACTICE" badge="USE THE WORD BANK" />

          {set.practice.length > 0 && (
            <div className="avoid-break mb-3 overflow-hidden rounded-xl border-4 border-black" style={{ boxShadow: "4px 4px 0 #000" }}>
              <div className="bg-black px-3 py-1 text-[11px] font-bold tracking-widest text-yellow-300" style={monoFont}>
                FILL IN THE BLANK
              </div>
              <div className="bg-white p-2">
                {set.practice.map((p, i) => (
                  <div key={i} className="flex items-start gap-2 border-b border-dashed border-gray-200 py-2 text-xs last:border-b-0">
                    <span className="font-black text-gray-500" style={monoFont}>{i + 1}.</span>
                    <span className="flex-1">{p.prompt}</span>
                    <span className="blank w-28 shrink-0">
                      <span className="answer-key text-[10px]">{p.expectedAnswer}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {set.quickFire.length > 0 && (
            <div className="avoid-break overflow-hidden rounded-xl border-4 border-black" style={{ boxShadow: "4px 4px 0 #000" }}>
              <div className="bg-black px-3 py-1 text-[11px] font-bold tracking-widest text-yellow-300" style={monoFont}>
                QUICK-FIRE — NO LOOKING BACK
              </div>
              <div className="bg-white p-2">
                {set.quickFire.map((p, i) => (
                  <div key={i} className="border-b border-dashed border-gray-200 py-2 text-xs last:border-b-0">
                    <p className="mb-1 font-bold text-gray-800">{i + 1}. {p.prompt}</p>
                    <div className="write-area write-area-sm" />
                    <span className="answer-key text-[10px] italic">{p.expectedAnswer}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Footer text={`${kit.brand} · ${set.series || kit.seriesLabel} · PRACTICE`} />
        </div>
      )}
    </>
  );
}

// ── Judge Ballot ─────────────────────────────────────────────────────────────

function JudgeBallotPages({
  ballot, kit, accent,
}: { ballot: JudgeBallot; kit: StyleKitConfig; accent: string }) {
  const totalPoints = ballot.criteria.reduce((n, c) => n + c.maxPoints, 0);
  return (
    <>
      <div className="pk-page print-page">
      <div className="mb-3 flex items-center justify-between border-b-2 pb-2" style={{ borderColor: `${accent}66` }}>
        <span className="text-xs uppercase tracking-[3px] text-slate-600" style={monoFont}>
          {kit.brand} · JUDGE BALLOT
        </span>
        <span className="px-3 py-1 text-sm font-black tracking-[2px] text-white"
          style={{ background: accent, ...monoFont }}>
          {ballot.format} {ballot.division}
        </span>
      </div>

      <h1 className="mb-2 text-3xl leading-none text-slate-900" style={displayFont}>
        {ballot.title || "Judge Ballot"}
      </h1>

      {/* round identification — judge fills these */}
      <div className="avoid-break mb-3 grid grid-cols-4 gap-2 text-[10px]">
        {["ROUND", "ROOM", "JUDGE", "DATE"].map((l) => (
          <div key={l}>
            <div className="font-black uppercase tracking-widest text-slate-600" style={monoFont}>{l}</div>
            <div className="h-6 border-b-2 border-slate-400" />
          </div>
        ))}
        <div className="col-span-2">
          <div className="font-black uppercase tracking-widest text-slate-600" style={monoFont}>PRO TEAM</div>
          <div className="h-6 border-b-2 border-slate-400" />
        </div>
        <div className="col-span-2">
          <div className="font-black uppercase tracking-widest text-slate-600" style={monoFont}>CON TEAM</div>
          <div className="h-6 border-b-2 border-slate-400" />
        </div>
      </div>

      <AnchorBox label="Resolution" text={ballot.resolution} />

      {ballot.criteria.length > 0 && (
        <div className="avoid-break mb-3 overflow-hidden rounded-xl border-4 border-black" style={{ boxShadow: "4px 4px 0 #000" }}>
          <div className="bg-black px-3 py-1 text-[11px] font-bold tracking-widest text-yellow-300" style={monoFont}>
            CRITERIA — SCORE EACH SIDE (TOTAL {totalPoints})
          </div>
          <table className="w-full border-collapse bg-white text-[10px]">
            <thead>
              <tr className="border-b border-gray-300 bg-gray-100 text-left">
                <th className="border-r border-gray-300 p-1">CRITERION</th>
                <th className="border-r border-gray-300 p-1">WHAT TO LOOK FOR</th>
                <th className="w-14 border-r border-gray-300 p-1 text-center">PRO</th>
                <th className="w-14 p-1 text-center">CON</th>
              </tr>
            </thead>
            <tbody>
              {ballot.criteria.map((c, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="border-r border-gray-200 p-1 font-bold">
                    {c.name} <span className="text-gray-500">/{c.maxPoints}</span>
                  </td>
                  <td className="border-r border-gray-200 p-1">{c.description}</td>
                  <td className="border-r border-gray-200 p-1"><div className="h-5 border-b border-dashed border-gray-400" /></td>
                  <td className="p-1"><div className="h-5 border-b border-dashed border-gray-400" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="avoid-break mb-3 rounded-lg border-2 p-2 text-[11px]" style={{ borderColor: accent, background: `${accent}0f` }}>
        <p className="font-black uppercase tracking-widest" style={{ color: accent, ...monoFont }}>
          Speaker points ({ballot.speakerPoints.min}–{ballot.speakerPoints.max})
        </p>
        {ballot.speakerPoints.guidance && <p className="mt-0.5 text-gray-700">{ballot.speakerPoints.guidance}</p>}
      </div>

      <Footer text={`${kit.brand} · ${ballot.format} BALLOT ${ballot.lessonCode} · SCORING`} accent={accent} />
      </div>

      {/* Page 2 — the written feedback, which needs real room to write */}
      <div className="pk-page print-page">
        <Header title="REASON FOR DECISION" badge="WRITE IN FULL SENTENCES" />

        {ballot.rfdPrompts.map((p, i) => (
          <div key={i} className="avoid-break mb-2">
            <p className="text-xs font-black text-gray-800">{p.label}</p>
            {p.hint && <p className="mb-1 text-[10px] italic text-gray-500">{p.hint}</p>}
            <div className={`write-area ${p.lines > 4 ? "write-area-lg" : p.lines > 2 ? "write-area-md" : "write-area-sm"}`} />
          </div>
        ))}

        {ballot.feedbackPrompts.length > 0 && (
          <div className="mb-2 mt-3 border-b-2 border-black pb-1 text-sm font-black uppercase tracking-widest" style={displayFont}>
            Feedback for the debaters
          </div>
        )}
        {ballot.feedbackPrompts.map((p, i) => (
          <div key={i} className="avoid-break mb-2">
            <p className="text-xs font-black text-gray-800">{p.label}</p>
            {p.hint && <p className="mb-1 text-[10px] italic text-gray-500">{p.hint}</p>}
            <div className={`write-area ${p.lines > 4 ? "write-area-lg" : p.lines > 2 ? "write-area-md" : "write-area-sm"}`} />
          </div>
        ))}

        <div className="avoid-break mt-auto flex items-center gap-4 rounded-lg border-4 border-black bg-white p-2">
          <span className="text-sm font-black uppercase tracking-widest" style={displayFont}>Winner:</span>
          <span className="text-sm font-bold" style={{ color: kit.palette.grassGreen }}>▢ PRO</span>
          <span className="text-sm font-bold" style={{ color: kit.palette.brickRed }}>▢ CON</span>
          {ballot.decisionRules && (
            <span className="ml-auto text-[10px] italic text-gray-600">{ballot.decisionRules}</span>
          )}
        </div>

        <Footer text={`${kit.brand} · ${ballot.format} BALLOT ${ballot.lessonCode} · DECISION`} accent={accent} />
      </div>
    </>
  );
}
