import { type JudgeBallot } from "./judge-ballot-schema";

/**
 * Feedback & Judging — the round-level layer that sits on top of Judge Ballot
 * templates.
 *
 * A Judge Ballot material is the *template* (criteria, speaker-point range,
 * prompted RFD). A round instantiates it for a real debate, and each judge
 * submits one filled ballot. Aggregating those submissions is what lets the
 * founder see judge consistency and which lessons/skills keep getting flagged.
 */

export type Side = "pro" | "con";

/** Per-criterion scores, keyed by criterion name. */
export type ScoreMap = Record<string, { pro: number; con: number }>;
export type SpeakerPoints = { pro: number; con: number };
/** Prompt label -> the judge's written answer. */
export type AnswerMap = Record<string, string>;

export interface RoundRow {
  id: number;
  ballot_id: number;
  label: string;
  resolution: string;
  pro_team: string;
  con_team: string;
  room: string;
  held_on: string;
  created_by_role: string;
  /** roster links: who actually debated each side, when the coach set them */
  pro_student_id: number | null;
  con_student_id: number | null;
  created_at: string;
}

export interface SubmissionRow {
  id: number;
  round_id: number;
  judge_name: string;
  role: string;
  winner: Side;
  scores: ScoreMap;
  speaker_points: SpeakerPoints;
  rfd: AnswerMap;
  feedback: AnswerMap;
  seconds_taken: number;
  created_at: string;
}

export interface RoundResult {
  submissionCount: number;
  proBallots: number;
  conBallots: number;
  /** null when tied or no ballots */
  decision: Side | null;
  unanimous: boolean;
  /** average total score per side across judges */
  avgTotals: { pro: number; con: number };
  avgSpeakerPoints: SpeakerPoints;
  /** per-criterion averages, for spotting where the round was actually won */
  perCriterion: { name: string; pro: number; con: number }[];
  /** how far apart judges were on total score — a disagreement signal */
  spread: number;
  medianSeconds: number;
}

function avg(ns: number[]): number {
  return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0;
}

function total(scores: ScoreMap, side: Side): number {
  return Object.values(scores).reduce((sum, s) => sum + (s?.[side] ?? 0), 0);
}

export function summariseRound(
  submissions: SubmissionRow[],
  ballot: JudgeBallot | null
): RoundResult {
  const proBallots = submissions.filter((s) => s.winner === "pro").length;
  const conBallots = submissions.filter((s) => s.winner === "con").length;

  const proTotals = submissions.map((s) => total(s.scores, "pro"));
  const conTotals = submissions.map((s) => total(s.scores, "con"));

  // widest disagreement between any two judges on either side's total
  const range = (ns: number[]) => (ns.length ? Math.max(...ns) - Math.min(...ns) : 0);
  const spread = Math.max(range(proTotals), range(conTotals));

  const criteria = ballot?.criteria ?? [];
  const perCriterion = criteria.map((c) => ({
    name: c.name,
    pro: avg(submissions.map((s) => s.scores[c.name]?.pro ?? 0)),
    con: avg(submissions.map((s) => s.scores[c.name]?.con ?? 0)),
  }));

  const secs = submissions
    .map((s) => s.seconds_taken)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const medianSeconds = secs.length ? secs[Math.floor(secs.length / 2)] : 0;

  return {
    submissionCount: submissions.length,
    proBallots,
    conBallots,
    decision:
      proBallots === conBallots ? null : proBallots > conBallots ? "pro" : "con",
    unanimous:
      submissions.length > 0 && (proBallots === 0 || conBallots === 0),
    avgTotals: { pro: avg(proTotals), con: avg(conTotals) },
    avgSpeakerPoints: {
      pro: avg(submissions.map((s) => s.speaker_points?.pro ?? 0)),
      con: avg(submissions.map((s) => s.speaker_points?.con ?? 0)),
    },
    perCriterion,
    spread,
    medianSeconds,
  };
}

/** Was this submission complete enough to be useful feedback? */
export function submissionQuality(s: SubmissionRow): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const answered = (m: AnswerMap) =>
    Object.values(m).filter((v) => v.trim().length > 0);
  const rfdAnswers = answered(s.rfd);
  if (rfdAnswers.length === 0) issues.push("No reason for decision given");
  else if (rfdAnswers.every((a) => a.trim().split(/\s+/).length < 8)) {
    issues.push("Reason for decision is too brief to be useful");
  }
  if (answered(s.feedback).length === 0) {
    issues.push("No feedback written for the debaters");
  }
  return { ok: issues.length === 0, issues };
}
