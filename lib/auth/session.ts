import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { newToken } from "./tokens";
import {
  createSessionRow,
  deleteSession,
  purgeExpiredSessions,
} from "./store";

/**
 * The session cookie: naming, flags and lifetime.
 *
 * Isolated from the store so there is exactly one place that decides what the
 * browser is told. The flags are not boilerplate:
 *
 *   httpOnly  script cannot read it, so an XSS bug cannot exfiltrate a session.
 *             This is the difference between this cookie and the old
 *             `ascent-role` one, which was deliberately readable because it
 *             granted nothing. This one grants everything.
 *   sameSite  'lax' — the cookie rides top-level navigations (so a link into
 *             the app from an email works) but not cross-site POSTs, which is
 *             most of CSRF handled by the browser.
 *   secure    production only. Setting it in development would mean the cookie
 *             is silently dropped over http://localhost and nobody can log in.
 *   path      '/' so one logout clears it everywhere.
 */
export const SESSION_COOKIE = "tt_session";

/**
 * Two lifetimes, and the checkbox picks between them.
 *
 * Without "remember me" the cookie is also given no `maxAge`, so it dies with
 * the browser — the shared-staffroom-computer case, which is a real one in
 * schools. The row still carries a 24-hour expiry regardless, because a
 * server-side session with no expiry is a session that lives forever if the
 * cookie is ever captured.
 */
export const SESSION_TTL = 60 * 60 * 24; // 24 hours
export const REMEMBER_TTL = 60 * 60 * 24 * 30; // 30 days

/**
 * Start a session and write the cookie onto a response.
 *
 * Takes the response rather than calling `cookies().set()` because that is only
 * legal inside a Route Handler or Server Action, and doing it this way makes the
 * constraint visible at the call site instead of at runtime.
 */
export async function startSession(
  res: NextResponse,
  input: {
    userId: number;
    activeOrgId: number;
    remember: boolean;
    userAgent?: string;
  }
): Promise<void> {
  const token = newToken();
  const ttl = input.remember ? REMEMBER_TTL : SESSION_TTL;

  /* AWAITED, and this is the reason this function became async.
     The write used to be synchronous, so the row existed by the time the cookie
     was set. Against Postgres it is a promise, and leaving it floating would
     hand the browser a cookie for a session row that has not been inserted yet —
     the user's very next request resolves nothing and bounces them to /login. On
     a serverless host it is worse: the instance can be frozen the moment the
     response is sent, so the insert may never land at all and the sign-in fails
     with no error anywhere. */
  await createSessionRow({
    token,
    userId: input.userId,
    activeOrgId: input.activeOrgId,
    ttlSeconds: ttl,
    userAgent: input.userAgent,
  });

  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(input.remember ? { maxAge: ttl } : {}),
  });

  // Opportunistic housekeeping: login is rare and already slow (scrypt), so it
  // is the right place to pay for a sweep that nothing else would ever run.
  await purgeExpiredSessions();
}

/** End the session behind a request and clear the cookie. */
export async function endSession(res: NextResponse): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // Awaited: an unawaited revocation is not a revocation.
  if (token) await deleteSession(token);
  // Delete AND overwrite: an expired cookie is removed by the browser, but
  // setting it empty first means a client that ignores the expiry still holds
  // nothing useful.
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** The raw cookie value, for the few callers that need the token itself. */
export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}
