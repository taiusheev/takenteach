import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { BatchCoalescer, sdkBatchClient } from "@/lib/batch-queue";
import { overnightStatus, runOvernight } from "@/lib/overnight";
import { BUDGET_MODE_IDS, setBudgetMode } from "@/lib/model-policy";
import { requireBuilder } from "@/lib/api/guards";
import { conflict, readBody, serverError } from "@/lib/api/request";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // Each id is a paid multi-stage build. The cap is the practical size of a
  // semester's worth of lessons, and it is here so a malformed client can't
  // queue ten thousand builds against a card overnight.
  materialIds: z
    .array(z.number().int().positive())
    .min(1, "give me the packs to build overnight")
    .max(60, "that's more than one night's work — queue it in batches"),
  fresh: z.boolean().default(false),
  autoQa: z.boolean().default(true),
  /**
   * Off by default, matching the live build: the house design is the design on
   * both paths. Batch pricing would make per-pack art direction affordable
   * here, but "affordable" was never the argument against it — ten
   * different-looking worksheets across one ten-week unit was.
   */
  autoDesign: z.boolean().default(false),
  budgetMode: z.enum(BUDGET_MODE_IDS).optional(),
});

/**
 * Queue a set of packs to build overnight through the Batches API, at half the
 * usual price.
 *
 * This route STARTS the run and returns immediately — it does not await it. A
 * batch may take up to 24 hours, so holding the request open is not an option
 * at any `maxDuration`. Progress lands on the materials themselves (the build
 * persists after every stage, same as the live path), so the library is the
 * status board; `GET` here reports the run itself.
 */
export async function POST(req: NextRequest) {
  const builder = await requireBuilder("Only builders can queue overnight builds.");
  if (!builder.ok) return builder.response;
  const { role, session } = builder;
  const { scope } = session;

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // De-duplicated: the same pack listed twice would be built twice, in parallel,
  // each overwriting the other's stages.
  const ids = [...new Set(body.materialIds)];

  if (overnightStatus()?.running) {
    return conflict("An overnight run is already in progress.", {
      status: overnightStatus(),
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return serverError("ANTHROPIC_API_KEY is not set.");
  }

  // Set only after the run is cleared to start — a rejected request must not
  // leave the process on a budget mode nobody chose.
  if (body.budgetMode) setBudgetMode(body.budgetMode);

  const run = runOvernight(scope, ids, {
    fresh: body.fresh,
    autoQa: body.autoQa,
    autoDesign: body.autoDesign,
    role,
    makeCoalescer: () =>
      new BatchCoalescer(sdkBatchClient(new Anthropic()), {
        onEvent: (e) => overnightStatus()?.events.push(e),
      }),
  });
  // Deliberately not awaited — but a rejection must not become an unhandled
  // rejection that takes the server down at 3am.
  run.catch(() => {});

  return NextResponse.json({
    started: true,
    materialIds: ids,
    note: "Building overnight at ~50% of live pricing. Batches usually finish within an hour; the packs update themselves stage by stage.",
  });
}

/** How the current (or last) overnight run is going. */
export async function GET() {
  return NextResponse.json({ run: overnightStatus() });
}
