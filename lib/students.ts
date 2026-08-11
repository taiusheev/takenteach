/**
 * The student model — the entity the platform was missing.
 *
 * Everything so far is about MATERIALS: packs, units, ballots, rounds. None of
 * it knows who is in the room. Progress tracking, parent reports and personal
 * feedback all need the same thing first: a student, and a record of what a
 * coach has actually seen them do.
 *
 * The design constraint is teacher time. A coach will not fill in a rubric for
 * thirty students after every session, so an observation is one tap on one
 * skill plus an optional sentence — and the progress view is computed from
 * those, not from a separate assessment ritual.
 */

/** The dimensions a debate coach actually tracks. Stable ids — they are stored. */
export const SKILLS = [
  { id: "speaking", label: "Speaking & delivery", hint: "Pace, volume, eye contact, presence" },
  { id: "confidence", label: "Confidence", hint: "Willingness to speak, recovery after a stumble" },
  { id: "structure", label: "Structure (PEEL)", hint: "Signposting, complete arguments, no orphan claims" },
  { id: "logic", label: "Logic & warrants", hint: "Reasons that actually connect claim to conclusion" },
  { id: "evidence", label: "Evidence use", hint: "Cites accurately, respects the card's limit" },
  { id: "rebuttal", label: "Rebuttal", hint: "Answers the strongest version, not the easiest" },
  { id: "crossfire", label: "Questioning", hint: "Crossfire / CX / POIs — short questions that corner" },
  { id: "weighing", label: "Weighing", hint: "Says which impact is bigger and why" },
] as const;

export type SkillId = (typeof SKILLS)[number]["id"];
export const SKILL_IDS = SKILLS.map((s) => s.id) as readonly SkillId[];

/**
 * A five-point scale with words, not numbers a coach has to interpret. The
 * labels are deliberately about observable behaviour rather than judgement.
 */
export const RATINGS = [
  { value: 1, label: "Not yet", tone: "bg-red-500/15 text-red-300 border-red-500/40" },
  { value: 2, label: "Emerging", tone: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  { value: 3, label: "Doing it", tone: "bg-sky-500/15 text-sky-300 border-sky-500/40" },
  { value: 4, label: "Solid", tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  { value: 5, label: "Teaching others", tone: "bg-accent/20 text-accent border-accent/50" },
] as const;

export function ratingLabel(v: number): string {
  return RATINGS.find((r) => r.value === Math.round(v))?.label ?? "—";
}

export interface Observation {
  id: number;
  student_id: number;
  skill: string;
  rating: number;
  note: string;
  /** where it was seen — a round, a lesson, a practice */
  context: string;
  observed_on: string;
  role: string;
}

export interface SkillState {
  skill: SkillId;
  label: string;
  hint: string;
  /** most recent rating, or null when never observed */
  latest: number | null;
  /** mean of everything logged */
  average: number | null;
  /** latest minus the first — the direction of travel */
  trend: number | null;
  count: number;
  lastSeen: string | null;
}

/**
 * Per-skill state from the raw log. Recency matters more than the mean for a
 * coach deciding what to work on next, so both are surfaced rather than blended
 * into one opaque score.
 */
export function skillStates(observations: Observation[]): SkillState[] {
  return SKILLS.map((s) => {
    // oldest → newest, so "trend" reads in the direction time runs
    const mine = observations
      .filter((o) => o.skill === s.id)
      .sort((a, b) => a.observed_on.localeCompare(b.observed_on) || a.id - b.id);
    if (mine.length === 0) {
      return { skill: s.id, label: s.label, hint: s.hint, latest: null, average: null, trend: null, count: 0, lastSeen: null };
    }
    const ratings = mine.map((o) => o.rating);
    const latest = ratings[ratings.length - 1];
    return {
      skill: s.id,
      label: s.label,
      hint: s.hint,
      latest,
      average: ratings.reduce((a, b) => a + b, 0) / ratings.length,
      trend: mine.length > 1 ? latest - ratings[0] : null,
      count: mine.length,
      lastSeen: mine[mine.length - 1].observed_on,
    };
  });
}

export interface Recommendation {
  skill: SkillId;
  label: string;
  /** why this is the next thing to work on */
  reason: string;
  /** what the coach should actually do about it */
  action: string;
  /** search terms that find the right material in the library */
  lookFor: string;
}

const ACTIONS: Record<SkillId, { action: string; lookFor: string }> = {
  speaking: { action: "Two minutes of stand-and-deliver at the top of each session, no notes.", lookFor: "delivery drill" },
  confidence: { action: "Give a scripted role first — a defined job lowers the cost of speaking.", lookFor: "sparring hook" },
  structure: { action: "Frames-on for one lesson: rebuild PEEL with sentence starters, then take them away.", lookFor: "PEEL structure" },
  logic: { action: "Warrant drill — hand them a claim and evidence, they supply the missing 'because'.", lookFor: "warrant" },
  evidence: { action: "Card-limit drill: give a card and three claims, they pick which one it can carry.", lookFor: "evidence limit" },
  rebuttal: { action: "Steelman first: they must restate the opponent's best version before answering it.", lookFor: "rebuttal" },
  crossfire: { action: "Closed-question ladders — three yes/no questions that set up the fourth.", lookFor: "crossfire questioning" },
  weighing: { action: "Force a comparative sentence: 'X matters more than Y because…' in every summary.", lookFor: "weighing" },
};

/**
 * What to work on next. Deterministic and explainable — a coach can see why
 * each line appeared, which matters more than a clever ranking.
 */
export function recommendations(states: SkillState[], limit = 3): Recommendation[] {
  const scored = states.map((s) => {
    let priority: number;
    let reason: string;
    if (s.count === 0) {
      // never observed: a gap in the record is itself worth closing
      priority = 2.5;
      reason = "Never assessed — you have no read on this yet.";
    } else if (s.trend !== null && s.trend < 0) {
      priority = (s.latest ?? 3) - 1.5;
      reason = `Slipped from ${ratingLabel((s.latest ?? 0) - s.trend)} to ${ratingLabel(s.latest ?? 0)}.`;
    } else {
      priority = s.latest ?? 3;
      reason = `Sitting at "${ratingLabel(s.latest ?? 0)}" across ${s.count} observation${s.count === 1 ? "" : "s"}.`;
    }
    return { s, priority, reason };
  });

  return scored
    .sort((a, b) => a.priority - b.priority)
    .slice(0, limit)
    .map(({ s, reason }) => ({
      skill: s.skill,
      label: s.label,
      reason,
      action: ACTIONS[s.skill].action,
      lookFor: ACTIONS[s.skill].lookFor,
    }));
}

// ── Judged rounds → observations ─────────────────────────────────────────────

/**
 * Ballot criteria are author-written free text ("Refutation & Clash", "Delivery
 * and Style"), so mapping them onto tracked skills is keyword matching. Order
 * matters: the first hit wins, so the more specific patterns come first.
 */
const CRITERION_PATTERNS: [RegExp, SkillId][] = [
  [/cross ?fire|cross.?ex|question|poi|point of information/i, "crossfire"],
  [/rebut|refut|clash|respons|answer/i, "rebuttal"],
  [/weigh|impact|compar|magnitude|prioriti/i, "weighing"],
  [/evidence|source|research|citation|support/i, "evidence"],
  [/logic|warrant|reason|analysis|argumentation/i, "logic"],
  [/structur|organis|organiz|signpost|peel|clarity of case/i, "structure"],
  [/deliver|style|manner|speak|presentation|voice|persuasi/i, "speaking"],
  [/confiden|poise|presence/i, "confidence"],
];

export function skillForCriterion(name: string): SkillId | null {
  for (const [pattern, skill] of CRITERION_PATTERNS) {
    if (pattern.test(name)) return skill;
  }
  return null;
}

/**
 * Map any points-out-of-max onto the 1–5 scale, never returning 0.
 * Points are clamped to the criterion's own maximum first: a ballot posted with
 * 6/5 should not be able to mint a "Teaching others" rating.
 */
export function toRating(points: number, max: number): number {
  if (!(max > 0)) return 3;
  const bounded = Math.min(Math.max(points, 0), max);
  const scaled = Math.round((bounded / max) * 5);
  return Math.min(5, Math.max(1, scaled));
}

export interface DerivedObservation {
  skill: SkillId;
  rating: number;
  note: string;
}

/**
 * Turn one side of a submitted ballot into observations.
 *
 * This is the point of wiring rounds to students: a coach who judges a round has
 * ALREADY made these judgements: scoring "Refutation 7/10" is an observation
 * about rebuttal. Re-typing it into a progress tracker afterwards is the kind of
 * duplicate data entry that guarantees the tracker stays empty.
 *
 * Criteria that map to no tracked skill are skipped rather than guessed at.
 */
export function observationsFromBallot(args: {
  criteria: { name: string; maxPoints: number }[];
  scores: Record<string, { pro?: number; con?: number }>;
  side: "pro" | "con";
  speakerPoints?: { pro?: number; con?: number };
  speakerRange?: { min: number; max: number };
  won?: boolean;
}): DerivedObservation[] {
  const out: DerivedObservation[] = [];
  const seen = new Set<SkillId>();

  for (const c of args.criteria) {
    const skill = skillForCriterion(c.name);
    if (!skill || seen.has(skill)) continue; // one observation per skill per ballot
    const points = args.scores?.[c.name]?.[args.side];
    if (typeof points !== "number" || points <= 0) continue;
    seen.add(skill);
    out.push({
      skill,
      rating: toRating(points, c.maxPoints),
      note: `${c.name}: ${points}/${c.maxPoints}${args.won === undefined ? "" : args.won ? " · won the round" : ""}`,
    });
  }

  // Speaker points are a delivery judgement in every format that uses them.
  const sp = args.speakerPoints?.[args.side];
  const range = args.speakerRange;
  if (typeof sp === "number" && range && range.max > range.min && !seen.has("speaking")) {
    // speaker scales don't start at zero — normalise within the usable band
    const span = range.max - range.min;
    const rating = Math.min(5, Math.max(1, Math.round(((sp - range.min) / span) * 4) + 1));
    out.push({
      skill: "speaking",
      rating,
      note: `Speaker points: ${sp} (${range.min}–${range.max})`,
    });
  }

  return out;
}

/** One-line summary for a roster row. */
export function headline(states: SkillState[]): string {
  const seen = states.filter((s) => s.count > 0);
  if (seen.length === 0) return "No observations yet";
  const avg = seen.reduce((n, s) => n + (s.latest ?? 0), 0) / seen.length;
  const rising = seen.filter((s) => (s.trend ?? 0) > 0).length;
  const falling = seen.filter((s) => (s.trend ?? 0) < 0).length;
  const dir = rising > falling ? "rising" : falling > rising ? "needs attention" : "steady";
  return `${ratingLabel(avg)} overall · ${dir} · ${seen.length}/${SKILLS.length} skills observed`;
}
