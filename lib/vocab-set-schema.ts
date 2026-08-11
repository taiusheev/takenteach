import { z } from "zod";

/**
 * Vocabulary Set — a standalone word bank students keep. Richer per term than
 * the vocabulary block inside a Lesson Pack: part of speech, an example
 * sentence, and the mistake students actually make with the word.
 */

export const vocabEntrySchema = z.object({
  term: z.string(),
  partOfSpeech: z.string().optional().default(""),
  definition: z.string(),
  analogy: z.string().optional().default(""), // "Think of it like…"
  exampleSentence: z.string().optional().default(""),
  commonError: z.string().optional().default(""), // the misuse to pre-empt
});
export type VocabEntry = z.infer<typeof vocabEntrySchema>;

export const vocabPracticeSchema = z.object({
  prompt: z.string(),
  expectedAnswer: z.string(),
});

export const vocabSetSchema = z.object({
  lessonCode: z.string(),
  title: z.string(),
  skillFocus: z.string(),
  series: z.string(),
  resolution: z.string(), // the unit anchor these words serve
  durationMin: z.number().int().min(0).default(30),
  accentColor: z.string().default("#0f766e"),
  emoji: z.string().default("📖"),

  gradeBand: z.string().optional().default(""),
  rigorLevel: z.string().default("standard"),
  introduction: z.string().optional().default(""),
  terms: z.array(vocabEntrySchema).default([]),
  /** fill-in-the-blank / definition-match practice */
  practice: z.array(vocabPracticeSchema).default([]),
  quickFire: z.array(vocabPracticeSchema).default([]),
  teacherNotes: z.string().optional().default(""),
});
export type VocabSet = z.infer<typeof vocabSetSchema>;

export function emptyVocabSet(): VocabSet {
  return vocabSetSchema.parse({
    lessonCode: "",
    title: "",
    skillFocus: "",
    series: "",
    resolution: "",
  });
}
