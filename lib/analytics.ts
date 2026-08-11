import { type CorrectionRow, type MaterialRow } from "./db";
import { STATUSES, type Status } from "./workflow";
import { correctionTag } from "./correction-tags";

/**
 * Memory Engine, closing the loop: turn this subject's RECURRING corrections
 * (from reviews and hand-edits alike) into a short "don't repeat these" brief
 * that's injected into generation. Focuses on failure modes the deterministic
 * checklist does NOT already catch — those are enforced structurally; these
 * only a smarter first draft can avoid. Returns "" until a tag has recurred
 * enough to be a real pattern, so a fresh corpus adds no noise.
 */
export interface RecurringCorrection {
  id: string;
  label: string;
  description: string;
  count: number;
}

/** The recurring, not-yet-auto-checked failure modes for a subject. */
export function recurringCorrections(
  corrections: CorrectionRow[],
  subject: string,
  { minCount = 2, max = 5 }: { minCount?: number; max?: number } = {}
): RecurringCorrection[] {
  const counts = new Map<string, number>();
  for (const c of corrections) {
    if (c.subject !== subject) continue;
    for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ tag: correctionTag(id), count }))
    .filter((x) => x.tag && !x.tag.hasAutomatedCheck && x.count >= minCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
    .map((x) => ({
      id: x.tag!.id,
      label: x.tag!.label,
      description: x.tag!.description,
      count: x.count,
    }));
}

export function recurringCorrectionGuidance(
  corrections: CorrectionRow[],
  subject: string,
  opts: { minCount?: number; max?: number } = {}
): string {
  return recurringCorrections(corrections, subject, opts)
    .map((x) => `- ${x.label} (flagged ${x.count}×): ${x.description}`)
    .join("\n");
}

/**
 * Quality-insights aggregations. Turns the raw activity/correction data into
 * the numbers a founder needs to answer "is quality improving, and what gets
 * corrected most?" — the measurable side of the Memory & Quality Engine.
 */

export interface TagStat {
  id: string;
  label: string;
  category: string;
  count: number;
  hasAutomatedCheck: boolean;
}

export interface Insights {
  funnel: { status: Status; count: number }[];
  totalMaterials: number;
  published: number;
  drafts: number;
  correctionCount: number;
  correctedMaterials: number;
  /** where the correction signal comes from: authoring edits vs review send-backs */
  bySource: { edit: number; review: number };
  /** published without ever being sent back — a clean first pass */
  cleanPublishRate: number | null;
  tagStats: TagStat[];
  byCategory: { category: string; count: number }[];
  bySubject: { subject: string; corrections: number; materials: number }[];
  byType: { type: string; corrections: number; materials: number }[];
  /** tags recurring often enough to consider a new automated check */
  promotionCandidates: TagStat[];
  mostCorrected: {
    materialId: number;
    title: string;
    count: number;
  }[];
  recent: CorrectionRow[];
}

const PROMOTION_THRESHOLD = 3; // a tag seen this many times, without a check yet

export function computeInsights(
  materials: MaterialRow[],
  corrections: CorrectionRow[]
): Insights {
  const funnel = STATUSES.map((status) => ({
    status,
    count: materials.filter((m) => m.status === status).length,
  }));

  const published = materials.filter((m) => m.status === "published").length;
  const drafts = materials.filter((m) => m.status === "draft").length;

  // "Sent back" corrections come from review actions; authoring edits are a
  // separate signal. Clean-first-pass is about send-backs, so it uses reviews.
  const reviewCorrections = corrections.filter((c) => c.action !== "edit");
  const correctedIds = new Set(reviewCorrections.map((c) => c.material_id));

  // clean first pass: of everything that reached published, how many were
  // never sent back
  const publishedIds = materials
    .filter((m) => m.status === "published")
    .map((m) => m.id);
  const cleanPublished = publishedIds.filter((id) => !correctedIds.has(id));
  const cleanPublishRate =
    publishedIds.length > 0
      ? cleanPublished.length / publishedIds.length
      : null;

  // tag frequency
  const tagCounts = new Map<string, number>();
  for (const c of corrections) {
    for (const t of c.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const tagStats: TagStat[] = [...tagCounts.entries()]
    .map(([id, count]) => {
      const def = correctionTag(id);
      return {
        id,
        label: def?.label ?? id,
        category: def?.category ?? "Other",
        count,
        hasAutomatedCheck: def?.hasAutomatedCheck ?? false,
      };
    })
    .sort((a, b) => b.count - a.count);

  const catCounts = new Map<string, number>();
  for (const t of tagStats) {
    catCounts.set(t.category, (catCounts.get(t.category) ?? 0) + t.count);
  }
  const byCategory = [...catCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  // per subject / type
  const bySubject = groupCounts(materials, corrections, (x) => x.subject);
  const byType = groupCounts(materials, corrections, (x) => x.type);

  const promotionCandidates = tagStats.filter(
    (t) => !t.hasAutomatedCheck && t.count >= PROMOTION_THRESHOLD
  );

  // most-corrected materials. A correction whose material has been deleted has
  // a null material_id — it still counts toward the tag and category stats
  // above, which is where its value is, but it has nothing to name in a
  // per-material leaderboard.
  const perMaterial = new Map<number, number>();
  for (const c of corrections) {
    if (c.material_id === null) continue;
    perMaterial.set(c.material_id, (perMaterial.get(c.material_id) ?? 0) + 1);
  }
  const titleById = new Map(materials.map((m) => [m.id, m.title]));
  const mostCorrected = [...perMaterial.entries()]
    .map(([materialId, count]) => ({
      materialId,
      title: titleById.get(materialId) ?? `#${materialId}`,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    funnel,
    totalMaterials: materials.length,
    published,
    drafts,
    correctionCount: corrections.length,
    correctedMaterials: correctedIds.size,
    bySource: {
      edit: corrections.length - reviewCorrections.length,
      review: reviewCorrections.length,
    },
    cleanPublishRate,
    tagStats,
    byCategory,
    bySubject,
    byType,
    promotionCandidates,
    mostCorrected,
    recent: corrections.slice(0, 12),
  };
}

function groupCounts(
  materials: MaterialRow[],
  corrections: CorrectionRow[],
  key: (x: { subject: string; type: string }) => string
) {
  const matCounts = new Map<string, number>();
  for (const m of materials) {
    const k = key(m);
    matCounts.set(k, (matCounts.get(k) ?? 0) + 1);
  }
  const corrCounts = new Map<string, number>();
  for (const c of corrections) {
    const k = key(c);
    corrCounts.set(k, (corrCounts.get(k) ?? 0) + 1);
  }
  return [...matCounts.entries()]
    .map(([k, materials]) => ({
      subject: k,
      type: k,
      materials,
      corrections: corrCounts.get(k) ?? 0,
    }))
    .sort((a, b) => b.corrections - a.corrections);
}
