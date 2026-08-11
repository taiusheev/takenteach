import { createDefaultStyleKit, getDb } from "@/lib/db";
import { type OrgRole } from "@/lib/workflow";
import { expiryFromNow, hashToken, nowStamp } from "./tokens";

/**
 * Every query the identity tables need, in one place.
 *
 * Deliberately NOT in lib/db.ts. That file is 1,400 lines and owns the content
 * model; identity is a self-contained surface with its own five tables, and the
 * two only meet through `getDb()`. The schema itself still lives in db.ts's
 * `createDb()`, because that is the one place the database is created — a table
 * defined anywhere else would exist only after something happened to import it.
 *
 * These functions are not org-scoped and that is correct: they ARE the tenancy
 * layer. An organization lookup cannot be filtered by an organization, and a
 * user's memberships are exactly the question "which organizations may this
 * person act in". The scoping rule applies to the CONTENT queries in lib/db.ts,
 * where `Scope` is the first required parameter and an unscoped call is a type
 * error.
 */

export type OrgKind = "school" | "individual";
export type PlatformRole = "user" | "super_admin";
export type MembershipStatus =
  | "invited"
  | "pending"
  | "active"
  | "suspended"
  | "rejected";

export interface OrgRow {
  id: number;
  slug: string;
  name: string;
  kind: OrgKind;
  location: string;
  size_band: string;
  plan: string;
  created_at: string;
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  platform_role: PlatformRole;
  must_change_password: number;
  email_verified_at: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface MembershipRow {
  id: number;
  user_id: number;
  org_id: number;
  org_role: OrgRole;
  status: MembershipStatus;
  created_at: string;
  approved_at: string | null;
  approved_by: number | null;
}

/** A membership joined to the organization it is in — what a session needs. */
export interface MembershipWithOrg {
  orgId: number;
  orgName: string;
  orgSlug: string;
  orgKind: OrgKind;
  orgRole: OrgRole;
  status: MembershipStatus;
}

/* ── Email ──────────────────────────────────────────────────────────────────
   Normalised in ONE function, used by every read and every write. An address
   stored as typed and looked up as typed means `Ada@school.org` and
   `ada@school.org` are two accounts, and the second signup succeeds — which is
   an account-takeover vector the day someone adds "log in with the email on
   your invitation". */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/* ── Organizations ───────────────────────────────────────────────────────── */

/**
 * A URL-safe slug that is unique across the table.
 *
 * Two schools called "St Mary's" is not an edge case, it is Tuesday, so the
 * collision path is the normal path and gets a counter rather than an error.
 */
export function uniqueSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "org";

  const db = getDb();
  const taken = db.prepare("SELECT 1 FROM organizations WHERE slug = ?");
  if (!taken.get(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.get(candidate)) return candidate;
  }
  // 998 organizations with the same name is not a case worth a nicer answer.
  return `${base}-${Date.now()}`;
}

export function createOrganization(input: {
  name: string;
  kind: OrgKind;
  location?: string;
  sizeBand?: string;
}): OrgRow {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO organizations (slug, name, kind, location, size_band)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      uniqueSlug(input.name),
      input.name.trim(),
      input.kind,
      input.location?.trim() ?? "",
      input.sizeBand?.trim() ?? ""
    );
  const orgId = Number(info.lastInsertRowid);

  /* Every organization gets its own default Style Kit, here, so one cannot
     exist without one — every builder screen assumes a kit is selectable, and
     an org with none is a broken signup that only shows itself three clicks
     later.
     This used to be database seeding: one global kit created at connection
     time, back when the installation WAS the academy. Under tenancy that breaks
     twice — a fresh database has no organization for it to belong to, and "the
     default kit" stopped being a property of the installation. Without this,
     the first school to edit theirs would restyle every other school's covers. */
  createDefaultStyleKit(orgId);

  return getOrganization(orgId)!;
}

export function getOrganization(id: number): OrgRow | undefined {
  return getDb()
    .prepare("SELECT * FROM organizations WHERE id = ?")
    .get(id) as OrgRow | undefined;
}

export function getOrganizationBySlug(slug: string): OrgRow | undefined {
  return getDb()
    .prepare("SELECT * FROM organizations WHERE slug = ?")
    .get(slug) as OrgRow | undefined;
}

/**
 * Schools a teacher might mean when they type a name at signup.
 *
 * Only `kind = 'school'`: personal workspaces are not joinable, and listing them
 * would expose every solo user's name to anyone typing into a signup box.
 */
export function findSchoolsByName(query: string, limit = 8): OrgRow[] {
  const q = query.trim();
  if (q.length < 2) return [];
  return getDb()
    .prepare(
      `SELECT * FROM organizations
        WHERE kind = 'school' AND name LIKE ? COLLATE NOCASE
        ORDER BY name LIMIT ?`
    )
    .all(`%${q}%`, limit) as OrgRow[];
}

/* ── Users ───────────────────────────────────────────────────────────────── */

export function createUser(input: {
  email: string;
  passwordHash: string;
  name: string;
  platformRole?: PlatformRole;
  mustChangePassword?: boolean;
}): UserRow {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, name, platform_role, must_change_password)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      normalizeEmail(input.email),
      input.passwordHash,
      input.name.trim(),
      input.platformRole ?? "user",
      input.mustChangePassword ? 1 : 0
    );
  return getUser(Number(info.lastInsertRowid))!;
}

export function getUser(id: number): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | UserRow
    | undefined;
}

export function getUserByEmail(email: string): UserRow | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(normalizeEmail(email)) as UserRow | undefined;
}

export function setPassword(
  userId: number,
  passwordHash: string,
  { mustChange = false }: { mustChange?: boolean } = {}
): void {
  getDb()
    .prepare(
      "UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?"
    )
    .run(passwordHash, mustChange ? 1 : 0, userId);
}

export function markLoggedIn(userId: number): void {
  getDb()
    .prepare("UPDATE users SET last_login_at = ? WHERE id = ?")
    .run(nowStamp(), userId);
}

/* ── Memberships ─────────────────────────────────────────────────────────── */

export function createMembership(input: {
  userId: number;
  orgId: number;
  orgRole: OrgRole;
  status: MembershipStatus;
  approvedBy?: number;
}): MembershipRow {
  const db = getDb();
  const approved = input.status === "active" ? nowStamp() : null;
  const info = db
    .prepare(
      `INSERT INTO memberships (user_id, org_id, org_role, status, approved_at, approved_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.userId,
      input.orgId,
      input.orgRole,
      input.status,
      approved,
      input.approvedBy ?? null
    );
  return db
    .prepare("SELECT * FROM memberships WHERE id = ?")
    .get(Number(info.lastInsertRowid)) as MembershipRow;
}

/** Every organization this user belongs to, in any state. */
export function listMemberships(userId: number): MembershipWithOrg[] {
  return getDb()
    .prepare(
      `SELECT o.id      AS orgId,
              o.name    AS orgName,
              o.slug    AS orgSlug,
              o.kind    AS orgKind,
              m.org_role AS orgRole,
              m.status  AS status
         FROM memberships m
         JOIN organizations o ON o.id = m.org_id
        WHERE m.user_id = ?
        ORDER BY (o.kind = 'school') DESC, o.name`
    )
    .all(userId) as MembershipWithOrg[];
}

export function getMembership(
  userId: number,
  orgId: number
): MembershipWithOrg | undefined {
  return getDb()
    .prepare(
      `SELECT o.id AS orgId, o.name AS orgName, o.slug AS orgSlug,
              o.kind AS orgKind, m.org_role AS orgRole, m.status AS status
         FROM memberships m
         JOIN organizations o ON o.id = m.org_id
        WHERE m.user_id = ? AND m.org_id = ?`
    )
    .get(userId, orgId) as MembershipWithOrg | undefined;
}

/* ── Sessions ────────────────────────────────────────────────────────────── */

/** What a resolved session carries. One query, so a request pays for it once. */
export interface SessionRecord {
  userId: number;
  email: string;
  name: string;
  platformRole: PlatformRole;
  mustChangePassword: boolean;
  orgId: number;
  orgName: string;
  orgSlug: string;
  orgKind: OrgKind;
  orgRole: OrgRole;
  membershipStatus: MembershipStatus;
}

export function createSessionRow(input: {
  token: string;
  userId: number;
  activeOrgId: number;
  ttlSeconds: number;
  userAgent?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, active_org_id, expires_at, user_agent)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      hashToken(input.token),
      input.userId,
      input.activeOrgId,
      expiryFromNow(input.ttlSeconds),
      (input.userAgent ?? "").slice(0, 200)
    );
}

/**
 * Resolve a cookie token to a session, or undefined.
 *
 * Expiry is filtered IN THE QUERY rather than checked afterwards. A post-fetch
 * check is one forgotten early-return away from honouring a dead session, and
 * this function has several callers.
 *
 * The membership is joined rather than looked up separately, so a session whose
 * membership has been deleted resolves to nothing at all — revoking access by
 * removing someone from an organization has to work on their next request, not
 * once their cookie happens to expire.
 */
export function readSessionRecord(token: string): SessionRecord | undefined {
  return getDb()
    .prepare(
      `SELECT u.id            AS userId,
              u.email         AS email,
              u.name          AS name,
              u.platform_role AS platformRole,
              u.must_change_password AS mustChangePassword,
              o.id            AS orgId,
              o.name          AS orgName,
              o.slug          AS orgSlug,
              o.kind          AS orgKind,
              m.org_role      AS orgRole,
              m.status        AS membershipStatus
         FROM sessions s
         JOIN users u         ON u.id = s.user_id
         JOIN organizations o ON o.id = s.active_org_id
         JOIN memberships m   ON m.user_id = s.user_id AND m.org_id = s.active_org_id
        WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .get(hashToken(token), nowStamp()) as SessionRecord | undefined;
}

export function touchSession(token: string): void {
  getDb()
    .prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?")
    .run(nowStamp(), hashToken(token));
}

export function switchSessionOrg(token: string, orgId: number): void {
  getDb()
    .prepare("UPDATE sessions SET active_org_id = ? WHERE token_hash = ?")
    .run(orgId, hashToken(token));
}

export function deleteSession(token: string): void {
  getDb()
    .prepare("DELETE FROM sessions WHERE token_hash = ?")
    .run(hashToken(token));
}

/** Every session for a user — what a password change has to invalidate. */
export function deleteAllSessionsFor(userId: number): void {
  getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

/** Housekeeping. Cheap, and stops the table growing without bound. */
export function purgeExpiredSessions(): void {
  getDb().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowStamp());
}

/* ── Password resets ─────────────────────────────────────────────────────── */

export function createPasswordReset(userId: number, token: string, ttlSeconds: number): void {
  getDb()
    .prepare(
      `INSERT INTO password_resets (token_hash, user_id, expires_at)
       VALUES (?, ?, ?)`
    )
    .run(hashToken(token), userId, expiryFromNow(ttlSeconds));
}

/**
 * A reset token that is live: not expired, not already spent.
 *
 * Both conditions are in the query for the same reason expiry is on sessions —
 * a spent link and a live one must not differ by a check the caller could skip.
 */
export function readPasswordReset(token: string): { user_id: number } | undefined {
  return getDb()
    .prepare(
      `SELECT user_id FROM password_resets
        WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`
    )
    .get(hashToken(token), nowStamp()) as { user_id: number } | undefined;
}

export function consumePasswordReset(token: string): void {
  getDb()
    .prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ?")
    .run(nowStamp(), hashToken(token));
}

/** Outstanding links for a user, killed when they set a new password by any route. */
export function invalidateResetsFor(userId: number): void {
  getDb()
    .prepare(
      "UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL"
    )
    .run(nowStamp(), userId);
}
