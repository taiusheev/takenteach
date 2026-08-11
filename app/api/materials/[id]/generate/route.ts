import { NextRequest } from "next/server";
import { z } from "zod";
import { logActivity, snapshotMaterial, updateMaterialContent } from "@/lib/db";
import { generateLessonPack, generateSimpleContent, describeAiError } from "@/lib/ai";
import { buildInputs } from "@/lib/overnight";
import { BUDGET_MODE_IDS, setBudgetMode } from "@/lib/model-policy";
import { LessonPack } from "@/lib/lesson-pack-schema";
import { loadEditableMaterial } from "@/lib/api/guards";
import { readBody } from "@/lib/api/request";
import { withUsageMeter, describeUsage } from "@/lib/usage-meter";

export const dynamic = "force-dynamic";
export const maxDuration = 3600;

const bodySchema = z.object({
  /** "Regenerate all" — clear the pack and rebuild rather than resume. */
  fresh: z.boolean().default(false),
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
  const { fresh, autoQa, autoDesign } = parsed.data;
  // Which models the stages run on, and how hard they think. Set for the whole
  // run before any stage starts, so the estimate the founder just read on the
  // Build tab and the calls this build makes come from the same table.
  if (parsed.data.budgetMode) setBudgetMode(parsed.data.budgetMode);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        // One snapshot per RUN, not per stage: a build writes eight times, and
        // the state worth keeping is the one that existed before it started —
        // especially for a fresh rebuild, which wipes everything first.
        snapshotMaterial(
          material.id,
          fresh ? "full rebuild" : "AI build",
          role
        );
        await logActivity(material.id, role, "quick-build-start");
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
                }
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
            for await (const event of stream) {
              if (req.signal.aborted) break;
              if (event.type === "stage-done" || event.type === "done") {
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
              }
              // don't re-send the full pack on every event; the client refetches
              send({
                type: event.type,
                stage: event.stage,
                label: event.label,
                pack: event.pack,
                repair: event.repair,
                qa: event.qa,
                skipped: event.skipped,
              });
            }
          },
          async (totals) => {
            send({ type: "usage", usage: totals, summary: describeUsage(totals) });
            await logActivity(
              material.id,
              role,
              "quick-build-usage",
              describeUsage(totals)
            );
          }
        );
        await logActivity(material.id, role, "quick-build-done");
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
