import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { type ApiError } from "@/lib/api/request";
import { type Scope } from "@/lib/db";
import { type Role, type OrgRole, toLegacyRole } from "@/lib/workflow";
import { SESSION_COOKIE } from "./session";
import { cookies } from "next/headers";
import {
  type MembershipStatus,
  type MembershipWithOrg,
  type SessionRecord,
  listMemberships,
  readSessionRecord,
} from "./store";

/**
 * THE DATA ACCESS LAYER.
 *
 * The single place the question "who is making this request" is answered, and
 * the only place any other module should ask it. Next's own guidance is
 * explicit that `proxy.ts` must not be the authorization boundary — it is an
 * optimistic redirect and nothing more — so the real check belongs here, as
 * close to the data as it can get.
 *
 * `cache()` memoises for the duration of one render pass. That matters more
 * than it looks: a page, its layout and four server components each calling
 * `getSession()` is one SQL query, not six, and — more importantly — they
 * cannot disagree with each other about who the user is halfway down the tree.
 *
 * WHAT THIS FILE DOES NOT DO. It does not scope content queries to an
 * organization, because no content table has an org_id yet (phase 2). Until
 * then `session.orgId` is carried and stored but does not filter anything, and
 * that is the outstanding security gap — not an oversight.
 */

export interface Session extends SessionRecord {
  /** The pre-tenancy role vocabulary, so the existing workflow keeps working. */
  legacyRole: Role;
  /** Every org this user belongs to — the workspace switcher's data. */
  memberships: MembershipWithOrg[];
  /**
   * What every content query in lib/db.ts filters by.
   *
   * Derived here and only here. No route, page or component builds one, and
   * nothing constructs one from a request body or query parameter — an org
   * that arrives with the request is an org the caller chose, which is the
   * entire attack. It comes from the session row or it does not exist.
   */
  scope: Scope;
}

/**
 * Who sees private drafts.
 *
 * A coach or an admin sees every draft in their own organization, because they
 * are accountable for the library and cannot review what they cannot open. A
 * teacher sees the organization's shared work plus their own private drafts.
 * Nobody, at any role, sees another organization's anything — that is org_id's
 * job and this function has no bearing on it.
 */
function canSeeAllPrivate(record: SessionRecord): boolean {
  return (
    record.platformRole === "super_admin" ||
    record.orgRole === "owner" ||
    record.orgRole === "admin" ||
    record.orgRole === "coach"
  );
}

/**
 * The current session, or null.
 *
 * Never throws and never redirects: plenty of callers legitimately want to know
 * whether someone is signed in — the landing page, the header — without that
 * question being an assertion.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const record = await readSessionRecord(token);
  if (!record) return null;

  return {
    ...record,
    legacyRole: toLegacyRole(record.orgRole),
    memberships: await listMemberships(record.userId),
    scope: {
      orgId: record.orgId,
      userId: record.userId,
      canSeeAllPrivate: canSeeAllPrivate(record),
    },
  };
});

/**
 * The current session, or a redirect to sign in.
 *
 * For pages and layouts. `redirect()` throws, so nothing after a call to this
 * runs unauthenticated — which is the property that makes it safe to write the
 * rest of a page as though a user exists.
 *
 * `next` is carried so signing in returns the user where they were going. It is
 * a PATH ONLY, never an absolute URL, or the login form becomes an open
 * redirect that can bounce a freshly-authenticated user to another origin.
 */
export async function requireSession(next?: string): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const target = next && next.startsWith("/") && !next.startsWith("//")
      ? `/login?next=${encodeURIComponent(next)}`
      : "/login";
    redirect(target);
  }
  return session;
}

/** Membership states that may use the product at all. */
const USABLE: MembershipStatus[] = ["active", "pending"];

/**
 * A session that is allowed to work.
 *
 * `pending` counts, deliberately. A teacher waiting on a school's approval is a
 * working user with a private workspace, not a locked-out one — that is the
 * difference between an onboarding flow and a dead end. What they cannot do is
 * see the school's data, and that is enforced by org scoping, not by blocking
 * the door.
 *
 * `suspended` and `rejected` do not count, and neither does an account still
 * holding a one-time password.
 */
export async function requireActiveSession(next?: string): Promise<Session> {
  const session = await requireSession(next);
  if (session.mustChangePassword) redirect("/account/password");
  if (!USABLE.includes(session.membershipStatus)) redirect("/no-access");
  return session;
}

/* ── The API-route half ─────────────────────────────────────────────────────
   Route handlers cannot redirect a fetch usefully, so they get the same
   `Guard<T>` shape lib/api/guards.ts already uses: unwrap on success, return
   the response on failure. */

export type Guard<T> =
  | ({ ok: true } & T)
  | { ok: false; response: NextResponse<ApiError> };

/** 401 — no valid session. Distinct from 403, which means "known but refused". */
export async function requireApiSession(): Promise<Guard<{ session: Session }>> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json<ApiError>(
        { error: "Sign in to continue." },
        { status: 401 }
      ),
    };
  }
  if (!USABLE.includes(session.membershipStatus)) {
    return {
      ok: false,
      response: NextResponse.json<ApiError>(
        { error: "This account doesn't have access to that organization." },
        { status: 403 }
      ),
    };
  }
  return { ok: true, session };
}

/** True when the caller administers the org they are acting in. */
export function isOrgAdmin(session: Session): boolean {
  return (
    session.platformRole === "super_admin" ||
    session.orgRole === "owner" ||
    session.orgRole === "admin"
  );
}

export type { MembershipWithOrg, OrgRole };
