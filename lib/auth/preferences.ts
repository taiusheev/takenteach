import { z } from "zod";
import { GRADE_BANDS } from "@/lib/lesson-quality";
import { SUBJECTS } from "@/lib/subjects";

/**
 * A teacher's own defaults.
 *
 * ── WHY THIS IS A SCHEMA AND NOT AN INTERFACE ────────────────────────────
 * The value arrives as JSON text out of `users.preferences`, written by a
 * version of the app that may be older than the one reading it. Parsing it
 * through zod means a preference added next month reads as its default on
 * every row already in the table, and a corrupted or hand-edited value degrades
 * to defaults instead of throwing on a page render.
 *
 * ── WHAT IS DELIBERATELY NOT IN HERE ─────────────────────────────────────
 * The brief's settings page also lists AI creativity, source preferences,
 * notification switches and a preferred language. None of those are here,
 * because a preference is only real if something reads it. `subject`,
 * `gradeBand` and `durationMin` are consumed by the create flow the moment
 * they are saved; a "creativity" slider would be a control that moves and
 * changes nothing, which is worse than an absent setting — it teaches people
 * that the settings page does not work.
 */
export const preferencesSchema = z.object({
  /** The track a new lesson starts on. */
  subject: z.enum(SUBJECTS).catch("debate"),
  /** Reading level. Drives the AI's word caps — see gradeBandGuidance(). */
  gradeBand: z.enum(GRADE_BANDS).catch("Grades 6–8"),
  /** Default lesson length in minutes. */
  durationMin: z.number().int().min(15).max(600).catch(120),
  /**
   * WHAT THIS TEACHER'S CLASSES ARE LIKE — the memory a teacher was retyping
   * into "Add teaching detail" on every single build.
   *
   * Consumed twice: `QuickBuildWizard` seeds the per-lesson prior
   * knowledge/misconceptions/constraints fields from these so a returning
   * teacher starts from their own last answer instead of a blank box, and
   * `planLesson()` reads them so it stops asking a clarifying question the
   * teacher already answered once. Per-lesson fields still win — these are a
   * starting point, never a silent override of what's typed for THIS lesson.
   */
  defaultPriorKnowledge: z.string().max(600).catch(""),
  defaultMisconceptions: z.string().max(600).catch(""),
  defaultConstraints: z.string().max(600).catch(""),
});

export type Preferences = z.infer<typeof preferencesSchema>;

/** Parse whatever is in the column, falling back to defaults on anything odd. */
export function parsePreferences(raw: string | null | undefined): Preferences {
  if (!raw) return preferencesSchema.parse({});
  try {
    return preferencesSchema.parse(JSON.parse(raw));
  } catch {
    /* Unparseable JSON is not worth an error page. Someone editing the row by
       hand, or a half-written value, should cost the defaults and nothing
       more — this is read on the create screen, not at a security boundary. */
    return preferencesSchema.parse({});
  }
}
