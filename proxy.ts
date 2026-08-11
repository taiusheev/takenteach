import { NextResponse, type NextRequest } from "next/server";

/**
 * PROXY — what every other framework calls middleware. Next 16 renamed it; the
 * file must be `proxy.ts` at the project root and the export must be `proxy`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THIS IS NOT THE AUTHORIZATION BOUNDARY. It is an optimistic redirect.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It checks whether a session COOKIE EXISTS. It does not check whether that
 * cookie is a valid session, whether it has expired, who it belongs to, or what
 * they are allowed to see — and it must not, for two reasons:
 *
 *   1. Next's own guidance says so: proxy runs on every request and is the
 *      wrong place for data fetching, and "should not be used as a full session
 *      management or authorization solution".
 *   2. It could not anyway. This runs in the edge runtime, and better-sqlite3 is
 *      a native Node module — importing lib/db here would not build.
 *
 * The real check is lib/auth/dal.ts, which runs as close to the data as it can
 * get, and it is what every page and route actually depends on. What this file
 * buys is the flicker: without it, a signed-out visitor requesting a protected
 * page gets a server round trip that renders a shell and then redirects. With
 * it, they are sent to /login before any of that happens.
 *
 * A forged cookie therefore reaches the page — and finds a DAL that resolves it
 * to nothing and redirects. That is the design, not a hole in it.
 */

/** Kept in sync with lib/auth/session.ts by hand; that file cannot be imported here. */
const SESSION_COOKIE = "tt_session";

/** Reachable with no session at all. */
const PUBLIC = [
  /^\/login\/?$/,
  /^\/signup(\/|$)/,
  /^\/forgot-password\/?$/,
  /^\/reset-password\/?$/,
  /^\/api\/auth\//,
];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC.some((re) => re.test(pathname));

  /* Signed in and standing on the sign-in door. Sent onward rather than shown a
     login form — but only for a GET: redirecting a POST to /api/auth/login
     would break the very request that is trying to establish the session. */
  if (hasCookie && isPublic && req.method === "GET" && !pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (!hasCookie && !isPublic) {
    /* Where they were going, so signing in finishes the journey. Only the path
       and query — never an absolute URL — and the login page validates it again
       before using it, because a value that has been through a query string has
       been outside our control. */
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Everything except Next's own assets and the icons, which are requested
   * before a session exists and would otherwise 302 to the login page — a
   * redirected favicon is a broken favicon.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
