import { z } from "zod";
import { type MaterialRow } from "./db";
import { type LessonPack } from "./lesson-pack-schema";
import { subjectDef } from "./subjects";

/**
 * Unit planning — the scope-and-sequence layer.
 *
 * A single lesson is a page; a unit is a *course*. This module plans a whole
 * class as one deliberate arc of N lessons that build on each other, and gives
 * that class its own visual + thematic identity so it reads as one world — and
 * so the NEXT class the same teacher builds looks visibly different rather than
 * a recolour of the last one.
 *
 * The plan is produced by the model (see `planUnit` in ai.ts), shown to the
 * author to edit, then batch-created as draft lesson packs that share the
 * unit's design and each carry their slot in the sequence into generation.
 */

/** The shared look + feel every lesson in a class inherits. */
export const unitDesignSchema = z.object({
  /** cover/border accent — a hex colour distinct from other classes' accents */
  accentColor: z.string(),
  /** a single cover emoji/motif icon for the whole unit */
  coverEmoji: z.string(),
  /**
   * the class's theming world, e.g. "Cold-case detective dossier" or
   * "Newsroom on deadline". Replaces the default spy/agent theming in
   * generation so each class feels like its own universe.
   */
  motif: z.string(),
  /** one line on the tone the motif sets, shown to the author */
  motifBlurb: z.string(),
});
export type UnitDesign = z.infer<typeof unitDesignSchema>;

/** One planned lesson — a slot in the sequence, not yet generated. */
export const unitLessonStubSchema = z.object({
  lessonCode: z.string(),
  coverTitle: z.string(),
  skillFocus: z.string(),
  format: z.string(),
  durationMin: z.number().int(),
  /** the cognitive job of this lesson in one line */
  goal: z.string(),
  /** how it stands on the lessons before it — the arc connective tissue */
  buildsOn: z.string(),
});
export type UnitLessonStub = z.infer<typeof unitLessonStubSchema>;

export const unitPlanSchema = z.object({
  subject: z.enum(["debate", "critical-thinking", "writing"]),
  series: z.string(),
  unitTitle: z.string(),
  /** the through-line: the one capability the whole unit builds toward */
  bigIdea: z.string(),
  resolution: z.string(),
  gradeBand: z.string(),
  rigorLevel: z.enum(["foundational", "standard", "advanced", "elite"]),
  durationMin: z.number().int(),
  design: unitDesignSchema,
  lessons: z.array(unitLessonStubSchema),
});
export type UnitPlan = z.infer<typeof unitPlanSchema>;

/**
 * Accent colours already spoken for by existing classes. Fed to the planner so
 * a new unit is pushed onto a clearly different part of the colour wheel — the
 * mechanism behind "new class, new design".
 */
export function usedAccents(materials: MaterialRow[]): string[] {
  const seen = new Set<string>();
  for (const m of materials) {
    if (m.type !== "lesson-pack") continue;
    const c = m.content as LessonPack;
    const hex = (c.accentColor ?? "").trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(hex)) seen.add(hex);
  }
  return [...seen];
}

/** Motifs already in play, so the planner reaches for a fresh theming world. */
export function usedMotifs(materials: MaterialRow[]): string[] {
  const seen = new Set<string>();
  for (const m of materials) {
    if (m.type !== "lesson-pack") continue;
    const motif = ((m.content as LessonPack).designMotif ?? "").trim();
    if (motif) seen.add(motif);
  }
  return [...seen];
}

const HEX = /^#[0-9a-f]{6}$/i;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Rough perceptual distance between two hex colours (0 = identical). */
function colourDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  // luma-weighted euclidean — good enough to tell "clearly different" apart
  return Math.sqrt(
    2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2
  );
}

/**
 * A curated, high-contrast fallback palette. If the model returns an accent too
 * close to an existing class's (or an invalid hex), we snap to the most-distant
 * unused colour here — so distinctness is guaranteed, not merely requested.
 */
const FALLBACK_ACCENTS = [
  "#0f766e", // teal
  "#b45309", // amber
  "#6d28d9", // violet
  "#b91c1c", // brick red
  "#1d4ed8", // royal blue
  "#15803d", // forest
  "#be185d", // magenta
  "#0e7490", // cyan
  "#a16207", // ochre
  "#4338ca", // indigo
  "#c2410c", // burnt orange
  "#0369a1", // steel blue
];

/**
 * Guarantee a class accent that stands clearly apart from every existing
 * class. Honours the model's choice when it's already distinct; otherwise picks
 * the fallback colour with the greatest minimum distance to what's in use.
 */
export function ensureDistinctAccent(
  proposed: string,
  used: string[]
): string {
  const norm = (proposed ?? "").trim().toLowerCase();
  const MIN_DISTANCE = 120; // below this two accents read as "the same colour"
  const farEnough = (c: string) =>
    used.every((u) => colourDistance(c, u) >= MIN_DISTANCE);

  if (HEX.test(norm) && farEnough(norm)) return norm;

  // rank fallbacks by how far the nearest existing accent is; take the best
  let best = FALLBACK_ACCENTS[0];
  let bestScore = -1;
  for (const c of FALLBACK_ACCENTS) {
    const score = used.length
      ? Math.min(...used.map((u) => colourDistance(c, u)))
      : Infinity;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  // if the model's own colour is valid and beats the best fallback, keep it
  if (HEX.test(norm)) {
    const proposedScore = used.length
      ? Math.min(...used.map((u) => colourDistance(norm, u)))
      : Infinity;
    if (proposedScore >= bestScore) return norm;
  }
  return best;
}

/** URL-safe key identifying a unit (a series is scoped to one subject). */
export function unitKey(subject: string, series: string): string {
  return encodeURIComponent(`${subject}::${series}`);
}

export function parseUnitKey(key: string): { subject: string; series: string } {
  const [subject, ...rest] = decodeURIComponent(key).split("::");
  return { subject, series: rest.join("::") };
}

/**
 * The sequence map injected into each lesson's generation: the full ordered
 * unit, with THIS lesson marked. It's what turns "don't repeat your siblings"
 * into "you are lesson 4 of 10 — stand on 1–3, set up 5". Built from the drafts
 * themselves, so it works even before the other lessons are generated.
 */
export function unitArcDigest(
  self: { lessonCode: string; skillFocus: string },
  siblings: MaterialRow[]
): string {
  const rows = [
    { code: self.lessonCode, skill: self.skillFocus, isSelf: true },
    ...siblings.map((s) => {
      const c = s.content as LessonPack;
      return {
        code: c.lessonCode ?? "",
        skill: c.skillFocus ?? s.title,
        isSelf: false,
      };
    }),
  ];
  if (rows.length < 2) return "";
  rows.sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" })
  );
  const lines = rows
    .map(
      (r) =>
        `  ${r.code || "—"}: ${r.skill || "—"}${r.isSelf ? "   ◀ YOU ARE WRITING THIS ONE" : ""}`
    )
    .join("\n");
  return `THIS UNIT'S FULL SCOPE & SEQUENCE — you are writing one lesson inside this planned arc:\n${lines}`;
}

/** A short human label for a unit, used in headers and the library. */
export function unitAnchorLabel(subject: string): string {
  return subjectDef(subject).anchorLabel;
}
