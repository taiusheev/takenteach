import { createDefaultStyleKit } from "@/lib/db";
import { all, insert, one, run } from "@/lib/pg";
import { type OrgRole } from "@/lib/workflow";
import { expiryFromNow, hashToken, nowStamp } from "./tokens";

/**
 * Every query the identity tables need, in one place.
 *
 * Deliberately NOT in lib/db.ts. That file owns the content model; identity is
 * a self-contained surface with its own five tables, and the two only meet
 * through the query layer in lib/pg.ts. The schema itself lives in
 * lib/schema.ts, which owns the DDL for both halves — a table defined anywhere
 * else would exist only after something happened to import it.
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
  /** JSON — this teacher's own defaults. See lib/auth/preferences.ts. */
  preferences: string;
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
export async function uniqueSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "org";

  const taken = async (slug: string) =>
    Boolean(await one("SELECT 1 FROM organizations WHERE slug = ?", [slug]));

  if (!(await taken(base))) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  // 998 organizations with the same name is not a case worth a nicer answer.
  return `${base}-${Date.now()}`;
}

export async function createOrganization(input: {
  name: string;
  kind: OrgKind;
  location?: string;
  sizeBand?: string;
}): Promise<OrgRow> {
  const orgId = await insert(
    `INSERT INTO organizations (slug, name, kind, location, size_band)
     VALUES (?, ?, ?, ?, ?)`,
    [
      await uniqueSlug(input.name),
      input.name.trim(),
      input.kind,
      input.location?.trim() ?? "",
      input.sizeBand?.trim() ?? "",
    ]
  );

  /* Every organization gets its own default Style Kit, here, so one cannot
     exist without one — every builder screen assumes a kit is selectable, and
     an org with none is a broken signup that only shows itself three clicks
     later.
     This used to be database seeding: one global kit created at connection
     time, back when the installation WAS the academy. Under tenancy that breaks
     twice — a fresh database has no organization for it to belong to, and "the
     default kit" stopped being a property of the installation. Without this,
     the first school to edit theirs would restyle every other school's covers. */
  /* Seeded with the school's OWN name, so the first lesson they print carries
     their masthead rather than this product's. See brandedKit in lib/db.ts. */
  await createDefaultStyleKit(orgId, undefined, input.name);

  return (await getOrganization(orgId))!;
}

export async function getOrganization(id: number): Promise<OrgRow | undefined> {
  return one<OrgRow>("SELECT * FROM organizations WHERE id = ?", [id]);
}

export async function getOrganizationBySlug(
  slug: string
): Promise<OrgRow | undefined> {
  return one<OrgRow>("SELECT * FROM organizations WHERE slug = ?", [slug]);
}

/**
 * Schools a teacher might mean when they type a name at signup.
 *
 * Only `kind = 'school'`: personal workspaces are not joinable, and listing them
 * would expose every solo user's name to anyone typing into a signup box.
 *
 * `ILIKE` is Postgres's spelling of what `LIKE ? COLLATE NOCASE` did on SQLite.
 * It is not merely a rename — NOCASE folded ASCII only, and ILIKE folds by the
 * database's locale, so "École" now matches "école" where it did not before.
 * That is the behaviour a school-name search should have had all along.
 */
export async function findSchoolsByName(
  query: string,
  limit = 8
): Promise<OrgRow[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  return all<OrgRow>(
    `SELECT * FROM organizations
      WHERE kind = 'school' AND name ILIKE ?
      ORDER BY name LIMIT ?`,
    [`%${q}%`, limit]
  );
}

/* ── Users ───────────────────────────────────────────────────────────────── */

export async function createUser(input: {
  email: string;
  passwordHash: string;
  name: string;
  platformRole?: PlatformRole;
  mustChangePassword?: boolean;
}): Promise<UserRow> {
  const id = await insert(
    `INSERT INTO users (email, password_hash, name, platform_role, must_change_password)
     VALUES (?, ?, ?, ?, ?)`,
    [
      normalizeEmail(input.email),
      input.passwordHash,
      input.name.trim(),
      input.platformRole ?? "user",
      input.mustChangePassword ? 1 : 0,
    ]
  );
  return (await getUser(id))!;
}

export async function getUser(id: number): Promise<UserRow | undefined> {
  return one<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
}

export async function getUserByEmail(
  email: string
): Promise<UserRow | undefined> {
  return one<UserRow>("SELECT * FROM users WHERE email = ?", [
    normalizeEmail(email),
  ]);
}

export async function setPassword(
  userId: number,
  passwordHash: string,
  { mustChange = false }: { mustChange?: boolean } = {}
): Promise<void> {
  await run(
    "UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?",
    [passwordHash, mustChange ? 1 : 0, userId]
  );
}

/**
 * A teacher's own name and defaults.
 *
 * Scoped by userId rather than taking a whole user object, so a caller cannot
 * pass one user's id with another's values. Name and preferences update
 * together because they are one form and one save.
 */
export async function updateAccount(
  userId: number,
  input: { name: string; preferences: string }
): Promise<void> {
  await run("UPDATE users SET name = ?, preferences = ? WHERE id = ?", [
    input.name.trim(),
    input.preferences,
    userId,
  ]);
}

export async function markLoggedIn(userId: number): Promise<void> {
  await run("UPDATE users SET last_login_at = ? WHERE id = ?", [
    nowStamp(),
    userId,
  ]);
}

/* ── Memberships ─────────────────────────────────────────────────────────── */

export async function createMembership(input: {
  userId: number;
  orgId: number;
  orgRole: OrgRole;
  status: MembershipStatus;
  approvedBy?: number;
}): Promise<MembershipRow> {
  const approved = input.status === "active" ? nowStamp() : null;
  const id = await insert(
    `INSERT INTO memberships (user_id, org_id, org_role, status, approved_at, approved_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.orgId,
      input.orgRole,
      input.status,
      approved,
      input.approvedBy ?? null,
    ]
  );
  return (await one<MembershipRow>("SELECT * FROM memberships WHERE id = ?", [
    id,
  ]))!;
}

/** Every organization this user belongs to, in any state. */
export async function listMemberships(
  userId: number
): Promise<MembershipWithOrg[]> {
  return all<MembershipWithOrg>(
    `SELECT o.id       AS "orgId",
            o.name     AS "orgName",
            o.slug     AS "orgSlug",
            o.kind     AS "orgKind",
            m.org_role AS "orgRole",
            m.status   AS status
       FROM memberships m
       JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = ?
      ORDER BY (o.kind = 'school') DESC, o.name`,
    [userId]
  );
}

export async function getMembership(
  userId: number,
  orgId: number
): Promise<MembershipWithOrg | undefined> {
  return one<MembershipWithOrg>(
    `SELECT o.id AS "orgId", o.name AS "orgName", o.slug AS "orgSlug",
            o.kind AS "orgKind", m.org_role AS "orgRole", m.status AS status
       FROM memberships m
       JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = ? AND m.org_id = ?`,
    [userId, orgId]
  );
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

export async function createSessionRow(input: {
  token: string;
  userId: number;
  activeOrgId: number;
  ttlSeconds: number;
  userAgent?: string;
}): Promise<void> {
  await run(
    `INSERT INTO sessions (token_hash, user_id, active_org_id, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [
      hashToken(input.token),
      input.userId,
      input.activeOrgId,
      expiryFromNow(input.ttlSeconds),
      (input.userAgent ?? "").slice(0, 200),
    ]
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
export async function readSessionRecord(
  token: string
): Promise<SessionRecord | undefined> {
  const row = await one<
    Omit<SessionRecord, "mustChangePassword"> & { mustChangePassword: number }
  >(
    `SELECT u.id            AS "userId",
            u.email         AS email,
            u.name          AS name,
            u.platform_role AS "platformRole",
            u.must_change_password AS "mustChangePassword",
            o.id            AS "orgId",
            o.name          AS "orgName",
            o.slug          AS "orgSlug",
            o.kind          AS "orgKind",
            m.org_role      AS "orgRole",
            m.status        AS "membershipStatus"
       FROM sessions s
       JOIN users u         ON u.id = s.user_id
       JOIN organizations o ON o.id = s.active_org_id
       JOIN memberships m   ON m.user_id = s.user_id AND m.org_id = s.active_org_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
    [hashToken(token), nowStamp()]
  );
  /* `must_change_password` is an integer column and the DAL treats this field as
     a boolean — `if (session.mustChangePassword)`. Under SQLite that worked by
     accident, because 0 is falsy. It still would here, but the field is DECLARED
     boolean and returning a number from a function that promises one is the kind
     of small lie that survives until someone writes `=== true`. */
  return row ? { ...row, mustChangePassword: Boolean(row.mustChangePassword) } : undefined;
}

export async function touchSession(token: string): Promise<void> {
  await run("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?", [
    nowStamp(),
    hashToken(token),
  ]);
}

export async function switchSessionOrg(
  token: string,
  orgId: number
): Promise<void> {
  await run("UPDATE sessions SET active_org_id = ? WHERE token_hash = ?", [
    orgId,
    hashToken(token),
  ]);
}

export async function deleteSession(token: string): Promise<void> {
  await run("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
}

/** Every session for a user — what a password change has to invalidate. */
export async function deleteAllSessionsFor(userId: number): Promise<void> {
  await run("DELETE FROM sessions WHERE user_id = ?", [userId]);
}

/** Housekeeping. Cheap, and stops the table growing without bound. */
export async function purgeExpiredSessions(): Promise<void> {
  await run("DELETE FROM sessions WHERE expires_at <= ?", [nowStamp()]);
}

/* ── Password resets ─────────────────────────────────────────────────────── */

export async function createPasswordReset(
  userId: number,
  token: string,
  ttlSeconds: number
): Promise<void> {
  await run(
    `INSERT INTO password_resets (token_hash, user_id, expires_at)
     VALUES (?, ?, ?)`,
    [hashToken(token), userId, expiryFromNow(ttlSeconds)]
  );
}

/**
 * A reset token that is live: not expired, not already spent.
 *
 * Both conditions are in the query for the same reason expiry is on sessions —
 * a spent link and a live one must not differ by a check the caller could skip.
 */
export async function readPasswordReset(
  token: string
): Promise<{ user_id: number } | undefined> {
  return one<{ user_id: number }>(
    `SELECT user_id FROM password_resets
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
    [hashToken(token), nowStamp()]
  );
}

export async function consumePasswordReset(token: string): Promise<void> {
  await run("UPDATE password_resets SET used_at = ? WHERE token_hash = ?", [
    nowStamp(),
    hashToken(token),
  ]);
}

/** Outstanding links for a user, killed when they set a new password by any route. */
export async function invalidateResetsFor(userId: number): Promise<void> {
  await run(
    "UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
    [nowStamp(), userId]
  );
}
