import { type LessonPack } from "./lesson-pack-schema";
import { type MaterialRow } from "./db";
import { commonFields } from "./content-types";

/**
 * Uniqueness checking — stops a series from becoming ten copies of the same
 * lesson.
 *
 * Two failure modes this guards against: (1) the generator cloning the
 * grounding exemplar's titles/vocabulary/evidence, and (2) a later lesson in a
 * series silently re-teaching what an earlier one already covered. The report
 * is advisory (shown to the author), not blocking — deliberate spiralling of a
 * term is legitimate, so a human judges.
 */

export interface OverlapDetail {
  value: string;
  /** which sibling lessons also contain it */
  sharedWith: string[];
}

export interface UniquenessReport {
  siblingCount: number;
  duplicateTitles: OverlapDetail[];
  duplicateVocab: OverlapDetail[];
  duplicateEvidence: OverlapDetail[];
  duplicateSkillFocus: OverlapDetail[];
  /** 0–1; 1 = nothing shared with siblings */
  distinctScore: number;
  verdict: "distinct" | "some-overlap" | "heavy-overlap";
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** A stable key for an evidence source: same study, however it's paraphrased. */
export function evidenceKey(c: {
  institution: string;
  year: string;
  publication: string;
}): string {
  return `${norm(c.institution)}|${norm(c.year)}|${norm(c.publication)}`;
}

function collect(
  packLabel: string,
  values: string[],
  into: Map<string, string[]>
) {
  for (const v of values) {
    const k = norm(v);
    if (!k) continue;
    const list = into.get(k) ?? [];
    if (!list.includes(packLabel)) list.push(packLabel);
    into.set(k, list);
  }
}

/**
 * Compare a pack against its sibling lessons (same series & subject).
 * `siblings` should exclude the pack itself.
 */
export function checkUniqueness(
  pack: LessonPack,
  siblings: MaterialRow[]
): UniquenessReport {
  const titleMap = new Map<string, string[]>();
  const vocabMap = new Map<string, string[]>();
  const evidenceMap = new Map<string, string[]>();
  const skillMap = new Map<string, string[]>();

  for (const s of siblings) {
    const c = commonFields(s.content);
    const label = c.lessonCode ? `${c.lessonCode}` : s.title;
    const sp = s.content as LessonPack;
    collect(label, (sp.activities ?? []).map((a) => a.title), titleMap);
    collect(label, (sp.vocabulary ?? []).map((v) => v.term), vocabMap);
    collect(
      label,
      (sp.evidenceCards ?? []).map((e) =>
        evidenceKey(e as unknown as { institution: string; year: string; publication: string })
      ),
      evidenceMap
    );
    collect(label, [c.skillFocus], skillMap);
  }

  const hit = (
    values: string[],
    map: Map<string, string[]>,
    display?: (raw: string) => string
  ): OverlapDetail[] => {
    const out: OverlapDetail[] = [];
    const seen = new Set<string>();
    for (const v of values) {
      const k = norm(v);
      if (!k || seen.has(k)) continue;
      const shared = map.get(k);
      if (shared?.length) {
        seen.add(k);
        out.push({ value: display ? display(v) : v, sharedWith: shared });
      }
    }
    return out;
  };

  const duplicateTitles = hit(pack.activities.map((a) => a.title), titleMap);
  const duplicateVocab = hit(pack.vocabulary.map((v) => v.term), vocabMap);
  const duplicateEvidence = hit(
    pack.evidenceCards.map((e) => evidenceKey(e)),
    evidenceMap,
    (raw) => {
      const [inst, year] = raw.split("|");
      return `${inst} (${year})`;
    }
  );
  const duplicateSkillFocus = hit([pack.skillFocus], skillMap);

  // score across the dimensions that have anything to compare
  const parts: number[] = [];
  if (pack.activities.length) {
    parts.push(1 - duplicateTitles.length / pack.activities.length);
  }
  if (pack.vocabulary.length) {
    parts.push(1 - duplicateVocab.length / pack.vocabulary.length);
  }
  if (pack.evidenceCards.length) {
    parts.push(1 - duplicateEvidence.length / pack.evidenceCards.length);
  }
  const distinctScore =
    siblings.length === 0
      ? 1
      : parts.length
        ? parts.reduce((a, b) => a + b, 0) / parts.length
        : 1;

  const verdict: UniquenessReport["verdict"] =
    siblings.length === 0 || distinctScore >= 0.85
      ? "distinct"
      : distinctScore >= 0.6
        ? "some-overlap"
        : "heavy-overlap";

  return {
    siblingCount: siblings.length,
    duplicateTitles,
    duplicateVocab,
    duplicateEvidence,
    duplicateSkillFocus,
    distinctScore,
    verdict,
  };
}

/**
 * Compact digest of the sibling lessons, injected into generation so the model
 * knows what has already been taught and must do something different.
 */
/**
 * LAST WEEK'S LESSON — the one the review page opens on.
 *
 * The syllabus can say what lesson 4 follows in the abstract; this says what
 * this class was actually taught last Saturday, which is what a review page has
 * to check. Picks the sibling with the highest lesson number below this one,
 * falling back to the most recently updated sibling when the codes don't sort
 * (a series that numbers by date, a one-off pair).
 */
export function previousInSeries(
  siblings: MaterialRow[],
  lessonCode: string
): MaterialRow | null {
  if (siblings.length === 0) return null;
  const num = (s: string) => {
    const m = (s || "").match(/\d+/);
    return m ? Number(m[0]) : NaN;
  };
  const mine = num(lessonCode);
  const numbered = siblings
    .map((s) => ({ s, n: num(commonFields(s.content).lessonCode) }))
    .filter(({ n }) => Number.isFinite(n));
  if (Number.isFinite(mine)) {
    const before = numbered
      .filter(({ n }) => n < mine)
      .sort((a, b) => b.n - a.n);
    if (before.length > 0) return before[0].s;
  }
  if (numbered.length > 0) {
    return [...numbered].sort((a, b) => b.n - a.n)[0].s;
  }
  return siblings[siblings.length - 1];
}

/** What that lesson taught, in the form the review page needs. */
export function previousLessonBrief(prev: MaterialRow | null): string {
  if (!prev) return "";
  const c = commonFields(prev.content);
  const p = prev.content as LessonPack;
  const vocab = (p.vocabulary ?? []).map((v) => v.term).join(", ");
  const criteria = (p.successCriteria ?? []).slice(0, 4).join(" · ");
  const pages = (p.activities ?? [])
    .filter((a) => ["i-do", "we-do", "drill", "exit-ticket"].includes(a.kind))
    .map((a) => a.title)
    .slice(0, 4)
    .join(" / ");
  return `LAST WEEK, THIS CLASS WAS TAUGHT — ${c.lessonCode || prev.title}: "${c.title}"
- Skill: ${c.skillFocus || "—"}
- What they should be able to do: ${criteria || "—"}
- Words they were given: ${vocab || "—"}
- The pages that did the teaching: ${pages || "—"}`;
}

export function seriesDigest(siblings: MaterialRow[]): string {
  if (siblings.length === 0) return "";
  const lines = siblings.map((s) => {
    const c = commonFields(s.content);
    const sp = s.content as LessonPack;
    const vocab = (sp.vocabulary ?? []).map((v) => v.term).join(", ") || "—";
    const sources =
      (sp.evidenceCards ?? [])
        .map((e) => `${e.institution} ${e.year}`)
        .join("; ") || "—";
    const titles =
      (sp.activities ?? []).map((a) => a.title).join(" / ") || "—";
    return `- ${c.lessonCode || s.title} "${c.title}" — skill: ${c.skillFocus}
    vocabulary already taught: ${vocab}
    evidence already used: ${sources}
    page titles already used: ${titles}`;
  });
  return lines.join("\n");
}
