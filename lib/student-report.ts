// type-only: this module stays pure aggregation and must not pull in the DB layer
import type { RoundRow, SubmissionRow } from "./judging";
import { SKILLS, ratingLabel, type Observation, type SkillId } from "./students";

/**
 * ONE STUDENT, ONE PERIOD, WITH THE EVIDENCE ATTACHED.
 *
 * ── WHAT THIS ADDS OVER `skillStates` ────────────────────────────────────
 * `lib/students.ts` already computes per-skill state, and the student page
 * already renders it. Three things it cannot do, and all three are what turn
 * a dashboard into something a coach can actually give to a student:
 *
 *   1. IT IS ALL-TIME. "Rebuttal: Doing it" is true and useless in a progress
 *      conversation — it cannot distinguish a student who arrived there this
 *      month from one who has been stuck there since October. A report has to
 *      be bounded, and the boundary has to be a parameter.
 *   2. IT DROPS THE NOTES. The ratings are the summary; the coach's own
 *      sentence is the evidence. "Solid" persuades nobody. "Restated the other
 *      side's best argument before answering it — first time unprompted" is
 *      the thing a student remembers and a parent believes.
 *   3. IT IGNORES ROUNDS. Judged rounds are the highest-stakes evidence there
 *      is about a debater, they are already linked to the roster
 *      (`rounds.pro_student_id`), and no student-facing view has ever read
 *      them.
 *
 * ── MOVEMENT IS MEASURED AGAINST A BASELINE, NOT A FIRST RATING ──────────
 * The direction of travel is the latest rating inside the window compared to
 * the last rating BEFORE it. Comparing against the window's own first rating
 * — which is what a naive trend does — makes every student look static in a
 * week where they were observed once, and makes a single bad day look like
 * regression. The baseline is what the coach already believed coming in.
 *
 * Deterministic throughout. No model decides whether a student improved; the
 * log does.
 */

export interface SkillMovement {
  skill: SkillId;
  label: string;
  /** what the coach believed before this period — null if never rated before */
  from: number | null;
  /** the latest rating inside the period */
  to: number;
  /** to - from, or null when there is no baseline to compare against */
  delta: number | null;
  fromLabel: string;
  toLabel: string;
}

export interface StuckSkill {
  skill: SkillId;
  label: string;
  at: number;
  atLabel: string;
  /** observations in the period that all landed on the same rating */
  timesSeen: number;
}

/** A coach's own words, kept verbatim — the part that makes a report credible. */
export interface EvidenceNote {
  date: string;
  skillLabel: string;
  rating: number;
  note: string;
  context: string;
}

export interface RoundRecord {
  rounds: number;
  wins: number;
  /** mean speaker points across judged rounds in the period, or null */
  averageSpeaks: number | null;
}

export interface StudentReport {
  from: string;
  to: string;
  observationCount: number;
  /** skills that changed in this period, biggest gain first */
  moved: SkillMovement[];
  /** skills seen repeatedly at the same rating and not yet solid */
  stuck: StuckSkill[];
  /** skills observed for the first time in this period */
  newlySeen: SkillMovement[];
  notes: EvidenceNote[];
  rounds: RoundRecord;
  /** the single thing to work on next, by name */
  focus: string | null;
  headline: string;
  hasData: boolean;
}

/** At or above this, a skill is not "stuck", it is done for now. */
const SOLID = 4;
/** Below this many same-rating observations, "stuck" is one observation twice. */
const MIN_FOR_STUCK = 2;

const LABELS = new Map<string, string>(SKILLS.map((s) => [s.id, s.label]));

function label(skill: string): string {
  return LABELS.get(skill) ?? skill;
}

/** Oldest → newest, so every fold below reads in the direction time runs. */
function chronological(obs: Observation[]): Observation[] {
  return [...obs].sort(
    (a, b) => a.observed_on.localeCompare(b.observed_on) || a.id - b.id
  );
}

/**
 * One student's period.
 *
 * `observations` is that student's whole log — NOT a pre-filtered window.
 * The rows before `from` are what the baseline is built from, so filtering
 * upstream would silently turn every report into "everything is new".
 */
export function studentReport(args: {
  from: string;
  to: string;
  observations: Observation[];
  studentId: number;
  rounds: RoundRow[];
  submissions: SubmissionRow[];
}): StudentReport {
  const { from, to, studentId } = args;
  const all = chronological(args.observations);
  const inWindow = all.filter((o) => o.observed_on >= from && o.observed_on <= to);
  const before = all.filter((o) => o.observed_on < from);

  const moved: SkillMovement[] = [];
  const newlySeen: SkillMovement[] = [];
  const stuck: StuckSkill[] = [];

  for (const s of SKILLS) {
    const mine = inWindow.filter((o) => o.skill === s.id);
    if (mine.length === 0) continue;
    const to_ = mine[mine.length - 1].rating;

    const priors = before.filter((o) => o.skill === s.id);
    const from_ = priors.length > 0 ? priors[priors.length - 1].rating : null;

    const entry: SkillMovement = {
      skill: s.id,
      label: s.label,
      from: from_,
      to: to_,
      delta: from_ === null ? null : to_ - from_,
      fromLabel: from_ === null ? "—" : ratingLabel(from_),
      toLabel: ratingLabel(to_),
    };

    if (from_ === null) {
      newlySeen.push(entry);
    } else if (entry.delta !== 0) {
      moved.push(entry);
    } else if (mine.length >= MIN_FOR_STUCK && to_ < SOLID) {
      /* Unchanged AND seen more than once AND not yet solid. All three
         matter: a skill rated once is not stuck, and a skill sitting at
         "Solid" is not a problem to solve — listing it would bury the two
         that are. */
      stuck.push({
        skill: s.id,
        label: s.label,
        at: to_,
        atLabel: ratingLabel(to_),
        timesSeen: mine.length,
      });
    }
  }

  moved.sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  stuck.sort((a, b) => a.at - b.at);

  const notes: EvidenceNote[] = inWindow
    .filter((o) => o.note.trim())
    .map((o) => ({
      date: o.observed_on,
      skillLabel: label(o.skill),
      rating: o.rating,
      note: o.note.trim(),
      context: o.context,
    }))
    .reverse(); // newest first — a report is read from the top

  const rounds = roundRecord(studentId, args.rounds, args.submissions, from, to);

  /* The focus is the worst thing in the period, and a slip outranks a plateau:
     a skill that went backwards is news, a skill that sat still is a standing
     condition. Falls back to the lowest stuck skill, then to nothing at all —
     a report with no problem to name should say so rather than invent one. */
  const slipped = moved.filter((m) => (m.delta ?? 0) < 0);
  const focus = slipped.length > 0 ? slipped[slipped.length - 1].label
    : stuck.length > 0 ? stuck[0].label
    : null;

  const hasData = inWindow.length > 0 || rounds.rounds > 0;

  return {
    from,
    to,
    observationCount: inWindow.length,
    moved,
    stuck,
    newlySeen,
    notes,
    rounds,
    focus,
    headline: headlineFor(moved, newlySeen, rounds, hasData),
    hasData,
  };
}

/**
 * What the judged rounds say.
 *
 * A round can carry several ballots (a panel), so a "win" is the majority of
 * its own judges rather than one ballot — counting ballots would let a
 * three-judge round outvote three separate rounds.
 */
function roundRecord(
  studentId: number,
  rounds: RoundRow[],
  submissions: SubmissionRow[],
  from: string,
  to: string
): RoundRecord {
  const mine = rounds.filter(
    (r) =>
      (r.pro_student_id === studentId || r.con_student_id === studentId) &&
      r.held_on >= from &&
      r.held_on <= to
  );
  let wins = 0;
  const speaks: number[] = [];

  for (const r of mine) {
    const side = r.pro_student_id === studentId ? "pro" : "con";
    const ballots = submissions.filter((b) => b.round_id === r.id);
    if (ballots.length === 0) continue;
    const forMe = ballots.filter((b) => b.winner === side).length;
    if (forMe * 2 > ballots.length) wins += 1;
    for (const b of ballots) {
      const pts = b.speaker_points?.[side];
      if (typeof pts === "number" && pts > 0) speaks.push(pts);
    }
  }

  return {
    rounds: mine.length,
    wins,
    averageSpeaks:
      speaks.length > 0
        ? Math.round((speaks.reduce((a, b) => a + b, 0) / speaks.length) * 10) / 10
        : null,
  };
}

function headlineFor(
  moved: SkillMovement[],
  newlySeen: SkillMovement[],
  rounds: RoundRecord,
  hasData: boolean
): string {
  if (!hasData) return "Nothing logged for this period.";
  const gains = moved.filter((m) => (m.delta ?? 0) > 0);
  const parts: string[] = [];
  if (gains.length > 0) {
    parts.push(
      `${gains[0].label} moved to "${gains[0].toLabel}"${gains.length > 1 ? `, and ${gains.length - 1} other${gains.length > 2 ? "s" : ""} improved` : ""}`
    );
  } else if (newlySeen.length > 0) {
    parts.push(`First read on ${newlySeen.length} skill${newlySeen.length === 1 ? "" : "s"}`);
  }
  if (rounds.rounds > 0) {
    parts.push(`${rounds.wins} of ${rounds.rounds} round${rounds.rounds === 1 ? "" : "s"} won`);
  }
  return parts.length > 0 ? `${parts.join(" · ")}.` : "Observed, with no change either way.";
}
