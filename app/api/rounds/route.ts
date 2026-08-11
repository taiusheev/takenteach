import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRound, getMaterial } from "@/lib/db";
import { JudgeBallot } from "@/lib/judge-ballot-schema";
import { requireApiSession } from "@/lib/auth/dal";
import { badRequest, forbidden, readBody } from "@/lib/api/request";

export const dynamic = "force-dynamic";

/**
 * The form posts student ids as strings (a `<select>` value always is) and sends
 * "" for "nobody". Coercing here rather than at the call site keeps the "" →
 * null decision in one place instead of behind a `Number(x) || null` that also
 * silently turns a legitimate 0 into null.
 */
const optionalId = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  });

const bodySchema = z.object({
  ballotId: z.number().int().positive({ message: "pick a Judge Ballot template" }),
  label: z.string().trim().min(1, 'give the round a label (e.g. "R3 · Room 4")'),
  proTeam: z.string().trim().default(""),
  conTeam: z.string().trim().default(""),
  room: z.string().trim().default(""),
  heldOn: z.string().trim().default(""),
  proStudentId: optionalId,
  conStudentId: optionalId,
});

/** Open a round from a Judge Ballot template. Founders and coaches run rounds. */
export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { scope, legacyRole: role } = auth.session;
  if (role !== "founder" && role !== "coach") {
    return forbidden("Only founders and coaches can open a round.");
  }

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const ballot = getMaterial(scope, body.ballotId);
  if (!ballot || ballot.type !== "judge-ballot") {
    return badRequest("Pick a Judge Ballot template to run this round from.");
  }

  const content = ballot.content as JudgeBallot;
  const id = createRound(scope, {
    ballotId: ballot.id,
    label: body.label,
    // snapshot the resolution so later template edits don't rewrite history
    resolution: content.resolution ?? "",
    proTeam: body.proTeam,
    conTeam: body.conTeam,
    // linking a debater turns every judged ballot into progress data
    proStudentId: body.proStudentId,
    conStudentId: body.conStudentId,
    room: body.room,
    heldOn: body.heldOn || new Date().toISOString().slice(0, 10),
    role,
  });
  return NextResponse.json({ id });
}
