import { NextRequest, NextResponse } from "next/server";
import { listMaterials } from "@/lib/db";
import { describeAiError, planUnit } from "@/lib/ai";
import { usedAccents, usedMotifs } from "@/lib/unit-plan";
import { commonFields } from "@/lib/content-types";
import { requireBuilder } from "@/lib/api/guards";
import { readBody, serverError } from "@/lib/api/request";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  idea: z
    .string()
    .trim()
    .min(1, "describe the class first")
    .max(2000, "keep the idea under 2000 characters"),
  // Bounded because each lesson in the plan becomes a paid build later; an
  // unbounded count is an unbounded bill.
  count: z.number().int().min(1).max(20).default(10),
});

/** Plan a whole class from one idea. Returns an editable scope-and-sequence. */
export async function POST(req: NextRequest) {
  const builder = await requireBuilder();
  if (!builder.ok) return builder.response;
  const scope = builder.session.scope;

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { idea, count } = parsed.data;
  const all = await listMaterials(scope);
  const usedSeries = [
    ...new Set(
      all.map((m) => commonFields(m.content).series).filter((s): s is string => !!s)
    ),
  ];
  try {
    const plan = await planUnit(idea, {
      count,
      usedAccents: usedAccents(all),
      usedMotifs: usedMotifs(all),
      usedSeries,
    });
    return NextResponse.json({ plan });
  } catch (err) {
    return serverError(describeAiError(err, "Unit planning failed"));
  }
}
