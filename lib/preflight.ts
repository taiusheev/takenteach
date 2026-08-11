import type { LessonPack } from "./lesson-pack-schema";
import {
  budgetMode,
  runsPolish,
  costOf,
  policyFor,
  type AiTask,
  type BudgetMode,
} from "./model-policy";

/**
 * What a build needs before it is worth paying for.
 *
 * A pack build is 10–17 model calls over 7–15 minutes and costs on the order of
 * a dollar. The expensive way to discover that the brief was too thin, or that
 * no anchor was set, is to spend all of that and read the result. Every check
 * here is deterministic and free, and every one of them corresponds to a
 * downstream review gate the pack would have failed anyway.
 *
 * Blockers describe a build that will produce a pack the review checklist
 * refuses; warnings describe one that will merely be worse than it needed to be.
 * Nothing here prevents a build — the founder may always press on — it just puts
 * the cost of doing so in front of them first.
 */

export interface Preflight {
  /** the build will produce a pack that cannot pass review as-is */
  blockers: string[];
  /** the build will work but is missing something that would make it better */
  warnings: string[];
  /** what it will probably cost, as a range */
  estimate: BuildEstimate;
  ready: boolean;
}

export interface BuildEstimate {
  callsLow: number;
  callsHigh: number;
  usdLow: number;
  usdHigh: number;
  /** tokens in the cached system prefix — the number caching is protecting */
  prefixTokens: number;
}

/** Rough token count. JSON is denser than prose; 3.5 chars/token fits both. */
const tok = (s: string) => Math.round(s.length / 3.5);

/**
 * Cost of a build, from the shape of the pack rather than a guess.
 *
 * The call count is the honest source of the range: the fixed stages are known,
 * while validate repairs (0–4) and QA revisions (0–3) depend on how clean the
 * draft comes out. Output dominates the bill at 5x the input rate, so the range
 * is driven by page count.
 */
export function estimateBuild(
  pack: LessonPack,
  exemplarJson: string,
  opts: {
    autoQa?: boolean;
    autoDesign?: boolean;
    staticPrefixTokens?: number;
    /** price against a mode other than the process default (for comparisons) */
    mode?: BudgetMode;
  } = {}
): BuildEstimate {
  const autoQa = opts.autoQa !== false;
  // Art direction is NOT part of the build — every pack prints the house
  // stylesheet unless someone deliberately asks for a redesign, on both the
  // live and overnight paths. So this is opt-in, matching what the build
  // actually does. It used to default on, which put a design call in the figure
  // on the Build tab that the button was never going to make: an estimate that
  // overstates its own cost is as useless as one that understates it.
  const autoDesign = opts.autoDesign === true && !pack.designCss;
  const pages = Math.max(pack.outlinePlan?.length ?? 0, 12);

  // ── input ──
  // The system prefix is written once (2x on the 1h TTL) then read per call.
  const prefixTokens = (opts.staticPrefixTokens ?? 750) + tok(exemplarJson);
  const restBatches = pages - 4 > 6 ? 2 : 1;
  const fixedCalls = 1 /* outline */ + 2 /* foundation ‖ evidence */ + 1 /* spine */
    + restBatches + 1 /* teacher guide */ + (runsPolish(opts.mode ?? budgetMode()) ? 1 : 0);
  const qaCalls = autoQa ? 1 : 0;              // the review itself
  const designCalls = autoDesign ? 1 : 0;
  const callsLow = fixedCalls + qaCalls + designCalls;
  const callsHigh =
    fixedCalls + 8 /* validate repairs — MAX_PAGE_REPAIRS in lib/ai.ts */ +
    (autoQa ? 1 + 3 : 0) + designCalls;

  // ── what each call costs, at the model the policy actually sends it to ──
  //
  // A blended flat rate stopped being honest once the stages ran on different
  // models: the same build is roughly twice the price in Maximum-quality mode
  // as in Economy, and a single Opus rate would quote the same number for both.
  // So the estimate walks the real call list, looks each task up in the same
  // policy table the build uses, and prices it at that model's rate.
  //
  // Prompt caches are per model, so each model group pays its own prefix write
  // (2x on the 1h TTL) and reads it back at 0.1x on every later call in that
  // group. Splitting the pipeline across models therefore costs one extra
  // prefix write per additional model — small next to the per-token saving, but
  // it is counted here rather than waved away.
  const mode = opts.mode ?? budgetMode();

  // ── Output budgets, CALIBRATED against logged builds ──
  //
  // These were guesses, and they were wrong by most of an order of magnitude.
  // Four real builds are recorded in the activity log:
  //
  //   12 calls · 151.1k out · $4.50     12 calls · 147.4k out · $4.75
  //   14 calls · 145.6k out · $5.85     13 calls · 123.3k out · $4.93
  //
  // The old figures summed to ~18k output for a 12-page pack — against ~148k
  // actually emitted — so the Build tab quoted $0.79–1.55 for a build that cost
  // $4.50, and quoted it for MAXIMUM mode too. A cost estimate that is wrong by
  // 3–4x is worse than none: it is the number the founder picks a budget mode
  // with, and it made the expensive modes look free.
  //
  // A page is not 700 tokens. A generated activity carries instructions, steps,
  // frames, prompts, a word bank, argument chains, its rigor mechanics, a hidden
  // judge move and a fast-finisher — and the teacher guide writes six coaching
  // fields for EVERY page, which is why it is the single largest call.
  //
  // Re-calibrate from the log rather than from intuition when these move.
  /** Visible tokens for one generated page; thinking is scaled on top. */
  const perPageOut = 2000;
  const calls: { task: AiTask; out: number }[] = [
    { task: "outline", out: 1500 },
    { task: "foundation", out: 2000 },
    { task: "evidence", out: 4000 },
    // the teachable spine, then the remaining pages
    { task: "activities", out: 4 * perPageOut },
    ...Array.from({ length: restBatches }, () => ({
      task: "activities" as AiTask,
      out: ((pages - 4) / restBatches) * perPageOut,
    })),
    // six coaching fields per page, plus the timing plan and rubric
    { task: "teacher-guide", out: 8000 },
  ];
  if (runsPolish(mode)) calls.push({ task: "polish", out: 5000 });
  if (autoQa) calls.push({ task: "qa", out: 6000 });
  // The four real stylesheets in the library run 6.3–13.7KB, so ~4k tokens.
  if (autoDesign) calls.push({ task: "design-system", out: 4000 });

  // Must track MAX_PAGE_REPAIRS in lib/ai.ts — the validate pass rewrites up to
  // that many pages, and the rigor mechanics alone routinely fault six.
  const optional: { task: AiTask; out: number }[] = [
    ...Array.from({ length: 8 }, () => ({
      task: "activities" as AiTask,
      out: perPageOut,
    })), // validate repairs
    ...(autoQa
      ? Array.from({ length: 3 }, () => ({ task: "revise" as AiTask, out: 2500 }))
      : []),
  ];

  /** Price a set of calls, grouping by model so caching is per model. */
  const price = (list: { task: AiTask; out: number }[], thinkMult: number) => {
    const byModel = new Map<string, { n: number; out: number }>();
    for (const c of list) {
      const { model } = policyFor(c.task, mode);
      const g = byModel.get(model) ?? { n: 0, out: 0 };
      g.n += 1;
      g.out += c.out;
      byModel.set(model, g);
    }
    let usd = 0;
    for (const [model, g] of byModel) {
      // The per-call UNCACHED input, and the second place this estimate was
      // badly out. 1500 assumed a stage sends a short instruction; in fact every
      // stage after the outline ships the pack as it stands — which is the whole
      // point of the design (each stage writes against what the others wrote) and
      // grows to ~11k tokens by the teacher guide. The stage's own JSON Schema
      // rides here too, deliberately placed after the cache breakpoint so the
      // cached prefix stays identical across stages.
      //
      // Logged builds: 115.7k–128.7k uncached input over 12–14 calls — ~9k a
      // call, not 1.5k.
      const uncachedPerCall = 9000;
      const inTokens =
        prefixTokens * 2 + (g.n - 1) * prefixTokens * 0.1 + g.n * uncachedPerCall;
      usd += costOf(model, inTokens, g.out * thinkMult);
    }
    return usd;
  };

  return {
    callsLow,
    callsHigh,
    prefixTokens,
    // Thinking runs comparable to visible output at high effort, so the high
    // end scales output rather than pretending reasoning tokens are free.
    usdLow: price(calls, 1.4),
    usdHigh: price([...calls, ...optional], 2.6),
  };
}

/** Grade bands that mean young learners, for the rigor contradiction check. */
function isYoungBand(band: string): boolean {
  return /\b(4|5|6|7|8)\b/.test(band) && !/\b(9|10|11|12)\b/.test(band);
}

export function preflight(
  pack: LessonPack,
  opts: {
    exemplarJson?: string;
    hasExemplar?: boolean;
    siblingCount?: number;
    autoQa?: boolean;
    /** false when the series already has a look this pack will inherit */
    autoDesign?: boolean;
    staticPrefixTokens?: number;
    /** price against a mode other than the process default (for comparisons) */
    mode?: BudgetMode;
  } = {}
): Preflight {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Every content page must carry the anchor verbatim, and two review gates
  // check for it — a build without one cannot pass.
  if (!pack.resolution.trim()) {
    blockers.push(
      "No resolution / central question. Every page has to carry it verbatim, and review blocks without it."
    );
  }
  if (!pack.skillFocus.trim() && !pack.brief.trim()) {
    blockers.push(
      "No skill focus and no brief — there is nothing for the lesson to teach. Give it one or the other."
    );
  }
  if (pack.durationMin <= 0) {
    blockers.push("No lesson duration, so the timing plan has nothing to add up to.");
  }

  // Warnings — the build will run, it will just be weaker than it could be.
  if (!pack.brief.trim()) {
    warnings.push(
      "No brief. The pack will be built from the defaults; a couple of sentences about what you actually want is the single biggest quality lever you have."
    );
  }
  if (opts.hasExemplar === false) {
    warnings.push(
      "No exemplar to ground on — nothing in the library has been submitted for review yet, so this build sets its own quality bar rather than matching a proven pack."
    );
  }
  if (!pack.gradeBand.trim()) {
    warnings.push("No grade band, so reading level and demand are untargeted.");
  }
  if (!pack.series.trim()) {
    warnings.push(
      "No series. The pack can't be checked against its siblings, so it may repeat their page titles, vocabulary or sources."
    );
  }
  if (
    (pack.rigorLevel || "").toLowerCase() === "elite" &&
    isYoungBand(pack.gradeBand)
  ) {
    warnings.push(
      `Elite rigor on ${pack.gradeBand} is contradictory — elite guidance removes the scaffolds that band needs. Pick one.`
    );
  }
  // 12 activities is the review minimum; under ~5 minutes a page the pack is
  // either too thin per page or over-stuffed for the time available.
  const planned = pack.outlinePlan?.length ?? 0;
  const pages = Math.max(planned, 12);
  if (pack.durationMin > 0 && pack.durationMin / pages < 5) {
    warnings.push(
      `${pack.durationMin} minutes across ${pages} pages is ${(pack.durationMin / pages).toFixed(1)} min per page. Review needs 12+ pages, so either give it more time or expect thin pages.`
    );
  }

  return {
    blockers,
    warnings,
    ready: blockers.length === 0,
    estimate: estimateBuild(pack, opts.exemplarJson ?? "", {
      autoQa: opts.autoQa,
      autoDesign: opts.autoDesign,
      staticPrefixTokens: opts.staticPrefixTokens,
      mode: opts.mode,
    }),
  };
}
