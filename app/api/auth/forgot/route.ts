import { NextRequest, NextResponse } from "next/server";
import { readBody } from "@/lib/api/request";
import { forgotSchema } from "@/lib/auth/schema";
import { newToken } from "@/lib/auth/tokens";
import { createPasswordReset, getUserByEmail } from "@/lib/auth/store";
import { passwordResetMail, sendMail } from "@/lib/mail";

export const dynamic = "force-dynamic";

/** One hour. Long enough to find the email, short enough that a forwarded one goes stale. */
const RESET_TTL = 60 * 60;

/**
 * Request a password-reset link.
 *
 * ALWAYS ANSWERS THE SAME WAY. Known address or not, mail sent or dropped, the
 * response is `{ ok: true }` — because "we've sent you a link" and "no account
 * with that email" are the same account-enumeration oracle the login route
 * refuses to be, and this form is the easier one to point at a staff list.
 *
 * That means the only honest thing the UI can say is "if that address has an
 * account, a link is on its way", and it does.
 */
export async function POST(req: NextRequest) {
  const parsed = await readBody(req, forgotSchema);
  if (!parsed.ok) return parsed.response;

  const user = await getUserByEmail(parsed.data.email);
  if (user) {
    const token = newToken();
    await createPasswordReset(user.id, token, RESET_TTL);

    /* Built from the request's own origin rather than a configured base URL,
       which is one fewer thing to get wrong in three environments. `req.nextUrl`
       is derived from the deployment's host, not from a client-supplied Host
       header Next has already rejected, so this cannot be poisoned into
       mailing someone a link to an attacker's domain. */
    const link = new URL(
      `/reset-password?token=${encodeURIComponent(token)}`,
      req.nextUrl.origin
    ).toString();

    // Awaited so a transport failure is logged before the response goes out —
    // but its result never reaches the caller, for the reason above.
    await sendMail(passwordResetMail(user.email, link));
  }

  return NextResponse.json({ ok: true });
}
