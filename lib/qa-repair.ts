import type { ContentQa } from "./ai";
import { qaRepairPlan, repairInstruction, qaVerifyOnly } from "./qa-fixes";

/**
 * Content QA and its repairs, as a build stage rather than a human chore.
 *
 * The measured problem: an elite pack needed two or three QA passes to reach
 * grade A, because each pass digs a level deeper than the last — misattributed
 * evidence, then inconsistent taxonomy, then a distinction the pack itself
 * blurs. Every round meant a person reading a finding, retyping it into the
 * revision box, and waiting again. The build already holds the finding AND the
 * fix; it can do the typing.
 *
 * Dependency-injected on purpose. The two expensive calls are passed in, so the
 * control flow — what gets fixed, in what order, when the pack is re-graded,
 * what is handed back to a human — can be tested exactly as it will run,
 * without an API key or a cent of credit.
 */

export interface QaSummary {
  /** A–D, as the reviewer graded it AFTER any repairs */
  grade: string;
  /** the reviewer's own verdict on whether it can go to a human review */
  ready: boolean;
  /** findings the build repaired by itself */
  repaired: string[];
  /** findings left for a human — over the cap, unfixable, or still failing */
  remaining: string[];
  /** citations a human must check against the real source; never auto-fixable */
  verify: string[];
}

export interface QaRepairDeps<P> {
  review: (pack: P) => Promise<ContentQa>;
  revise: (pack: P, instruction: string) => Promise<{ pack: P; applied: boolean }>;
}

export async function qaRepairPass<P>(
  pack: P,
  deps: QaRepairDeps<P>,
  opts: { maxFixes?: number; perCall?: number } = {}
): Promise<{ pack: P; report: ContentQa; qa: QaSummary }> {
  let current = pack;
  let report = await deps.review(current);
  const plan = qaRepairPlan(report, opts);
  const repaired: string[] = [];

  // Strictly sequential: every batch edits the same pack, so two in flight would
  // both revise from the same stale copy and the second would undo the first.
  for (const batch of plan.batches) {
    try {
      const res = await deps.revise(current, repairInstruction(batch));
      if (res.applied) {
        current = res.pack;
        repaired.push(...batch.map((f) => f.label));
      }
    } catch {
      // One failed batch must not sink a finished pack. The finding simply
      // stays on the report and is handed to a human below.
    }
  }

  // Re-grade only if something actually changed — an unchanged pack would get
  // the identical report for the price of a second expensive call. This is also
  // what lets the pack reach review: the gate compares the report's content
  // fingerprint against the pack, so a pre-repair report is stale by definition.
  if (repaired.length > 0) report = await deps.review(current);

  const left = qaRepairPlan(report, opts);
  return {
    pack: current,
    report,
    qa: {
      grade: report.overallGrade,
      ready: report.readyForReview,
      repaired,
      remaining: [...left.batches.flat(), ...left.deferred].map((f) => f.label),
      verify: qaVerifyOnly(report),
    },
  };
}
