import { type MaterialRow } from "./db";
import { type JudgeBallot } from "./judge-ballot-schema";
import { type LessonPack } from "./lesson-pack-schema";
import { type RoundRow, type SubmissionRow } from "./judging";
import { commonFields } from "./content-types";

/**
 * The bridge from judging back to lesson-making — the loop the whole platform
 * depends on.
 *
 * A round is not a scoreboard; it is evidence about what students can actually
 * do. Aggregating criterion scores across rounds tells you which SKILL is
 * weakest; matching that skill to the lesson that teaches it tells you which
 * lesson isn't working, or that no lesson covers it at all. That signal then
 * drives what to build next and is fed into AI generation, so a new pack
 * targets real observed weakness instead of a guess.
 */

/**
 * Ballot criteria and lesson skill names are written by different people at
 * different times, so matching is fuzzy: shared word stems plus a small
 * synonym table for the debate vocabulary that reliably differs.
 */
const SYNONYMS: Record<string, string[]> = {
  refutation: ["rebuttal", "refute", "attack", "response", "answering", "clash"],
  argumentation: ["argument", "peel", "contention", "case", "claim", "warrant", "evidence"],
  crossfire: ["cross", "questioning", "question", "crossex"],
  delivery: ["speaking", "speech", "flowing", "presentation", "signposting", "voice"],
  weighing: ["weigh", "impact", "magnitude", "scope", "comparative"],
  summary: ["collapse", "extend", "final focus", "crystallize"],
  organization: ["structure", "signpost", "roadmap"],
};

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3);
}

function expand(s: string): Set<string> {
  const base = tokens(s);
  const out = new Set(base);
  for (const t of base) {
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (t === key || t.startsWith(key.slice(0, 5))) syns.forEach((x) => out.add(x));
      if (syns.some((x) => t.startsWith(x.slice(0, 5)))) {
        out.add(key);
        syns.forEach((x) => out.add(x));
      }
    }
  }
  return out;
}

/** Does this lesson plausibly teach this criterion? */
export function skillMatches(criterion: string, lessonSkill: string): boolean {
  if (!criterion.trim() || !lessonSkill.trim()) return false;
  const a = expand(criterion);
  const b = expand(lessonSkill);
  for (const t of a) {
    if (b.has(t)) return true;
    // stem-ish prefix match catches refutation/refute, weighing/weigh
    for (const u of b) {
      if (t.length > 4 && u.length > 4 && (t.startsWith(u.slice(0, 5)) || u.startsWith(t.slice(0, 5)))) {
        return true;
      }
    }
  }
  return false;
}

export interface SkillSignal {
  criterion: string;
  /** average score as a % of the criterion's max, across every ballot */
  pct: number;
  /** number of side-scores averaged (2 per ballot) */
  samples: number;
  rounds: number;
  /** lessons whose skillFocus plausibly teaches this criterion */
  lessons: { id: number; title: string; code: string; status: string }[];
  /** no lesson teaches this skill — a hole in the curriculum */
  isGap: boolean;
}

export interface TeachingSignal {
  hasData: boolean;
  roundCount: number;
  ballotCount: number;
  signals: SkillSignal[];
  /** the weakest skills, worst first (only where there's enough evidence) */
  weakest: SkillSignal[];
  /** skills students are assessed on that nothing in the library teaches */
  gaps: SkillSignal[];
  /** what judges actually wrote — the qualitative half of the signal */
  judgeQuotes: { text: string; round: string }[];
}

const MIN_SAMPLES = 2;
const WEAK_THRESHOLD = 0.7; // below 70% of max is worth acting on

export function computeTeachingSignal(
  rounds: RoundRow[],
  submissions: SubmissionRow[],
  materials: MaterialRow[]
): TeachingSignal {
  const ballotById = new Map(
    materials
      .filter((m) => m.type === "judge-ballot")
      .map((m) => [m.id, m.content as JudgeBallot])
  );
  const roundById = new Map(rounds.map((r) => [r.id, r]));

  const lessons = materials.filter((m) => m.type === "lesson-pack");

  // criterion -> accumulated normalised scores
  const acc = new Map<
    string,
    { sum: number; n: number; rounds: Set<number> }
  >();

  for (const sub of submissions) {
    const round = roundById.get(sub.round_id);
    if (!round) continue;
    const ballot = ballotById.get(round.ballot_id);
    if (!ballot) continue;
    for (const c of ballot.criteria) {
      const got = sub.scores?.[c.name];
      if (!got) continue;
      const max = c.maxPoints || 1;
      const entry = acc.get(c.name) ?? { sum: 0, n: 0, rounds: new Set<number>() };
      // both sides are evidence of what students can do
      entry.sum += (got.pro ?? 0) / max + (got.con ?? 0) / max;
      entry.n += 2;
      entry.rounds.add(round.id);
      acc.set(c.name, entry);
    }
  }

  const signals: SkillSignal[] = [...acc.entries()]
    .map(([criterion, e]) => {
      const matched = lessons.filter((l) =>
        skillMatches(criterion, commonFields(l.content).skillFocus)
      );
      return {
        criterion,
        pct: e.n ? e.sum / e.n : 0,
        samples: e.n,
        rounds: e.rounds.size,
        lessons: matched.map((l) => ({
          id: l.id,
          title: l.title,
          code: commonFields(l.content).lessonCode,
          status: l.status,
        })),
        isGap: matched.length === 0,
      };
    })
    .sort((a, b) => a.pct - b.pct);

  const weakest = signals.filter(
    (s) => s.samples >= MIN_SAMPLES && s.pct < WEAK_THRESHOLD
  );
  const gaps = signals.filter((s) => s.isGap && s.samples >= MIN_SAMPLES);

  const judgeQuotes: { text: string; round: string }[] = [];
  for (const sub of submissions.slice(0, 30)) {
    const round = roundById.get(sub.round_id);
    const label = round?.label ?? `Round ${sub.round_id}`;
    for (const v of [
      ...Object.values(sub.rfd ?? {}),
      ...Object.values(sub.feedback ?? {}),
    ]) {
      const t = v.trim();
      // skip the throwaway ones; they carry no teaching signal
      if (t.split(/\s+/).length >= 8) judgeQuotes.push({ text: t, round: label });
    }
  }

  return {
    hasData: submissions.length > 0,
    roundCount: rounds.length,
    ballotCount: submissions.length,
    signals,
    weakest,
    gaps,
    judgeQuotes: judgeQuotes.slice(0, 8),
  };
}

/** Round evidence for one specific lesson — shown on its material page. */
export function signalForLesson(
  signal: TeachingSignal,
  lesson: LessonPack
): SkillSignal | null {
  const skill = lesson.skillFocus ?? "";
  if (!skill.trim()) return null;
  return (
    signal.signals.find((s) => skillMatches(s.criterion, skill)) ?? null
  );
}

/**
 * Classroom evidence rendered for a generation prompt, so a new or rewritten
 * lesson targets what students actually get wrong.
 */
export function signalForPrompt(
  signal: TeachingSignal,
  skillFocus: string
): string {
  if (!signal.hasData) return "";
  const relevant = signal.signals.filter((s) => skillMatches(s.criterion, skillFocus));
  const lines: string[] = [];

  if (relevant.length > 0) {
    for (const s of relevant) {
      lines.push(
        `- Students currently average ${Math.round(s.pct * 100)}% on "${s.criterion}" across ${s.rounds} judged round(s). ${
          s.pct < WEAK_THRESHOLD
            ? "This is a REAL WEAKNESS — the lesson must directly attack it."
            : "This is a relative strength; push beyond it rather than re-teaching the basics."
        }`
      );
    }
  } else if (signal.weakest.length > 0) {
    lines.push(
      `- Cohort-wide weakest skills right now: ${signal.weakest
        .map((s) => `${s.criterion} (${Math.round(s.pct * 100)}%)`)
        .join(", ")}. Where this lesson can reinforce them, do so.`
    );
  }

  if (signal.judgeQuotes.length > 0) {
    lines.push(
      `- What judges actually wrote about these students:\n${signal.judgeQuotes
        .slice(0, 5)
        .map((q) => `    "${q.text}"`)
        .join("\n")}`
    );
  }

  if (lines.length === 0) return "";
  return `\nREAL CLASSROOM EVIDENCE — this cohort's judged performance. Target these specific weaknesses rather than generic practice:\n${lines.join(
    "\n"
  )}`;
}
