import type { LessonPack } from "./lesson-pack-schema";
import { packReadiness } from "./readiness";
import { coherenceReport } from "./coherence";
import { missingMechanics } from "./rigor";

/**
 * HOW GOOD IS THIS PACK, WITHOUT ASKING A MODEL?
 *
 * ── WHY THIS HAS TO EXIST BEFORE ANY MODEL COMPARISON ────────────────────
 * The question worth answering is not "which model is cheapest" but "which
 * model gives the most teacher-ready lesson per dollar". The denominator was
 * already measurable — the meter now records it per call. The numerator was
 * not: judging a pack meant a person reading twenty pages, or paying a model to
 * review it, and neither scales to a comparison across three models and ten
 * lessons.
 *
 * So this scores a pack from the pack alone. Every component is a deterministic
 * reading of structure the product already depends on, and it costs nothing to
 * run — which means a model comparison can be re-run on every prompt change
 * rather than once, and a cost optimization can be checked for quality damage
 * before it ships rather than after a teacher notices.
 *
 * ── WHAT IT DELIBERATELY DOES NOT CLAIM ──────────────────────────────────
 * This is NOT a measure of whether the lesson is any good to teach. It cannot
 * read whether an analogy lands, whether an explanation misleads, or whether
 * the evidence actually supports the claim — those are exactly the judgements
 * content QA exists to make, and pretending a structural score covers them
 * would be the "fake metric that looks impressive" this product has been
 * careful to avoid everywhere else.
 *
 * What it measures is whether the pack has the SHAPE of a teachable lesson:
 * the beats in the right order, the scaffolds where they belong, every prompt
 * keyed, every card used, the timings honest. A model that scores badly here is
 * producing structurally deficient packs and no amount of prose quality
 * rescues that. A model that scores well may still be writing weak lessons —
 * which is why the QA grade, when one exists, is reported alongside rather
 * than folded in.
 */

export interface ScoreComponent {
  id: string;
  label: string;
  /** 0–1 */
  score: number;
  /** relative importance within the total */
  weight: number;
  detail: string;
}

export interface PackScore {
  /** 0–100, weighted. */
  total: number;
  components: ScoreComponent[];
  /** Content QA's own grade, if it has run. Reported, never folded in. */
  qaGrade: string | null;
  pages: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function scorePack(pack: LessonPack): PackScore {
  const pages = pack.activities.length;
  const components: ScoreComponent[] = [];

  // ── 1. Does it have the beats of a lesson at all? ──
  const readiness = packReadiness(pack);
  components.push({
    id: "teachable",
    label: "Teachable shape",
    weight: 3,
    score: readiness.canTeach ? 1 : clamp01(1 - readiness.missing.length / 6),
    detail: readiness.canTeach
      ? "hook, model, guided practice and exit ticket all present"
      : `missing ${readiness.missing.join(", ")}`,
  });

  // ── 2. Is every student prompt answerable by the teacher? ──
  const prompts = pack.activities.flatMap((a) => a.prompts);
  const keyed = prompts.filter((p) => p.expectedAnswer.trim()).length;
  components.push({
    id: "answer-key",
    label: "Answer key coverage",
    weight: 2,
    score: prompts.length === 0 ? 0 : keyed / prompts.length,
    detail: `${keyed}/${prompts.length} prompts keyed`,
  });

  // ── 3. Is the evidence real work, or decoration? ──
  const cards = pack.evidenceCards;
  const sourced = cards.filter(
    (c) => c.institution.trim() && c.year.trim() && c.publication.trim()
  ).length;
  const limited = cards.filter((c) => c.limit.trim().split(/\s+/).length >= 8).length;
  components.push({
    id: "evidence",
    label: "Evidence integrity",
    weight: 2,
    score:
      cards.length === 0 ? 0 : (sourced / cards.length) * 0.5 + (limited / cards.length) * 0.5,
    detail: `${cards.length} cards · ${sourced} fully sourced · ${limited} with real scope limits`,
  });

  // ── 4. Is what it defines actually used? ──
  const coh = coherenceReport(pack);
  const defined = coh.evidenceCount + coh.vocabCount;
  const unused = coh.unusedEvidence.length + coh.unusedVocab.length;
  components.push({
    id: "coherence",
    label: "Cards and terms put to work",
    weight: 2,
    score: defined === 0 ? 0 : clamp01(1 - unused / defined),
    detail:
      unused === 0
        ? "every card and term is deployed on a page"
        : `${unused} of ${defined} defined but never used`,
  });

  // ── 5. Do the pages carry the rigor the product promises? ──
  let owed = 0;
  let met = 0;
  for (const a of pack.activities) {
    const missing = missingMechanics(a);
    owed += missing.length;
    met += 1;
  }
  components.push({
    id: "rigor",
    label: "Rigor mechanics present where required",
    weight: 2,
    score: met === 0 ? 0 : clamp01(1 - owed / Math.max(1, met)),
    detail: owed === 0 ? "every page carries what it owes" : `${owed} mechanics missing`,
  });

  // ── 6. Do the minutes tell the truth? ──
  const planned = pack.activities.reduce((n, a) => n + a.durationMin, 0);
  const target = pack.durationMin;
  const drift = target > 0 ? Math.abs(planned - target) / target : 1;
  components.push({
    id: "timing",
    label: "Timing honest",
    weight: 1,
    score: clamp01(1 - drift * 3), // 33% out scores zero
    detail: `pages total ${planned} min against a ${target}-minute lesson`,
  });

  // ── 7. Does the teacher guide make it runnable by someone else? ──
  const guide = pack.teacherGuide;
  const guideBits = [
    guide.timingPlan.length > 0,
    guide.rubric.length > 0,
    guide.materialsChecklist.trim().length > 0,
    guide.pitfalls.trim().length > 0,
    (guide.pageCoaching?.length ?? 0) >= Math.max(1, Math.floor(pages * 0.6)),
  ];
  components.push({
    id: "teacher-guide",
    label: "Runnable by another teacher",
    weight: 2,
    score: guideBits.filter(Boolean).length / guideBits.length,
    detail: `${guideBits.filter(Boolean).length}/${guideBits.length} guide elements present`,
  });

  // ── 8. Is any page empty or a placeholder? ──
  const substantive = pack.activities.filter(
    (a) =>
      a.title.trim() &&
      a.instructions.trim() &&
      (a.prompts.length > 0 ||
        a.sortItems.length > 0 ||
        a.frames.length > 0 ||
        a.exampleLayers.length > 0 ||
        a.matchPairs.length > 0 ||
        a.quiz.length > 0)
  ).length;
  components.push({
    id: "substance",
    label: "Every page has work on it",
    weight: 2,
    score: pages === 0 ? 0 : substantive / pages,
    detail: `${substantive}/${pages} pages carry student work`,
  });

  // ── 9. Are the pages distinct from each other? ──
  const titles = pack.activities.map((a) => a.title.trim().toLowerCase()).filter(Boolean);
  const distinct = new Set(titles).size;
  components.push({
    id: "distinct",
    label: "Pages are distinct",
    weight: 1,
    score: titles.length === 0 ? 0 : distinct / titles.length,
    detail: `${distinct}/${titles.length} distinct page titles`,
  });

  const weightSum = components.reduce((n, c) => n + c.weight, 0);
  const total =
    components.reduce((n, c) => n + clamp01(c.score) * c.weight, 0) / weightSum;

  let qaGrade: string | null = null;
  if (pack.contentQaJson) {
    try {
      qaGrade =
        (JSON.parse(pack.contentQaJson) as { overallGrade?: string }).overallGrade ??
        null;
    } catch {
      qaGrade = null;
    }
  }

  return {
    total: Math.round(total * 100),
    components,
    qaGrade,
    pages,
  };
}

/**
 * Quality per dollar — the number this whole exercise is for.
 *
 * Points of structural quality per dollar spent. Meaningless in absolute terms
 * and precisely the right shape for a comparison: the same ten briefs run
 * through two models produce two of these, and the bigger one wins regardless
 * of which was cheaper or which scored higher alone.
 */
export function qualityPerDollar(score: PackScore, usd: number): number {
  if (usd <= 0) return 0;
  return score.total / usd;
}
