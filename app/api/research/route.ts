import { NextRequest, NextResponse } from "next/server";
import { describeAiError, suggestSources } from "@/lib/ai";
import { SUBJECTS } from "@/lib/subjects";
import { requireBuilder } from "@/lib/api/guards";
import { readBody, serverError } from "@/lib/api/request";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  // An unknown subject falls back to debate rather than 400-ing: the field is a
  // hint for the prompt, not a key, and refusing the whole request over it would
  // block a research call that would otherwise have worked.
  subject: z.enum(SUBJECTS).catch("debate"),
  anchor: z
    .string()
    .trim()
    .min(1, "add the resolution / central question / writing focus first")
    .max(600),
  skillFocus: z.string().trim().max(300).default(""),
  brief: z.string().trim().max(2000).optional(),
});

/**
 * Research helper — propose verifiable source leads for a topic so the teacher
 * doesn't start their research from a blank page. Returns candidates to VERIFY,
 * never finished evidence.
 */
export async function POST(req: NextRequest) {
  const builder = await requireBuilder();
  if (!builder.ok) return builder.response;

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { anchor, skillFocus, brief, subject } = parsed.data;
  try {
    const leads = await suggestSources({
      subject,
      anchor,
      skillFocus,
      brief,
    });
    return NextResponse.json({ leads });
  } catch (err) {
    // describeAiError rather than the raw message: the two failures a founder
    // actually hits here are out-of-credit and rate-limited, and both have an
    // action attached to them that a bare SDK string doesn't carry.
    return serverError(describeAiError(err, "Research failed"));
  }
}
