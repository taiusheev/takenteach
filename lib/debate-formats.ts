/**
 * The competitive formats themselves — the object the platform was missing.
 *
 * `lesson-formats.ts` describes how a LESSON is shaped (skill drill, workshop,
 * clinic). This file describes how a ROUND is shaped: who speaks, for how long,
 * in what order, how questioning works, how judges score it, and what the format
 * calls its own moves. Nine planned features need it — a Public Forum lesson
 * must teach crossfire while a British Parliamentary one teaches extensions, a
 * ballot's speaker-point scale differs per format, and a crossfire trainer is
 * nonsense in a format that uses points of information instead.
 *
 * Everything here is reference data, not generated content: it is stable, it is
 * the same for every school, and getting it wrong is a factual error rather than
 * a matter of taste.
 */

export interface SpeechSlot {
  /** the speech's name in this format's own language */
  name: string;
  /** who delivers it */
  speaker: string;
  minutes: number;
  /** what this speech is FOR — the burden it must discharge */
  purpose: string;
}

export interface DebateFormat {
  id: string;
  label: string;
  /** the short name coaches actually say out loud */
  short: string;
  /** teams × speakers, e.g. "2 teams × 2 speakers" */
  teams: string;
  /** typical age/experience home of the format */
  typical: string;
  speeches: SpeechSlot[];
  prepTimeMin: number;
  /** how opponents question each other — the single biggest format difference */
  questioning: {
    style: "crossfire" | "cross-examination" | "points-of-information" | "reply-only";
    label: string;
    rules: string;
  };
  /** what judges are actually deciding */
  judging: {
    criteria: string[];
    speakerPoints: string;
    decision: string;
  };
  /** format-specific moves a lesson in this format should teach by name */
  vocabulary: string[];
  /** the mistake novices make in THIS format */
  commonNoviceError: string;
}

export const DEBATE_FORMATS: DebateFormat[] = [
  {
    id: "public-forum",
    label: "Public Forum",
    short: "PF",
    teams: "2 teams × 2 speakers",
    typical: "Middle and high school; accessible to lay judges",
    speeches: [
      { name: "Constructive", speaker: "First speaker, both sides", minutes: 4, purpose: "Present the team's case — contentions with warrants and evidence." },
      { name: "Crossfire", speaker: "First speakers", minutes: 3, purpose: "Question each other directly; expose weak warrants." },
      { name: "Rebuttal", speaker: "Second speaker, both sides", minutes: 4, purpose: "Answer the opponent's case line by line; second rebuttal must also frontline." },
      { name: "Crossfire", speaker: "Second speakers", minutes: 3, purpose: "Press the rebuttals; set up weighing." },
      { name: "Summary", speaker: "First speakers", minutes: 3, purpose: "Collapse to the strongest clash and start weighing." },
      { name: "Grand Crossfire", speaker: "All four", minutes: 3, purpose: "Whole-round questioning on the key clash." },
      { name: "Final Focus", speaker: "Second speakers", minutes: 2, purpose: "One voter, weighed. No new arguments." },
    ],
    prepTimeMin: 3,
    questioning: {
      style: "crossfire",
      label: "Crossfire",
      rules:
        "Both speakers question each other simultaneously — no alternating turns. Whoever asks first should ask a short closed question. Answers must be brief; a speech in crossfire loses the exchange.",
    },
    judging: {
      criteria: ["Clash on the key contention", "Warranted evidence", "Weighing in summary and final focus", "Clarity for a lay judge"],
      speakerPoints: "Typically 25–30 per speaker, 27.5 average",
      decision: "One team wins; the RFD names the voting issue and why it outweighs.",
    },
    vocabulary: ["contention", "warrant", "frontline", "turn", "weighing", "voter", "crossfire", "final focus"],
    commonNoviceError: "Repeating their case in summary instead of weighing it against the opponent's.",
  },
  {
    id: "lincoln-douglas",
    label: "Lincoln–Douglas",
    short: "LD",
    teams: "1 v 1",
    typical: "High school; values and philosophy",
    speeches: [
      { name: "Affirmative Constructive", speaker: "Aff", minutes: 6, purpose: "Value, criterion, and contentions supporting the resolution." },
      { name: "Cross-Examination", speaker: "Neg questions Aff", minutes: 3, purpose: "Clarify the framework and test the link to the value." },
      { name: "Negative Constructive", speaker: "Neg", minutes: 7, purpose: "Own framework plus a line-by-line answer to the Aff case." },
      { name: "Cross-Examination", speaker: "Aff questions Neg", minutes: 3, purpose: "Attack the competing criterion." },
      { name: "First Affirmative Rebuttal", speaker: "Aff", minutes: 4, purpose: "Answer the Neg case and rebuild — the hardest speech in the format." },
      { name: "Negative Rebuttal", speaker: "Neg", minutes: 6, purpose: "Crystallise the framework debate and win it." },
      { name: "Second Affirmative Rebuttal", speaker: "Aff", minutes: 3, purpose: "One clean path to the ballot under the winning framework." },
    ],
    prepTimeMin: 4,
    questioning: {
      style: "cross-examination",
      label: "Cross-examination",
      rules:
        "One speaker asks, the other answers, for the full period. The questioner controls the clock and should not argue — questions set up the rebuttal that follows.",
    },
    judging: {
      criteria: ["Framework (value and criterion)", "Link from contentions to the value", "Philosophical consistency", "Line-by-line clash"],
      speakerPoints: "25–30, framework clarity heavily weighted",
      decision: "Whoever best achieves the winning value criterion wins.",
    },
    vocabulary: ["value", "criterion", "framework", "contention", "link", "burden", "crystallisation"],
    commonNoviceError: "Debating the contentions while ignoring whose framework the judge should evaluate them under.",
  },
  {
    id: "policy",
    label: "Policy (CX)",
    short: "Policy",
    teams: "2 teams × 2 speakers",
    typical: "High school and university; evidence-heavy",
    speeches: [
      { name: "1AC", speaker: "First Aff", minutes: 8, purpose: "Read the plan: harms, inherency, solvency, advantages." },
      { name: "CX of 1AC", speaker: "Second Neg questions", minutes: 3, purpose: "Test solvency and the evidence quality." },
      { name: "1NC", speaker: "First Neg", minutes: 8, purpose: "Off-case (DAs, counterplan, kritik) plus case answers." },
      { name: "CX of 1NC", speaker: "First Aff questions", minutes: 3, purpose: "Pin down links and competition." },
      { name: "2AC", speaker: "Second Aff", minutes: 8, purpose: "Answer every off-case position and extend the case." },
      { name: "CX of 2AC", speaker: "First Neg questions", minutes: 3, purpose: "Find dropped arguments." },
      { name: "2NC / 1NR", speaker: "Neg block", minutes: 13, purpose: "Split the positions and go deep — the Neg's advantage." },
      { name: "1AR", speaker: "First Aff", minutes: 5, purpose: "Answer the entire block. The most time-pressured speech in debate." },
      { name: "2NR", speaker: "Second Neg", minutes: 5, purpose: "Choose one path to the ballot and win it." },
      { name: "2AR", speaker: "Second Aff", minutes: 5, purpose: "Weigh the case against whatever the 2NR chose." },
    ],
    prepTimeMin: 8,
    questioning: {
      style: "cross-examination",
      label: "Cross-examination",
      rules:
        "Three minutes after each constructive. Used to establish links, concessions and evidence quality — the answers get quoted back in the next speech.",
    },
    judging: {
      criteria: ["Solvency and link chains", "Impact calculus (magnitude, probability, timeframe)", "Dropped arguments", "Evidence quality and qualification"],
      speakerPoints: "27.5–29.5 typical",
      decision: "Comparative: whose world is better, weighed on the surviving impacts.",
    },
    vocabulary: ["plan", "inherency", "solvency", "disadvantage", "counterplan", "kritik", "link chain", "impact calculus", "dropped"],
    commonNoviceError: "Answering positions one by one without ever weighing impacts against each other.",
  },
  {
    id: "british-parliamentary",
    label: "British Parliamentary",
    short: "BP",
    teams: "4 teams × 2 speakers",
    typical: "University and international competition (Worlds format)",
    speeches: [
      { name: "Prime Minister", speaker: "Opening Government 1", minutes: 7, purpose: "Define the motion and set the Government case." },
      { name: "Leader of Opposition", speaker: "Opening Opposition 1", minutes: 7, purpose: "Engage the definition, set the Opposition case." },
      { name: "Deputy Prime Minister", speaker: "Opening Government 2", minutes: 7, purpose: "Rebuild and extend Opening Government." },
      { name: "Deputy Leader of Opposition", speaker: "Opening Opposition 2", minutes: 7, purpose: "Rebuild Opposition, attack Government mechanism." },
      { name: "Member for Government", speaker: "Closing Government 1", minutes: 7, purpose: "Deliver an EXTENSION — new material that is not a repeat of Opening." },
      { name: "Member for Opposition", speaker: "Closing Opposition 1", minutes: 7, purpose: "Closing Opposition's own extension." },
      { name: "Government Whip", speaker: "Closing Government 2", minutes: 7, purpose: "Summarise the round in Government's favour; no new arguments." },
      { name: "Opposition Whip", speaker: "Closing Opposition 2", minutes: 7, purpose: "Final summary and comparative case for Opposition." },
    ],
    prepTimeMin: 15,
    questioning: {
      style: "points-of-information",
      label: "Points of Information",
      rules:
        "Offer POIs between the first and last minute of another team's speech. The speaker chooses whether to accept; take one or two. A good POI is one sentence and lands a dilemma, not a speech.",
    },
    judging: {
      criteria: ["Extension quality (Closing teams)", "Engagement with the clash", "Role fulfilment", "Persuasiveness and structure"],
      speakerPoints: "Usually 50–100 scale, ~75 average",
      decision: "All four teams are ranked 1st to 4th; Closing teams must beat their own Opening.",
    },
    vocabulary: ["motion", "definition", "extension", "whip", "point of information", "burden", "mechanism", "clash"],
    commonNoviceError: "Closing teams repeating Opening's arguments instead of bringing a genuine extension.",
  },
  {
    id: "wsdc",
    label: "World Schools",
    short: "WSDC",
    teams: "2 teams × 3 speakers",
    typical: "International school competition; mix of prepared and impromptu",
    speeches: [
      { name: "First Proposition", speaker: "Prop 1", minutes: 8, purpose: "Definition, framing, and the first two substantive arguments." },
      { name: "First Opposition", speaker: "Opp 1", minutes: 8, purpose: "Engage the definition, rebut, and open the Opposition case." },
      { name: "Second Proposition", speaker: "Prop 2", minutes: 8, purpose: "Rebuild, rebut, and add substantive material." },
      { name: "Second Opposition", speaker: "Opp 2", minutes: 8, purpose: "Deepen the Opposition case and press the clash." },
      { name: "Third Proposition", speaker: "Prop 3", minutes: 8, purpose: "Whole-round rebuttal; no new matter." },
      { name: "Third Opposition", speaker: "Opp 3", minutes: 8, purpose: "Whole-round rebuttal for Opposition." },
      { name: "Reply Speeches", speaker: "First or second speaker, Opposition first", minutes: 4, purpose: "A biased adjudication of the round — why your side won." },
    ],
    prepTimeMin: 60,
    questioning: {
      style: "points-of-information",
      label: "Points of Information",
      rules:
        "POIs may be offered between the first and last minute. Speakers are expected to accept at least one or two — refusing every POI is penalised in style and engagement.",
    },
    judging: {
      criteria: ["Content (40%)", "Style (40%)", "Strategy (20%)"],
      speakerPoints: "60–80 per speaker, 70 average; reply speeches half marks",
      decision: "Panel votes; content, style and strategy are scored separately per speaker.",
    },
    vocabulary: ["motion", "definition", "characterisation", "substantive", "point of information", "reply speech", "burden"],
    commonNoviceError: "Treating the reply speech as another rebuttal instead of a biased summary of the whole round.",
  },
  {
    id: "asian-parliamentary",
    label: "Asian Parliamentary",
    short: "AP",
    teams: "2 teams × 3 speakers",
    typical: "Asian school and university circuits",
    speeches: [
      { name: "Prime Minister", speaker: "Gov 1", minutes: 7, purpose: "Define the motion, set the team line, first arguments." },
      { name: "Leader of Opposition", speaker: "Opp 1", minutes: 7, purpose: "Accept or challenge the definition; rebut and open the case." },
      { name: "Deputy Prime Minister", speaker: "Gov 2", minutes: 7, purpose: "Rebuild and extend Government's case." },
      { name: "Deputy Leader of Opposition", speaker: "Opp 2", minutes: 7, purpose: "Rebuild and extend Opposition's case." },
      { name: "Government Whip", speaker: "Gov 3", minutes: 7, purpose: "Summarise the clash; no new matter." },
      { name: "Opposition Whip", speaker: "Opp 3", minutes: 7, purpose: "Summarise the clash for Opposition." },
      { name: "Reply Speeches", speaker: "First or second speaker, Opposition first", minutes: 4, purpose: "Biased summary of the round." },
    ],
    prepTimeMin: 30,
    questioning: {
      style: "points-of-information",
      label: "Points of Information",
      rules:
        "Offered between minutes 1 and 6. Keep them to fifteen seconds — a POI is a question or a challenge, never a mini-speech.",
    },
    judging: {
      criteria: ["Matter", "Manner", "Method", "Team line consistency"],
      speakerPoints: "Typically 67–83, 75 average",
      decision: "Team with better matter, manner and method across the round.",
    },
    vocabulary: ["motion", "team line", "matter", "manner", "method", "point of information", "whip", "reply"],
    commonNoviceError: "Speakers contradicting their own team line because nobody agreed the case split in prep.",
  },
];

export const DEBATE_FORMAT_IDS = DEBATE_FORMATS.map((f) => f.id);

export function debateFormat(id: string | undefined): DebateFormat | null {
  if (!id) return null;
  return DEBATE_FORMATS.find((f) => f.id === id) ?? null;
}

/** Total round length including prep — the number a teacher plans a class around. */
export function roundMinutes(f: DebateFormat): number {
  return f.speeches.reduce((n, s) => n + s.minutes, 0) + f.prepTimeMin;
}

/**
 * The format brief handed to the AI. A lesson for a PF squad must teach
 * crossfire and final-focus weighing; the same lesson for BP must teach
 * extensions and POIs. Without this the generator writes generic "debate".
 */
export function debateFormatForPrompt(id: string | undefined): string {
  const f = debateFormat(id);
  if (!f) return "";
  return `COMPETITIVE FORMAT — this lesson is for ${f.label} (${f.short}), ${f.teams}. Teach the skill AS IT IS PERFORMED IN THIS FORMAT, using the format's own vocabulary.
- Speech order: ${f.speeches.map((s) => `${s.name} (${s.speaker}, ${s.minutes}m)`).join(" → ")}
- Prep time: ${f.prepTimeMin} min. Full round ≈ ${roundMinutes(f)} min.
- Questioning: ${f.questioning.label} — ${f.questioning.rules}
- Judges reward: ${f.judging.criteria.join("; ")}. ${f.judging.decision}
- Use these terms exactly, never a synonym from another format: ${f.vocabulary.join(", ")}.
- The classic novice failure in ${f.short}: ${f.commonNoviceError} — the lesson should attack that directly where the skill allows.
Any practice round, drill or sparring page must match this format's speech names and timings, not a generic two-sided debate.`;
}
