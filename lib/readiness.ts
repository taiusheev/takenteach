import type { LessonPack } from "./lesson-pack-schema";

/**
 * What a half-built pack can already do.
 *
 * A full build takes 7–9 minutes, and until now the teacher could do nothing at
 * all until the last stage finished — even though a lesson is read and taught in
 * order, so the cover, the hook and the modelled example are useful long before
 * the transfer task exists.
 *
 * This computes, from the pack as it currently stands, which of those milestones
 * have actually been reached. It is deliberately pure and content-based rather
 * than stage-based: a resumed build, a hand-edited pack and a fresh one all get
 * the same honest answer, and no stage has to remember to announce anything.
 */

export type ReadinessLevel =
  | "empty"
  | "planned"
  | "partial"
  | "teachable"
  | "complete";

export interface Readiness {
  level: ReadinessLevel;
  /** what the teacher can do right now, in their words */
  headline: string;
  /** pages that exist and would print today */
  pages: number;
  /** pages the outline still owes */
  outstanding: number;
  /** true once printing produces something you could stand in front of a class with */
  canTeach: boolean;
  /** what is still missing for that, most important first */
  missing: string[];
}

/** The beats a lesson cannot be taught without. */
const CORE: [string, string][] = [
  ["hook", "an opening hook"],
  ["i-do", "a modelled example"],
  ["we-do", "guided practice"],
  ["exit-ticket", "an exit ticket"],
];

export function packReadiness(pack: LessonPack): Readiness {
  const pages = pack.activities.length;
  const planned = pack.outlinePlan?.length ?? 0;
  const outstanding = Math.max(0, planned - pages);
  const kinds = new Set(pack.activities.map((a) => a.kind));

  const missing: string[] = [];
  if (!pack.title.trim()) missing.push("a lesson title");
  if (pack.successCriteria.length === 0) missing.push("success criteria");
  for (const [kind, label] of CORE) {
    if (!kinds.has(kind as (typeof pack.activities)[number]["kind"])) {
      missing.push(label);
    }
  }
  if (pack.teacherGuide.timingPlan.length === 0) missing.push("the timing plan");

  const canTeach = missing.length === 0;

  if (pages === 0 && planned === 0) {
    return {
      level: "empty",
      headline: "Nothing generated yet",
      pages,
      outstanding,
      canTeach: false,
      missing,
    };
  }
  if (pages === 0) {
    return {
      level: "planned",
      headline: `Page-by-page plan ready — ${planned} pages mapped out`,
      pages,
      outstanding,
      canTeach: false,
      missing,
    };
  }
  if (!canTeach) {
    return {
      level: "partial",
      headline: `${pages} page${pages === 1 ? "" : "s"} written — printable now, still building`,
      pages,
      outstanding,
      canTeach: false,
      missing,
    };
  }
  if (outstanding > 0) {
    return {
      level: "teachable",
      headline: `Teachable now — ${pages} pages ready, ${outstanding} still coming`,
      pages,
      outstanding,
      canTeach: true,
      missing,
    };
  }
  return {
    level: "complete",
    headline: `Complete — ${pages} pages`,
    pages,
    outstanding,
    canTeach: true,
    missing,
  };
}
