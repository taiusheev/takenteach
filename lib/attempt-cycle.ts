/**
 * THE ATTEMPT → CONSOLIDATION CYCLE.
 *
 * A concept is understood more deeply, and transfers further, when students
 * ATTEMPT it before being taught and then have that attempt explicitly
 * corrected — rather than being shown the method and practising it. The
 * alternative has a name: students who are told exactly what to do succeed on
 * the page in front of them and can do nothing different afterwards.
 *
 * The whole effect, though, lives in the correction. An attempt with nothing
 * resolving it leaves a class holding a method they invented and got wrong,
 * which is strictly worse than teaching it straight. So the pair is the unit,
 * never the attempt alone.
 *
 * This module is the single place that says what a valid pair looks like, and
 * it is imported by all three consumers so they cannot drift:
 *
 *   • `lib/ai.ts`        — turns it into the instruction the generator is given
 *   • `lib/checklist.ts` — turns it into a gate the pack must pass to be reviewed
 *   • the teacher guide  — must warn the coach not to rescue the attempt
 *
 * Same reasoning as `lib/rigor.ts`: a rule that lives only in the prompt is one
 * the model drops under load, and nothing notices until a coach is teaching it.
 *
 * WHEN NOT TO USE IT. Procedures with a right answer — how a card is formatted,
 * how a flow is laid out, the speaking order of a format — are conventions.
 * There is nothing to discover in a convention, and making students guess at one
 * spends the lesson's best minutes on a wrong answer nobody needed to hear.
 */
import { type Activity } from "./lesson-pack-schema";

/** One page's part in a cycle, as recorded on the activity. */
export interface AttemptPage {
  index: number;
  title: string;
  likelyMisstep: string;
}

export interface CycleIssue {
  /** the page at fault, 1-based for humans */
  page: number;
  title: string;
  problem: string;
}

/** Titles compare the way the packer's do — case and spacing are not identity. */
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Every page that asks students to try the concept before it is taught. */
export function attemptPages(activities: Activity[]): AttemptPage[] {
  return activities
    .map((a, index) => ({ a, index }))
    .filter(({ a }) => a.attemptsBeforeTaught)
    .map(({ a, index }) => ({
      index,
      title: a.title ?? "",
      likelyMisstep: a.likelyMisstep ?? "",
    }));
}

/**
 * Everything wrong with this pack's attempt cycles.
 *
 * Four ways the pair breaks, and all four have been seen in drafts:
 *  - an attempt with no page resolving it (the class keeps the wrong method);
 *  - a consolidation naming an attempt page that does not exist (a typo'd title
 *    silently unpairs both halves);
 *  - a consolidation placed BEFORE its attempt, which is just instruction-first
 *    with extra steps;
 *  - an attempt that never says what students are expected to get wrong, which
 *    leaves the consolidation nothing specific to correct and the coach no idea
 *    what they are watching for.
 */
export function attemptCycleIssues(activities: Activity[]): CycleIssue[] {
  const issues: CycleIssue[] = [];
  const byTitle = new Map<string, number>();
  activities.forEach((a, i) => {
    if (a.title?.trim()) byTitle.set(norm(a.title), i);
  });

  for (const attempt of attemptPages(activities)) {
    if (!attempt.likelyMisstep.trim()) {
      issues.push({
        page: attempt.index + 1,
        title: attempt.title,
        problem:
          "asks students to attempt the concept but never says what they are expected to get wrong, so nothing downstream can correct it",
      });
    }
    const resolver = activities.findIndex(
      (a) => norm(a.consolidatesAttempt ?? "") === norm(attempt.title)
    );
    if (resolver === -1) {
      issues.push({
        page: attempt.index + 1,
        title: attempt.title,
        problem:
          "is an attempt before teaching with no page that resolves it — the class is left holding the method they invented",
      });
    } else if (resolver <= attempt.index) {
      issues.push({
        page: resolver + 1,
        title: activities[resolver].title ?? "",
        problem: `consolidates "${attempt.title}" but comes before it, so students are told the method first`,
      });
    }
  }

  // A consolidation pointing at nothing is the same defect seen from the other
  // side, and it is the one a title edit causes.
  activities.forEach((a, i) => {
    const target = (a.consolidatesAttempt ?? "").trim();
    if (!target) return;
    const at = byTitle.get(norm(target));
    if (at === undefined) {
      issues.push({
        page: i + 1,
        title: a.title ?? "",
        problem: `says it consolidates "${target}", but no page has that title`,
      });
    } else if (!activities[at].attemptsBeforeTaught) {
      issues.push({
        page: i + 1,
        title: a.title ?? "",
        problem: `says it consolidates "${target}", but that page is not marked as an attempt`,
      });
    }
  });

  return issues;
}

/** The instruction the generator gets. Written once, here, next to the rule. */
export const ATTEMPT_CYCLE_CONTRACT = `THE ATTEMPT → CONSOLIDATION PAIR. Where a page asks students to try the lesson's CONCEPT before it has been taught, mark it \`attemptsBeforeTaught: true\` and write \`likelyMisstep\` — the specific wrong move most of the room will make ("they will pick the bigger number and call it weighing"). A LATER page must then carry \`consolidatesAttempt\` set to that page's title EXACTLY, and its job is to name that misstep and replace it with the move a strong debater makes.

Never write one half. An attempt page with nothing resolving it leaves a class holding a method they invented and got wrong — worse than teaching it straight. A consolidation with no attempt is just instruction with a strange label.

Use the pair for ways of THINKING — weighing, warranting, telling a landed rebuttal from a shallow one. Do NOT use it for conventions with a right answer (card format, flow notation, speaking order): there is nothing to discover in a convention, and making students guess at one wastes the lesson's best minutes.`;
