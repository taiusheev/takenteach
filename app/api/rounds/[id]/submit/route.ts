import { NextRequest, NextResponse } from "next/server";
import { getRound, submitBallot } from "@/lib/db";
import { requireApiSession } from "@/lib/auth/dal";
import { badRequest, notFound, readBody, routeId } from "@/lib/api/request";
import { z } from "zod";


export const dynamic = "force-dynamic";

/**
 * A judged ballot is the product's only record of what actually happened in a
 * round, and it feeds the teaching-signal loop that decides which lessons get
 * rewritten. Garbage in here is not a rendering bug, it is a wrong conclusion
 * about a student — so this is the strictest schema in the app.
 */
const bodySchema = z.object({
  judgeName: z.string().trim().max(120).default(""),
  winner: z.enum(["pro", "con"], { message: "pick a winner before submitting" }),
  scores: z.record(z.string(), z.number()).default({}),
  speakerPoints: z.record(z.string(), z.number()).default({}),
  rfd: z.record(z.string(), z.string()).default({}),
  feedback: z.record(z.string(), z.string()).default({}),
  secondsTaken: z.number().int().min(0).max(86_400).default(0),
});

/**
 * Submit one judge's filled ballot for a round. Every role can judge — TAs and
 * judges especially, since this is the surface built for them.
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/rounds/[id]/submit">
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { scope, legacyRole: role } = auth.session;

  const { id } = await ctx.params;
  const roundId = routeId(id);
  if (roundId === null) return notFound("Round not found");
  const round = await getRound(scope, roundId);
  if (!round) return notFound("Round not found");
  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const rfdAnswered = Object.values(body.rfd).some((v) => v.trim().length > 0);
  if (!rfdAnswered) {
    return badRequest(
      "Write at least one reason for your decision — a ballot without an RFD is the thing this replaces."
    );
  }

  const submissionId = await submitBallot(scope, {
    roundId: round.id,
    judgeName: body.judgeName?.trim() ?? "",
    role,
    winner: body.winner,
    scores: body.scores,
    speakerPoints: body.speakerPoints,
    rfd: body.rfd,
    feedback: body.feedback,
    secondsTaken: Math.max(0, Math.round(body.secondsTaken ?? 0)),
  });
  return NextResponse.json({ id: submissionId });
}
