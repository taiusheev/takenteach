import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth/dal";
import { getUser, updateStyleProfile } from "@/lib/auth/store";
import { badRequest, readBody, serverError } from "@/lib/api/request";
import { checkSpend, metered, ESTIMATE_USD } from "@/lib/api/metered";
import { extractStyleProfile, describeAiError } from "@/lib/ai";
import { styleProfileSchema, parseStyleProfile } from "@/lib/style-profile";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Read a teacher's own materials, and let them correct the result.
 *
 * POST   extract a profile from pasted samples (one model call)
 * PATCH  save the teacher's own edits — no model, no spend
 * DELETE forget it
 *
 * ── WHY PATCH IS A SEPARATE VERB AND NOT A RE-EXTRACT ────────────────────
 * The profile is a description of a person that a model wrote, so the teacher
 * has to be able to fix it — and fixing it must not cost a call or risk the
 * model overwriting the correction with its own reading again. Editing is
 * therefore a plain write, and it is the only path that can produce a profile
 * with `sampleCount: 0`: hand-written, from no samples at all, which is a
 * perfectly good way to use this.
 */

const CAP = 40_000;

const extractSchema = z.object({
  /* Capped hard. This is pasted text that becomes the whole user turn of a
     paid call, so an unbounded one is both a cost and the largest untrusted
     input surface in the product. 40k characters is roughly a dozen handouts —
     past the point where more samples sharpen the answer. */
  samples: z
    .string()
    .trim()
    .min(200, "paste a bit more — a page or two reads better than a paragraph")
    .max(CAP, "that's more than this needs; a few lessons is plenty"),
  /** how many separate documents the teacher pasted, for provenance */
  sampleCount: z.number().int().min(1).max(50).default(1),
});

export async function POST(req: NextRequest) {
  const gate = await requireApiSession();
  if (!gate.ok) return gate.response;
  const { scope, userId } = gate.session;

  const parsed = await readBody(req, extractSchema);
  if (!parsed.ok) return parsed.response;
  const { samples, sampleCount } = parsed.data;

  const spend = await checkSpend(scope, ESTIMATE_USD.plan);
  if (!spend.allow) return badRequest(spend.reason);

  try {
    const out = await metered(
      { scope, operation: "style-profile" },
      () => extractStyleProfile(samples)
    );
    const profile = styleProfileSchema.parse({
      ...out,
      sampleCount,
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    /* Re-serialised from the PARSED value, so the column can only ever hold
       the shape this app knows how to read — the same rule the preferences
       endpoint follows. */
    await updateStyleProfile(userId, JSON.stringify(profile));
    return NextResponse.json({ profile });
  } catch (err) {
    return serverError(describeAiError(err, "Couldn't read that material"));
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireApiSession();
  if (!gate.ok) return gate.response;

  const parsed = await readBody(req, z.object({ profile: styleProfileSchema }));
  if (!parsed.ok) return parsed.response;

  /* `sampleCount` and `updatedAt` are provenance, not content: they say where
     this came from, so an edit must not be able to claim it was read from
     more material than it was. Carried over from what is stored. */
  const current = parseStyleProfile(
    (await getUser(gate.session.userId))?.style_profile
  );
  const profile = styleProfileSchema.parse({
    ...parsed.data.profile,
    sampleCount: current.sampleCount,
    updatedAt: new Date().toISOString().slice(0, 10),
  });
  await updateStyleProfile(gate.session.userId, JSON.stringify(profile));
  return NextResponse.json({ profile });
}

export async function DELETE() {
  const gate = await requireApiSession();
  if (!gate.ok) return gate.response;
  await updateStyleProfile(gate.session.userId, "{}");
  return NextResponse.json({ ok: true });
}
