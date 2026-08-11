import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logActivity, snapshotAndUpdate } from "@/lib/db";
import { reviewDesignSystem, describeAiError, type DesignMetrics } from "@/lib/ai";
import { houseFloor, HOUSE_NOTE } from "@/lib/house-design";
import { LessonPack, lessonPackSchema } from "@/lib/lesson-pack-schema";
import { loadEditableMaterial } from "@/lib/api/guards";
import { badRequest, readBody, serverError } from "@/lib/api/request";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The measurements the house floor is judged on.
 *
 * These are numbers the gate does arithmetic and comparisons with, so every one
 * of them is required to BE a number. Previously only `sheets` was checked and
 * the rest were `?? 0`-defaulted — which meant a client that sent `"14"` for a
 * type scale, or omitted a field, got a silent 0 that sailed under every
 * threshold. A design was then declared to meet the house standard on the
 * strength of measurements nobody had taken.
 */
const metricsSchema = z.object({
  sheets: z.number().finite().min(0),
  overfull: z.number().finite().min(0),
  minZoom: z.number().finite().min(0),
  pageTitlePx: z.number().finite().min(0),
  bodyTextPx: z.number().finite().min(0),
  coverTitlePx: z.number().finite().min(0),
  mastheadPx: z.number().finite().min(0),
  proFill: z.string(),
  conFill: z.string(),
  medianFillPct: z.number().finite().min(0),
  contrastRepairs: z.number().finite().min(0),
});

const bodySchema = z.object({
  metrics: metricsSchema,
  /** second pass: enforce the house floor rather than ask for a critique */
  enforce: z.boolean().default(false),
});

/**
 * Proof-read the design against the RENDERED pages.
 *
 * The generator writes a stylesheet having never seen a page. This is the pass
 * a designer does after printing a proof: the browser measures what the CSS
 * actually produced — overflowing sheets, a 46px page title, Pro and Con boxes
 * that look alike, text the renderer had to rescue — and the model corrects its
 * own work against those numbers.
 *
 * Measurements come from the client because that is where the pages are really
 * laid out; nothing here trusts the CSS's own description of itself.
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/materials/[id]/design-review">
) {
  const gate = await loadEditableMaterial(ctx, {
    refusal: "Only draft packs can be redesigned, by builders.",
    packOnly: "Design review",
  });
  if (!gate.ok) return gate.response;
  const { material, role } = gate;

  const content = material.content as LessonPack;
  if (!content.designCss?.trim()) {
    return badRequest("There is no design to review yet — generate one first.");
  }

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const metrics: DesignMetrics = body.metrics;

  // THE HOUSE FLOOR, measured before any model call. If the rendered design is
  // already worse than the academy's own lessons on the things a number can
  // settle — overflow, type scale, masthead height, greyscale side separation,
  // unreadable text — that is not a critique note, it is a failed proof.
  const failed = houseFloor(metrics);

  // The enforcing pass. The client re-measures after a corrected stylesheet has
  // been applied and calls back with `enforce`; if the design is STILL below the
  // house standard it is dropped rather than shipped. Clearing designCss is the
  // fallback, because the house stylesheet is what every pack prints without
  // one — so the floor is guaranteed rather than hoped for.
  if (body.enforce) {
    if (failed.length === 0) {
      return NextResponse.json({ verdict: "ship", houseFloor: [], reverted: false });
    }
    const next = lessonPackSchema.parse({
      ...content,
      designCss: "",
      designNote: HOUSE_NOTE,
    });
    await snapshotAndUpdate(material.id, "design below house standard", role, material.title, next);
    await logActivity(
      material.id,
      role,
      "design-house-fallback",
      failed.map((f) => f.id).join(", ").slice(0, 300)
    );
    return NextResponse.json({
      verdict: "fix",
      reverted: true,
      houseFloor: failed.map((f) => f.detail),
    });
  }

  try {
    const review = await reviewDesignSystem(material.subject, content, metrics, failed);
    // "ship" still returns the stylesheet, so applying it is a no-op — but only
    // write when something actually changed, to keep the version history honest.
    const changed = review.css.trim() && review.css.trim() !== content.designCss.trim();
    if (changed) {
      const next = lessonPackSchema.parse({ ...content, designCss: review.css });
      await snapshotAndUpdate(material.id, "design proof-read", role, material.title, next);
    }
    await logActivity(
      material.id,
      role,
      "design-review",
      `${review.verdict}: ${review.critique}`.slice(0, 300)
    );
    return NextResponse.json({
      verdict: review.verdict,
      critique: review.critique,
      issues: review.issues,
      applied: changed,
      /* so the client can apply the corrected sheet and re-measure it before
         the pack is allowed to keep it */
      css: changed ? review.css : undefined,
      /* The client re-measures after applying and calls back; a design that
         still fails the floor on that pass is dropped for the house
         stylesheet, which is guaranteed to meet it. */
      houseFloor: failed.map((f) => f.detail),
    });
  } catch (err) {
    return serverError(describeAiError(err, "Design review failed"));
  }
}
