import { z } from "zod";

/**
 * Judge Ballot — the Debate-only feedback form a judge fills in during a
 * round. This is a *template*: the founder/coach authors the criteria and
 * prompts, and it prints as a blank form. In Phase 5 the same schema backs the
 * structured feedback the Judging module collects digitally.
 */

export const ballotCriterionSchema = z.object({
  name: z.string(), // "Argumentation", "Refutation", "Delivery"
  description: z.string(), // what the judge is actually looking for
  maxPoints: z.number().int().min(1).max(100).default(10),
});
export type BallotCriterion = z.infer<typeof ballotCriterionSchema>;

export const ballotPromptSchema = z.object({
  label: z.string(),
  hint: z.string().optional().default(""), // guidance so feedback stays specific
  lines: z.number().int().min(1).max(12).default(3), // writing space on the printed form
});
export type BallotPrompt = z.infer<typeof ballotPromptSchema>;

export const judgeBallotSchema = z.object({
  lessonCode: z.string(), // ballot code, e.g. "PF-NOV"
  title: z.string(),
  skillFocus: z.string(), // what this ballot emphasises
  series: z.string(),
  resolution: z.string(), // the round's resolution
  durationMin: z.number().int().min(0).default(0),
  accentColor: z.string().default("#1e40af"),
  emoji: z.string().default("⚖️"),

  format: z.string().optional().default("Public Forum"),
  division: z.string().optional().default(""),
  criteria: z.array(ballotCriterionSchema).default([]),
  speakerPoints: z
    .object({
      min: z.number().int().default(20),
      max: z.number().int().default(30),
      guidance: z.string().default(""),
    })
    .default({ min: 20, max: 30, guidance: "" }),
  /** structured Reason For Decision — stops "it was good" ballots */
  rfdPrompts: z.array(ballotPromptSchema).default([]),
  feedbackPrompts: z.array(ballotPromptSchema).default([]),
  decisionRules: z.string().optional().default(""),
  judgeNotes: z.string().optional().default(""),
});
export type JudgeBallot = z.infer<typeof judgeBallotSchema>;

export function emptyJudgeBallot(): JudgeBallot {
  return judgeBallotSchema.parse({
    lessonCode: "",
    title: "",
    skillFocus: "",
    series: "",
    resolution: "",
  });
}
