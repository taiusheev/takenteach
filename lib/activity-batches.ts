/**
 * How the outline's pages are divided between concurrent generation calls.
 *
 * The obvious split — first half, second half — is the wrong one. A lesson is
 * only teachable once it has all four core beats, and the outline always puts
 * the exit ticket last, so NO contiguous slice can contain both the hook and the
 * exit ticket. Whichever half you wait for, you are waiting for both.
 *
 * So the first batch is the SPINE: the first page realising each core beat. It
 * is about four pages against the remainder's ten, so it comes back
 * substantially earlier — and a pack with a hook, a modelled example, guided
 * practice and an exit ticket is something a teacher can actually stand up and
 * teach while the drills are still being written.
 *
 * Kept pure and separate from the generator so the split can be inspected and
 * tested without spending a model call.
 */

/** The beats a lesson cannot be taught without, in teaching order. */
export const SPINE_KINDS = ["hook", "i-do", "we-do", "exit-ticket"] as const;

export interface BatchPlan {
  /** [outline index, index into the existing activities] for pages already written */
  matched: [number, number][];
  /** outline indices of the teachable spine, in outline order */
  spine: number[];
  /** every other outstanding outline index, split into balanced batches */
  rest: number[][];
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Split the outline into the batches still to be generated.
 *
 * Pages already on the pack (a resumed or partially-failed build) are matched
 * back to their outline slot BY TITLE rather than by position: a build that lost
 * one batch has holes in the middle, so counting is not enough to know what is
 * missing. Only unmatched slots are handed out for generation.
 *
 * @param maxBatch pages above which the remainder is split in two, so no single
 *   call is larger than the halves this replaced.
 */
export function batchActivities(
  plan: { kind: string; title: string }[],
  existing: { title: string }[],
  maxBatch = 6
): BatchPlan {
  const matched: [number, number][] = [];
  const takenSlot = new Set<number>();
  existing.forEach((page, e) => {
    const slot = plan.findIndex(
      (p, i) => !takenSlot.has(i) && norm(p.title) === norm(page.title)
    );
    if (slot >= 0) {
      takenSlot.add(slot);
      matched.push([slot, e]);
    }
  });

  // the FIRST page realising each beat — a lesson with two hooks needs one of
  // them to be teachable, not both
  const spineSlots = new Set<number>();
  for (const kind of SPINE_KINDS) {
    const hit = plan.findIndex((p, i) => p.kind === kind && !spineSlots.has(i));
    if (hit >= 0) spineSlots.add(hit);
  }

  const outstanding = plan
    .map((_, i) => i)
    .filter((i) => !takenSlot.has(i));
  const spine = outstanding.filter((i) => spineSlots.has(i));
  const remainder = outstanding.filter((i) => !spineSlots.has(i));

  const rest: number[][] =
    remainder.length === 0
      ? []
      : remainder.length > maxBatch
        ? [
            remainder.slice(0, Math.ceil(remainder.length / 2)),
            remainder.slice(Math.ceil(remainder.length / 2)),
          ]
        : [remainder];

  return { matched, spine, rest };
}

/** One row of a minute-by-minute plan, structurally identical to `TimingRow`. */
export interface PlanRow {
  startMin: number;
  endMin: number;
  phase: string;
  who: "T" | "Ss" | "T+Ss";
  what: string;
}

/**
 * A minute-by-minute plan derived straight from the pages that exist.
 *
 * `packReadiness` will not call a pack teachable without a timing plan, and the
 * real one is written six or seven minutes into a build — so a pack whose spine
 * was already on paper still reported as unteachable. This costs no model call
 * and is overwritten by the teacher-guide stage; callers mark it `provisional`
 * so the review checklist never accepts it as the finished article.
 */
export function provisionalTimingPlan(
  activities: {
    kind: string;
    title: string;
    durationMin: number;
    instructions?: string;
    keyIdea?: string;
  }[]
): PlanRow[] {
  let at = 0;
  return activities.map((a) => {
    const startMin = at;
    at += Math.max(1, a.durationMin || 1);
    return {
      startMin,
      endMin: at,
      phase: a.title,
      who:
        a.kind === "i-do"
          ? "T"
          : a.kind === "exit-ticket" || a.kind === "independent-build"
            ? "Ss"
            : "T+Ss",
      what: (a.instructions || a.keyIdea || "Run this page.").trim(),
    };
  });
}
