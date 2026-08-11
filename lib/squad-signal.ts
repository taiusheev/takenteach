// type-only: this module stays pure aggregation and must not pull in the DB layer
import type { ObservationRow, StudentRow } from "./db";
import { SKILLS, type SkillId, ratingLabel, skillStates } from "./students";

/**
 * What the squad actually can't do yet — fed straight into lesson generation.
 *
 * The builder already receives a signal from judged rounds, but that is
 * criterion-level and coarse. The observation log is finer: it knows which
 * skills are weak, which are *slipping*, and which students are carrying them —
 * so a lesson can be built against evidence rather than against a topic.
 *
 * Everything here is deterministic aggregation. No model call decides what the
 * squad is weak at; the log does, and the model is simply told.
 */

export interface SquadSkill {
  skill: SkillId;
  label: string;
  /** mean of each student's latest rating, 1–5 */
  average: number;
  /** students whose latest rating is at or below "Emerging" */
  struggling: string[];
  /** students whose rating has fallen since their first observation */
  slipping: string[];
  /** students rated "Solid" or better — the pairing partners */
  strong: string[];
  observed: number;
}

export interface SquadSignal {
  cohort: string;
  students: number;
  observations: number;
  skills: SquadSkill[];
  /** weakest first — what the next lesson should attack */
  priorities: SquadSkill[];
  hasData: boolean;
}

const STRONG = 4;

/**
 * Join names for prose. Trailing initials ("Amina R.") would otherwise collide
 * with the sentence's own full stop and print as "Amina R..".
 */
function nameList(names: string[]): string {
  return names.map((n) => n.replace(/\.$/, "")).join(", ");
}

export function squadSignal(
  cohort: string,
  students: StudentRow[],
  observations: ObservationRow[]
): SquadSignal {
  const roster = students.filter((s) => (s.cohort || "No cohort") === cohort);
  const ids = new Set(roster.map((s) => s.id));
  const mine = observations.filter((o) => ids.has(o.student_id));

  const skills: SquadSkill[] = SKILLS.map((def) => {
    const latest: number[] = [];
    const struggling: string[] = [];
    const slipping: string[] = [];
    const strong: string[] = [];

    for (const student of roster) {
      const states = skillStates(mine.filter((o) => o.student_id === student.id));
      const s = states.find((x) => x.skill === def.id);
      if (!s || s.count === 0 || s.latest === null) continue;
      latest.push(s.latest);
      if (s.latest <= 2) struggling.push(student.name);
      else if (s.latest >= STRONG) strong.push(student.name);
      if ((s.trend ?? 0) < 0) slipping.push(student.name);
    }

    return {
      skill: def.id,
      label: def.label,
      average: latest.length ? latest.reduce((a, b) => a + b, 0) / latest.length : 0,
      struggling,
      slipping,
      strong,
      observed: latest.length,
    };
  });

  const seen = skills.filter((s) => s.observed > 0);
  // slipping outranks merely low: a skill going backwards is the urgent one
  const priorities = [...seen].sort(
    (a, b) =>
      b.slipping.length - a.slipping.length ||
      a.average - b.average ||
      b.struggling.length - a.struggling.length
  );

  return {
    cohort,
    students: roster.length,
    observations: mine.length,
    skills,
    priorities,
    hasData: seen.length > 0,
  };
}

/**
 * The squad evidence a generation prompt receives. Named students are included
 * on purpose: a lesson that can say "pair Amina with Deniz on the guided page"
 * is worth more than one that knows only an average.
 */
export function squadSignalForPrompt(signal: SquadSignal, skillFocus = ""): string {
  if (!signal.hasData) return "";
  const lines: string[] = [
    `THIS SQUAD, FROM ${signal.observations} LOGGED OBSERVATIONS of ${signal.students} students in "${signal.cohort}":`,
  ];

  for (const s of signal.priorities.slice(0, 3)) {
    const bits = [`${s.label}: averaging "${ratingLabel(s.average)}"`];
    if (s.struggling.length) bits.push(`${s.struggling.join(", ")} still at or below Emerging`);
    if (s.slipping.length) bits.push(`going BACKWARDS for ${s.slipping.join(", ")}`);
    lines.push(`- ${bits.join(" · ")}`);
  }

  const focus = signal.priorities[0];
  if (focus) {
    lines.push(
      `The single most urgent gap is ${focus.label}. If this lesson's skill touches it, attack it directly rather than reviewing it.`
    );
    if (focus.strong.length > 0 && focus.struggling.length > 0) {
      lines.push(
        `For the guided-practice page, pair a stronger student with one who is struggling: ${focus.strong[0]} with ${focus.struggling[0]}. Name the pairing in the teacher guide.`
      );
    }
  }

  const strengths = signal.skills
    .filter((s) => s.observed > 0 && s.average >= STRONG)
    .map((s) => s.label);
  if (strengths.length) {
    lines.push(
      `Already solid — do NOT spend pages re-teaching: ${strengths.join(", ")}.`
    );
  }

  if (skillFocus.trim()) {
    lines.push(
      `Where this evidence and the lesson's stated skill ("${skillFocus.trim()}") disagree, the stated skill wins — but say in the teacher guide how the lesson also serves the gap above.`
    );
  }
  return lines.join("\n");
}

/**
 * A ready-to-build lesson brief straight from the log — the "Build from my
 * squad" path, where the teacher types nothing at all.
 */
export function squadLessonIdea(signal: SquadSignal): string {
  if (!signal.hasData) return "";
  const top = signal.priorities[0];
  const n = top.struggling.length;
  const who = n
    ? `${n} of ${signal.students} student${signal.students === 1 ? "" : "s"} ${n === 1 ? "is" : "are"}`
    : "the squad is";
  const trend = top.slipping.length
    ? ` and it has gone backwards for ${nameList(top.slipping)}`
    : "";
  return `Teach ${top.label.toLowerCase()} — ${who} at or below "${ratingLabel(top.average)}" on it${trend}. Build the lesson around fixing that specific weakness, for the ${signal.cohort} cohort.`;
}
