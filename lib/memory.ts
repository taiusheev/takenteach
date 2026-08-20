import type { MaterialRow } from "./db";
import type { LessonPack } from "./lesson-pack-schema";

/**
 * Memory & Quality Engine — retrieval.
 *
 * The generator grounds each draft in a published, approved pack as its quality
 * bar. v0 used whatever was published most recently; this picks the CLOSEST
 * MATCH instead — the approved lesson that most resembles what we're about to
 * build (same format, grade band, rigor, and nearest skill focus) — so a new
 * rebuttal lesson stands on the best past rebuttal-style pack, not an unrelated
 * one. As more lessons are published and tagged, the corpus deepens and the
 * match gets better: the blueprint's "gets better over time" mechanic.
 */

export interface ExemplarTarget {
  skillFocus?: string;
  format?: string;
  gradeBand?: string;
  rigorLevel?: string;
}

function tokens(s: string | undefined): string[] {
  return (s ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

const STOP = new Set([
  "the", "a", "an", "of", "to", "and", "or", "for", "in", "on", "with", "how",
  "what", "why", "an", "is", "are", "by", "skill",
]);

/** Overlap of meaningful words between two short phrases. */
function phraseOverlap(a: string | undefined, b: string | undefined): number {
  const bs = new Set(tokens(b).filter((t) => !STOP.has(t)));
  let n = 0;
  for (const t of new Set(tokens(a).filter((t) => !STOP.has(t)))) {
    if (bs.has(t)) n += 1;
  }
  return n;
}

/**
 * Relevance of a candidate exemplar to the lesson we're about to build. Higher
 * is closer. Weighted so a format/grade match matters, but a genuinely on-skill
 * example can win over a merely same-format one.
 */
export function scoreExemplar(candidate: LessonPack, target: ExemplarTarget): number {
  let score = 0;
  if (
    target.format &&
    target.format !== "auto" &&
    candidate.format &&
    candidate.format === target.format
  ) {
    score += 3;
  }
  if (target.gradeBand && candidate.gradeBand === target.gradeBand) score += 2;
  if (target.rigorLevel && candidate.rigorLevel === target.rigorLevel) score += 1;
  score += Math.min(phraseOverlap(candidate.skillFocus, target.skillFocus), 4) * 1.5;
  return score;
}

/**
 * How far through review a pack has come. An exemplar is held up to the model as
 * "the standard to meet", so it has to be something a human has at least
 * vouched for by submitting it — a draft is nobody's standard.
 *
 * `published`-only was the original rule, and it quietly broke the whole
 * mechanism: nothing in a working library is published early on, so the pool was
 * empty and the lookup fell through to a subject-wide query with NO type filter,
 * which handed every lesson build a **judge ballot** as its quality bar.
 * Accepting in_review is the difference between grounding on the academy's two
 * best packs and grounding on a scoring form.
 */
const TIERS: Record<string, number> = {
  published: 3,
  approved: 2,
  in_review: 1, // cleared the automated review gate: checklist + content QA
};

export function exemplarTier(status: string): number {
  return TIERS[status] ?? 0; // draft and anything unknown are not exemplars
}

/**
 * HOW GOOD THE STANDARD ITSELF IS.
 *
 * The exemplar is shipped into the cached system prefix of every call in a
 * build and framed to the model as "the quality bar — match its density,
 * texture and rigor". Until this existed, nothing checked that the bar cleared
 * the bar: eligibility asked only for a status tier and at least one activity,
 * so the pack teaching every new build what good looks like could be one that
 * fails a dozen of our own gates. That is not a one-off bad pack; it is a
 * ratchet pointing the wrong way, because the next pack learns from it and then
 * becomes eligible in turn.
 *
 * Banded rather than continuous, and deliberately coarse. A pack should not
 * lose its place as the house standard because it picked up one new gate
 * failure the week a rule was added — but a pack failing a quarter of the
 * checklist should not outrank a clean one just because it matches the format.
 *
 * Ranked BELOW review tier, because a human submitting a pack is still the
 * stronger signal, and ABOVE relevance, because a closely-matched weak pack
 * teaches the wrong lesson more effectively than a distant strong one.
 */
export function exemplarQuality(m: MaterialRow): number {
  const pack = m.content as LessonPack;

  // The content-QA verdict is the sharpest signal we have and it is already
  // stored: it is a fact about this pack recorded by a reviewer pass that read
  // the whole thing. A pack its own QA refused to pass is not a standard.
  let qa: { overallGrade?: string; readyForReview?: boolean } | null = null;
  try {
    qa = pack.contentQaJson ? JSON.parse(pack.contentQaJson) : null;
  } catch {
    qa = null; // a malformed report is no evidence either way, not a failure
  }
  // Negative, not zero, and the difference matters. Zero is what an unreviewed
  // pack scores — "we do not know". A pack a QA pass read in full and refused
  // is worse evidence than no evidence, so it must rank below the unknown case
  // rather than tying with it and falling through to whichever is newer.
  if (qa && qa.readyForReview === false) return -1;

  const grade = (qa?.overallGrade ?? "").trim().toUpperCase()[0];
  if (grade === "A") return 3;
  if (grade === "B") return 2;
  if (grade === "C" || grade === "D" || grade === "F") return 1;

  // No QA report — fall back to how complete the pack is. This is weaker than a
  // graded verdict, so it caps at 2: an unreviewed pack should not outrank one
  // a QA pass actually graded A.
  const acts = pack.activities ?? [];
  if (acts.length === 0) return 0;
  const coached = acts.filter((a) => a.prompts.some((p) => p.guide?.trim())).length;
  const reasoned = acts.filter((a) => a.whyItMatters?.trim()).length;
  const share = (coached + reasoned) / (acts.length * 2);
  return share >= 0.5 ? 2 : share > 0 ? 1 : 0;
}

/**
 * Can this row stand as the quality bar for a new lesson pack?
 * It must be a lesson pack (not a ballot or a word bank), reviewed at least as
 * far as submission, and actually built — an empty shell teaches nothing.
 */
export function isExemplarEligible(m: MaterialRow): boolean {
  if (m.type !== "lesson-pack") return false;
  if (exemplarTier(m.status) === 0) return false;
  const pack = m.content as LessonPack;
  return (pack?.activities?.length ?? 0) > 0;
}

/**
 * The best-matching exemplar from a candidate list. Ranked by how far it got
 * through review FIRST — a published pack outranks a submitted one however well
 * the submitted one matches — then by relevance, then by recency.
 */
export function pickExemplar(
  candidates: MaterialRow[],
  target: ExemplarTarget
): MaterialRow | null {
  const eligible = candidates.filter(isExemplarEligible);
  if (eligible.length === 0) return null;
  return eligible
    .map((m) => ({
      m,
      tier: exemplarTier(m.status),
      q: exemplarQuality(m),
      s: scoreExemplar(m.content as LessonPack, target),
    }))
    .sort(
      (a, b) =>
        // Review tier first (a human vouched for it), then how good the pack
        // actually is, then how close a match. Quality sits above relevance
        // deliberately: a closely-matched weak pack teaches the wrong lesson
        // more effectively than a distant strong one, because the model is
        // told to match its density and texture.
        b.tier - a.tier ||
        b.q - a.q ||
        b.s - a.s ||
        b.m.updated_at.localeCompare(a.m.updated_at)
    )[0].m;
}
