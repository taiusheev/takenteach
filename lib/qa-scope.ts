import type { Activity, LessonPack } from "./lesson-pack-schema";

/**
 * WHAT HAS CHANGED SINCE THE LAST CONTENT REVIEW.
 *
 * ── THE PROBLEM THIS EXISTS TO MAKE VISIBLE ──────────────────────────────
 * A content-QA verdict is stored against a hash of the whole pack. Edit one
 * word on page 8 and the verdict goes stale — correctly, because it can no
 * longer claim to describe the pack. But the product then tells the teacher
 * only that it is "out of date", which leaves them one option: re-run a full
 * whole-pack review. That is an Opus call at roughly 26¢, and on a three-edit
 * session it is the majority of everything spent after the build.
 *
 * The expensive part is not the review. It is that nothing in the system knows
 * WHICH pages the review no longer covers, so all thirteen are re-read to find
 * out about one.
 *
 * ── WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT ────────────────────
 * It records a fingerprint per page at review time, so afterwards the system
 * can say exactly which pages are unreviewed and which are still covered by a
 * verdict that remains true of them.
 *
 * It does NOT skip any review. Every finding still comes from a full pass, and
 * the review gate is unchanged: a stale report still blocks submission. This is
 * a reporting improvement whose immediate value is that a teacher can see what
 * they have disturbed and batch their editing before paying for one review
 * instead of three.
 *
 * That it is also the exact dependency data an incremental review would need is
 * deliberate — but incremental QA is a correctness-sensitive change (a merge
 * bug shows "passed" for content nobody read) and is not attempted here. This
 * is the half that is provably safe.
 *
 * ── WHY GLOBAL CHANGES ARE TRACKED SEPARATELY ────────────────────────────
 * Some edits cannot be localised. The evidence deck, the vocabulary, the
 * mission, the success criteria and the anchor are cited and relied upon across
 * every page — change a card's year and a verdict about page 9's use of that
 * card may no longer hold. So those are one bit: touched or not. Claiming a
 * page is "still reviewed" after the evidence under it moved would be exactly
 * the false reassurance this must never give.
 */

/** The QA-visible projection of one page, as a string to fingerprint. */
function pageFingerprintInput(a: Activity): string {
  /* Mirrors the projection `reviewPackContent` sends — see the note on
     packContentHash. Fields the reviewer cannot see (badge, durationMin,
     designHtml) are excluded so a cosmetic edit does not mark a page
     unreviewed; everything it can see is included. */
  return JSON.stringify({
    kind: a.kind,
    title: a.title,
    instructions: a.instructions,
    keyIdea: a.keyIdea,
    scene: a.scene,
    steps: a.steps,
    exampleLayers: a.exampleLayers,
    compare: a.compare,
    sortItems: a.sortItems,
    matchPairs: a.matchPairs,
    frames: a.frames,
    callouts: a.callouts,
    prompts: a.prompts.map((p) => ({ label: p.label, expectedAnswer: p.expectedAnswer })),
    standAndDeliver: a.standAndDeliver,
  });
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Fingerprint of one page's reviewable content. */
export function pageContentHash(a: Activity): string {
  return fnv1a(pageFingerprintInput(a));
}

/** Fingerprint of everything a page-level verdict depends on but does not own. */
export function globalContentHash(pack: LessonPack): string {
  return fnv1a(
    JSON.stringify({
      mission: pack.mission,
      successCriteria: pack.successCriteria,
      vocabulary: pack.vocabulary,
      evidenceCards: pack.evidenceCards,
      resolution: pack.resolution,
      skillFocus: pack.skillFocus,
    })
  );
}

/** The review-scope fingerprints stored alongside a QA report. */
export interface QaScope {
  global: string;
  /** One per page, in page order, keyed by title so reorders are survivable. */
  pages: { title: string; hash: string }[];
}

export function captureQaScope(pack: LessonPack): QaScope {
  return {
    global: globalContentHash(pack),
    pages: pack.activities.map((a) => ({
      title: a.title,
      hash: pageContentHash(a),
    })),
  };
}

export interface QaCoverage {
  /** True when nothing reviewable has changed — the verdict still stands whole. */
  current: boolean;
  /** Shared content changed, so no page verdict can be relied on. */
  globalChanged: boolean;
  /** Pages whose content changed since the review, by current index. */
  changedPages: number[];
  /** Pages added since the review — never reviewed at all. */
  newPages: number[];
  /** Titles of pages that were reviewed and no longer exist. */
  removedPages: string[];
  /** Pages the stored verdict still describes accurately. */
  stillCovered: number[];
}

/**
 * Compare a pack against the scope a review was taken at.
 *
 * Pages are matched BY TITLE rather than by position, because reordering pages
 * is a normal editing action that changes no page's content — matching on index
 * would report every page after a move as unreviewed, which is both wrong and
 * the kind of false alarm that teaches people to ignore the panel.
 */
export function qaCoverage(pack: LessonPack, scope: QaScope | null): QaCoverage {
  if (!scope) {
    return {
      current: false,
      globalChanged: true,
      changedPages: pack.activities.map((_, i) => i),
      newPages: pack.activities.map((_, i) => i),
      removedPages: [],
      stillCovered: [],
    };
  }

  const globalChanged = globalContentHash(pack) !== scope.global;
  const reviewed = new Map(scope.pages.map((p) => [p.title, p.hash]));
  const seen = new Set<string>();

  const changedPages: number[] = [];
  const newPages: number[] = [];
  const stillCovered: number[] = [];

  pack.activities.forEach((a, i) => {
    const prior = reviewed.get(a.title);
    seen.add(a.title);
    if (prior === undefined) {
      newPages.push(i);
      changedPages.push(i);
      return;
    }
    if (prior !== pageContentHash(a)) {
      changedPages.push(i);
      return;
    }
    /* Its own content is untouched — but a page verdict rests on the evidence
       and vocabulary it cites, so shared changes withdraw that cover too. */
    if (globalChanged) changedPages.push(i);
    else stillCovered.push(i);
  });

  const removedPages = scope.pages
    .map((p) => p.title)
    .filter((t) => !seen.has(t));

  return {
    current:
      !globalChanged &&
      changedPages.length === 0 &&
      newPages.length === 0 &&
      removedPages.length === 0,
    globalChanged,
    changedPages,
    newPages,
    removedPages,
    stillCovered,
  };
}

/** One sentence a teacher can act on, or "" when the review still stands. */
export function describeCoverage(c: QaCoverage, totalPages: number): string {
  if (c.current) return "";
  if (c.globalChanged) {
    return "The evidence, vocabulary or objectives changed, so every page needs re-reviewing — those are cited across the whole pack.";
  }
  const bits: string[] = [];
  if (c.changedPages.length > 0) {
    bits.push(
      `${c.changedPages.length} of ${totalPages} page${totalPages === 1 ? "" : "s"} changed`
    );
  }
  if (c.removedPages.length > 0) {
    bits.push(`${c.removedPages.length} removed`);
  }
  return `${bits.join(" · ")} since the last review. Finish your edits, then review once.`;
}
