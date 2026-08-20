import type { BudgetMode } from "./model-policy";

/**
 * THE GOLDEN SET — ten briefs that between them exercise everything that can
 * go wrong.
 *
 * ── WHAT IT IS FOR ───────────────────────────────────────────────────────
 * Every cost optimization from here on is a hypothesis: "a cheaper model can
 * write the teacher guide", "the exemplar is not needed for edits", "this
 * prompt can lose 400 tokens". Each is plausible, each is cheap to implement,
 * and none can be settled by looking at the diff. The only honest way to decide
 * is to run the same inputs through both configurations and compare what comes
 * out — which requires the inputs to be fixed, written down, and chosen to
 * cover the cases that actually differ.
 *
 * ── WHY THESE TEN ────────────────────────────────────────────────────────
 * Not ten variations of the same lesson. Each one is here because it stresses a
 * different part of the pipeline, and a model that handles nine of them can
 * still be unusable on the tenth:
 *
 *   age extremes        a 9-year-old and a national qualifier need opposite
 *                       scaffolding from the same machinery
 *   subject spread      debate, critical thinking and writing use different
 *                       anchors, evidence rules and vocabulary
 *   evidence load       a policy motion demands real citations; a logic lesson
 *                       demands almost none — the cheap model may pass one and
 *                       fabricate on the other
 *   format specificity  Public Forum crossfire vs format-agnostic teaching
 *   time extremes       35 minutes and 120 minutes break timing differently
 *   thin brief          one sentence with no detail is the commonest real input
 *                       and the hardest case for a small model
 *   loaded topic        a model may refuse or hedge, and a refusal nine minutes
 *                       into a build is a distinct failure mode worth catching
 *
 * ── HOW TO USE IT WITHOUT WASTING MONEY ──────────────────────────────────
 * `scripts/eval-run.mjs` builds a chosen subset under a chosen budget mode and
 * writes the scored results to disk. Nothing here calls a model by itself —
 * running the set is always a deliberate, costed act. Start with `--cases 3`.
 */

export interface GoldenCase {
  id: string;
  /** What this case is here to stress. */
  probes: string;
  brief: string;
  subject: "debate" | "critical-thinking" | "writing";
  durationMin: number;
  gradeBand: string;
  rigorLevel: "foundational" | "standard" | "advanced" | "elite";
  /** Deterministic expectations — checked by the harness, not by a person. */
  expect: {
    /** The pack must reach at least this structural score (lib/pack-score.ts). */
    minScore: number;
    /** Evidence-heavy topics must produce at least this many sourced cards. */
    minEvidenceCards?: number;
    /** Page count the outline should land near, ±3. */
    approxPages?: number;
  };
}

export const GOLDEN_SET: GoldenCase[] = [
  {
    id: "novice-rebuttal",
    probes: "the commonest real input: one thin sentence, novice band",
    brief:
      "90-minute novice class tomorrow — they're weak on rebuttal and just say 'I disagree' instead of attacking the reasoning.",
    subject: "debate",
    durationMin: 90,
    gradeBand: "Grades 6–8",
    rigorLevel: "standard",
    expect: { minScore: 70, minEvidenceCards: 3, approxPages: 13 },
  },
  {
    id: "young-band",
    probes: "the youngest band — scaffolding must appear without being asked for",
    brief:
      "First ever debate lesson for 9 and 10 year olds. They have never done this. 45 minutes. Keep it playful.",
    subject: "debate",
    durationMin: 45,
    gradeBand: "Grades 4–5",
    rigorLevel: "foundational",
    expect: { minScore: 68, approxPages: 10 },
  },
  {
    id: "elite-weighing",
    probes: "the top of the range — scaffolds must be REMOVED, not added",
    brief:
      "Varsity squad prepping for state quals. They win on evidence but lose on weighing — they never tell the judge why their impact matters more. 120 minutes.",
    subject: "debate",
    durationMin: 120,
    gradeBand: "Grades 11–12",
    rigorLevel: "elite",
    expect: { minScore: 75, minEvidenceCards: 4, approxPages: 16 },
  },
  {
    id: "pf-crossfire",
    probes: "format specificity — crossfire, not POIs or cross-ex",
    brief:
      "Public Forum team. Crossfire is a disaster: they ask open questions and let the other side make speeches. 60 minutes on controlling crossfire.",
    subject: "debate",
    durationMin: 60,
    gradeBand: "Grades 9–10",
    rigorLevel: "advanced",
    expect: { minScore: 72, approxPages: 12 },
  },
  {
    id: "policy-evidence",
    probes: "evidence load — a policy motion where fabrication is the risk",
    brief:
      "Resolved: The United States should substantially increase its investment in nuclear energy. Build the evidence work — they need to read cards properly and use the limits.",
    subject: "debate",
    durationMin: 90,
    gradeBand: "Grades 9–10",
    rigorLevel: "advanced",
    expect: { minScore: 72, minEvidenceCards: 4 },
  },
  {
    id: "logic-fallacies",
    probes: "critical thinking — a different anchor, almost no evidence deck",
    brief:
      "Critical thinking, 50 minutes. Spotting the difference between a correlation and a cause, using examples from things they actually read online.",
    subject: "critical-thinking",
    durationMin: 50,
    gradeBand: "Grades 6–8",
    rigorLevel: "standard",
    expect: { minScore: 68, approxPages: 11 },
  },
  {
    id: "writing-thesis",
    probes: "academic writing — a prose skill, not an oral one",
    brief:
      "Academic writing. Their thesis statements are just topic announcements — 'This essay will discuss...'. 60 minutes fixing that.",
    subject: "writing",
    durationMin: 60,
    gradeBand: "Grades 9–10",
    rigorLevel: "standard",
    expect: { minScore: 70, approxPages: 12 },
  },
  {
    id: "short-lesson",
    probes: "time extreme — 35 minutes must not produce a 13-page pack",
    brief:
      "Only have 35 minutes before assembly. One tight drill on signposting a speech.",
    subject: "debate",
    durationMin: 35,
    gradeBand: "Grades 6–8",
    rigorLevel: "standard",
    expect: { minScore: 65, approxPages: 8 },
  },
  {
    id: "mixed-ability",
    probes: "a constraint the model must honour in every activity",
    brief:
      "28 students, no printer, one shared screen, desks bolted in rows. Mixed ability from complete beginners to two nationals qualifiers. 60 minutes on building a contention.",
    subject: "debate",
    durationMin: 60,
    gradeBand: "Mixed / adult learners",
    rigorLevel: "standard",
    expect: { minScore: 68 },
  },
  {
    id: "loaded-topic",
    probes: "a politically live motion — refusal and hedging are the failure modes",
    brief:
      "Resolved: Social media companies should be held legally liable for content posted by users. Novice class, 60 minutes, both sides argued properly.",
    subject: "debate",
    durationMin: 60,
    gradeBand: "Grades 9–10",
    rigorLevel: "standard",
    expect: { minScore: 70, minEvidenceCards: 3 },
  },
];

export function goldenCase(id: string): GoldenCase | undefined {
  return GOLDEN_SET.find((c) => c.id === id);
}

/** What one evaluation run records, per case. */
export interface EvalResult {
  caseId: string;
  mode: BudgetMode;
  ok: boolean;
  score: number;
  usd: number;
  ms: number;
  calls: number;
  outputTokens: number;
  pages: number;
  evidenceCards: number;
  qaGrade: string | null;
  /** Expectations that were not met — empty means the case passed. */
  failures: string[];
  qualityPerDollar: number;
}

/**
 * THE HUMAN RUBRIC — how a person judges what the scorer cannot.
 *
 * ── WHY THIS EXISTS BEFORE ANY CREDITS ARE SPENT ─────────────────────────
 * "Quality" decided after seeing the results is not a measurement, it is a
 * preference discovered late. Writing the criteria down first is what stops the
 * comparison being settled by whichever output happens to read nicely on the
 * evening someone looks at it.
 *
 * ── ITS RELATIONSHIP TO scorePack ────────────────────────────────────────
 * `scorePack` reads structure and costs nothing, so it runs on everything. This
 * reads meaning, costs a person twenty minutes per pack, and runs on a sample.
 * They are not redundant: the structural score can be full marks on a lesson
 * that teaches nothing, and this rubric is the only thing that would notice.
 *
 * Use it on at least two packs per configuration under comparison — one from
 * the middle of the golden set and one from an extreme (`young-band` or
 * `elite-weighing`), because the extremes are where a cheaper model fails
 * first and the middle is where it looks fine.
 */
export interface RubricCriterion {
  id: string;
  question: string;
  /** What a 5 looks like, so the scale is not read differently by two people. */
  anchor5: string;
  /** What a 1 looks like. */
  anchor1: string;
}

export const HUMAN_RUBRIC: RubricCriterion[] = [
  {
    id: "teacher-readiness",
    question: "Could you teach this tomorrow with no preparation?",
    anchor5: "Print it and walk in. Every instruction is sayable as written.",
    anchor1: "You would have to rewrite it first, or improvise the middle.",
  },
  {
    id: "progression",
    question: "Does the lesson actually teach the skill, or only exercise it?",
    anchor5: "Each page makes the next one possible; the exit ticket is earned.",
    anchor1: "A pile of tasks about the same topic in no particular order.",
  },
  {
    id: "activity-quality",
    question: "Is every activity doing a job only it can do?",
    anchor5: "Remove any page and something is lost.",
    anchor1: "Two or three pages are the same task with different wording.",
  },
  {
    id: "age-fit",
    question: "Is the language and demand right for the stated band?",
    anchor5: "Pitched exactly there — neither babyish nor over their heads.",
    anchor1: "Reads as written for a different age group entirely.",
  },
  {
    id: "subject-accuracy",
    question: "Is the debate/subject content correct and current?",
    anchor5: "A specialist would not correct anything.",
    anchor1: "Contains a claim a specialist would call wrong.",
  },
  {
    id: "evidence-quality",
    question: "Are the sources real, relevant, and honestly limited?",
    anchor5: "Every card checks out and its limit is the real one.",
    anchor1: "A citation you cannot find, or a limit that is decoration.",
  },
  {
    id: "timing-realism",
    question: "Would this actually fit the stated minutes in a real room?",
    anchor5: "Timings survive contact with thirty twelve-year-olds.",
    anchor1: "Half the pages would be abandoned at the bell.",
  },
  {
    id: "engagement",
    question: "Would students want to do this?",
    anchor5: "There is a reason to care on the first page.",
    anchor1: "Worksheet fatigue by page three.",
  },
  {
    id: "clarity",
    question: "Can a student follow it without the teacher re-explaining?",
    anchor5: "Instructions are unambiguous at first reading.",
    anchor1: "Every page needs the teacher to translate it.",
  },
  {
    id: "overall",
    question: "Would you rather have this than an hour of your own planning?",
    anchor5: "Comfortably better than what you would have written.",
    anchor1: "You would have been quicker starting from nothing.",
  },
];

/**
 * WHAT `scorePack` DOES NOT MEASURE — read this before optimizing against it.
 *
 * A proxy becomes a target the moment someone is rewarded for moving it, and
 * this one is easy to move without improving a single lesson. Written down so
 * that a future change which raises the score is checked against this list
 * before it is called an improvement.
 *
 * It can be gamed by:
 *   MORE PAGES        substance and guide-coverage are ratios, so a pack of
 *                     sixteen adequate pages outscores twelve excellent ones.
 *   LONGER ANSWERS    answer-key coverage counts non-empty strings. "Answers
 *                     will vary" scores identically to a real model answer.
 *   NAME-DROPPING     coherence checks that a card ID appears on a page, not
 *                     that it is used correctly — a page can cite Card B for a
 *                     claim Card B contradicts and score full marks.
 *   FILLING FIELDS    rigor counts a mechanic as present when its text field is
 *                     non-empty, not when its content is any good.
 *   TIDY ARITHMETIC   timing scores the sum, not whether the minutes are
 *                     survivable in a real room.
 *
 * Every one of those is a semantic judgement, which is precisely what content
 * QA and HUMAN_RUBRIC are for. The structural score is a filter for ruling
 * configurations OUT cheaply; nothing should be ruled IN on it alone.
 */
export const SCORER_BLIND_SPOTS = [
  "page count inflation",
  "placeholder answer keys",
  "citations used incorrectly but present",
  "rigor fields filled with weak content",
  "timings that add up but do not survive a real room",
] as const;
