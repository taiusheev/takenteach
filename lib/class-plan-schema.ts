import { z } from "zod";

/**
 * Class Plan — the lightweight cousin of the Lesson Pack. Two to four printed
 * pages: what happens, in what order, with what materials. No evidence deck,
 * no student worksheet pages; a teacher runs the room from this.
 */

export const planSegmentSchema = z.object({
  startMin: z.number().int().min(0),
  endMin: z.number().int().min(0),
  title: z.string(),
  who: z.enum(["T", "Ss", "T+Ss"]).default("T"),
  what: z.string(),
});
export type PlanSegment = z.infer<typeof planSegmentSchema>;

export const classPlanSchema = z.object({
  lessonCode: z.string(),
  title: z.string(),
  skillFocus: z.string(),
  series: z.string(),
  /** resolution / central question / writing focus — same anchor role as a pack */
  resolution: z.string(),
  durationMin: z.number().int().min(0).default(60),
  accentColor: z.string().default("#0f766e"),
  emoji: z.string().default("📋"),
  // Who the session is for. A run-sheet drafted without these reads the same
  // for a first-week novice class and an elite squad, which is the fastest way
  // to a plan a teacher quietly rewrites.
  gradeBand: z.string().default("Grades 6–8"),
  rigorLevel: z.string().default("standard"),

  objective: z.string(), // one-line "students will be able to…"
  materials: z.string(),
  doNow: z.string(), // bell-ringer / warm-up
  segments: z.array(planSegmentSchema).default([]),
  keyQuestions: z.array(z.string()).default([]), // cold-call / CFU questions
  differentiation: z.string().optional().default(""),
  homework: z.string().optional().default(""),
  teacherNotes: z.string().optional().default(""),
});
export type ClassPlan = z.infer<typeof classPlanSchema>;

export function emptyClassPlan(): ClassPlan {
  return classPlanSchema.parse({
    lessonCode: "",
    title: "",
    skillFocus: "",
    series: "",
    resolution: "",
    objective: "",
    materials: "",
    doNow: "",
  });
}
