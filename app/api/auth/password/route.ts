import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { badRequest, readBody } from "@/lib/api/request";
import { changePasswordSchema } from "@/lib/auth/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireApiSession } from "@/lib/auth/dal";
import { startSession } from "@/lib/auth/session";
import {
  deleteAllSessionsFor,
  getUser,
  invalidateResetsFor,
  setPassword,
} from "@/lib/auth/store";

export const dynamic = "force-dynamic";

/**
 * Change your own password.
 *
 * This is the route a seeded account has to pass through: the founder is
 * created with a printed one-time password and `must_change_password = 1`, and
 * the DAL redirects everything else to the screen that posts here until it is
 * cleared. That is what stops a password read off a terminal from quietly
 * becoming the permanent one.
 *
 * The current password is required even though the caller is already
 * authenticated — an unlocked laptop should not be enough to change the
 * credential that outlives the session on it.
 */
export async function POST(req: NextRequest) {
  const gate = await requireApiSession();
  if (!gate.ok) return gate.response;

  const parsed = await readBody(req, changePasswordSchema);
  if (!parsed.ok) return parsed.response;
  const { currentPassword, password } = parsed.data;

  const user = getUser(gate.session.userId);
  if (!user) return badRequest("That account no longer exists.");

  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    return badRequest("That isn't your current password.");
  }
  if (await verifyPassword(password, user.password_hash)) {
    return badRequest("Choose a password you haven't used here before.");
  }

  const passwordHash = await hashPassword(password);

  /* Same revocation as a reset: every other session for this user dies. If the
     reason for changing a password is that someone else had it, the session
     they are sitting in is exactly what needs to stop working. */
  getDb().transaction(() => {
    setPassword(user.id, passwordHash, { mustChange: false });
    invalidateResetsFor(user.id);
    deleteAllSessionsFor(user.id);
  })();

  /* ...including this one — so a fresh session is issued immediately, or the
     user would be signed out by their own successful password change. */
  const res = NextResponse.json({ ok: true, next: "/" });
  startSession(res, {
    userId: user.id,
    activeOrgId: gate.session.orgId,
    remember: false,
    userAgent: req.headers.get("user-agent") ?? "",
  });
  return res;
}
