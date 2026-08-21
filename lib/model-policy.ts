import { AsyncLocalStorage } from "node:async_hooks";
/**
 * What each AI task is allowed to spend.
 *
 * Every call in this product ran on Opus 5 at `high` effort — the planner that
 * turns one sentence into eight fields cost exactly as much per token as the
 * reviewer that fact-checks an evidence deck. Opus 5 is $5/$25 per million
 * tokens and Sonnet 5 is $3/$15, so the mechanical stages were being billed at
 * nearly twice what they need.
 *
 * This table is the single place that decides, per task, which model runs it
 * and how hard it thinks. It is deliberately explicit rather than clever: the
 * cost of a build should be readable off one file, and the preflight estimate
 * reads the same table so the number shown to the teacher is the number the
 * build actually spends.
 *
 * THE RULE BEHIND THE ASSIGNMENTS: keep Opus where a mistake is expensive and
 * invisible — the evidence deck (a fabricated citation reaches a classroom),
 * the activities (the actual teaching), and content QA (the gate that catches
 * both). Downgrade where the task is structural and the output is checked by
 * something else: planning fields, outlines, the teacher guide, CSS.
 */

/**
 * The three modes, as data. The union used to be hand-written and `isBudgetMode`
 * hand-checked the same three strings a second time — so adding a mode meant
 * remembering both, and the guard was the one that got forgotten. Deriving the
 * type from the tuple leaves one place to edit, and lets a request schema
 * validate against the same list the policy tables are keyed by.
 */
export const BUDGET_MODE_IDS = ["economy", "balanced", "max"] as const;
export type BudgetMode = (typeof BUDGET_MODE_IDS)[number];
export type Effort = "low" | "medium" | "high";

/** Every distinct model call the product makes. */
export type AiTask =
  | "plan" // one sentence → the pack's setup fields
  | "style-profile" // a teacher's own materials → how they sound
  | "outline" // page-by-page arc
  | "foundation" // mission, criteria, vocabulary
  | "evidence" // the source deck — citations live or die here
  | "activities" // the actual lesson pages
  | "teacher-guide" // timing plan, scripts, rubric
  | "polish" // self-critique rewrite of the weakest pages
  | "revise" // surgical targeted edit
  | "qa" // fact-check + teaching review
  | "design-system" // one scoped stylesheet for the pack
  | "art-direction" // the design brief the stylesheet is built from
  | "unit-plan" // a series of lessons
  | "research" // source leads
  | "simple-content"; // class plan / vocab set / ballot

export const MODELS = {
  opus: "claude-opus-5",
  sonnet: "claude-sonnet-5",
} as const;

/**
 * WHY HAIKU IS NOT ON THIS LADDER, despite being the cheapest option at $1/$5.
 *
 * Haiku 4.5 is a previous-generation model and rejects both parameters every
 * request in this codebase sends: `output_config.effort` errors on it outright,
 * and it predates adaptive thinking — it needs the deprecated
 * `thinking: {type:"enabled", budget_tokens:N}` form instead. Routing even the
 * one-sentence planner there would 400 on the first call.
 *
 * Supporting it means a second request shape throughout `aiStream`, which is a
 * real change to the one place all sixteen call sites funnel through, for a
 * saving of roughly two cents per build on the two smallest calls. Sonnet 5
 * takes the same parameters as Opus 5 and is already 40% cheaper, so the ladder
 * stops there. Revisit if a Haiku-generation model gains the current shape.
 */

/** Published list price, USD per million tokens. */
export const RATES: Record<string, { in: number; out: number }> = {
  [MODELS.opus]: { in: 5, out: 25 },
  // Sonnet 5 is discounted to $2/$10 through 2026-08-31. The list price is used
  // for estimates on purpose: an estimate that quietly assumes a promotion is
  // an estimate that breaks the day it ends.
  [MODELS.sonnet]: { in: 3, out: 15 },
  // Haiku is intentionally absent — see the note above MODELS.

  /* OPEN-WEIGHT MODELS, so a stage running on one is priced by the same
     meter and lands in the same cost view — which is what makes the two
     directly comparable. Published Groq rates; see lib/open-model.ts. */
  "openai/gpt-oss-120b": { in: 0.15, out: 0.6 },
  "openai/gpt-oss-20b": { in: 0.1, out: 0.5 },
};

export interface TaskPolicy {
  model: string;
  effort: Effort;
}

/**
 * The stages that share ONE cached system prefix (everything routed through
 * `runStage` → `systemBlocks`: the ~12k-token preamble + grounding exemplar).
 *
 * ── WHY THIS SET EXISTS: EFFORT IS PART OF THE CACHE KEY ──
 *
 * Measured, not assumed (scripts/probe-cache.mjs): sending the same system
 * prefix to the same model twice reads the cache — but changing
 * `output_config.effort` between them re-WRITES it, and writes bill at 2x.
 *
 *   sonnet-5 effort=medium  write=9262 read=0
 *   sonnet-5 effort=medium  write=0    read=9262   <- cache works
 *   sonnet-5 effort=high    write=9262 read=0      <- effort change invalidated it
 *   sonnet-5 effort=medium  write=0    read=9262   <- and it's per (model, effort)
 *
 * The build used to vary effort per stage, so a real 13-call build reported a
 * **0% cache hit rate and cost $4.93** against a ~$1.20 estimate — every stage
 * paying full freight for the same exemplar. So every task in this set runs at
 * the SAME effort, and that is a correctness constraint, not a preference: give
 * two of them different efforts and the cache silently stops working again.
 *
 * Tasks outside this set (design, QA, revise, plan, research…) build their own
 * system prompts, so their effort is free to vary.
 *
 * ── EFFORT WAS ONLY HALF OF IT ──
 *
 * Pinning effort did NOT fix the hit rate: the next build still reported 0%
 * with `156.8k cache writes`. The second invalidator is the structured-output
 * grammar, which is also part of the cached prefix and used to differ per
 * stage. Both had to be held constant; see `ENVELOPE_FORMAT` in lib/ai.ts and
 * scripts/probe-cache-format.mjs for the measurement.
 */
const STAGED_TASKS = new Set<AiTask>([
  "outline",
  "foundation",
  "evidence",
  "activities",
  "teacher-guide",
  "polish",
  "simple-content",
]);

/**
 * The one effort every staged task runs at, per mode.
 *
 * It has to be a single value per mode (see above), so the only question is
 * which. The same $4.93 build that exposed the cache bug also generated
 * **123.3k output tokens** — roughly double the estimate — and output bills at
 * 5x input, so thinking depth is the other half of the overrun.
 *
 * Hence: Balanced and Maximum pin to `high`, the deepest any staged task used
 * before, so neither loses quality to buy the cache back. Economy drops to
 * `medium`, which is what "economy" should mean — it trades some depth for a
 * materially smaller output bill, and stays cache-coherent either way.
 */
const STAGED_EFFORT: Record<BudgetMode, Effort> = {
  economy: "medium",
  balanced: "high",
  max: "high",
};

/**
 * `max` is exactly what the product did before this file existed, so it is the
 * honest baseline to compare against and the escape hatch if a cheaper mode
 * ever disappoints.
 */
const MAX: Record<AiTask, TaskPolicy> = {
  plan: { model: MODELS.opus, effort: "low" },
  "style-profile": { model: MODELS.opus, effort: "low" },
  outline: { model: MODELS.opus, effort: "medium" },
  foundation: { model: MODELS.opus, effort: "high" },
  evidence: { model: MODELS.opus, effort: "high" },
  activities: { model: MODELS.opus, effort: "high" },
  "teacher-guide": { model: MODELS.opus, effort: "high" },
  polish: { model: MODELS.opus, effort: "high" },
  revise: { model: MODELS.opus, effort: "high" },
  qa: { model: MODELS.opus, effort: "high" },
  "design-system": { model: MODELS.opus, effort: "high" },
  "art-direction": { model: MODELS.opus, effort: "high" },
  "unit-plan": { model: MODELS.opus, effort: "medium" },
  research: { model: MODELS.opus, effort: "medium" },
  "simple-content": { model: MODELS.opus, effort: "high" },
};

/**
 * Opus keeps the three jobs where a quiet mistake is expensive:
 * the evidence deck, the pages themselves, and the review that checks both.
 * Everything else moves to a model that is genuinely good at it and costs less.
 */
const BALANCED: Record<AiTask, TaskPolicy> = {
  ...MAX,
  // Filling eight known fields from one sentence, against a fixed schema.
  plan: { model: MODELS.sonnet, effort: "low" },
  // Summarising prose into eight short fields, read back and edited by a human.
  "style-profile": { model: MODELS.sonnet, effort: "low" },
  // Structural planning, and the author reviews it before the build spends on it.
  outline: { model: MODELS.sonnet, effort: "medium" },
  foundation: { model: MODELS.sonnet, effort: "high" },
  // Follows pages that already exist; the checklist verifies the timings sum.
  "teacher-guide": { model: MODELS.sonnet, effort: "medium" },
  // Writing CSS — Sonnet's strong suit, and the contrast pass catches unsafe output.
  "design-system": { model: MODELS.sonnet, effort: "high" },
  "art-direction": { model: MODELS.sonnet, effort: "medium" },
  "unit-plan": { model: MODELS.sonnet, effort: "medium" },
  research: { model: MODELS.sonnet, effort: "low" },
};

/**
 * As cheap as it can be while still clearing the review gates.
 *
 * Note what does NOT move even here: `evidence` and `qa` stay on Opus. Cheap
 * citations are worthless — the whole evidence-integrity apparatus exists
 * because a fabricated source in a printed pack is the one defect this product
 * must never ship, and QA is what catches it. Everything else drops a notch.
 */
const ECONOMY: Record<AiTask, TaskPolicy> = {
  ...BALANCED,
  activities: { model: MODELS.sonnet, effort: "high" },
  evidence: { model: MODELS.opus, effort: "medium" },
  qa: { model: MODELS.opus, effort: "medium" },
  revise: { model: MODELS.sonnet, effort: "high" },
  foundation: { model: MODELS.sonnet, effort: "medium" },
  "simple-content": { model: MODELS.sonnet, effort: "medium" },
  polish: { model: MODELS.sonnet, effort: "medium" },
};

const TABLES: Record<BudgetMode, Record<AiTask, TaskPolicy>> = {
  economy: ECONOMY,
  balanced: BALANCED,
  max: MAX,
};

export const BUDGET_MODES: { id: BudgetMode; label: string; blurb: string }[] = [
  {
    id: "economy",
    label: "Economy",
    blurb:
      "The default. Cheapest that still passes every gate: the pages, planning, guide and design all run on the cheaper model, polish is skipped entirely, and only the source deck and the content review stay on the top model — a cheap citation is worth nothing. About a third less than Maximum.",
  },
  {
    id: "balanced",
    label: "Balanced",
    blurb:
      "The top model writes the pages, the sources and the review; planning, the teacher guide and the design run on the cheaper model. Use it when a pack matters more than the bill but Maximum is overkill.",
  },
  {
    id: "max",
    label: "Maximum quality",
    blurb:
      "Everything on the top model. What this product did before budget modes existed — use it when a pack has to be the best it can be, and expect to pay about twice Balanced.",
  },
];

/**
 * Whether a mode runs the polish stage at all.
 *
 * Polish ships the WHOLE pack and rewrites its 2–4 weakest pages, whether or
 * not anything is actually wrong — the one stage that always spends. It no
 * longer stands alone: the validate pass repairs exactly the pages that fail a
 * real gate, and content QA is a better-informed reviewer that flags every
 * merely-adequate page, which is precisely polish's job. In Economy it is
 * dropped outright rather than run on a cheaper model, because a whole extra
 * pack-sized call is the single largest thing left to cut.
 */
export function runsPolish(mode: BudgetMode = budgetMode()): boolean {
  return mode !== "economy";
}

/**
 * THE BUDGET MODE, SCOPED TO ONE REQUEST.
 *
 * ── WHY THIS IS NOT A MODULE VARIABLE ANY MORE ───────────────────────────
 * It was `let current: BudgetMode`, and that is a bug the moment the app runs
 * anywhere but one process — which is the whole point of the deploy
 * (docs/DEPLOYMENT.md §4 lists it as work still to do). Three ways it bites,
 * all silent:
 *
 *   · One organization's mode becomes another's. A warm serverless instance is
 *     shared, so a school that picked Maximum sets the price for whoever lands
 *     on that instance next. Cross-tenant, and about money.
 *   · A build changes price mid-flight. A build is many requests now, and
 *     nothing guarantees two legs hit the same instance — so a run started at
 *     Maximum can finish at Economy, or the reverse, with no record of either.
 *   · It re-keys the prompt cache. `effort` is part of the cache key, and
 *     `policyFor` reads the mode to set it. Two legs disagreeing means the
 *     ~12k-token prefix is written again instead of read, at 2x instead of
 *     0.1x. That is the 0%-hit-rate signature, arriving from a direction
 *     nobody would think to look.
 *
 * AsyncLocalStorage is the fix the codebase already trusts for exactly this —
 * see lib/usage-meter.ts, which the deployment notes single out as the piece of
 * module state that is *fine* because it is request-scoped by design.
 *
 * Economy remains the default: the standing instruction is to spend as little
 * as possible, and the two things that must not be cheapened — the evidence
 * deck and the content review — stay on the top model in every mode.
 */
const modeStore = new AsyncLocalStorage<{ mode: BudgetMode }>();

/**
 * Run `fn` with this budget mode. Everything inside — including the ~16 call
 * sites that read it indirectly through `policyFor` — sees it, and nothing
 * outside does.
 */
export function withBudgetMode<T>(mode: BudgetMode, fn: () => Promise<T>): Promise<T> {
  return modeStore.run({ mode }, fn);
}

/**
 * Kept for the one caller that cannot wrap: the overnight runner starts work
 * and returns before it finishes, so there is no scope to run inside.
 *
 * It sets the mode for the CURRENT store if there is one, and otherwise does
 * nothing at all — which is the safe direction. A background job that cannot
 * express its mode gets the Economy default rather than silently setting the
 * price for every other request on the instance.
 */
export function setBudgetMode(mode: BudgetMode) {
  const s = modeStore.getStore();
  if (s) s.mode = mode;
}

export function budgetMode(): BudgetMode {
  return modeStore.getStore()?.mode ?? "economy";
}

export function isBudgetMode(v: unknown): v is BudgetMode {
  return BUDGET_MODE_IDS.includes(v as BudgetMode);
}

/** What model and effort a task runs at, in a given mode (defaults to current). */
export function policyFor(task: AiTask, mode: BudgetMode = budgetMode()): TaskPolicy {
  const p = TABLES[mode][task];
  // Staged tasks share a cached prefix, and effort is part of its key — so the
  // table's per-task effort is deliberately overridden here rather than trusted.
  // Enforcing it in one place means a future edit to the tables can't silently
  // reintroduce the 0%-cache bug. See STAGED_TASKS above.
  return STAGED_TASKS.has(task) ? { ...p, effort: STAGED_EFFORT[mode] } : p;
}

/** The tasks whose effort is pinned for cache coherence (for tests/reporting). */
export function isStagedTask(task: AiTask): boolean {
  return STAGED_TASKS.has(task);
}

/** Cost of one call's tokens, in USD, at the given model's list price. */
export function costOf(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rate = RATES[model] ?? RATES[MODELS.opus];
  return (inputTokens * rate.in + outputTokens * rate.out) / 1e6;
}

/**
 * PROMPT VERSIONS.
 *
 * Every task's prompt gets an explicit revision, recorded against each metered
 * call. Without it, "the build got more expensive last Tuesday" and "the packs
 * got worse last Tuesday" are both unanswerable — a prompt edit changes cost
 * and quality simultaneously and leaves no trace, so the two most important
 * questions about a change to this system cannot be asked after the fact.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────
 * Bump the version whenever you change the text a task sends. That is the whole
 * discipline; it costs one line per edit and it is what makes a regression
 * attributable to a change rather than to the model having a bad week.
 *
 * ── AND IT IS NOT COSMETIC ───────────────────────────────────────────────
 * The staged tasks share ONE cached system prefix, so editing that prefix
 * invalidates the cache for every one of them and the next build pays a full
 * set of writes (2x). A version bump is therefore also the honest record of
 * "this build was more expensive because I changed the prompt", which is
 * otherwise indistinguishable from the cache silently breaking.
 *
 * v2 across the board: the system prompt and the four standalone prompts had
 * the product's own name written into them ("You are the lead lesson-pack
 * author for TakenTeach"). Lessons belong to the school that teaches them, so
 * the prompts now say so — see the note on brandedKit in lib/db.ts.
 */
export const PROMPT_VERSIONS: Record<AiTask, string> = {
  plan: "plan_v2",
  "style-profile": "style_profile_v1",
  outline: "outline_v2",
  foundation: "foundation_v2",
  evidence: "evidence_v2",
  activities: "activities_v2",
  "teacher-guide": "teacher_guide_v2",
  polish: "polish_v2",
  revise: "revise_v2",
  qa: "qa_v2",
  "design-system": "design_system_v2",
  "art-direction": "art_direction_v2",
  "unit-plan": "unit_plan_v2",
  research: "research_v2",
  "simple-content": "simple_content_v2",
};

export function promptVersion(task: AiTask): string {
  return PROMPT_VERSIONS[task] ?? `${task}_v1`;
}

/**
 * The output ceiling per task, in tokens.
 *
 * ── WHY THIS IS NOT ONE NUMBER ───────────────────────────────────────────
 * Every call in the pipeline sent `max_tokens: 64000`, which is not a budget —
 * it is the absence of one. Output bills at 5x input, so a single runaway Opus
 * call at that ceiling is $1.60, more than a third of a whole build, and
 * nothing in the system would have stopped it or even remarked on it.
 *
 * The numbers below are the calibrated per-call output from four logged builds
 * (see lib/preflight.ts) with generous headroom — roughly 2.5x the observed
 * figure — so they cannot truncate a legitimate result. They exist to catch the
 * pathological case: a model that loops, or a schema that invites an essay.
 *
 * Adaptive thinking counts against this, which is why the ceilings are set well
 * above visible output rather than at it.
 */
export const MAX_OUTPUT: Record<AiTask, number> = {
  plan: 4_000,
  "style-profile": 4_000,
  outline: 12_000,
  foundation: 16_000,
  evidence: 24_000,
  // The largest legitimate call: a batch of pages, each with its components.
  activities: 48_000,
  // Six coaching fields for every page plus the timing plan and rubric.
  "teacher-guide": 40_000,
  polish: 32_000,
  revise: 24_000,
  qa: 32_000,
  "design-system": 24_000,
  "art-direction": 8_000,
  "unit-plan": 16_000,
  research: 8_000,
  "simple-content": 24_000,
};

export function maxOutputFor(task: AiTask): number {
  return MAX_OUTPUT[task] ?? 32_000;
}
