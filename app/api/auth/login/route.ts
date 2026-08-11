import { NextRequest, NextResponse } from "next/server";
import { readBody } from "@/lib/api/request";
import { loginSchema } from "@/lib/auth/schema";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import {
  getUserByEmail,
  listMemberships,
  markLoggedIn,
  setPassword,
} from "@/lib/auth/store";

export const dynamic = "force-dynamic";

/**
 * Sign in.
 *
 * THE ONE MESSAGE. Every failure below — no such account, wrong password, an
 * account with no usable organization — answers with the same sentence and the
 * same 401. That is not vagueness for its own sake: a login form that says "no
 * account with that email" is an account enumeration oracle, and anyone can
 * point it at a staff directory to learn which teachers have signed up. The
 * cost is one slightly less helpful error; the alternative is publishing the
 * user list.
 *
 * The same reasoning is why a missing user still pays for a password hash below.
 */
export async function POST(req: NextRequest) {
  const parsed = await readBody(req, loginSchema);
  if (!parsed.ok) return parsed.response;
  const { email, password, remember } = parsed.data;

  const user = await getUserByEmail(email);

  /* A miss must cost the same as a hit. Returning early here makes "no such
     user" answer in about a millisecond and "wrong password" in about eighty —
     a difference any client can measure, which hands back the enumeration the
     shared error message just refused. So an unknown email verifies the
     password against a real hash of a throwaway value and discards the result. */
  const storedHash = user?.password_hash ?? DUMMY_HASH;
  const passwordOk = await verifyPassword(password, storedHash);

  if (!user || !passwordOk) return refuse();

  /* A user must have somewhere to land. This should be impossible — signup
     creates a personal org in the same transaction as the user — but "should be
     impossible" is exactly the state that turns into a crash on the login path
     if a future migration ever gets it wrong. */
  const memberships = await listMemberships(user.id);
  const landing =
    memberships.find((m) => m.status === "active") ??
    memberships.find((m) => m.status === "pending");
  if (!landing) return refuse();

  /* Cost parameters may have been raised since this hash was written. The user
     has just handed us the plaintext — this is the only moment we can upgrade
     it, and it happens without them noticing. */
  if (needsRehash(user.password_hash)) {
    await setPassword(user.id, await hashPassword(password), {
      mustChange: Boolean(user.must_change_password),
    });
  }

  await markLoggedIn(user.id);

  const res = NextResponse.json({
    ok: true,
    /* A seeded or reset account holds a one-time password and may not go
       anywhere else until it is changed — the DAL enforces this too, so this
       field is a courtesy to the client, not the control. */
    next: user.must_change_password ? "/account/password" : "/",
  });
  await startSession(res, {
    userId: user.id,
    activeOrgId: landing.orgId,
    remember,
    userAgent: req.headers.get("user-agent") ?? "",
  });
  return res;
}

function refuse() {
  return NextResponse.json(
    { error: "That email and password don't match an account." },
    { status: 401 }
  );
}

/**
 * A real scrypt hash of a value nobody knows, so verifying against it takes the
 * same time as verifying against a user's. Written as a literal rather than
 * computed at import: generating it at startup would run scrypt on the module
 * load path of every server boot, and its only requirement is to be well-formed.
 */
const DUMMY_HASH =
  "scrypt$16384$8$1$YWJzZW50LXVzZXItc2FsdA==$Zm9yLXRpbWluZy1vbmx5LW5vdC1hLXJlYWwta2V5";
