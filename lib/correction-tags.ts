import { type Subject } from "./subjects";

/**
 * Correction-tag vocabulary — the controlled set of reasons a reviewer picks
 * when sending a material back or unpublishing it.
 *
 * This is the heart of the Memory & Quality Engine: every rejection is tagged
 * with a structured reason, so recurring failure modes become measurable
 * instead of being re-noticed by a human each time. Tags that recur often are
 * candidates for promotion into an automatic checklist rule.
 */

export interface CorrectionTag {
  id: string;
  label: string;
  category: string;
  description: string;
  /** tracks this failure mode applies to; omitted = all */
  subjects?: Subject[];
  /** if this failure mode is already caught by the automated checklist */
  hasAutomatedCheck?: boolean;
}

export const CORRECTION_CATEGORIES = [
  "Evidence & citations",
  "Alignment",
  "Reading level & pedagogy",
  "Structure & completeness",
  "Style & consistency",
] as const;

export const CORRECTION_TAGS: CorrectionTag[] = [
  // ── Evidence & citations ──
  {
    id: "unverifiable-citation",
    label: "Unverifiable / fabricated citation",
    category: "Evidence & citations",
    description:
      "A source, statistic, or quotation that can't be confirmed against the real publication.",
  },
  {
    id: "missing-scope-limit",
    label: "Missing / weak scope limit",
    category: "Evidence & citations",
    description:
      "An evidence card without a real LIMIT stating what it cannot prove.",
    hasAutomatedCheck: true,
  },
  {
    id: "weak-evidence",
    label: "Weak or off-point evidence",
    category: "Evidence & citations",
    description:
      "Evidence that doesn't actually support the claim, or is too thin to carry it.",
  },
  {
    id: "paraphrase-too-long",
    label: "Paraphrase over the word limit",
    category: "Evidence & citations",
    description: "A card paraphrase longer than the kit's word cap.",
    hasAutomatedCheck: true,
  },

  // ── Alignment ──
  {
    id: "off-anchor",
    label: "Off-resolution / off-topic",
    category: "Alignment",
    description:
      "Content that drifts from the lesson's resolution, central question, or writing focus.",
  },
  {
    id: "inconsistent-terminology",
    label: "Inconsistent terminology",
    category: "Alignment",
    description:
      "The resolution or key terms are reworded across the pack instead of staying identical.",
  },

  // ── Reading level & pedagogy ──
  {
    id: "reading-level-too-high",
    label: "Reading level too high",
    category: "Reading level & pedagogy",
    description:
      "Vocabulary or sentence complexity beyond the target cohort of English learners.",
  },
  {
    id: "insufficient-scaffolding",
    label: "Insufficient scaffolding",
    category: "Reading level & pedagogy",
    description:
      "Jumps to independent work without enough modeling, frames, or guided practice.",
  },
  {
    id: "weak-modeling",
    label: "Weak worked example / mentor text",
    category: "Reading level & pedagogy",
    description:
      "The I-Do example doesn't clearly demonstrate the skill or label its parts.",
  },
  {
    id: "vague-criteria",
    label: "Vague judging / rubric criteria",
    category: "Reading level & pedagogy",
    description:
      "Criteria too vague to apply consistently (ballots and rubrics).",
    subjects: ["debate", "writing"],
  },

  // ── Structure & completeness ──
  {
    id: "incomplete-structure",
    label: "Incomplete argument structure",
    category: "Structure & completeness",
    description:
      "Missing a required layer (e.g. an incomplete PEEL, or a paragraph with no analysis).",
  },
  {
    id: "timing-mismatch",
    label: "Timing doesn't add up",
    category: "Structure & completeness",
    description:
      "The minute-by-minute plan has gaps, overlaps, or doesn't cover the lesson.",
    hasAutomatedCheck: true,
  },
  {
    id: "thin-content",
    label: "Too thin / short",
    category: "Structure & completeness",
    description:
      "Not enough substance to fill the intended session — a worksheet, not a pack.",
    hasAutomatedCheck: true,
  },
  {
    id: "answer-key-gaps",
    label: "Answer-key gaps",
    category: "Structure & completeness",
    description: "Student prompts without expected answers for the teacher.",
    hasAutomatedCheck: true,
  },

  // ── Style & consistency ──
  {
    id: "off-kit-tone",
    label: "Off-kit tone or voice",
    category: "Style & consistency",
    description:
      "Voice or register that doesn't match the assigned Style Kit.",
  },
  {
    id: "formatting",
    label: "Formatting / layout issues",
    category: "Style & consistency",
    description: "Overflows, broken layout, or inconsistent presentation.",
  },
  {
    id: "other",
    label: "Other (see note)",
    category: "Style & consistency",
    description: "Anything not covered above — explain in the note.",
  },
];

const BY_ID = new Map(CORRECTION_TAGS.map((t) => [t.id, t]));

export function correctionTag(id: string): CorrectionTag | undefined {
  return BY_ID.get(id);
}

export function correctionLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

/** Tags relevant to a subject (drops subject-specific tags for other tracks). */
export function tagsForSubject(subject: Subject): CorrectionTag[] {
  return CORRECTION_TAGS.filter((t) => !t.subjects || t.subjects.includes(subject));
}

export function isValidTag(id: string): boolean {
  return BY_ID.has(id);
}

/**
 * Turn a free-typed "edit with AI" instruction into correction tags.
 *
 * When an author steers a section rewrite ("make the paraphrases shorter", "this
 * drifts off the resolution"), the instruction IS a correction — so we classify
 * it into the same controlled vocabulary reviewers use, no extra typing. Keyword
 * rules keep it deterministic and free (no model call); an unmatched instruction
 * still logs as "other" with the note preserved, so nothing is lost.
 */
const CLASSIFIER_RULES: { tag: string; re: RegExp }[] = [
  { tag: "missing-scope-limit", re: /\bscope|\blimit(s|ation)?\b|cannot prove|can'?t prove|overreach/i },
  { tag: "paraphrase-too-long", re: /paraphrase|word (count|limit)|too long|shorten|trim|\b\d+ words\b/i },
  { tag: "unverifiable-citation", re: /fabricat|made[- ]?up|fake|real (source|citation|publication|stat)|verify|unverifiab|doesn'?t exist|isn'?t real|invented/i },
  { tag: "weak-evidence", re: /weak (evidence|source|card)|off[- ]point|stronger (evidence|source)|better (source|evidence)|thin (evidence|card)|doesn'?t support/i },
  { tag: "off-anchor", re: /off[- ]?(topic|resolution|anchor)|on[- ]resolution|stay on|central question|writing focus|drift/i },
  { tag: "inconsistent-terminology", re: /reworded|inconsistent|verbatim|terminology|same wording|keep the (term|wording)/i },
  { tag: "reading-level-too-high", re: /reading level|simpler|simplif|easier|too (hard|complex|advanced)|dumb|plain(er)? (english|language)|for (esl|english learners|beginners)/i },
  { tag: "insufficient-scaffolding", re: /scaffold|frames?\b|sentence (starters?|stems?)|guided|more support|training wheels|gradual release|hand[- ]?holding/i },
  { tag: "weak-modeling", re: /worked example|i[- ]?do\b|model(ing| it)?|mentor text|demonstrat|show them how/i },
  { tag: "vague-criteria", re: /vague|more specific|measurable|criteria|rubric (band|descriptor|wording)/i },
  { tag: "incomplete-structure", re: /\bpeel\b|incomplete|missing (a |the )?(layer|step|analysis|warrant|link)|full structure/i },
  { tag: "timing-mismatch", re: /timing|minutes?\b|schedule|pacing|doesn'?t (add up|fit)|too (long|short) for/i },
  { tag: "thin-content", re: /thin|too short|more (content|depth|substance|detail)|denser|beef up|expand|flesh out|fuller|add more/i },
  { tag: "answer-key-gaps", re: /answer key|expected answers?|answers? for (the |each )?prompt/i },
  { tag: "off-kit-tone", re: /\btone\b|voice|register|too (formal|casual|dry|playful)|style kit/i },
  { tag: "formatting", re: /format|layout|overflow|spacing|fits? on (the |a )?page|too much on/i },
];

export function classifyInstruction(instruction: string): string[] {
  const text = instruction.trim();
  if (!text) return [];
  const hits = CLASSIFIER_RULES.filter((r) => r.re.test(text)).map((r) => r.tag);
  return hits.length ? Array.from(new Set(hits)) : ["other"];
}
