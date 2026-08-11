/**
 * A unit should look like one unit.
 *
 * Only Lesson Packs ever get an AI-authored design system, so a class plan or a
 * vocabulary set printed alongside one looked like it came from a different
 * school — same series, same cohort, same week, completely different paper. The
 * fix costs nothing and needs no model call: the lighter materials in a series
 * adopt the design system the series' lesson pack already has.
 *
 * Which pack defines the identity matters. It is the EARLIEST designed lesson in
 * the series, by lesson code — so the look is set once, at L1, and stays put as
 * later lessons are added. Picking "the most recently designed" would mean a
 * unit silently re-skinned itself every time a coach designed a new lesson.
 */

import { stripEmoji } from "./sanitize-design";
import { DEFAULT_DESIGN_ID, resolveDesign } from "./lesson-designs";

export interface DesignSource {
  id: number;
  lessonCode: string;
  title: string;
  designCss: string;
  designNote: string;
  /** the pack's pinned design, if any — feeds the house-design choice */
  design?: string;
  /** the pack's grade band — the house design follows it when nothing is pinned */
  gradeBand?: string;
}

/** Numeric part of a lesson code ("L10" → 10) for curriculum ordering. */
function codeOrder(code: string): number {
  const n = code.match(/\d+/);
  return n ? Number(n[0]) : Number.MAX_SAFE_INTEGER;
}

/**
 * The design system a non-pack material in this series should adopt, or null.
 *
 * @param candidates every lesson pack in the same series (already filtered by
 *   series and subject by the caller, which owns the DB access).
 */
export function unitDesign(candidates: DesignSource[]): DesignSource | null {
  const designed = candidates.filter((c) => c.designCss.trim().length > 0);
  if (designed.length === 0) return null;
  return designed.sort(
    (a, b) => codeOrder(a.lessonCode) - codeOrder(b.lessonCode) || a.id - b.id
  )[0];
}

/**
 * The HOUSE design a non-pack material in this series should print in.
 *
 * Separate from `unitDesign` above, and it has to be: that one only considers
 * packs carrying an AI-authored stylesheet, because that is the only thing it
 * can inherit. But every pack has a house design whether or not anyone has ever
 * pressed a design button — and the house design is what decides whether a
 * sheet gets the novice treatment (framed pages, black rules, hard shadows) or
 * the elite one. A class plan that inherited neither printed in bare defaults
 * beside a lesson pack in the academy's own design.
 *
 * Same ordering rule as `unitDesign`: the EARLIEST lesson in the series sets
 * the look, so a unit does not re-skin itself when L7 is added.
 */
export function unitHouseDesignId(candidates: DesignSource[]): string {
  if (candidates.length === 0) return DEFAULT_DESIGN_ID;
  const first = [...candidates].sort(
    (a, b) => codeOrder(a.lessonCode) - codeOrder(b.lessonCode) || a.id - b.id
  )[0];
  return resolveDesign(first.design, first.gradeBand).id;
}

/**
 * How the toolbar describes where the look came from. The design note is model
 * prose and can carry a stray glyph ("balance-scale ⚖ section motifs"), so it
 * goes through the same emoji strip everything else user-visible does.
 */
export function unitDesignLabel(source: DesignSource | null): string {
  if (!source) return "";
  const code = source.lessonCode.trim();
  const note = stripEmoji(source.designNote).trim();
  const from = code ? `${code}` : `#${source.id}`;
  return note ? `${from} — ${note}` : from;
}
