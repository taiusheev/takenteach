import { NextRequest } from "next/server";
import { z } from "zod";
import {
  logActivity,
  logAiUsage,
  snapshotMaterial,
  spentOnMaterial,
  updateMaterialContent,
} from "@/lib/db";
import { generateLessonPack, generateSimpleContent, describeAiError } from "@/lib/ai";
import { buildInputs } from "@/lib/overnight";
import { BUDGET_MODE_IDS, budgetMode, setBudgetMode } from "@/lib/model-policy";
import { LessonPack } from "@/lib/lesson-pack-schema";
import { loadEditableMaterial } from "@/lib/api/guards";
import { badRequest, readBody } from "@/lib/api/request";
import {
  withUsageMeter,
  describeUsage,
  usageBreakdown,
} from "@/lib/usage-meter";
import { consumeLeg } from "@/lib/build-leg";

export const dynamic = "force-dynamic";

/**
 * ── A BUILD IS NOW SEVERAL REQUESTS, NOT ONE ─────────────────────────────
 *
 * This route declared `maxDuration = 3600` and held one stream open for the
 * whole build. Measured against the real corpus, a build runs 6–22 minutes
 * (median 7.3, and the last four elite packs 15–22) across 12–14 model calls,
 * so no serverless platform was ever going to serve it — see docs/DEPLOYMENT.md
 * §2. It is also simply a bad experience: closing the laptop or losing school
 * wifi killed the connection and the progress display with it.
 *
 * So the route now runs the build for a TIME BUDGET and stops. It persists
 * everything finished, says whether more remains, and the client asks again.
 *
 * WHY A TIME BUDGET RATHER THAN "ONE STAGE PER REQUEST". The obvious design is
 * `?stage=foundation`, one stage per call. A budget is strictly better here and
 * no more complex: stages are wildly uneven — several resume for free in
 * microseconds while `activities-1` on an elite pack is minutes — so a
 * stage-per-request spends ten round trips to skip work that costs nothing,
 * and still cannot promise any single request fits. A budget adapts by itself:
 * cheap stages batch into one leg, an expensive one gets a leg to itself, and
 * the knob is the deployment's real constraint rather than a guess about which
 * stage is slow.
 *
 * WHAT MAKES THIS SAFE is that `generateLessonPack` is re-entrant: the pack is
 * persisted after every stage and each stage checks whether its work is already
 * present, so re-entering skips to the first unfinished stage without paying
 * for the ones behind it. QA was the one exception and now carries the same
 * gate — see the note on `qaIsCurrent` in lib/ai.ts.
 *
 * A LEG THAT IS KILLED ANYWAY still only loses the stage in flight. That is the
 * property worth having on a free tier whose ceiling we do not control: the
 * build degrades to "click again to continue" instead of failing.
 */
export const maxDuration = 300;

/**
 * How long one leg may run before it stops and hands back.
 *
 * Deliberately below `maxDuration`, because the budget is only checked BETWEEN
 * stages — a stage started at 04:59 runs to completion — so the gap is the
 * headroom for the longest single stage. Set `BUILD_LEG_BUDGET_MS` per
 * deployment: lower it on a tighter ceiling, raise it on a longer one. It
 * changes only how many legs a build takes, never the result.
 */
const LEG_BUDGET_MS = Number(process.env.BUILD_LEG_BUDGET_MS ?? 45_000);

/**
 * The most one lesson may ever cost, across every build leg and rebuild.
 *
 * Measured builds run $4.50–5.85 in Maximum mode and roughly a third of that
 * in the Economy default, so $25 is far above any legitimate lesson — it is not
 * a budget to plan against, it is the tripwire that stops a loop. A build that
 * hits it keeps everything it has written and refuses to start another leg.
 */
const MATERIAL_BUDGET_USD = Number(process.env.MATERIAL_BUDGET_USD ?? 25);

/** Ceiling for a single leg — one runaway stage cannot outrun the leg budget. */
const LEG_BUDGET_USD = Number(process.env.BUILD_LEG_BUDGET_USD ?? 8);

const bodySchema = z.object({
  /** "Regenerate all" — clear the pack and rebuild rather than resume. */
  fresh: z.boolean().default(false),
  /**
   * This is a continuation of a build already in progress, not a new one.
   *
   * Set by the client on every leg after the first. It suppresses the things
   * that must happen once per BUILD rather than once per request — the undo
   * snapshot and the start marker in the activity log. Without it a 22-minute
   * build would write thirty snapshots and the material's history would read as
   * thirty separate builds.
   */
  resume: z.boolean().default(false),
  /**
   * Content QA + auto-repair as the last build stage. On by default: it adds a
   * few minutes to the build and removes the two or three human QA/revise rounds
   * an elite pack used to need.
   */
  autoQa: z.boolean().default(true),
  /**
   * THE HOUSE DESIGN IS THE DESIGN, so this is off by default. Builds no longer
   * art-direct each pack: the academy's own lessons are one publication across
   * all ten weeks, not ten different-looking worksheets, and a bespoke
   * stylesheet per pack was the thing that made quality a lottery. Every pack
   * prints the house standard (lib/house-design.ts) unless someone deliberately
   * asks for a redesign — this opts in, and the Redesign button still works.
   * Also removes a model call from every build.
   */
  autoDesign: z.boolean().default(false),
  /** Which models the stages run on, and how hard they think. */
  budgetMode: z.enum(BUDGET_MODE_IDS).optional(),
});

/**
 * Streams staged AI generation as newline-delimited JSON events. The pack is
 * persisted after every stage, so stopping mid-way keeps everything generated
 * so far and the Builder picks it up immediately.
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/materials/[id]/generate">
) {
  const gate = await loadEditableMaterial(ctx, {
    refusal: "Only draft packs can be generated, by builders.",
  });
  if (!gate.ok) return gate.response;
  const { material, role, session } = gate;
  const { scope } = session;

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  // "Regenerate all" clears the pack for a clean rebuild; a plain build resumes
  // past whatever stages an interrupted run already completed.
  const { fresh, autoQa, autoDesign, resume } = parsed.data;
  // Which models the stages run on, and how hard they think. Set for the whole
  // run before any stage starts, so the estimate the founder just read on the
  // Build tab and the calls this build makes come from the same table.
  if (parsed.data.budgetMode) setBudgetMode(parsed.data.budgetMode);
  // Read back rather than reusing the request field: the mode is a process
  // default the body may or may not override, and the usage row must record
  // what actually ran, not what was asked for.
  const mode = budgetMode();

  /* CUMULATIVE CEILING. A build is several requests, each metered separately,
     so a per-run limit cannot see the total — the runaway this guards against
     is a lesson that keeps resuming, each leg individually reasonable. Checked
     once per leg, before any money is spent, against every operation this
     lesson has ever paid for. */
  const alreadySpent = await spentOnMaterial(scope, material.id);
  if (alreadySpent >= MATERIAL_BUDGET_USD) {
    return badRequest(
      `This lesson has already used ${alreadySpent.toFixed(2)} of AI budget, which is past the ${MATERIAL_BUDGET_USD.toFixed(2)} per-lesson limit. Everything built so far is saved and editable. Raise MATERIAL_BUDGET_USD if this lesson genuinely needs more.`
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      /** Did the generator reach `done`, or did this leg run out of budget? */
      let finished = false;
      try {
        // One snapshot per BUILD, not per stage and — since a build became
        // several requests — not per leg either. The state worth keeping is the
        // one that existed before the build started, especially for a fresh
        // rebuild, which wipes everything first. A continuation must not
        // snapshot: it would bury the real undo point under thirty copies of
        // work in progress, and VERSION_LIMIT would then evict the only version
        // the teacher actually wanted back.
        if (!resume) {
          await snapshotMaterial(
            material.id,
            fresh ? "full rebuild" : "AI build",
            role
          );
          await logActivity(material.id, role, "quick-build-start");
        }
        // Everything the build grounds itself on — the kit, series siblings, a
        // remix's inherited outline, classroom evidence, the exemplar, recurring
        // corrections and the design memory. Gathered by the SAME function the
        // overnight runner uses: these forty lines were previously copied here,
        // so "build this pack now" and "build it at 3am for half price" were two
        // hand-maintained descriptions of one thing, and any fix to grounding
        // had to be made twice or silently applied to only one path.
        const inputs = await buildInputs(scope, material);
        const kit = inputs.kit;
        const stream =
          material.type === "lesson-pack"
            ? generateLessonPack(
                material.subject,
                material.content as LessonPack,
                inputs.inherited,
                inputs.siblings,
                inputs.evidence,
                kit?.config,
                inputs.exemplar,
                fresh,
                inputs.corrections,
                autoQa,
                {
                  enabled: autoDesign,
                  // design memory: what the library already looks like, so this
                  // pack invents something of its own instead of repeating
                  avoid: inputs.design.avoid,
                  // ...but if this pack's own SERIES already has a look, adopt
                  // that instead of inventing a rival one. The cheapest call is
                  // the one not made, and a unit should look like one unit —
                  // the same rule class plans and word banks already follow.
                  inherit: inputs.design.inherit,
                },
                inputs.recentActivity
              )
            : generateSimpleContent(
                material.type,
                material.subject,
                material.content as unknown as Record<string, unknown>,
                kit?.config.rules.minVocabTerms ?? 8,
                {
                  // the lighter types get the same audience and classroom
                  // evidence a Lesson Pack does — they were drafted blind before
                  kitConfig: kit?.config,
                  classroomEvidence: inputs.evidence,
                  debateFormat:
                    (material.content as Record<string, unknown>)
                      ?.debateFormat as string,
                }
              );
        // Meter the whole build so the last event can report what it cost and,
        // more importantly, whether the shared prompt cache was actually hit.
        await withUsageMeter(
          async () => {
            const leg = await consumeLeg(stream, {
              budgetMs: LEG_BUDGET_MS,
              aborted: () => req.signal.aborted,
              onStageDone: async (event) => {
                if (event.pack) {
                  await updateMaterialContent(material.id, material.title, event.pack);
                }
                // A stage the build was allowed to survive without (design, QA)
                // goes in the activity log. Without this the only evidence is a
                // missing field, which is indistinguishable from "never asked
                // for" — and the founder paid for the attempt either way.
                if (event.skipped) {
                  await logActivity(
                    material.id,
                    role,
                    `stage-skipped:${event.stage}`,
                    event.skipped
                  );
                }
              },
              // don't re-send the full pack on every event; the client refetches
              onEvent: (event) =>
                send({
                  type: event.type,
                  stage: event.stage,
                  label: event.label,
                  pack: event.pack,
                  repair: event.repair,
                  qa: event.qa,
                  skipped: event.skipped,
                }),
            });
            finished = leg.finished;
          },
          async (totals) => {
            send({ type: "usage", usage: totals, summary: describeUsage(totals) });
            /* Only when this leg actually spent something. A leg that just
               skipped its way to the first unfinished stage made no model calls,
               and a row saying "0 calls · ~$0.00" for each of those turns the
               cost history — which is the ground truth for what a build costs —
               into something you have to filter before you can read it. */
            if (totals.calls > 0) {
              await logActivity(
                material.id,
                role,
                "quick-build-usage",
                describeUsage(totals)
              );
              /* The queryable copy. The activity line above stays because a
                 person reading one lesson's history wants a sentence; this is
                 what makes "where did the month's budget go" a query rather
                 than an afternoon of reading logs. */
              await logAiUsage({
                orgId: scope.orgId,
                materialId: material.id,
                operation: "build",
                calls: totals.calls,
                inputTokens: totals.input,
                cacheWriteTokens: totals.cacheWrite,
                cacheReadTokens: totals.cacheRead,
                outputTokens: totals.output,
                usd: totals.usd,
                ms: totals.ms,
                budgetMode: mode,
                /* A leg stopped by the ceiling is not a success. Recording it
                   as one would hide the most important thing about it. */
                ok: !totals.stoppedOnBudget,
                breakdown: usageBreakdown(totals),
              });
            }
          },
          {
            /* Whichever is tighter: the per-leg ceiling, or what remains of
               this lesson's total allowance. The floor keeps a nearly-exhausted
               lesson from being given a budget so small that a single legitimate
               call trips it on arrival. */
            budgetUsd: Math.min(
              LEG_BUDGET_USD,
              Math.max(0.5, MATERIAL_BUDGET_USD - alreadySpent)
            ),
          }
        );
        if (finished) {
          await logActivity(material.id, role, "quick-build-done");
        } else {
          /* Out of budget with stages still to run. The client asks again with
             `resume: true`; everything finished is already persisted, so the
             next leg picks up exactly here. Sent as an event rather than an
             error because nothing has gone wrong — this is the build working
             as designed. */
          send({ type: "paused", reason: "leg-budget" });
        }
      } catch (err) {
        send({
          type: "error",
          error: describeAiError(err, "Generation failed"),
        });
        await logActivity(
          material.id,
          role,
          "quick-build-error",
          describeAiError(err)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
