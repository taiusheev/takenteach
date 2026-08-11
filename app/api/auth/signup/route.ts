import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { badRequest, conflict, readBody } from "@/lib/api/request";
import { signupSchema, type Signup } from "@/lib/auth/schema";
import { hashPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import {
  createMembership,
  createOrganization,
  createUser,
  findSchoolsByName,
  getUserByEmail,
  normalizeEmail,
} from "@/lib/auth/store";

export const dynamic = "force-dynamic";

/**
 * Create an account.
 *
 * One endpoint for both paths, discriminated on `accountType`, because the two
 * differ only in what organization gets built — everything else (hash the
 * password, create the user, open a session) is identical, and two routes would
 * be two places to forget one of those steps.
 *
 * THE INVARIANT THIS ROUTE EXISTS TO MAINTAIN: a user always leaves here with at
 * least one organization and one ACTIVE membership in it (decision 1 in
 * docs/SAAS-FOUNDATION.md). There is no "signed up but has no org" state, which
 * is what lets phase 2 make org_id NOT NULL on every table rather than branching
 * on null at every call site.
 */
export async function POST(req: NextRequest) {
  const parsed = await readBody(req, signupSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  /* Invitations are phase 3: the table that would make a code verifiable does
     not exist yet. Refused explicitly and up front, because a code accepted
     without being checked is far worse than one that is not accepted at all —
     it would put someone inside a school on the strength of a string. */
  if (input.accountType === "teacher" && input.inviteCode) {
    return badRequest(
      "Invitation codes aren't available yet. Leave the code blank to create your own workspace — you'll be able to join a school from Settings once invitations ship."
    );
  }

  /* Checked before the write as a courtesy — the UNIQUE index is what actually
     guarantees it, since two simultaneous signups both pass this check. The
     insert below is wrapped for exactly that race. */
  if (getUserByEmail(input.email)) {
    return conflict(
      "An account with that email already exists. Sign in instead, or reset your password."
    );
  }

  const passwordHash = await hashPassword(input.password);

  let created: Built;
  try {
    created = getDb().transaction(() => build(input, passwordHash))();
  } catch (err) {
    // The UNIQUE(email) index firing means someone else won the race.
    if (String(err).includes("UNIQUE") && String(err).includes("email")) {
      return conflict("An account with that email already exists.");
    }
    throw err;
  }

  const res = NextResponse.json({
    ok: true,
    next: "/",
    /* So the UI can say something true immediately rather than discovering the
       join request on the next page load. */
    joinRequest: created.joinRequest,
  });
  startSession(res, {
    userId: created.userId,
    activeOrgId: created.orgId,
    remember: true, // someone who just signed up did not come here to log in again
    userAgent: req.headers.get("user-agent") ?? "",
  });
  return res;
}

interface Built {
  userId: number;
  /** The org the new session starts in. Always one they are ACTIVE in. */
  orgId: number;
  /** The school they asked to join, if the name matched one. */
  joinRequest: { orgName: string } | null;
}

/**
 * The part that differs by account type.
 *
 * Runs inside a transaction: a user with no organization, and an organization
 * with no owner, are both states nothing downstream is written to handle — so
 * neither may exist even briefly.
 */
function build(input: Signup, passwordHash: string): Built {
  if (input.accountType === "school") {
    const user = createUser({
      email: input.email,
      passwordHash,
      name: input.adminName,
    });
    const org = createOrganization({
      name: input.schoolName,
      kind: "school",
      location: input.location,
      sizeBand: input.teacherCount,
    });
    createMembership({
      userId: user.id,
      orgId: org.id,
      orgRole: "owner",
      status: "active",
    });
    return { userId: user.id, orgId: org.id, joinRequest: null };
  }

  // ── Teacher ──
  const user = createUser({
    email: input.email,
    passwordHash,
    name: input.name,
  });

  /* The personal workspace, always, whatever else happens. It is what they own
     outright and where their lessons live until they deliberately move them —
     joining a school must never silently hand a teacher's existing work to it. */
  const personal = createOrganization({
    name: personalOrgName(input.name, input.email),
    kind: "individual",
  });
  createMembership({
    userId: user.id,
    orgId: personal.id,
    orgRole: "owner",
    status: "active",
  });

  /* A named school becomes a join REQUEST, not a membership: the school decides
     who is in it, and a signup form is not the school. The request sits at
     `pending` until an admin approves it, and until then this teacher can see
     nothing of that organization — which is enforced by org scoping, not by
     this row.

     Matched on an exact-ish name because there is nothing better to match on
     yet. A wrong match costs nothing: it produces a pending request an admin
     will not recognise and will decline. */
  let joinRequest: Built["joinRequest"] = null;
  const wanted = input.schoolName.trim();
  if (wanted) {
    const school = findSchoolsByName(wanted, 2);
    // Exactly one candidate, or nothing. Two schools whose names both contain
    // what they typed is a question for a person, not a guess for this function.
    if (school.length === 1) {
      createMembership({
        userId: user.id,
        orgId: school[0].id,
        orgRole: "teacher",
        status: "pending",
      });
      joinRequest = { orgName: school[0].name };
    }
  }

  /* The session starts in the PERSONAL org, never the pending one. A session
     whose active org is one the user is only `pending` in would be a session
     that can do nothing — and `readSessionRecord` would happily resolve it,
     because pending is a real membership. */
  return { userId: user.id, orgId: personal.id, joinRequest };
}

/**
 * A personal workspace needs a name a human recognises in a switcher. Falls
 * back to the email's local part when someone signs up with a blank-ish name,
 * so the organization is never called "'s workspace".
 */
function personalOrgName(name: string, email: string): string {
  const who = name.trim() || normalizeEmail(email).split("@")[0];
  return `${who}'s workspace`;
}
