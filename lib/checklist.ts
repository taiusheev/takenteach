import { type LessonPack, countWords } from "./lesson-pack-schema";
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
    a.prompts.reduce((n, p) => n + w(p.label), 0) +
    w(a.keyIdea) +
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
  // A page is a page: novices get a hard ceiling so it can't become a wall of
  // text, and the ceiling is generous enough that a rich page still passes.
  if (pack.activities.length > 0) {
    const young =
      /\b(4|5|6|7|8)\b/.test(pack.gradeBand || "") &&
      !/\b(9|10|11|12)\b/.test(pack.gradeBand || "");
    const CEILING = young ? 200 : 300;
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
