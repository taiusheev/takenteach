import { NextRequest, NextResponse } from "next/server";
import { transaction } from "@/lib/pg";
import { badRequest, readBody } from "@/lib/api/request";
import { resetSchema } from "@/lib/auth/schema";
import { hashPassword } from "@/lib/auth/password";
import {
  consumePasswordReset,
  deleteAllSessionsFor,
  invalidateResetsFor,
  readPasswordReset,
  setPassword,
} from "@/lib/auth/store";

export const dynamic = "force-dynamic";

/**
 * Spend a reset link and set a new password.
 *
 * Three things happen together or not at all, which is why they are in a
 * transaction:
 *
 *   1. the password changes,
 *   2. THIS link is marked used, and every other outstanding link for the user
 *      is invalidated too — otherwise an attacker who requested a reset an hour
 *      before the real user did still holds a working link afterwards,
 *   3. every existing session for that user is deleted.
 *
 * (3) is the one that is easy to leave out and is the entire point of the
 * exercise. Changing a password because someone else has it accomplishes
 * nothing if the session they are already sitting in keeps working — and it
 * would, because sessions here are database rows that outlive the credential
 * that created them. Signing everyone out is what makes a reset a revocation.
 *
 * The user is deliberately NOT logged in afterwards. They must sign in with the
 * new password, which proves it reached the person who will use it rather than
 * the person who happened to open the link.
 */
export async function POST(req: NextRequest) {
  const parsed = await readBody(req, resetSchema);
  if (!parsed.ok) return parsed.response;
  const { token, password } = parsed.data;

  const reset = await readPasswordReset(token);
  if (!reset) {
    // Expired, already spent, and never-existed are one answer on purpose: the
    // difference between them is only useful to someone guessing tokens.
    return badRequest(
      "That reset link has expired or already been used. Request a new one."
    );
  }

  const passwordHash = await hashPassword(password);

  await transaction(async () => {
    await setPassword(reset.user_id, passwordHash, { mustChange: false });
    await consumePasswordReset(token);
    await invalidateResetsFor(reset.user_id);
    await deleteAllSessionsFor(reset.user_id);
  });

  return NextResponse.json({ ok: true, next: "/login?reset=1" });
}
