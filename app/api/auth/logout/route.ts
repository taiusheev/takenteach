import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Sign out.
 *
 * POST, not GET, and that is not pedantry: a GET logout can be triggered by any
 * `<img src="/api/auth/logout">` on any page on the internet, which is a small
 * but real cross-site nuisance. It also deletes the session ROW rather than
 * only clearing the cookie — a cookie the browser has thrown away is still a
 * working credential to anyone who captured it, which is the whole reason
 * sessions are database rows here rather than signed tokens.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  await endSession(res);
  return res;
}
