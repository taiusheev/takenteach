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
      s: scoreExemplar(m.content as LessonPack, target),
    }))
    .sort(
      (a, b) =>
        b.tier - a.tier ||
        b.s - a.s ||
        b.m.updated_at.localeCompare(a.m.updated_at)
    )[0].m;
}
