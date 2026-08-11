/**
 * Role-gated Draft → In Review → Approved → Published workflow.
 *
 * The transition table below is unchanged by the move to real accounts and is
 * meant to stay that way — what changed is only where the role VALUE comes
 * from. It used to be a cookie the browser could set to anything; it is now
 * derived from the caller's membership in the organization they are acting in.
 */

export const ROLES = ["founder", "coach", "teacher", "ta"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  founder: "Founder",
  coach: "Coach",
  teacher: "Teacher",
  ta: "TA / Judge",
};

/* ── ORGANIZATION ROLES ────────────────────────────────────────────────────
   The tenancy vocabulary (decision 3 in docs/SAAS-FOUNDATION.md): ONE role
   system, stored on `memberships.org_role`.

   The four names above are Ascent's own and were never generic — "Founder" and
   "TA / Judge" mean something inside a debate academy and nothing inside a
   secondary school's English department. These five are what a second customer
   can read. `super_admin` is deliberately absent: it is a platform fact stored
   on `users`, not a membership, so that no school admin can grant it.

   Both vocabularies exist during phase 1 and that is temporary. Memberships
   store the org role; `toLegacyRole` maps it back so the entire existing
   workflow, guard and UI surface keeps working untouched while identity lands.
   Phase 2 reverses the dependency and deletes `Role`. */
export const ORG_ROLES = [
  "owner",
  "admin",
  "coach",
  "teacher",
  "assistant",
] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "School Admin",
  coach: "Coach",
  teacher: "Teacher",
  assistant: "Assistant / Judge",
};

/** Whether this role administers the organization itself — members, invitations, settings. */
export function canAdministerOrg(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * The bridge, for phase 1 only.
 *
 * `admin` and `coach` both land on `coach` because they have identical powers
 * in the transition table — the difference between them is organizational
 * (who manages the roster), not editorial, and inventing an editorial
 * difference here to make the mapping bijective would be inventing a rule.
 */
export function toLegacyRole(role: OrgRole): Role {
  switch (role) {
    case "owner":
      return "founder";
    case "admin":
    case "coach":
      return "coach";
    case "assistant":
      return "ta";
    default:
      return "teacher";
  }
}

export const STATUSES = ["draft", "in_review", "approved", "published"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  published: "Published",
};

export interface Transition {
  action: string;
  from: Status;
  to: Status;
  roles: Role[];
  label: string;
  /** transitions that reject/send back require a reason (correction capture groundwork) */
  requiresReason?: boolean;
  /** submit requires the evidence-integrity checklist to pass */
  requiresChecklist?: boolean;
}

export const TRANSITIONS: Transition[] = [
  {
    action: "submit",
    from: "draft",
    to: "in_review",
    roles: ["founder", "coach", "teacher"],
    label: "Submit for review",
    requiresChecklist: true,
  },
  {
    action: "approve",
    from: "in_review",
    to: "approved",
    roles: ["founder", "coach"],
    label: "Approve",
  },
  {
    action: "reject",
    from: "in_review",
    to: "draft",
    roles: ["founder", "coach"],
    label: "Send back",
    requiresReason: true,
  },
  {
    action: "publish",
    from: "approved",
    to: "published",
    roles: ["founder", "coach"],
    label: "Publish",
  },
  {
    action: "unpublish",
    from: "published",
    to: "draft",
    roles: ["founder"],
    label: "Unpublish",
    requiresReason: true,
  },
];

export function availableTransitions(status: Status, role: Role): Transition[] {
  return TRANSITIONS.filter((t) => t.from === status && t.roles.includes(role));
}

export function findTransition(action: string, status: Status, role: Role) {
  return availableTransitions(status, role).find((t) => t.action === action);
}

/** Only builders may edit content, and only while it's a draft. */
export function canEdit(status: Status, role: Role): boolean {
  return status === "draft" && role !== "ta";
}

export function canCreate(role: Role): boolean {
  return role !== "ta";
}
