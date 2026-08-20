import { type ActivityKind, type LessonPack, countWords } from "./lesson-pack-schema";
import { RIGOR_LABELS, missingMechanics, requiredMechanics } from "./rigor";
import { attemptCycleIssues, attemptPages } from "./attempt-cycle";
import { findContrastIssues } from "./mono-contrast";
import { type Subject, subjectDef } from "./subjects";
import { DEFAULT_KIT_CONFIG, type StyleKitConfig } from "./style-kit";
import { type ClassPlan } from "./class-plan-schema";
import { type VocabSet } from "./vocab-set-schema";
import { type JudgeBallot } from "./judge-ballot-schema";
// Type-only: this is the list the checklist map must stay total over. Erased at
// runtime, so it cannot create an import cycle with content-types.
import type { ContentType } from "./content-types";
import {
  runClassPlanChecklist,
  runJudgeBallotChecklist,
  runVocabSetChecklist,
} from "./checklists-extra";

/**
 * Quality checklist — subject-aware.
 *
 * Structural enforcement of the non-negotiables: no fabricated citations,
 * mandatory scope limits wherever evidence is used, consistent anchor
 * (resolution / central question / writing focus) language, word-bank rules,
 * full-length packs. A pack cannot be submitted for review until every rule
 * passes.
 */

export interface ChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ChecklistResult {
  passed: boolean;
  items: ChecklistItem[];
}

/**
 * Words a STUDENT has to read on one page — teacher-only text (expected
 * answers, sort explanations, worked-example notes) excluded, because the
 * reading budget is about what lands in front of the class, not the key.
 */
export function studentReadWords(a: LessonPack["activities"][number]): number {
  const w = (s?: string) =>
    s ? s.trim().split(/\s+/).filter(Boolean).length : 0;
  return (
    w(a.instructions) +
    w(a.body) +
    w(a.scene?.setup) +
    (a.scene?.turns ?? []).reduce((n, t) => n + w(t.speaker) + w(t.line), 0) +
    w(a.scene?.twist) +
    a.steps.reduce((n, s) => n + w(s.text) + w(s.detail), 0) +
    w(a.compare?.leftLabel) +
    w(a.compare?.rightLabel) +
    (a.compare?.rows ?? []).reduce((n, r) => n + w(r.left) + w(r.right), 0) +
    a.callouts.reduce((n, c) => n + w(c.value) + w(c.label), 0) +
    a.sortItems.reduce((n, s) => n + w(s.statement), 0) +
    a.matchPairs.reduce((n, m) => n + w(m.left) + w(m.right), 0) +
    a.frames.reduce((n, f) => n + w(f.label) + w(f.starter), 0) +
    a.exampleLayers.reduce((n, l) => n + w(l.label) + w(l.text), 0) +
    // `guide` and `trap` print on the student copy, so they spend the reading
    // budget like any other line on the page. Counting them is what keeps the
    // coaching honest: it has to be worth the words it costs.
    a.prompts.reduce((n, p) => n + w(p.label) + w(p.guide) + w(p.trap), 0) +
    // Card jobs and pass conditions print on the student copy too.
    a.cardJobs.reduce((n, j) => n + w(j.job) + w(j.instruction), 0) +
    a.figures.reduce((n, f) => n + w(f.title) + w(f.caption) + w(f.exact) + f.stages.reduce((m, x) => m + w(x), 0), 0) +
    a.exampleLayers.reduce((n, l) => n + w(l.passesWhen), 0) +
    w(a.keyIdea) +
    w(a.whyItMatters) +
    w(a.standAndDeliver)
  );
}

/**
 * Words too common to prove a success criterion is really being taught. Without
 * this list a criterion matches on "the" and every check passes vacuously.
 */
const CRITERIA_STOPWORDS = new Set(
  ("the a an and or of to in on for with by from as at is are be been that this these those it its your you " +
    "their they we our can will not what how why when who whom which into onto over under about after before " +
    "then than them there here have has had do does did make makes made use uses used using able own")
    .split(" ")
);

const MIN_LIMIT_WORDS = 8;
const MIN_RUBRIC_BANDS = 3;

/**
 * Page kinds whose prompts must carry student-facing coaching, and page kinds
 * that owe two pieces of student work rather than one.
 *
 * Exported because `lib/ai.ts` builds the repair instruction from the same two
 * lists, and a gate that disagrees with its own repair is a build that loops:
 * the checklist fails a page, the repair fixes a different set of pages, and
 * the next validate pass fails it again. Same reason `lib/rigor.ts` owns its
 * mapping for all three consumers instead of restating it in each.
 */
export const COACHED_KINDS: ActivityKind[] = [
  "we-do",
  "scaffolded-build",
  "bridge",
  "independent-build",
  "exit-ticket",
];

export const HEAVY_PRODUCTION_KINDS: ActivityKind[] = [
  "we-do",
  "drill",
  "scaffolded-build",
  "independent-build",
  "exit-ticket",
];

/**
 * Run the right checklist for a material's content type. Every type is gated
 * before review; only the rules differ.
 */
/**
 * One checklist per content type, as a total map rather than a switch.
 *
 * The switch this replaces ended in `default: runChecklist(content as LessonPack)`,
 * so a content type added without a checklist of its own didn't fail loudly —
 * it got silently graded as a Lesson Pack. That matters because this is the
 * REVIEW GATE: `applyTransition` refuses to move a material into review until
 * the result passes, so a type checked against the wrong rules is a type whose
 * real rules nobody enforces. Phase 3 adds Reading Passage, Rubric and
 * Prompt + Model Response, so that trap was going to be sprung.
 *
 * Typed `Record<ContentType, …>`, this becomes a compile error instead: adding
 * an id to `CONTENT_TYPES` won't build until someone decides what checks it.
 */
const CHECKLIST_FOR: Record<
  ContentType,
  (content: never, subject: Subject, kit: StyleKitConfig, ctx: ChecklistContext) => ChecklistResult
> = {
  "lesson-pack": (c: LessonPack, subject, kit, ctx) => runChecklist(c, subject, kit, ctx),
  "class-plan": (c: ClassPlan, subject, kit) => runClassPlanChecklist(c, subject, kit),
  "vocabulary-set": (c: VocabSet, subject, kit) => runVocabSetChecklist(c, subject, kit),
  "judge-ballot": (c: JudgeBallot, subject, kit) => runJudgeBallotChecklist(c, subject, kit),
};

export function runChecklistFor(
  type: string,
  content: unknown,
  subject: Subject = "debate",
  kit: StyleKitConfig = DEFAULT_KIT_CONFIG,
  ctx: ChecklistContext = {}
): ChecklistResult {
  // `type` is a plain string because it arrives off a DB row, which may predate
  // any given type id. An unrecognised one falls back to the Lesson Pack rules —
  // the same behaviour as before, but now reached only by a genuinely unknown
  // row rather than by every type someone forgot to wire up.
  const run = CHECKLIST_FOR[type as ContentType] ?? CHECKLIST_FOR["lesson-pack"];
  return run(content as never, subject, kit, ctx);
}

/**
 * Collect the vocabulary taught by EARLIER lessons in the same series, for the
 * series-integrity check. "Earlier" matters: only the later lesson is at fault
 * for repeating a term, so L1 must not be flagged for a word L5 later reused.
 * Order is by lesson-code number (the curriculum order); when codes lack a
 * number we fall back to creation id (a pack can only copy one that existed).
 */
function codeNumber(code: string): number | null {
  const m = (code || "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export function earlierSiblingVocab(
  current: { id: number; lessonCode: string },
  siblings: { id: number; content: unknown }[]
): string[] {
  const cn = codeNumber(current.lessonCode);
  const terms: string[] = [];
  for (const s of siblings) {
    const pack = s.content as LessonPack;
    const sn = codeNumber(pack.lessonCode);
    const earlier =
      cn !== null && sn !== null ? sn < cn : s.id < current.id;
    if (!earlier) continue;
    for (const v of pack.vocabulary ?? []) if (v.term.trim()) terms.push(v.term.trim());
  }
  return terms;
}

/**
 * Structural thresholds come from the material's assigned Style Kit, so a
 * cohort's rules are set once by the founder rather than hardcoded here.
 */
/**
 * Optional cross-pack context. Supplied by callers that have DB access (the
 * review gate, the material page, the generation validate pass) so the checklist
 * can enforce series-level integrity — e.g. not re-teaching a sibling's word.
 */
export interface ChecklistContext {
  /** lower-cased vocabulary terms already taught by earlier lessons in the series */
  siblingVocab?: string[];
}

/**
 * How many DISTINCT pages cite each card, and which ones.
 *
 * Exported because the gate below and the auto-repair in `lib/ai.ts` both need
 * it and must agree: a gate that blocks on "used once" while the repair only
 * knows how to fix "used never" leaves the author stuck with a failing pack and
 * a repair pass that reports success.
 *
 * Word-bounded on purpose — "Card A" must not be satisfied by a page citing
 * Card AB, or a two-card deck passes on one card's mentions.
 */
/**
 * Pages a "say it out loud" box belongs on: the ones where a student has just
 * produced something they could deliver.
 *
 * Exported with `MAX_ORAL_BOXES` and `misplacedOralPages` because the gate and
 * the repair in `lib/ai.ts` must agree exactly. The repair strips the box from
 * pages that should not carry it — a data fix, no model call — and a repair
 * working from its own copy of this list would either miss a fault or delete a
 * box the checklist was happy with.
 */
export const ORAL_KINDS: readonly string[] = [
  "scaffolded-build",
  "independent-build",
  "sparring",
  "exit-ticket",
  "we-do",
];

/** Past about four, the box stops being an instruction and becomes a footer. */
export const MAX_ORAL_BOXES = 4;

/**
 * Indices of the pages whose `standAndDeliver` should be cleared: every box on
 * a page with nothing to deliver yet, then any surplus beyond the cap — keeping
 * the well-placed ones, which are the pages students have just written on.
 */
export function misplacedOralPages(pack: LessonPack): number[] {
  const carries = pack.activities
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.standAndDeliver?.trim());
  const misplaced = carries.filter(({ a }) => !ORAL_KINDS.includes(a.kind));
  const surplus = carries
    .filter(({ a }) => ORAL_KINDS.includes(a.kind))
    .slice(MAX_ORAL_BOXES);
  return [...new Set([...misplaced, ...surplus].map(({ i }) => i))].sort(
    (a, b) => a - b
  );
}

export function cardDeployment(
  pack: LessonPack
): { id: string; n: number; pages: number[] }[] {
  return pack.evidenceCards.map((c) => {
    const id = c.id.trim();
    const re = new RegExp(`Card\\s+${id}\\b`, "i");
    const pages = pack.activities
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => re.test(JSON.stringify({ ...a, designHtml: "" })))
      .map(({ i }) => i);
    return { id, n: pages.length, pages };
  });
}

export function runChecklist(
  pack: LessonPack,
  subject: Subject = "debate",
  kit: StyleKitConfig = DEFAULT_KIT_CONFIG,
  ctx: ChecklistContext = {}
): ChecklistResult {
  const def = subjectDef(subject);
  const PARAPHRASE_MAX_WORDS = kit.rules.paraphraseMaxWords;
  const MIN_VOCAB_TERMS = kit.rules.minVocabTerms;
  const MIN_SUCCESS_CRITERIA = kit.rules.minSuccessCriteria;
  const MIN_ACTIVITIES = kit.rules.minActivities;
  const items: ChecklistItem[] = [];
  const add = (id: string, label: string, passed: boolean, detail: string) =>
    items.push({ id, label, passed, detail });

  // ── Cover identity ──
  // The cover title is typed at setup and easy to leave blank; a pack whose
  // page 1 has no title is not printable, however good the inside pages are.
  const hasTitle = pack.title.trim().length > 0;
  add(
    "cover-title",
    "The cover has a lesson title",
    hasTitle,
    hasTitle
      ? `"${pack.title.trim()}"`
      : "Page 1 has no title — name the lesson before it goes out."
  );

  // ── Anchor consistency ──
  const hasAnchor = pack.resolution.trim().length > 0;
  add(
    "anchor-present",
    `${def.anchorLabel} is stated`,
    hasAnchor,
    hasAnchor
      ? `"${pack.resolution.trim()}"`
      : `The pack has no ${def.anchorLabel.toLowerCase()}. Every artifact in a unit must carry the same anchor language.`
  );

  // ── Evidence / source deck ──
  const cards = pack.evidenceCards;
  if (def.requiresEvidence) {
    add(
      "evidence-present",
      `${def.evidenceLabel} has at least one card`,
      cards.length > 0,
      cards.length > 0
        ? `${cards.length} card(s)`
        : `A ${def.label} lesson pack needs a ${def.evidenceLabel.toLowerCase()} — claims without sourced evidence are opinions.`
    );
  }
  if (cards.length > 0 || def.requiresEvidence) {
    const missingSource = cards.filter(
      (c) =>
        c.institution.trim() === "" ||
        c.year.trim() === "" ||
        c.publication.trim() === ""
    );
    add(
      "citation-fields",
      "Every card has institution, year, and publication",
      cards.length > 0 && missingSource.length === 0,
      missingSource.length === 0 && cards.length > 0
        ? "All cards fully sourced"
        : cards.length === 0
          ? "No cards yet."
          : `Card(s) ${missingSource.map((c) => c.id).join(", ")} missing source fields — citations are structural, never free-typed.`
    );

    const badYear = cards.filter((c) => !/^\d{4}$/.test(c.year.trim()));
    add(
      "citation-year",
      "Every card's year is a real 4-digit year",
      cards.length > 0 && badYear.length === 0,
      badYear.length === 0 && cards.length > 0
        ? "All years well-formed"
        : cards.length === 0
          ? "No cards yet."
          : `Card(s) ${badYear.map((c) => c.id).join(", ")} have malformed years.`
    );

    const longParaphrase = cards.filter(
      (c) => countWords(c.paraphrase) > PARAPHRASE_MAX_WORDS
    );
    const emptyParaphrase = cards.filter((c) => c.paraphrase.trim() === "");
    add(
      "paraphrase-length",
      `Every paraphrase is 1–${PARAPHRASE_MAX_WORDS} words`,
      cards.length > 0 &&
        longParaphrase.length === 0 &&
        emptyParaphrase.length === 0,
      longParaphrase.length === 0 && emptyParaphrase.length === 0 && cards.length > 0
        ? "All paraphrases within limit"
        : cards.length === 0
          ? "No cards yet."
          : [
              ...emptyParaphrase.map((c) => `Card ${c.id}: empty`),
              ...longParaphrase.map(
                (c) => `Card ${c.id}: ${countWords(c.paraphrase)} words`
              ),
            ].join("; ")
    );

    const weakLimit = cards.filter(
      (c) => countWords(c.limit) < MIN_LIMIT_WORDS
    );
    add(
      "scope-limits",
      "Every card has a real scope limit (what it CANNOT prove)",
      cards.length > 0 && weakLimit.length === 0,
      weakLimit.length === 0 && cards.length > 0
        ? "All cards carry limits"
        : cards.length === 0
          ? "No cards yet."
          : `Card(s) ${weakLimit.map((c) => c.id).join(", ")} have missing or token limits (need ≥${MIN_LIMIT_WORDS} words).`
    );

    const noTranslation = cards.filter((c) => c.translation.trim() === "");
    add(
      "translation",
      "Every card has a plain-English translation",
      cards.length > 0 && noTranslation.length === 0,
      noTranslation.length === 0 && cards.length > 0
        ? "All cards translated"
        : cards.length === 0
          ? "No cards yet."
          : `Card(s) ${noTranslation.map((c) => c.id).join(", ")} missing translations.`
    );
  }

  // ── Rubric (mandatory for Writing) ──
  if (def.requiresRubric) {
    const bands = pack.teacherGuide.rubric.filter(
      (b) => b.score.trim() !== "" && b.descriptor.trim() !== ""
    );
    add(
      "rubric",
      `Grading rubric has at least ${MIN_RUBRIC_BANDS} bands`,
      bands.length >= MIN_RUBRIC_BANDS,
      bands.length >= MIN_RUBRIC_BANDS
        ? `${bands.length} band(s)`
        : `${bands.length} complete band(s) — Writing students must see the rubric before drafting.`
    );
  }

  // ── Word bank rules ──
  add(
    "word-bank",
    `Vocabulary set has at least ${MIN_VOCAB_TERMS} terms`,
    pack.vocabulary.length >= MIN_VOCAB_TERMS,
    pack.vocabulary.length >= MIN_VOCAB_TERMS
      ? `${pack.vocabulary.length} terms`
      : `Only ${pack.vocabulary.length} term(s) — the word-bank rule requires ${MIN_VOCAB_TERMS}.`
  );
  const bareTerms = pack.vocabulary.filter((v) => v.definition.trim() === "");
  add(
    "word-bank-definitions",
    "Every vocabulary term has a definition",
    bareTerms.length === 0,
    bareTerms.length === 0
      ? "All terms defined"
      : `Undefined: ${bareTerms.map((v) => v.term || "(unnamed)").join(", ")}`
  );

  // ── Objectives ──
  add(
    "success-criteria",
    `At least ${MIN_SUCCESS_CRITERIA} success criteria ("I can…")`,
    pack.successCriteria.filter((s) => s.trim() !== "").length >=
      MIN_SUCCESS_CRITERIA,
    `${pack.successCriteria.filter((s) => s.trim() !== "").length} present`
  );

  // ── Full-length pack ──
  add(
    "activity-count",
    `At least ${MIN_ACTIVITIES} student activities (a full pack, not a worksheet)`,
    pack.activities.length >= MIN_ACTIVITIES,
    pack.activities.length >= MIN_ACTIVITIES
      ? `${pack.activities.length} activities`
      : `Only ${pack.activities.length} — a full lesson pack runs hook → instruction → modeled → guided → drills → builds → practice → exit ticket.`
  );

  // ── Answer key coverage ──
  const promptCount = pack.activities.reduce((n, a) => n + a.prompts.length, 0);
  const unanswered = pack.activities.flatMap((a) =>
    a.prompts.filter((p) => p.expectedAnswer.trim() === "")
  );
  add(
    "answer-key",
    "Every student prompt has an expected answer (feeds the answer key)",
    promptCount > 0 && unanswered.length === 0,
    promptCount === 0
      ? "No student prompts in the pack yet"
      : unanswered.length === 0
        ? `${promptCount} prompt(s), all keyed`
        : `${unanswered.length} of ${promptCount} prompt(s) missing expected answers.`
  );

  // ── Teacher pack ──
  const plan = pack.teacherGuide.timingPlan;
  // A provisional plan is the build's own placeholder, derived from the outline
  // so a part-built pack can already be printed and taught. It carries no
  // teacher moves, so it must never satisfy the gate — an abandoned build has to
  // show up here rather than pass as a finished pack.
  const provisionalPlan = plan.length > 0 && pack.teacherGuide.provisional;
  const planCoversDuration =
    plan.length > 0 &&
    !provisionalPlan &&
    plan[plan.length - 1].endMin >= pack.durationMin;
  add(
    "timing-plan",
    "Minute-by-minute plan covers the full lesson duration",
    planCoversDuration,
    plan.length === 0
      ? "No timing plan."
      : provisionalPlan
        ? `Still the provisional plan the build wrote from the outline — the teacher guide stage hasn't run.`
        : planCoversDuration
          ? `${plan.length} phases through minute ${plan[plan.length - 1].endMin}`
          : `Plan ends at minute ${plan[plan.length - 1].endMin} but the lesson is ${pack.durationMin} minutes.`
  );

  // ── Production pages must scaffold, not leave a blank prompt ──
  // (Test finding: exit-ticket + independent-build came back prompts-only.)
  // A page where students PRODUCE needs a visible support — a steps checklist or
  // sentence-frames — so novices aren't staring at an empty write-line.
  const PRODUCTION_KINDS = new Set(["independent-build", "exit-ticket"]);
  const hasScaffold = (a: LessonPack["activities"][number]) =>
    a.steps.length > 0 ||
    a.frames.length > 0 ||
    a.exampleLayers.length > 0 ||
    a.sortItems.length > 0 ||
    a.matchPairs.length > 0;
  const bareProduction = pack.activities.filter(
    (a) => PRODUCTION_KINDS.has(a.kind) && a.prompts.length > 0 && !hasScaffold(a)
  );
  if (pack.activities.some((a) => PRODUCTION_KINDS.has(a.kind))) {
    add(
      "production-scaffold",
      "Production & exit pages carry a scaffold (steps or frames)",
      bareProduction.length === 0,
      bareProduction.length === 0
        ? "All production pages scaffolded"
        : `${bareProduction
            .map((a) => a.title || a.kind)
            .join(", ")} — a bare prompt leaves novices with no support; add a steps checklist or frames.`
    );
  }

  // ── The rigor mechanics are present where they are required ──
  // The four mechanics exist to stop a drill going soft (see lib/rigor.ts), and
  // "the prompt asks for it" is not enough: a prompt rule is the first thing a
  // model drops on a long generation, and the resulting page still LOOKS
  // complete — a sparring page with a tick-box listener reads fine until a
  // coach runs it. So the requirement is a gate, page by page.
  {
    const soft = pack.activities
      .map((a) => ({ a, missing: missingMechanics(a) }))
      .filter((x) => x.missing.length > 0);
    const expected = pack.activities.filter(
      (a) => requiredMechanics(a.kind).length > 0
    );
    if (expected.length > 0) {
      add(
        "rigor-mechanics",
        "Sparring, build and exit pages carry their rigor mechanics",
        soft.length === 0,
        soft.length === 0
          ? `All ${expected.length} page(s) instrumented`
          : soft
              .map(
                (x) =>
                  `${x.a.title || x.a.kind} needs ${x.missing
                    .map((m) => RIGOR_LABELS[m])
                    .join(" + ")}`
              )
              .join("; ")
      );
    }
  }

  // ── The student page carries its own coaching ──
  // The gap this closes was the largest one measured against the founder's
  // benchmark: our packs contain MORE instructional intelligence than his and
  // print less of it, because the model answer, the warning and the coaching
  // all shared `expectedAnswer` — which is teacher-only. A page then reaches a
  // student as a label and a blank, and the only way to run the lesson is for
  // the coach to narrate the key aloud page by page.
  //
  // Scoped to the pages where a student PRODUCES something rather than checks
  // something: on a hook or a vocabulary drill the prompt is a quick recall and
  // a coaching line would be clutter, but nobody writes a full argument well
  // from a bare instruction. Same rule of thumb as lib/rigor.ts — require it
  // where its absence lets a student produce the right-looking artifact without
  // doing the thinking.
  {
    const owed = pack.activities.filter(
      (a) => COACHED_KINDS.includes(a.kind) && a.prompts.length > 0
    );
    const bare = owed.filter((a) => a.prompts.some((p) => !p.guide?.trim()));
    if (owed.length > 0) {
      add(
        "student-coaching",
        "Production pages tell the student what goes in the box",
        bare.length === 0,
        bare.length === 0
          ? `All ${owed.length} production page(s) carry student-facing guidance`
          : `${bare
              .map((a) => a.title || a.kind)
              .join(", ")} — every prompt on these pages needs a one-line \`guide\` naming the MOVE (not the answer), printed next to the box. The expected answer stays the teacher's key.`
      );
    }
  }

  // ── A figure that rounds must print the number it rounded ──
  // The founder's habit, and the one worth enforcing above all the others in
  // his graphics: the pictogram says 4 of 100 and 12 of 100, and the line
  // underneath says "Exact: 4.4% measured; 11.8% estimated". A pack that
  // simplifies a number for a picture and never states the real one is teaching
  // the exact move the lesson exists to stop — quiet rounding is how a debater
  // gets caught, and a student learns the habit from the page before they learn
  // it from the rule.
  //
  // Only fires where the drawing ACTUALLY rounds. A four-stage process flow
  // rounds nothing and owes nothing.
  {
    const rounds = (f: LessonPack["activities"][number]["figures"][number]) =>
      f.kind === "unit-chart" || f.kind === "ratio";
    const owed: string[] = [];
    for (const a of pack.activities) {
      for (const f of a.figures) {
        if (rounds(f) && !f.exact.trim())
          owed.push(`${a.title || a.kind}: ${f.title || f.kind}`);
      }
    }
    if (pack.activities.some((a) => a.figures.length > 0)) {
      add(
        "figures-state-the-exact",
        "A figure that rounds a number also prints the real one",
        owed.length === 0,
        owed.length === 0
          ? `${pack.activities.reduce((n, a) => n + a.figures.length, 0)} figure(s), each honest about what it rounded`
          : `${owed.slice(0, 3).join("; ")} — the drawing simplifies a number and nothing says what it really was. Fill \`exact\`.`
      );

      // A figure is evidence, and evidence carries its source. Same rule the
      // cards live under; a chart is not exempt because it is a picture.
      const unsourced = pack.activities.flatMap((a) =>
        a.figures.filter((f) => !f.source.trim()).map((f) => `${a.title || a.kind}: ${f.title || f.kind}`)
      );
      add(
        "figures-sourced",
        "Every figure names where its numbers came from",
        unsourced.length === 0,
        unsourced.length === 0
          ? "Figures are attributed"
          : `${unsourced.slice(0, 3).join("; ")} — a chart with no source is an unattributed claim that happens to be drawn.`
      );
    }
  }

  // ── A long pack states what to drop when the room runs behind ──
  // Only fires on packs long enough for the problem to be real. Every class
  // runs behind eventually, and with no cut path the teacher improvises under
  // time pressure — at which point the thing that gets cut is whatever sits at
  // the END, which is the exit ticket, the one page the lesson exists to reach.
  //
  // The exit ticket may never be the droppable one, for the same reason.
  {
    const LONG = 12;
    if (pack.activities.length >= LONG) {
      const optional = pack.activities.filter((a) => a.optional);
      const badly = optional.filter((a) => a.kind === "exit-ticket");
      const ok = optional.length > 0 && badly.length === 0;
      add(
        "cut-path",
        `A ${LONG}+ page pack says which pages can be dropped`,
        ok,
        badly.length > 0
          ? `${badly.map((a) => a.title || a.kind).join(", ")} is marked droppable — the exit ticket is the page the lesson exists to reach, and it is the one a teacher running late will cut first if you let them.`
          : optional.length > 0
            ? `${optional.length} page(s) marked "if time"`
            : `${pack.activities.length} pages and nothing marked droppable. A coach at minute sixty will cut whatever is last, which is the assessment. Mark the extension pages \`optional\`.`
      );
    }
  }

  // ── The practice topic hands over, or it is a disconnected worksheet ──
  //
  // This is the rule that lets a pack teach a new skill on an easy topic first,
  // and it is deliberately STRICTER than the "one anchor throughout" rule it
  // replaces rather than looser. The old rule bought coherence by forbidding a
  // second topic. This buys it by requiring the handover: a practice page owes
  // a LATER page that picks the same skill back up on the anchor. A practice
  // topic with no transfer is exactly the disconnected worksheet the original
  // rule was aimed at — so that is now the case that fails.
  //
  // Silent on the packs that need no practice topic, which is most of them: a
  // lesson introducing no new form should not invent one, and doing so just
  // costs a page.
  {
    const hasTopic = Boolean(pack.practiceTopic?.trim());
    const practiceIdx = pack.activities
      .map((a, i) => (a.runsOn === "practice" ? i : -1))
      .filter((i) => i >= 0);
    const anchorIdx = pack.activities
      .map((a, i) => (a.runsOn !== "practice" ? i : -1))
      .filter((i) => i >= 0);

    // A page claiming a practice topic the pack does not have.
    if (!hasTopic && practiceIdx.length > 0) {
      add(
        "practice-topic-declared",
        "Pages running on a practice topic have one to run on",
        false,
        `${practiceIdx.length} page(s) are marked as running on a practice topic, but the pack's \`practiceTopic\` is empty — so nothing tells the student what they are arguing about.`
      );
    }

    if (hasTopic) {
      const problems: string[] = [];
      if (practiceIdx.length === 0)
        problems.push("no page actually runs on it");
      if (anchorIdx.length === 0)
        problems.push("no page runs on the real anchor, so the skill is never transferred");
      // The handover must come AFTER the practice, not before it. A pack that
      // does the anchor work first and the easy topic afterwards has the
      // sequence backwards: the point is to hold content trivial while the form
      // is new, then hold the form fixed while the content gets hard.
      if (practiceIdx.length > 0 && anchorIdx.length > 0) {
        const lastPractice = Math.max(...practiceIdx);
        const anchorAfter = anchorIdx.filter((i) => i > lastPractice);
        if (anchorAfter.length === 0)
          problems.push(
            "every anchor page comes before the practice pages — the transfer runs backwards"
          );
      }
      add(
        "practice-transfers",
        "The practice topic hands the skill over to the anchor",
        problems.length === 0,
        problems.length === 0
          ? `Skill taught on "${pack.practiceTopic.trim().slice(0, 40)}" across ${practiceIdx.length} page(s), then transferred to the anchor`
          : `${problems.join("; ")}. A practice topic that never hands over is the disconnected worksheet the one-anchor rule exists to prevent.`
      );
    }
  }

  // ── Cards carry named jobs, and the jobs point at real cards ──
  // The founder's evidence pages hand each card ONE job — speech line, limit,
  // weigh — rather than printing three cards and hoping. Two things can go
  // wrong and both are silent: a job can name a card that is not in the deck
  // (a dangling reference nobody notices until a student looks for card D and
  // there are three cards), and an evidence-study page can carry no jobs at
  // all, which is the "printed and hoped" failure this whole block exists to
  // stop.
  {
    const ids = new Set(pack.evidenceCards.map((c) => c.id.trim().toUpperCase()));
    const dangling: string[] = [];
    for (const a of pack.activities) {
      for (const j of a.cardJobs) {
        const id = j.cardId.trim().toUpperCase();
        if (!id || !ids.has(id)) dangling.push(`${a.title || a.kind} → "${j.cardId || "(blank)"}"`);
      }
    }
    if (pack.activities.some((a) => a.cardJobs.length > 0)) {
      add(
        "card-jobs-resolve",
        "Every card job points at a card that exists in the deck",
        dangling.length === 0,
        dangling.length === 0
          ? `${pack.activities.reduce((n, a) => n + a.cardJobs.length, 0)} job(s), all resolving`
          : `${dangling.slice(0, 4).join("; ")} — a job naming a card that is not in the deck sends a student looking for evidence that was never printed.`
      );
    }

    const studies = pack.activities.filter((a) => a.kind === "evidence-study");
    if (studies.length > 0 && pack.evidenceCards.length > 0) {
      const jobless = studies.filter((a) => a.cardJobs.length === 0);
      add(
        "cards-have-jobs",
        "Evidence pages give each card a job, not just a paraphrase to read",
        jobless.length === 0,
        jobless.length === 0
          ? `All ${studies.length} evidence page(s) assign work per card`
          : `${jobless.map((a) => a.title || a.kind).join(", ")} — cards printed with nothing to do with them are a reference deck, not an activity. Assign one job per card (a speech line, the scope limit, or why it should decide the round).`
      );
    }
  }

  // ── The exit ticket carries an instrument the student can actually use ──
  // Not a rubric in the teacher guide and not a free-text reflection. The three
  // sub-checks are the three ways this block goes soft:
  //   no rows      → nothing is being judged
  //   no errors    → the student is asked to diagnose from an open field, which
  //                  at this level produces "I did okay"
  //   no repairs   → they are told what went wrong and left there, which is the
  //                  difference between an assessment and a diagnosis
  {
    const exits = pack.activities.filter((a) => a.kind === "exit-ticket");
    if (exits.length > 0) {
      const bad = exits
        .map((a) => {
          const b = a.exitBallot;
          const miss: string[] = [];
          if ((b?.rows?.length ?? 0) < 3) miss.push("3+ ballot rows");
          if ((b?.errors?.length ?? 0) < 3) miss.push("3+ named errors");
          if ((b?.repairs?.length ?? 0) < 2) miss.push("2+ repair moves");
          if (!b?.product?.trim()) miss.push("what the student leaves with");
          return miss.length ? `${a.title || a.kind} needs ${miss.join(", ")}` : "";
        })
        .filter(Boolean);
      add(
        "exit-ballot",
        "The exit ticket carries a ballot, a named error list and a repair move",
        bad.length === 0,
        bad.length === 0
          ? "Students leave with a diagnosis and a rewrite, not a score"
          : `${bad.join("; ")} — a rubric in the teacher guide is not an instrument the student can use.`
      );

      // And the rows must be criteria the pack actually taught. A ballot that
      // introduces new standards at the end is assessing something nobody was
      // shown — the exact "assessed but not taught" failure the rubric already
      // warns about, arriving through a different door.
      const taught = [
        ...pack.successCriteria,
        ...pack.activities.flatMap((a) => [
          a.instructions,
          a.keyIdea,
          ...a.prompts.map((p) => p.label),
          ...a.exampleLayers.map((l) => `${l.label} ${l.note}`),
          ...a.steps.map((s) => `${s.text} ${s.detail}`),
        ]),
      ]
        .join(" ")
        .toLowerCase();
      const orphan = exits.flatMap((a) =>
        (a.exitBallot?.rows ?? [])
          .filter((r) => {
            const words = r.criterion
              .toLowerCase()
              .split(/[^a-z]+/)
              .filter((w) => w.length > 3 && !CRITERIA_STOPWORDS.has(w));
            // One substantive word in common is a low bar deliberately: the
            // rule is meant to catch a ballot written from scratch, not to
            // police paraphrase.
            return words.length > 0 && !words.some((w) => taught.includes(w));
          })
          .map((r) => r.criterion)
      );
      add(
        "ballot-tests-what-was-taught",
        "Every ballot row judges something the pack taught",
        orphan.length === 0,
        orphan.length === 0
          ? "Ballot criteria trace back to the lesson"
          : `${orphan.slice(0, 3).join("; ")} — nothing earlier in the pack teaches this, so the exit ticket is judging a standard the student never saw.`
      );
    }
  }

  // ── Every page tells the student why it exists ──
  // One or two sentences, and the duplicate check is the point of the rule
  // rather than a nicety. Asked for a reason to care on fourteen pages, the
  // cheapest thing to write is the same reason fourteen times — and a generic
  // one actively teaches that "why am I doing this" has a boilerplate answer.
  // The founder's pack carries one on every sheet and no two are alike.
  if (pack.activities.length > 0) {
    const missing = pack.activities.filter((a) => !a.whyItMatters?.trim());
    const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const a of pack.activities) {
      const w = a.whyItMatters?.trim();
      if (!w) continue;
      const k = norm(w);
      if (seen.has(k)) dupes.push(`${a.title || a.kind} repeats ${seen.get(k)}`);
      else seen.set(k, a.title || a.kind);
    }
    add(
      "why-this-page",
      "Every page says why it exists, in the student's own terms",
      missing.length === 0 && dupes.length === 0,
      missing.length === 0 && dupes.length === 0
        ? `All ${pack.activities.length} pages carry a distinct reason to care`
        : [
            missing.length
              ? `${missing.length} page(s) give no reason: ${missing.slice(0, 3).map((a) => a.title || a.kind).join(", ")}${missing.length > 3 ? "…" : ""}`
              : "",
            dupes.length ? `Repeated: ${dupes.slice(0, 2).join("; ")}` : "",
          ]
            .filter(Boolean)
            .join(" · ")
    );
  }

  // ── Coaching that is really a second answer key ──
  // The failure mode of the rule above, and the reason it is worth its own
  // check: asked for student guidance next to a box that already has an
  // expected answer, the cheapest thing to write is a shortened copy of that
  // answer. That hands the student the result and teaches nothing, and it is
  // invisible in review because the page LOOKS well scaffolded.
  //
  // Length is the detectable proxy. A `guide` naming a move is short; one that
  // has started reciting the answer runs long, and a `trap` generic enough to
  // fit any page ("be specific", "do not be vague") teaches nothing either.
  {
    const GUIDE_MAX = 22;
    const GENERIC = /^(be |do not be |don'?t be |avoid being )?(too )?(specific|vague|general|clear|detailed|brief|thorough|careful)\b/i;
    const bloated: string[] = [];
    for (const a of pack.activities) {
      for (const p of a.prompts) {
        const g = p.guide?.trim() ?? "";
        const t = p.trap?.trim() ?? "";
        const gWords = g ? g.split(/\s+/).length : 0;
        const tWords = t ? t.split(/\s+/).length : 0;
        if (gWords > GUIDE_MAX)
          bloated.push(`${a.title || a.kind}: guide runs ${gWords} words`);
        else if (tWords > GUIDE_MAX)
          bloated.push(`${a.title || a.kind}: trap runs ${tWords} words`);
        else if (t && GENERIC.test(t))
          bloated.push(`${a.title || a.kind}: trap is generic ("${t.slice(0, 40)}")`);
      }
    }
    if (pack.activities.some((a) => a.prompts.some((p) => p.guide?.trim() || p.trap?.trim()))) {
      add(
        "coaching-is-not-the-key",
        `Student coaching stays a one-line move, not a copy of the answer`,
        bloated.length === 0,
        bloated.length === 0
          ? "Guidance lines are short and specific to their page"
          : `${bloated.slice(0, 4).join("; ")}${bloated.length > 4 ? `, +${bloated.length - 4} more` : ""} — keep each under ${GUIDE_MAX} words and name the move, not the answer. A trap that would fit any page should be deleted.`
      );
    }
  }

  // ── The attempt → consolidation pair ──
  // Only gated once a pack HAS an attempt page: attempt-first is right for
  // concepts and wrong for conventions, so a pack of procedural pages legitimately
  // carries none. What is never acceptable is half a pair — see lib/attempt-cycle.ts.
  {
    const cycles = attemptPages(pack.activities);
    if (cycles.length > 0) {
      const issues = attemptCycleIssues(pack.activities);
      add(
        "attempt-consolidation",
        "Every attempt-before-teaching page is resolved by a later one",
        issues.length === 0,
        issues.length === 0
          ? `${cycles.length} attempt page(s), each consolidated`
          : issues.map((i) => `p${i.page} ${i.title} ${i.problem}`).join("; ")
      );
    }
  }

  // ── Citation hygiene: a page may only name a card the deck actually holds ──
  // (Test finding on the elite pack: keys cited Card B and Card D for claims
  // those cards don't make. Misuse needs the QA pass to judge, but an ID that
  // simply doesn't exist is catchable here, for free.)
  if (pack.evidenceCards.length > 0) {
    const known = new Set(pack.evidenceCards.map((c) => c.id.trim().toUpperCase()));
    const ghosts = new Map<string, string[]>();
    for (const a of pack.activities) {
      const text = JSON.stringify({ ...a, designHtml: "" });
      // Case-sensitive and tightly bounded on purpose: "the card is clear" and
      // "card and deck" are prose, not citations. Only "Card A" / "Card B2" /
      // "Card 3" — a capital C and an ID-shaped token — counts as a reference.
      for (const m of text.matchAll(/\bCard\s+([A-Z]\d?|\d{1,2})\b/g)) {
        const id = m[1].toUpperCase();
        if (known.has(id)) continue;
        const list = ghosts.get(id) ?? [];
        if (!list.includes(a.title)) list.push(a.title);
        ghosts.set(id, list);
      }
    }
    add(
      "citation-ids-exist",
      "Pages cite only cards that exist in the deck",
      ghosts.size === 0,
      ghosts.size === 0
        ? `All card references resolve (${[...known].join(", ")})`
        : [...ghosts]
            .map(([id, where]) => `Card ${id} (on ${where.join(", ")}) is not in the deck`)
            .join("; ")
    );
  }

  // ── No placeholder text ──
  // (Test finding: a modeled page shipped with keyIdea ":" — a field the model
  // opened and never filled. It renders as an empty box on a printed page.)
  const PLACEHOLDER = /^[\s:;.,\-–—_·•*"'`()[\]{}]*$|^(tbd|todo|n\/?a|xxx+|lorem)\b/i;
  const stubs: string[] = [];
  for (const a of pack.activities) {
    const fields: [string, string][] = [
      ["keyIdea", a.keyIdea],
      ["instructions", a.instructions],
      ["standAndDeliver", a.standAndDeliver],
      ...a.prompts.map(
        (p, i) => [`prompt ${i + 1} answer`, p.expectedAnswer] as [string, string]
      ),
    ];
    for (const [name, value] of fields) {
      // an untouched empty field is fine — a field with only punctuation is not
      if (value.trim() !== "" && PLACEHOLDER.test(value)) {
        stubs.push(`${a.title || a.kind}: ${name} = "${value.trim()}"`);
      }
    }
  }
  add(
    "no-placeholders",
    "No half-written or placeholder fields",
    stubs.length === 0,
    stubs.length === 0
      ? "Every filled field carries real content"
      : `${stubs.join(" · ")} — prints as an empty box; fill it or clear it.`
  );

  // ── A design must not eat the page it is printed on ──
  // How many blocks fit a sheet is computed from the BASE theme's spacing, and
  // the printer can only shrink a page ~15% before the type stops being
  // readable. A stylesheet that inflates the masthead or adds margin to every
  // block spends that headroom on ornament and pushes content off the paper —
  // measured on a real generated design, 14 of 26 sheets overflowed.
  if (pack.designCss) {
    const greedy: string[] = [];
    // min-height on a content block is the outright disallowed one: it removes
    // the fit pass's ability to recover the page at all.
    if (/\.pk-(prompt|key|say|instructions|scene|judge)[^{]*\{[^}]*min-height/i.test(pack.designCss)) {
      greedy.push("a min-height on a content block");
    }
    // padding over ~24px on a block is roughly double the base and compounds
    // across the six-to-eight blocks a page carries.
    const fatPad = [...pack.designCss.matchAll(
      /\.pk-(prompt|key|say|instructions|judge)\b[^{]*\{([^}]*)\}/gi
    )].filter(([, , body]) => {
      const m = body.match(/padding:\s*(\d+(?:\.\d+)?)px/i);
      return m ? Number(m[1]) > 24 : false;
    });
    if (fatPad.length > 0) greedy.push(`${fatPad.length} block(s) padded over 24px`);

    add(
      "design-space-budget",
      "Design leaves room for the content",
      greedy.length === 0,
      greedy.length === 0
        ? "No spacing rule that would push pages off the sheet"
        : `${greedy.join("; ")} — chrome comes out of the content's height, so pages overflow. Re-run "Design this pack".`
    );
  }

  // ── Page proportions ──
  // Measured against the academy's own packs: inside-page titles run 23–25px
  // against 13px body, roughly 2x. A generated design set --pk-title to 46px,
  // which pushed every masthead to 140px and shoved the content down the sheet.
  if (pack.designCss) {
    const num = (token: string) => {
      const m = pack.designCss.match(
        new RegExp(`${token}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, "i")
      );
      return m ? Number(m[1]) : null;
    };
    const title = num("--pk-title");
    const text = num("--pk-text");
    const oversized = title !== null && title > 32;
    const ratio = title && text ? title / text : null;
    add(
      "design-type-scale",
      "Page titles are sized for a worksheet, not a poster",
      !oversized && (ratio === null || ratio <= 3),
      oversized
        ? `--pk-title is ${title}px. Inside-page titles should be 24–28px (the house scale is ~2x the body); only the cover goes large. At this size the masthead alone eats the top of every sheet.`
        : ratio && ratio > 3
          ? `Title is ${ratio.toFixed(1)}x the body text — the house scale is about 2x. Get contrast from weight and tracking, not size.`
          : title
            ? `Title ${title}px${text ? ` on ${text}px body` : ""} — in scale`
            : "Type scale left at the theme defaults"
    );
  }

  // ── The pack must survive the photocopier ──
  // A pairing that reads on screen can print as grey-on-grey. WCAG contrast is
  // a luminance ratio, so it doubles as a black-and-white print check.
  if (pack.designCss) {
    const issues = findContrastIssues(pack.designCss);
    add(
      "design-mono-safe",
      "Design prints legibly in black and white",
      issues.length === 0,
      issues.length === 0
        ? "Every text/background pair in the design system clears WCAG AA"
        : `${issues
            .slice(0, 4)
            .map(
              (i) =>
                `${i.selector} (${i.color} on ${i.background}, ${i.ratio}:1)`
            )
            .join("; ")}${issues.length > 4 ? ` +${issues.length - 4} more` : ""} — too low to read on a mono printer. Re-run "Design this pack".`
    );
  }

  // ── The arc has to be a whole lesson ──
  // Gradual release is the pack's core promise: model it, practise it together,
  // then have them do it alone and prove it. A pack missing one of those beats
  // is not a lesson however good its pages are.
  if (pack.activities.length > 0) {
    const kinds = new Set(pack.activities.map((a) => a.kind));
    const BEATS: [LessonPack["activities"][number]["kind"], string][] = [
      ["hook", "a hook"],
      ["i-do", "a modelled example (I-do)"],
      ["we-do", "guided practice (We-do)"],
      ["independent-build", "independent work"],
      ["exit-ticket", "an exit ticket"],
    ];
    const missing = BEATS.filter(([k]) => !kinds.has(k));
    add(
      "lesson-arc",
      "The lesson runs a full arc: model → guided → independent → assess",
      missing.length === 0,
      missing.length === 0
        ? `${kinds.size} distinct page types across the arc`
        : `Missing ${missing.map(([, label]) => label).join(", ")} — without it students never ${missing.some(([k]) => k === "exit-ticket") ? "prove they learned today's skill" : "see the skill performed before doing it"}.`
    );
  }

  // ── Success criteria must be taught AND assessed ──
  // The cover promises "by the end of today I can…"; these check the pack keeps
  // that promise. Matching is on content words, so a criterion phrased in the
  // pack's own vocabulary passes and only a genuinely orphaned one fails.
  if (pack.successCriteria.length > 0 && pack.activities.length > 0) {
    const body = (list: LessonPack["activities"]) =>
      JSON.stringify(list.map((a) => ({ ...a, designHtml: "" }))).toLowerCase();
    const packText = body(pack.activities);
    const exitText = body(pack.activities.filter((a) => a.kind === "exit-ticket"));
    const contentWords = (s: string) =>
      [...new Set(s.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [])].filter(
        (word) => !CRITERIA_STOPWORDS.has(word)
      );

    const untaught = pack.successCriteria.filter((c) => {
      const words = contentWords(c);
      return words.length > 0 && !words.some((word) => packText.includes(word));
    });
    add(
      "criteria-taught",
      "Every success criterion is actually taught in the pages",
      untaught.length === 0,
      untaught.length === 0
        ? `All ${pack.successCriteria.length} criteria appear in the lesson`
        : `Nothing in the pack works on: ${untaught.map((c) => `"${c}"`).join("; ")} — promise it on the cover or teach it, not neither.`
    );

    if (exitText.length > 2) {
      const unassessed = pack.successCriteria.filter((c) => {
        const words = contentWords(c);
        return words.length > 0 && !words.some((word) => exitText.includes(word));
      });
      add(
        "criteria-assessed",
        "The exit ticket assesses the criteria the cover promised",
        unassessed.length === 0,
        unassessed.length === 0
          ? "Every criterion is touched by the exit ticket"
          : `The exit ticket never tests: ${unassessed.map((c) => `"${c}"`).join("; ")} — assess what you promised, or drop the promise.`
      );
    }
  }

  // ── Words are taught to be used ──
  if (pack.vocabulary.length > 0 && pack.activities.length > 0) {
    const text = JSON.stringify(
      pack.activities.map((a) => ({ ...a, designHtml: "" }))
    ).toLowerCase();
    const idle = pack.vocabulary.filter(
      (v) => v.term.trim() && !text.includes(v.term.trim().toLowerCase())
    );
    add(
      "vocab-used",
      "Every word-bank term is used on a page, not just defined",
      idle.length === 0,
      idle.length === 0
        ? `All ${pack.vocabulary.length} terms are put to work`
        : `${idle.map((v) => v.term).join(", ")} — defined and then never used again; a glossary is not teaching.`
    );
  }

  // ── A scene is a picture, not a paragraph ──
  if (pack.activities.length > 0) {
    const LINE_CAP = 35;
    const long = pack.activities.flatMap((a) =>
      (a.scene?.turns ?? [])
        .filter((t) => countWords(t.line) > LINE_CAP)
        .map((t) => `${a.title || a.kind} (${countWords(t.line)} words)`)
    );
    add(
      "scene-lines-short",
      "Dialogue lines stay speakable, never paragraphs",
      long.length === 0,
      long.length === 0
        ? "Every scene line is short enough to read aloud"
        : `${long.join(", ")} — a scene is a picture of the idea; split or cut the line.`
    );
  }

  // ── Page identity ──
  const titles = pack.activities.map((a) => a.title.trim()).filter(Boolean);
  const dupeTitles = [...new Set(titles.filter((t, i) => titles.indexOf(t) !== i))];
  if (titles.length > 0) {
    add(
      "page-titles-unique",
      "No two pages share a title",
      dupeTitles.length === 0,
      dupeTitles.length === 0
        ? `${titles.length} distinct page titles`
        : `Repeated: ${dupeTitles.join(", ")} — a teacher calling out "turn to X" needs one page to mean one thing.`
    );
  }

  // ── The clock has to add up ──
  if (pack.activities.length > 0 && pack.durationMin > 0) {
    const planned = pack.activities.reduce((n, a) => n + (a.durationMin || 0), 0);
    add(
      "duration-adds-up",
      "Page durations sum to the lesson length",
      planned === pack.durationMin,
      planned === pack.durationMin
        ? `${planned} min across ${pack.activities.length} pages`
        : `Pages total ${planned} min but the lesson is ${pack.durationMin} min — the teacher's clock is ${planned > pack.durationMin ? "over" : "under"} by ${Math.abs(planned - pack.durationMin)}.`
    );
  }

  // ── Every card must be WORKED, not just printed ──
  //
  // The deck is small on purpose, so each card has to earn its page. A card
  // cited once has been printed, not taught: the student reads it and never
  // does anything with it. The rule the generator is given is "every card used
  // on at least TWO pages, and the two strongest returned to three or four
  // times", and this counts DISTINCT pages so it can actually check that —
  // the old version flattened every activity into one string and asked only
  // whether the id appeared anywhere, which a single mention satisfied.
  if (pack.evidenceCards.length > 0 && pack.activities.length > 0) {
    const uses = cardDeployment(pack);
    const never = uses.filter((u) => u.n === 0);
    const once = uses.filter((u) => u.n === 1);
    const worked = uses.filter((u) => u.n >= 3).length;

    add(
      "evidence-used",
      "Every card is worked on at least two pages, not just printed",
      never.length === 0 && once.length === 0,
      never.length === 0 && once.length === 0
        ? `All ${uses.length} cards deployed on 2+ pages (${worked} returned to 3+ times)`
        : [
            never.length > 0
              ? `Card(s) ${never.map((u) => u.id).join(", ")} are never used in an activity — build them into a page or cut them.`
              : "",
            once.length > 0
              ? `Card(s) ${once.map((u) => u.id).join(", ")} appear on only one page — a card used once has been printed, not taught. Deploy it again where students apply it, weigh it, or find its limit.`
              : "",
          ]
            .filter(Boolean)
            .join(" ")
    );
  }

  // ── What makes a card evidence rather than a summary ──
  // The academy's own elite packs card every source the way a debater uses it:
  // a named event, a verbatim quotation they read out, and the line they say to
  // the judge. A deck of paraphrases is revision notes; this is the difference
  // the founder noticed between our output and theirs.
  if (pack.evidenceCards.length > 0) {
    const noQuote = pack.evidenceCards.filter((c) => !c.quote?.trim());
    add(
      "cards-quoted",
      "Every card carries a verbatim quotation to read out",
      noQuote.length === 0,
      noQuote.length === 0
        ? `All ${pack.evidenceCards.length} cards are quoted`
        : `Card(s) ${noQuote.map((c) => c.id).join(", ")} have no quotation — a paraphrase is a revision note, not evidence a student can read in a round.`
    );

    const noSay = pack.evidenceCards.filter(
      (c) => !c.roundApplication?.trim()
    );
    add(
      "cards-deployable",
      "Every card says how it is deployed to the judge",
      noSay.length === 0,
      noSay.length === 0
        ? `All ${pack.evidenceCards.length} cards carry a judge-facing line`
        : `Card(s) ${noSay.map((c) => c.id).join(", ")} have no "Judge, …" application — students are left to invent the deployment themselves.`
    );
  }

  // ── Can a student argue EITHER side? ──
  // A debater is assigned a side minutes before the round, so a pack that only
  // builds one case teaches half the lesson. Two rules: wherever chains appear
  // they come as a matched pair, and a DEBATE pack has to carry them somewhere.
  if (pack.activities.length > 0) {
    const paired = (a: (typeof pack.activities)[number]) => {
      const ch = a.argumentChains ?? [];
      return ch.some((c) => c.side === "pro") && ch.some((c) => c.side === "con");
    };
    const lopsided = pack.activities.filter(
      (a) => (a.argumentChains ?? []).length > 0 && !paired(a)
    );
    const anyChains = pack.activities.some(
      (a) => (a.argumentChains ?? []).length > 0
    );
    add(
      "argument-chains-paired",
      "Argument architectures come as a matched Pro/Con pair",
      lopsided.length === 0,
      lopsided.length === 0
        ? anyChains
          ? "Both sides are built wherever the pack maps an argument"
          : "No argument architectures in this pack"
        : `${lopsided.map((a) => a.title).join(", ")} build only one side — a debater assigned the other side has nothing to run.`
    );

    // Required, not optional, on the track it was built for. The generator was
    // asked for this block "where it fits" and answered by never fitting it in:
    // a full 15-page debate pack came back with zero. It is the founder's core
    // structure — claim → mechanism → example → response → turn → weighing — and
    // the one thing that lets a student be handed either side and still know the
    // whole line of argument.
    if (subject === "debate") {
      const carriers = pack.activities.filter(paired);
      add(
        "argument-chains-present",
        "One page maps the argument on BOTH sides",
        carriers.length > 0,
        carriers.length > 0
          ? `"${carriers[0].title}" runs the full Pro and Con architecture${
              carriers.length > 1 ? ` (+${carriers.length - 1} more)` : ""
            }`
          : "No page builds the Pro/Con argument architecture. A debater is assigned a side minutes before the round — without it this pack teaches a move, not a case they can actually run."
      );
    }
  }

  // ── The founder's own page contracts ──
  // Three rules his master prompt states as MUSTs, and every one of them exists
  // because of a specific way a page fails in a real classroom.
  if (pack.activities.length > 0) {
    // A word bank with exactly as many words as blanks can be completed by
    // elimination, without understanding one term. His fix is two dummies.
    const banked = pack.activities.filter(
      (a) => (a.wordBank?.words ?? []).length > 0
    );
    const thin = banked.filter((a) => (a.wordBank?.distractors ?? []).length < 2);
    // "Scrambled, never alphabetical" — testable, so tested.
    const sorted = banked.filter((a) => {
      const w = a.wordBank?.words ?? [];
      return (
        w.length > 2 &&
        w.every(
          (x, i) => i === 0 || x.toLowerCase() >= w[i - 1].toLowerCase()
        )
      );
    });
    if (banked.length > 0) {
      const bad = [...new Set([...thin, ...sorted])];
      add(
        "word-bank-distractors",
        "Word banks are scrambled and carry two dummies",
        bad.length === 0,
        bad.length === 0
          ? `${banked.length} word bank(s), each scrambled with 2 dummy words`
          : `${bad
              .map((a) => a.title)
              .join(", ")}: a bank that is alphabetical, or has fewer than two distractors, can be completed by elimination without understanding a single term.`
      );
    }

    // Multiple choice is only a check if the wrong answers are answerable.
    const quizzed = pack.activities.filter((a) => (a.quiz ?? []).length > 0);
    const brokenQuiz = quizzed.filter((a) =>
      (a.quiz ?? []).some(
        (q) =>
          (q.options ?? []).length < 3 ||
          q.correctIndex < 0 ||
          q.correctIndex >= (q.options ?? []).length ||
          !q.why?.trim()
      )
    );
    if (quizzed.length > 0) {
      add(
        "quiz-answerable",
        "Every multiple-choice check has 3+ options, a valid key and a why",
        brokenQuiz.length === 0,
        brokenQuiz.length === 0
          ? `${quizzed.reduce((n, a) => n + (a.quiz ?? []).length, 0)} checks, all keyed`
          : `${brokenQuiz
              .map((a) => a.title)
              .join(", ")}: a check with under three options, no valid answer index, or no explanation is a tick-box, not an assessment.`
      );
    }

    // An oral task on every page is an oral task on no page. The founder puts
    // "stand and deliver" where a student has just PRODUCED something — the
    // builds, the sparring, the exit ticket — so it still reads as an
    // instruction rather than as a footer they have learned to skip.
    const oral = pack.activities.filter((a) => a.standAndDeliver?.trim());
    const misplaced = oral.filter((a) => !ORAL_KINDS.includes(a.kind));
    const tooMany = oral.length > MAX_ORAL_BOXES;
    if (oral.length > 0) {
      add(
        "oral-task-placement",
        "Say-it-out-loud sits on pages where students have produced something",
        misplaced.length === 0 && !tooMany,
        misplaced.length === 0 && !tooMany
          ? `${oral.length} oral task(s), all on production pages`
          : tooMany
            ? `${oral.length} of ${pack.activities.length} pages carry a say-it-out-loud box. Past about four it stops being an instruction and becomes a footer students skip — keep it to the pages where they have just written something.`
            : `${misplaced.map((a) => a.title).join(", ")} carry a say-it-out-loud box with nothing for the student to deliver yet.`
      );
    }

    // The strongest student finishing five minutes early is a classroom
    // problem, and a blank page is how it becomes a behaviour problem.
    const writing = pack.activities.filter(
      (a) => a.kind === "independent-build" || a.kind === "scaffolded-build"
    );
    const noStretch = writing.filter((a) => !a.fastFinisher?.trim());
    if (writing.length > 0) {
      add(
        "fast-finisher",
        "Independent writing pages stretch whoever finishes first",
        noStretch.length === 0,
        noStretch.length === 0
          ? `All ${writing.length} writing page(s) carry a fast-finisher task`
          : `${noStretch
              .map((a) => a.title)
              .join(", ")} leave the first student to finish with nothing harder to do.`
      );
    }
  }

  // ── What the judge is actually deciding ──
  // A pack can teach a skill correctly and still leave a student with no idea
  // why one execution of it wins the ballot and another doesn't.
  if (pack.activities.length > 0) {
    const noMove = pack.activities.filter((a) => !a.hiddenJudgeMove?.trim());
    add(
      "judge-move-present",
      "Every page names the hidden judge move",
      noMove.length === 0,
      noMove.length === 0
        ? `All ${pack.activities.length} pages name what wins the round`
        : `${noMove.length} page(s) don't say what separates a shallow attempt from a winning one: ${noMove
            .slice(0, 3)
            .map((a) => a.title)
            .join(", ")}${noMove.length > 3 ? "…" : ""}`
    );
  }

  // ── Reading load ──
  // A page is a page: novices get a ceiling so it can't become a wall of text,
  // and the ceiling is generous enough that a rich page still passes.
  //
  // RECALIBRATED against the founder's own classroom pack, which averages ~358
  // words of student reading per sheet and peaks above 500 — measured the same
  // way this function measures, since `studentReadWords` counts labels, steps,
  // compare rows, frames and prompt labels rather than prose alone. The old
  // 200/300 pair put the ceiling BELOW the benchmark's average, so ten of his
  // thirteen core pages would have failed here and the repair loop would have
  // been told to cut them. A gate that would reject the reference material is
  // measuring the wrong thing.
  //
  // The numbers below are still well under his peak: the aim is to stop a wall
  // of prose, not to cap a page that is dense in short labelled cells. They
  // also have to absorb the per-prompt coaching lines, which now print on the
  // student copy and are counted above.
  if (pack.activities.length > 0) {
    const young =
      /\b(4|5|6|7|8)\b/.test(pack.gradeBand || "") &&
      !/\b(9|10|11|12)\b/.test(pack.gradeBand || "");
    const CEILING = young ? 240 : 380;
    const heavy = pack.activities
      .map((a) => ({ a, n: studentReadWords(a) }))
      .filter((x) => x.n > CEILING);
    add(
      "page-density",
      `No page exceeds ${CEILING} words of student reading`,
      heavy.length === 0,
      heavy.length === 0
        ? "Every page is within the reading budget"
        : `${heavy.map((x) => `${x.a.title || x.a.kind} (${x.n} words)`).join(", ")} — split the page or cut copy; ${young ? "novices stop reading" : "this is a worksheet, not an essay"}.`
    );
  }

  // ── The other half of the reading budget: a page a student does nothing on ──
  // The ceiling above was gated and the floor was only ever requested in the
  // prompt, and the drift that produced is measurable: the most advanced pack
  // in the library is also its thinnest. `gradeBandGuidance` tells the model
  // that for older readers "the danger is a page that is too THIN" — but no
  // check ever disagreed with a thin page, and a prompt rule with no gate
  // behind it is the kind this codebase has learned stops being true.
  //
  // Word count is the wrong floor: a build page is legitimately short on words
  // and long on boxes. What actually makes a page worth its sheet is how many
  // times the student has to DECIDE or PRODUCE something on it — so that is
  // what gets counted.
  if (pack.activities.length > 0) {
    const surfaces = (a: LessonPack["activities"][number]) =>
      a.prompts.length +
      a.sortItems.length +
      a.matchPairs.length +
      a.frames.length +
      (a.quiz?.length ?? 0) +
      (a.microFlow?.target?.trim() ? 1 : 0) +
      (a.ballotLine?.line?.trim() ? 1 : 0) +
      (a.microCrossfire?.questions?.length ?? 0) +
      (a.echoCheck?.tests?.length ?? 0) +
      (a.standAndDeliver?.trim() ? 1 : 0);
    // Two on pages whose whole purpose is production; one everywhere else,
    // including the i-do — a modelled page a student only watches is the exact
    // failure the content QA has already flagged in this library ("100% passive
    // with zero prompts"), and one 30-second check fixes it without turning the
    // model into a worksheet.
    const thin = pack.activities
      .map((a) => ({
        a,
        n: surfaces(a),
        need: HEAVY_PRODUCTION_KINDS.includes(a.kind) ? 2 : 1,
      }))
      .filter((x) => x.n < x.need);
    add(
      "page-does-something",
      "Every page asks the student to produce or decide something",
      thin.length === 0,
      thin.length === 0
        ? `All ${pack.activities.length} pages put the student to work`
        : `${thin
            .map((x) => `${x.a.title || x.a.kind} (${x.n} task${x.n === 1 ? "" : "s"}, needs ${x.need})`)
            .join(", ")} — a page a student reads without writing, sorting, choosing or saying anything is a handout, not an activity.`
    );
  }

  // ── Demand, for cohorts that are past scaffolding ──
  // (The varsity test build shipped an independent build with ONE prompt — the
  // exact "too easy for elite students" failure.)
  const rigor = (pack.rigorLevel || "standard").toLowerCase();
  if (rigor === "advanced" || rigor === "elite") {
    const minPrompts = rigor === "elite" ? 3 : 2;
    const owed = pack.activities.filter(
      (a) =>
        (a.kind === "independent-build" || a.kind === "exit-ticket") &&
        a.prompts.length < minPrompts
    );
    add(
      "production-demand",
      `${rigor === "elite" ? "Elite" : "Advanced"} production pages ask for at least ${minPrompts} pieces of work`,
      owed.length === 0,
      owed.length === 0
        ? "Independent and exit pages carry a full production load"
        : `${owed.map((a) => `${a.title || a.kind} (${a.prompts.length})`).join(", ")} — this cohort has the fundamentals; one prompt is a warm-up, not a build.`
    );

    if (rigor === "elite") {
      const scaffolded = pack.activities.filter(
        (a) =>
          (a.kind === "independent-build" || a.kind === "exit-ticket") &&
          a.frames.length > 0
      );
      add(
        "elite-no-scaffolds",
        "Elite independent work is unscaffolded",
        scaffolded.length === 0,
        scaffolded.length === 0
          ? "No sentence frames on independent or exit pages"
          : `${scaffolded.map((a) => a.title || a.kind).join(", ")} still hand out sentence frames — an elite squad writes without starters.`
      );

      // Elite means holding sources against each other, not quoting one.
      const cardIds = pack.evidenceCards.map((c) => c.id.trim());
      const synthesises = pack.activities.some((a) => {
        const text = JSON.stringify({ ...a, designHtml: "" });
        return (
          cardIds.filter((id) => new RegExp(`Card\\s+${id}\\b`, "i").test(text))
            .length >= 2
        );
      });
      if (cardIds.length >= 2) {
        add(
          "elite-synthesis",
          "At least one page makes students weigh two or more cards together",
          synthesises,
          synthesises
            ? "Multi-card synthesis is present"
            : "Every page uses cards one at a time — an elite pack must make students compare, rank or reconcile sources."
        );
      }
    }
  }

  // ── Series integrity: don't re-teach a sibling's vocabulary ──
  // (Test finding: L5 re-defined "warrant" and "magnitude" from L1.)
  // Only runs when a caller supplies the series' already-taught terms.
  if (ctx.siblingVocab && ctx.siblingVocab.length > 0) {
    const taught = new Set(ctx.siblingVocab.map((t) => t.trim().toLowerCase()));
    const repeats = pack.vocabulary
      .map((v) => v.term.trim())
      .filter((t) => t && taught.has(t.toLowerCase()));
    add(
      "series-vocab-unique",
      "Word bank teaches only NEW terms (no sibling repeats)",
      repeats.length === 0,
      repeats.length === 0
        ? "No terms re-taught from earlier lessons"
        : `Re-defines ${repeats.join(", ")} — already taught earlier in this series. Use those terms freely, but the word bank should introduce only new ones.`
    );
  }

  return { passed: items.every((i) => i.passed), items };
}
