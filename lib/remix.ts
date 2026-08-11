import { type LessonPack, lessonPackSchema } from "./lesson-pack-schema";
import { type AnyContent, commonFields, contentTypeDef } from "./content-types";

/**
 * Remix / Fork — start a new lesson from one that already works.
 *
 * Two modes:
 *  - duplicate: an exact copy as a fresh draft (iterate without touching the
 *    published original).
 *  - remix: keep the proven pedagogical skeleton — the activity sequence,
 *    kinds, timings, block shapes, rubric bands — but swap the topic. Content
 *    is cleared and the inherited structure is handed to Quick Build so the AI
 *    refills that shape instead of planning a new lesson from scratch.
 */

export type ForkMode = "duplicate" | "remix";

export interface ForkOptions {
  lessonCode: string;
  coverTitle: string;
  skillFocus: string;
  series: string;
  resolution: string;
  durationMin?: number;
}

/** One inherited activity slot — the shape Quick Build must fill. */
export interface OutlineSlot {
  kind: LessonPack["activities"][number]["kind"];
  title: string;
  badge: string;
  durationMin: number;
  goal: string;
  /** block shape of the source activity, so the remix keeps the same texture */
  shape: {
    prompts: number;
    exampleLayers: number;
    sortItems: number;
    matchPairs: number;
    frames: number;
    keyIdea: boolean;
    standAndDeliver: boolean;
  };
}

export interface InheritedOutline {
  slots: OutlineSlot[];
  vocabularyCount: number;
  evidenceCount: number;
  evidenceSides: string[];
  rubricBands: number;
  timingPhases: number;
}

function firstSentence(s: string, max = 140): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const cut = t.split(/(?<=[.!?])\s/)[0];
  return cut.length > max ? cut.slice(0, max) + "…" : cut;
}

/** Derive the structural skeleton of a pack — what makes it work, minus its topic. */
export function extractOutline(pack: LessonPack): InheritedOutline {
  return {
    slots: pack.activities.map((a) => ({
      kind: a.kind,
      title: a.title,
      badge: a.badge,
      durationMin: a.durationMin,
      goal: firstSentence(a.instructions || a.body || a.title),
      shape: {
        prompts: a.prompts.length,
        exampleLayers: a.exampleLayers.length,
        sortItems: a.sortItems.length,
        matchPairs: a.matchPairs.length,
        frames: a.frames.length,
        keyIdea: a.keyIdea.trim().length > 0,
        standAndDeliver: a.standAndDeliver.trim().length > 0,
      },
    })),
    vocabularyCount: pack.vocabulary.length,
    evidenceCount: pack.evidenceCards.length,
    evidenceSides: pack.evidenceCards.map((c) => c.side),
    rubricBands: pack.teacherGuide.rubric.length,
    timingPhases: pack.teacherGuide.timingPlan.length,
  };
}

/** Exact copy as a fresh draft; only the identity fields are re-set. Any type. */
export function duplicateContent(
  type: string,
  content: AnyContent,
  opts: ForkOptions
): AnyContent {
  const c = commonFields(content);
  return contentTypeDef(type).schema.parse({
    ...structuredClone(content),
    lessonCode: opts.lessonCode || c.lessonCode,
    title: opts.coverTitle || c.title,
    skillFocus: opts.skillFocus || c.skillFocus,
    series: opts.series || c.series,
    resolution: opts.resolution || c.resolution,
    durationMin: opts.durationMin ?? c.durationMin,
  });
}

/**
 * Remix for the lighter types: keep identity + style, clear the type-specific
 * body. (Lesson Packs use remixPack below, which also hands Quick Build the
 * source's page structure.)
 */
export function remixContent(
  type: string,
  content: AnyContent,
  opts: ForkOptions
): AnyContent {
  const c = commonFields(content);
  const def = contentTypeDef(type);
  const blank = def.empty() as Record<string, unknown>;
  return def.schema.parse({
    ...blank,
    lessonCode: opts.lessonCode,
    title: opts.coverTitle,
    skillFocus: opts.skillFocus,
    series: opts.series || c.series,
    resolution: opts.resolution,
    durationMin: opts.durationMin ?? c.durationMin,
    accentColor: c.accentColor,
    emoji: c.emoji,
  });
}

/**
 * Keep the style and skeleton, drop the topic content. The result is an empty
 * pack carrying the source's visual identity and duration; the structure it
 * should be refilled with travels separately as the InheritedOutline.
 */
export function remixPack(pack: LessonPack, opts: ForkOptions): LessonPack {
  return lessonPackSchema.parse({
    lessonCode: opts.lessonCode,
    title: opts.coverTitle,
    subtitle: "",
    skillFocus: opts.skillFocus,
    series: opts.series || pack.series,
    resolution: opts.resolution,
    durationMin: opts.durationMin ?? pack.durationMin,
    // style identity carries over — that's the point of a remix
    accentColor: pack.accentColor,
    emoji: pack.emoji,
    mission: "",
    successCriteria: [],
    vocabulary: [],
    evidenceCards: [],
    activities: [],
    teacherGuide: {
      cohort: pack.teacherGuide.cohort,
      assessment: "",
      nextLesson: "",
      materialsChecklist: "",
      timingPlan: [],
      launchScripts: [],
      pitfalls: "",
      rubric: [],
    },
  });
}

/** Human-readable summary of what a remix will carry over, for the fork UI. */
export function describeOutline(o: InheritedOutline): string[] {
  const bits = [
    `${o.slots.length} activities in the same order and timing`,
  ];
  if (o.vocabularyCount) bits.push(`${o.vocabularyCount} vocabulary terms`);
  if (o.evidenceCount) bits.push(`${o.evidenceCount} evidence cards`);
  const shaped = o.slots.filter(
    (s) =>
      s.shape.exampleLayers || s.shape.sortItems || s.shape.matchPairs || s.shape.frames
  ).length;
  if (shaped) bits.push(`${shaped} pages with worked examples, drills or frames`);
  if (o.rubricBands) bits.push(`${o.rubricBands}-band rubric`);
  return bits;
}
