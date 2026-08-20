import { all, insert, one, run, transaction } from "./pg";
import { SQL_NOW } from "./schema";
import { type AnyContent, parseContent } from "./content-types";
import { type RoundRow, type SubmissionRow } from "./judging";
import { type Role, type Status } from "./workflow";
import { type Subject } from "./subjects";
import {
  DEFAULT_KIT_CONFIG,
  type StyleKitConfig,
  parseKitConfig,
} from "./style-kit";
import { pickExemplar, type ExemplarTarget } from "./memory";
import { observationsFromBallot } from "./students";

/**
 * The data layer. One materials table holds every content type as typed JSON;
 * style kits, students, rounds and an activity log ride alongside. The activity
 * log doubles as Phase 4 correction capture — rejections store a tagged reason.
 *
 * ── THIS FILE USED TO OWN THE SCHEMA ─────────────────────────────────────
 * It no longer does. `createDb()` opened a SQLite file, ran the DDL, applied
 * six ALTER-TABLE migrations and asserted the result on every connection.
 * lib/schema.ts owns all of that now and `npm run db:migrate` applies it, which
 * is the difference between a local file that can be re-created on demand and a
 * shared database that several serverless instances would otherwise race to
 * migrate on every cold start.
 *
 * ── EVERY FUNCTION HERE IS ASYNC ─────────────────────────────────────────
 * better-sqlite3 was synchronous; no Postgres driver is. That is the whole cost
 * of the port and it is paid in signatures rather than in logic — the SQL below
 * is very nearly the SQL that was here before, because lib/pg.ts converts `?`
 * placeholders rather than making 130 queries change shape. See its header.
 */

export type { StyleKitConfig } from "./style-kit";

export interface StyleKitRow {
  id: number;
  org_id: number;
  name: string;
  config: StyleKitConfig;
  locked_fields: string[];
  is_default: number;
}

/**
 * Who may see a material.
 *
 *   private       the creator only
 *   organization  every active member of the owning org — the default
 *   shared        published outward; today that means the same as organization,
 *                 and it exists so the column does not have to be migrated
 *                 again when cross-org sharing lands
 *
 * The default is `organization` rather than `private` on purpose: the product's
 * whole premise is one house style across a department, and a default nobody
 * else can see produces a shared library that quietly fills with invisible work.
 */
export const VISIBILITIES = ["private", "organization", "shared"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export interface MaterialRow {
  id: number;
  /** The organization that owns it. Every query filters on this. */
  org_id: number;
  /** null once the teacher who made it is deleted — the lesson outlives them */
  created_by: number | null;
  visibility: Visibility;
  department_id: number | null;
  student_level: string;
  type: string;
  subject: Subject;
  title: string;
  status: Status;
  style_kit_id: number;
  content: AnyContent;
  created_by_role: Role;
  /** lineage: the material this one was duplicated or remixed from */
  forked_from: number | null;
  /** JSON InheritedOutline — the structure a remix should be refilled with */
  inherited_outline: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * WHO IS ASKING — the scope every content query is filtered by.
 *
 * Passed as one object rather than a bare `orgId`, because visibility needs the
 * user too: `private` means "the creator only", and a function that receives
 * only an organization cannot answer that. Bundling them means a call site
 * cannot supply half a scope, and it is one parameter to thread rather than two.
 *
 * Built by lib/auth/dal.ts from the session. It is never constructed from
 * anything a request carries — that is the whole point of it existing.
 */
export interface Scope {
  orgId: number;
  userId: number;
  /** owner/admin/coach see private drafts in their org; a teacher sees own only */
  canSeeAllPrivate: boolean;
  /**
   * The organization's display name — for BRANDING ONLY, never for filtering.
   *
   * Optional so the ~130 existing queries and the tenancy tests are unaffected:
   * nothing may key off a name when it has an id, and every query in this file
   * still filters on `orgId`. It exists so a pack can print the school's
   * masthead without the print page having to fetch the organization itself.
   */
  orgName?: string;
}

export interface ActivityRow {
  id: number;
  material_id: number;
  role: string;
  action: string;
  detail: string;
  created_at: string;
}

export interface CorrectionRow {
  id: number;
  /** null once the material it described has been deleted — the tags outlive it */
  material_id: number | null;
  action: string;
  role: string;
  subject: string;
  type: string;
  tags: string[];
  note: string;
  created_at: string;
}

const DEFAULT_KIT: StyleKitConfig = DEFAULT_KIT_CONFIG;

/**
 * A new organization's starting Style Kit.
 *
 * THIS USED TO BE DATABASE SEEDING and could not stay that way. `seed(db)` ran
 * at connection time and inserted one global default kit plus a demo lesson —
 * which made sense when the installation *was* the academy. Under tenancy it
 * breaks twice: the insert has no organization to belong to (a fresh database
 * has none, because the first org is created at signup), and "the default kit"
 * stopped being a property of the installation. Every organization needs its
 * own, or the first school to edit theirs restyles every other school's covers.
 *
 * Called from createOrganization(), so an org cannot exist without one — every
 * builder screen assumes a kit is selectable.
 *
 * The demo lesson is deliberately NOT recreated here. A new organization's
 * library should be empty, because an empty library is a true statement about
 * their work and the front page already has a first-run state that says so.
 * Seeding someone else's lesson into it is a worse welcome than nothing.
 */
export async function createDefaultStyleKit(
  orgId: number,
  name?: string,
  /**
   * The organization's own name, which becomes the brand printed on the pack.
   *
   * ── WHY THIS PARAMETER EXISTS ────────────────────────────────────────────
   * Every printed lesson carried "TAKENTEACH" in its footer and masthead,
   * because the starting kit hard-coded it. That is the wrong name on the
   * paper: the sheet a student is handed belongs to their school, and the tool
   * that produced it is nobody's business — no school hands out worksheets
   * branded with the name of the software that made them. It also reads as an
   * advert on a document a teacher is putting their own credibility behind.
   *
   * So the kit is seeded from the organization at signup, and `brandFor()`
   * below rescues the kits that were created before this existed.
   */
  orgName?: string
): Promise<number> {
  return insert(
    `INSERT INTO style_kits (org_id, name, config, locked_fields, is_default)
     VALUES (?, ?, ?, ?, 1)`,
    [
      orgId,
      name ?? "House Style",
      JSON.stringify(brandedKit(DEFAULT_KIT, orgName)),
      JSON.stringify(["palette", "fonts", "rules"]),
    ]
  );
}

/** The starting kit, wearing the school's name instead of the product's. */
export function brandedKit(
  base: StyleKitConfig,
  orgName?: string
): StyleKitConfig {
  const school = (orgName ?? "").trim();
  if (!school) return base;
  const brand = school.toUpperCase();
  return {
    ...base,
    brand,
    /* The year is deliberately dropped rather than guessed. "SPRING 2026"
       was baked into the default and is wrong for most of the year and every
       year after; a footer nobody edits should not state a false date. */
    footerText: `${brand} · ${base.seriesLabel.toUpperCase()}`,
  };
}

// ── Typed accessors ──────────────────────────────────────────────────────────

function parseMaterial(row: Record<string, unknown>): MaterialRow {
  // re-parse against the row's own content type so rows saved under older
  // schema versions pick up defaults for fields added since
  const raw = JSON.parse(row.content as string);
  return {
    ...(row as object),
    content: parseContent(row.type as string, raw),
  } as MaterialRow;
}

/* ── THE TWO FUNCTIONS TENANCY TURNS ON ─────────────────────────────────────
   Everything the product shows a teacher comes through listMaterials or
   getMaterial. Before phase 2 they read:

     SELECT * FROM materials ORDER BY updated_at DESC
     SELECT * FROM materials WHERE id = ?

   — no organization, no owner, no visibility. The first returned every row in
   the database to whoever asked, and the second let any id be addressed by
   anyone. Both now take a Scope as their FIRST REQUIRED ARGUMENT, so a caller
   that has not thought about tenancy does not compile.

   THE FILTER IS IN THE SQL, not applied to the result. A post-fetch `.filter()`
   is one forgotten early return away from being skipped, and it also means the
   database hands the process rows it had no right to — which is the difference
   between a bug and a breach when something later logs them. */

/** The WHERE fragment that makes a query tenant-safe, plus its parameters. */
function visibleTo(scope: Scope): { sql: string; params: unknown[] } {
  /* A coach or admin sees everything in their own organization, including
     private drafts — they are accountable for the library and cannot review
     what they cannot open. A teacher sees the org's shared work plus their own
     private drafts, and nobody sees another organization's anything. */
  if (scope.canSeeAllPrivate) {
    return { sql: "org_id = ?", params: [scope.orgId] };
  }
  return {
    sql: "org_id = ? AND (visibility != 'private' OR created_by = ?)",
    params: [scope.orgId, scope.userId],
  };
}

export async function listMaterials(scope: Scope): Promise<MaterialRow[]> {
  const v = visibleTo(scope);
  const rows = await all(
    `SELECT * FROM materials WHERE ${v.sql} ORDER BY updated_at DESC`,
    v.params
  );
  return rows.map(parseMaterial);
}

/**
 * One material, or null.
 *
 * Null for "does not exist" and null for "belongs to another organization" is
 * the same answer on purpose, and the callers turn it into a 404. Answering 403
 * for the second would confirm the row exists, which is exactly the leak
 * lib/api/guards.ts already refuses to produce between a malformed id and a
 * missing row.
 */
export async function getMaterial(
  scope: Scope,
  id: number
): Promise<MaterialRow | null> {
  const v = visibleTo(scope);
  const row = await one(`SELECT * FROM materials WHERE id = ? AND ${v.sql}`, [
    id,
    ...v.params,
  ]);
  return row ? parseMaterial(row) : null;
}

export async function createMaterial(
  scope: Scope,
  title: string,
  styleKitId: number,
  content: AnyContent,
  role: Role,
  subject: Subject = "debate",
  lineage?: { forkedFrom: number; inheritedOutline?: unknown },
  type: string = "lesson-pack"
): Promise<number> {
  const id = await insert(
    `INSERT INTO materials (org_id, created_by, type, subject, title, status, style_kit_id, content, created_by_role, forked_from, inherited_outline)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
    [
      scope.orgId,
      scope.userId,
      type,
      subject,
      title,
      styleKitId,
      JSON.stringify(content),
      role,
      lineage?.forkedFrom ?? null,
      lineage?.inheritedOutline
        ? JSON.stringify(lineage.inheritedOutline)
        : null,
    ]
  );
  await logActivity(id, role, "create", title);
  return id;
}

/**
 * Sibling lessons in the same series — what has already been taught. Feeds
 * generation (so a new lesson doesn't repeat earlier ones) and the uniqueness
 * report. Series match is case/whitespace-insensitive; blank series has no
 * siblings.
 */
export async function listSeriesSiblings(
  scope: Scope,
  subject: string,
  series: string,
  excludeId: number
): Promise<MaterialRow[]> {
  const key = series.trim().toLowerCase();
  if (!key) return [];
  /* Filtered in SQL, including the series that lives inside the content JSON.
     This used to call listMaterials(), which reads every row and runs the full
     zod content schema over each one — including the design stylesheet — just to
     compare three fields. Generation calls this on every build, so the cost of
     planning one lesson grew with the size of the whole library.

     `content` is a text column (see lib/schema.ts on why), so reaching inside it
     costs a cast. That is the honest price of storing JSON as text and it is
     paid by exactly this one query. */
  const rows = await all(
    `SELECT * FROM materials
      WHERE org_id = ? AND subject = ? AND type = 'lesson-pack' AND id != ?
        AND lower(trim(COALESCE(content::jsonb ->> 'series', ''))) = ?
      ORDER BY updated_at DESC`,
    [scope.orgId, subject, excludeId, key]
  );
  return rows.map(parseMaterial);
}

/**
 * Retrieval grounding for Quick Build: the most recently published pack of the
 * same subject serves as the exemplar the AI drafts against (Memory Engine v0
 * — the corpus grows as more lessons get published).
 */
export async function getExemplar(
  scope: Scope,
  subject: Subject,
  type = "lesson-pack"
): Promise<MaterialRow | null> {
  // The type filter is not optional. Without it this returned the most recent
  // published material of ANY type, which in a real library meant a judge
  // ballot was handed to the lesson generator as the standard to meet.
  const row = await one(
    "SELECT * FROM materials WHERE org_id = ? AND status = 'published' AND subject = ? AND type = ? ORDER BY updated_at DESC LIMIT 1",
    [scope.orgId, subject, type]
  );
  return row ? parseMaterial(row) : null;
}

/**
 * Memory Engine v1 retrieval: the published lesson pack that most closely
 * matches what we're about to build (format / grade / rigor / skill), rather
 * than just the most recent one. Falls back to the most recent of the subject,
 * then any subject, so a fresh corpus still grounds on something.
 */
export async function getBestExemplar(
  scope: Scope,
  subject: Subject,
  target: ExemplarTarget,
  excludeId: number
): Promise<MaterialRow | null> {
  // Every lesson pack is a candidate; `pickExemplar` applies the eligibility
  // rule (reviewed at least as far as submission, and actually built) and ranks
  // by review tier before relevance. Restricting the SQL to published packs was
  // what emptied this pool in the first place.
  const candidates = async (sameSubject: boolean) => {
    const rows = sameSubject
      ? await all(
          "SELECT * FROM materials WHERE org_id = ? AND type = 'lesson-pack' AND subject = ? AND id != ?",
          [scope.orgId, subject, excludeId]
        )
      : await all(
          "SELECT * FROM materials WHERE org_id = ? AND type = 'lesson-pack' AND id != ?",
          [scope.orgId, excludeId]
        );
    return rows.map(parseMaterial);
  };
  // Same subject first; a cross-subject pack still sets a useful quality bar,
  // since the prompt frames an exemplar as a standard to beat, never a template.
  return (
    pickExemplar(await candidates(true), target) ??
    pickExemplar(await candidates(false), target)
  );
}

/**
 * This teacher's own most recent lesson packs — for `recentActivityGuidance`
 * (lib/analytics.ts). Scoped to `created_by`, not `org_id`: two teachers at
 * the same school build differently, and averaging across them would recommend
 * variety neither of them actually needs.
 */
export async function listOwnRecentLessonPacks(
  scope: Scope,
  excludeId: number,
  limit = 5
): Promise<MaterialRow[]> {
  const rows = await all(
    "SELECT * FROM materials WHERE org_id = ? AND created_by = ? AND type = 'lesson-pack' AND id != ? ORDER BY updated_at DESC LIMIT ?",
    [scope.orgId, scope.userId, excludeId, limit]
  );
  return rows.map(parseMaterial);
}

/**
 * A material is created before the AI has named it, so its row title is a
 * placeholder ("Untitled full lesson pack") until someone renames it by hand —
 * and nobody does, so the library ends up full of Untitleds. Once the content
 * carries a real cover title, adopt it (prefixed with the lesson code).
 */
function titleFromContent(current: string, content: AnyContent): string {
  if (current.trim() && !/^untitled\b/i.test(current.trim())) return current;
  const c = content as { title?: unknown; lessonCode?: unknown };
  const cover = typeof c.title === "string" ? c.title.trim() : "";
  if (!cover) return current;
  const code = typeof c.lessonCode === "string" ? c.lessonCode.trim() : "";
  return code ? `${code} · ${cover}` : cover;
}

export async function updateMaterialContent(
  id: number,
  title: string,
  content: AnyContent
): Promise<void> {
  await run(
    `UPDATE materials SET title = ?, content = ?, updated_at = ${SQL_NOW} WHERE id = ?`,
    [titleFromContent(title, content), JSON.stringify(content), id]
  );
}

/**
 * Snapshot the current content and overwrite it, as one transaction.
 *
 * Every AI mutation is a snapshot followed by a write, and doing that as two
 * statements has a gap: if the write fails, the history gains a version row
 * describing an edit that never happened, and the timeline shows the teacher an
 * "AI build" they can restore to that is identical to what they already have.
 * Pairing them means the undo point and the thing it undoes always agree.
 */
export async function snapshotAndUpdate(
  id: number,
  label: string,
  role: string,
  title: string,
  content: AnyContent
): Promise<void> {
  await transaction(async () => {
    await snapshotMaterial(id, label, role);
    await updateMaterialContent(id, title, content);
  });
}

/** How many materials were forked from this one (guards deletion of a lineage root). */
/* ── A NOTE ON THE FUNCTIONS BELOW ─────────────────────────────────────────
   Two kinds live here and they are guarded differently.

   READS and DESTRUCTIVE operations take a Scope, because they can be reached
   with any id and must answer for one organization only.

   POST-AUTHORIZATION WRITERS — setMaterialStatus, setMaterialStyleKit,
   updateMaterialContent, snapshotAndUpdate, snapshotMaterial, saveChecklistRun,
   logActivity — do not. They take a materialId that the caller has already
   resolved through getMaterial(scope, id), which is the only way to obtain one:
   lib/api/guards.ts will not hand a handler a material without it, and a
   handler cannot construct one. The invariant is therefore enforced by the
   guard layer rather than repeated in nine signatures.

   That is a real trade and worth naming: a NEW call site that invents a
   material id from a request body would bypass it. If one ever needs to, it
   takes a Scope and re-reads the material first — it does not call these
   directly. */

export async function countForksOf(scope: Scope, id: number): Promise<number> {
  const row = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM materials WHERE forked_from = ? AND org_id = ?",
    [id, scope.orgId]
  );
  return row!.n;
}

/**
 * How many rounds were run from this material as their ballot template.
 *
 * A round is opened from a ballot of ANY status, draft included, so a draft
 * ballot can have real judged rounds hanging off it. Without this check the
 * delete reached the database and came back "foreign key constraint" as a bare
 * 500 — the same failure the missing version cleanup caused, wearing a different
 * table's name. Unlike versions, these must not be cascaded away: a judged round
 * is a record of something that happened in a room.
 */
export async function countRoundsFrom(
  scope: Scope,
  materialId: number
): Promise<number> {
  const row = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM rounds WHERE ballot_id = ? AND org_id = ?",
    [materialId, scope.orgId]
  );
  return row!.n;
}

/**
 * Delete a material and everything that only exists because of it.
 *
 * Every table referencing `materials` has to be dealt with explicitly here.
 * `material_versions` was missed, and because foreign keys are enforced that
 * was not a leak but a hard failure: a snapshot row is created before every AI
 * build, so ANY pack that had ever been generated refused to delete with a
 * foreign-key error — surfacing as a 500 with no explanation, on the one action
 * a founder takes to tidy up.
 *
 * Versions and checklist runs die with the material; they describe a document
 * that no longer exists. Corrections do not — they are dropped to a null
 * material by the schema's ON DELETE SET NULL and keep feeding the quality
 * signal.
 */
export async function deleteMaterial(scope: Scope, id: number): Promise<void> {
  /* Each child delete is gated on the PARENT being ours, not merely on the id
     matching. Scoping only the final statement would erase another tenant's
     history and then correctly decline to delete the material it belonged to —
     a destructive no-op, which is the worst of both answers. */
  const owned =
    "material_id IN (SELECT id FROM materials WHERE id = ? AND org_id = ?)";
  await transaction(async () => {
    await run("DELETE FROM activity_log WHERE " + owned, [id, scope.orgId]);
    await run("DELETE FROM checklist_runs WHERE " + owned, [id, scope.orgId]);
    await run("DELETE FROM material_versions WHERE " + owned, [id, scope.orgId]);
    await run("DELETE FROM materials WHERE id = ? AND org_id = ?", [
      id,
      scope.orgId,
    ]);
  });
}

export async function setMaterialStyleKit(
  id: number,
  styleKitId: number
): Promise<void> {
  await run(
    `UPDATE materials SET style_kit_id = ?, updated_at = ${SQL_NOW} WHERE id = ?`,
    [styleKitId, id]
  );
}

/**
 * Who may see this material.
 *
 * Scoped even though it is a write on a material the caller has already loaded,
 * because it is the one write that changes WHO CAN SEE something — the cost of
 * getting it wrong is a disclosure rather than a bad edit, so it re-states the
 * organization rather than inheriting the guard's word for it.
 */
export async function setMaterialVisibility(
  scope: Scope,
  id: number,
  visibility: Visibility
): Promise<void> {
  await run(
    `UPDATE materials SET visibility = ?, updated_at = ${SQL_NOW} WHERE id = ? AND org_id = ?`,
    [visibility, id, scope.orgId]
  );
}

export async function setMaterialStatus(
  id: number,
  status: Status
): Promise<void> {
  await run(
    `UPDATE materials SET status = ?, updated_at = ${SQL_NOW} WHERE id = ?`,
    [status, id]
  );
}

export async function logActivity(
  materialId: number,
  role: string,
  action: string,
  detail = ""
): Promise<void> {
  await run(
    "INSERT INTO activity_log (material_id, role, action, detail) VALUES (?, ?, ?, ?)",
    [materialId, role, action, detail]
  );
}

/**
 * Record what one metered AI operation cost.
 *
 * Deliberately never throws into the caller: this is bookkeeping, and a failed
 * INSERT must not lose a lesson that has just been generated and paid for. The
 * failure is logged and swallowed — the alternative is a build that succeeded,
 * cost a dollar, and reports as an error because its accounting row would not
 * write.
 */
export async function logAiUsage(input: {
  orgId: number;
  materialId?: number | null;
  operation: string;
  calls: number;
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  usd: number;
  ms: number;
  budgetMode: string;
  ok: boolean;
  breakdown: string;
}): Promise<void> {
  try {
    await run(
      `INSERT INTO ai_usage
         (org_id, material_id, operation, calls, input_tokens, cache_write_tokens,
          cache_read_tokens, output_tokens, usd_micros, ms, budget_mode, ok, breakdown)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.orgId,
        input.materialId ?? null,
        input.operation,
        input.calls,
        input.inputTokens,
        input.cacheWriteTokens,
        input.cacheReadTokens,
        input.outputTokens,
        Math.round(input.usd * 1e6),
        input.ms,
        input.budgetMode,
        input.ok,
        input.breakdown,
      ]
    );
  } catch (err) {
    console.error("ai_usage insert failed (spend not recorded):", err);
  }
}

/**
 * This organization's model spend so far this calendar month, in dollars.
 *
 * The read side of the meter, and until now it had none: every dollar was
 * written to `ai_usage` and nothing ever read it back, so the bill had no upper
 * bound. `lib/spend-policy.ts` turns this number into a decision.
 *
 * Counts FAILED operations too (`ok` is not filtered). A build that died
 * halfway still burned the tokens it burned, and a runaway is usually a loop of
 * failures — excluding them would blind the guard to exactly the case it exists
 * for.
 *
 * Calendar month, not a rolling window, because it has to match what a customer
 * is billed for; "your allowance resets on the 1st" is a sentence a school
 * finance office accepts and "in 12 days" is not.
 */
export async function orgSpendThisMonthUsd(orgId: number): Promise<number> {
  /* `created_at` is TEXT in `YYYY-MM-DD HH24:MI:SS` UTC (see SQL_NOW), not a
     timestamp column. So the bound is built as text and compared as text —
     lexicographic order is chronological order in that format, which is the
     whole reason it was chosen. Comparing the column against `date_trunc(...)`
     would make Postgres cast every row and would break the moment a row was
     written in any other shape. */
  const rows = await all<{ micros: string | number | null }>(
    `SELECT COALESCE(SUM(usd_micros), 0) AS micros
       FROM ai_usage
      WHERE org_id = $1
        AND created_at >= to_char(date_trunc('month', now() AT TIME ZONE 'utc'),
                                  'YYYY-MM-DD HH24:MI:SS')`,
    [orgId]
  );
  // SUM over bigint comes back as a string on some drivers; Number() on a null
  // would be 0 anyway, but COALESCE makes that explicit rather than incidental.
  return Number(rows[0]?.micros ?? 0) / 1e6;
}

export interface AiUsageRow {
  id: number;
  material_id: number | null;
  operation: string;
  calls: number;
  input_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  output_tokens: number;
  usd_micros: number;
  ms: number;
  budget_mode: string;
  ok: boolean;
  breakdown: string;
  created_at: string;
}

/** This organization's AI spend, newest first. */
export async function listAiUsage(
  scope: Scope,
  limit = 200
): Promise<AiUsageRow[]> {
  return all<AiUsageRow>(
    `SELECT * FROM ai_usage WHERE org_id = ? ORDER BY id DESC LIMIT ?`,
    [scope.orgId, limit]
  );
}

/**
 * What has already been spent on one lesson, in USD.
 *
 * A build is several requests, each with its own meter, so a per-run ceiling
 * cannot see the total. This is the cumulative figure — the one that answers
 * "this lesson has now cost eleven dollars and is still asking for more".
 */
export async function spentOnMaterial(
  scope: Scope,
  materialId: number
): Promise<number> {
  const row = await one<{ total: string | number | null }>(
    `SELECT COALESCE(SUM(usd_micros), 0) AS total
       FROM ai_usage WHERE org_id = ? AND material_id = ?`,
    [scope.orgId, materialId]
  );
  return Number(row?.total ?? 0) / 1e6;
}

export async function listActivity(
  scope: Scope,
  materialId: number
): Promise<ActivityRow[]> {
  return all<ActivityRow>(
    `SELECT a.* FROM activity_log a
       JOIN materials m ON m.id = a.material_id
      WHERE a.material_id = ? AND m.org_id = ?
      ORDER BY a.id DESC LIMIT 50`,
    [materialId, scope.orgId]
  );
}

/**
 * Apply a workflow transition atomically: status change, activity log, and
 * (for a send-back/unpublish) the structured correction record all land
 * together or not at all — no partial writes if one step fails.
 */
export async function applyTransition(
  scope: Scope,
  args: {
    materialId: number;
    toStatus: Status;
    role: string;
    action: string;
    detail: string;
    correction?: { subject: string; type: string; tags: string[]; note: string };
  }
): Promise<void> {
  await transaction(async () => {
    await run(
      `UPDATE materials SET status = ?, updated_at = ${SQL_NOW} WHERE id = ? AND org_id = ?`,
      [args.toStatus, args.materialId, scope.orgId]
    );
    await run(
      "INSERT INTO activity_log (material_id, role, action, detail) VALUES (?, ?, ?, ?)",
      [args.materialId, args.role, args.action, args.detail]
    );
    if (args.correction) {
      await run(
        `INSERT INTO corrections (org_id, material_id, action, role, subject, type, tags, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          scope.orgId,
          args.materialId,
          args.action,
          args.role,
          args.correction.subject,
          args.correction.type,
          JSON.stringify(args.correction.tags),
          args.correction.note,
        ]
      );
    }
  });
}

// ── Rounds & judging ─────────────────────────────────────────────────────────

export async function createRound(
  scope: Scope,
  args: {
    ballotId: number;
    label: string;
    resolution: string;
    proTeam: string;
    conTeam: string;
    room: string;
    heldOn: string;
    role: string;
    /** roster links, so judging this round feeds each debater's progress */
    proStudentId?: number | null;
    conStudentId?: number | null;
  }
): Promise<number> {
  return insert(
    `INSERT INTO rounds (org_id, ballot_id, label, resolution, pro_team, con_team, room, held_on, created_by_role, pro_student_id, con_student_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      scope.orgId,
      args.ballotId,
      args.label,
      args.resolution,
      args.proTeam,
      args.conTeam,
      args.room,
      args.heldOn,
      args.role,
      args.proStudentId ?? null,
      args.conStudentId ?? null,
    ]
  );
}

// ── Version history ───────────────────────────────────────────────────────────

export interface VersionRow {
  id: number;
  material_id: number;
  title: string;
  content: AnyContent;
  label: string;
  role: string;
  created_at: string;
}

/** How many snapshots to keep per material — enough to undo a bad session. */
const VERSION_LIMIT = 40;

/**
 * Snapshot a material's CURRENT content before something overwrites it.
 *
 * Call this immediately before a mutation, never after: the value of a version
 * row is that it holds the state the teacher is about to lose. Silently does
 * nothing for a material that doesn't exist, so a snapshot can never be the
 * reason an edit fails.
 */
export async function snapshotMaterial(
  id: number,
  label: string,
  role: string
): Promise<number | null> {
  const row = await one<{ title: string; content: string }>(
    "SELECT title, content FROM materials WHERE id = ?",
    [id]
  );
  if (!row) return null;

  const versionId = await insert(
    "INSERT INTO material_versions (material_id, title, content, label, role) VALUES (?, ?, ?, ?, ?)",
    [id, row.title, row.content, label, role]
  );

  // keep the history bounded — old snapshots of a much-edited pack are noise
  await run(
    `DELETE FROM material_versions
      WHERE material_id = ?
        AND id NOT IN (
          SELECT id FROM material_versions WHERE material_id = ? ORDER BY id DESC LIMIT ?
        )`,
    [id, id, VERSION_LIMIT]
  );

  return versionId;
}

export async function listVersions(
  scope: Scope,
  materialId: number
): Promise<VersionRow[]> {
  const rows = await all(
    // join the material's type: a version stores raw JSON and only the
    // material knows which schema to parse it against. The same join now
    // carries the tenancy check, so it costs nothing extra.
    `SELECT v.*, m.type AS material_type FROM material_versions v
       JOIN materials m ON m.id = v.material_id
      WHERE v.material_id = ? AND m.org_id = ? ORDER BY v.id DESC`,
    [materialId, scope.orgId]
  );
  return rows.map((r) => ({
    ...(r as unknown as VersionRow),
    content: parseContent(
      String(r.material_type),
      JSON.parse(String(r.content))
    ),
  }));
}

/**
 * A version is addressed by ITS OWN id, which makes it one of the few rows in
 * the schema a caller can reach without naming its material — so the join to
 * materials is load-bearing here rather than a convenience. Without the org
 * check, `/api/materials/1/versions` with someone else's version id would
 * happily restore another organization's lesson into yours.
 */
export async function getVersion(
  scope: Scope,
  versionId: number
): Promise<VersionRow | null> {
  const r = await one(
    `SELECT v.*, m.type AS material_type FROM material_versions v
       JOIN materials m ON m.id = v.material_id
      WHERE v.id = ? AND m.org_id = ?`,
    [versionId, scope.orgId]
  );
  if (!r) return null;
  return {
    ...(r as unknown as VersionRow),
    content: parseContent(
      String(r.material_type),
      JSON.parse(String(r.content))
    ),
  };
}

/**
 * Put a previous version back. The current state is snapshotted first, so
 * restoring is itself undoable — a teacher who restores the wrong version must
 * not be worse off than one who never tried.
 */
export async function restoreVersion(
  scope: Scope,
  versionId: number,
  role: string
): Promise<number | null> {
  const version = await getVersion(scope, versionId);
  if (!version) return null;
  await transaction(async () => {
    // the UI renders "before <label>", so the label is the action itself
    await snapshotMaterial(version.material_id, "a restore", role);
    // deliberately NOT updateMaterialContent: that function adopts a cover title
    // for a still-"Untitled" row, which is right for an edit and wrong here —
    // restoring means putting back exactly the title this version was saved with.
    await run(
      `UPDATE materials SET title = ?, content = ?, updated_at = ${SQL_NOW} WHERE id = ?`,
      [version.title, JSON.stringify(version.content), version.material_id]
    );
  });
  return version.material_id;
}

// ── Students & observations ───────────────────────────────────────────────────

export interface StudentRow {
  id: number;
  name: string;
  cohort: string;
  subject: string;
  grade_band: string;
  note: string;
  archived: number;
  created_at: string;
}

export interface ObservationRow {
  id: number;
  student_id: number;
  skill: string;
  rating: number;
  note: string;
  context: string;
  observed_on: string;
  role: string;
  created_at: string;
}

export async function listStudents(
  scope: Scope,
  includeArchived = false
): Promise<StudentRow[]> {
  return all<StudentRow>(
    `SELECT * FROM students
      WHERE org_id = ?${includeArchived ? "" : " AND archived = 0"}
      ORDER BY cohort, name`,
    [scope.orgId]
  );
}

export async function getStudent(
  scope: Scope,
  id: number
): Promise<StudentRow | null> {
  return (
    (await one<StudentRow>(
      "SELECT * FROM students WHERE id = ? AND org_id = ?",
      [id, scope.orgId]
    )) ?? null
  );
}

export async function createStudent(
  scope: Scope,
  args: {
    name: string;
    cohort: string;
    subject: string;
    gradeBand: string;
    note: string;
  }
): Promise<number> {
  return insert(
    "INSERT INTO students (org_id, name, cohort, subject, grade_band, note) VALUES (?, ?, ?, ?, ?, ?)",
    [
      scope.orgId,
      args.name,
      args.cohort,
      args.subject,
      args.gradeBand,
      args.note,
    ]
  );
}

/** Roster maintenance is archive-not-delete: the observation log stays intact. */
export async function setStudentArchived(
  scope: Scope,
  id: number,
  archived: boolean
): Promise<void> {
  await run("UPDATE students SET archived = ? WHERE id = ? AND org_id = ?", [
    archived ? 1 : 0,
    id,
    scope.orgId,
  ]);
}

/* Observations carry no org_id of their own — they reach one through the student
   they belong to. That is the schema's rule for every child table: one source of
   truth per row, paid for with a join. A copy of org_id here would be faster and
   would eventually disagree with the student's, and the disagreement would be
   invisible. */
export async function listObservations(
  scope: Scope,
  studentId: number
): Promise<ObservationRow[]> {
  return all<ObservationRow>(
    `SELECT o.* FROM observations o
       JOIN students s ON s.id = o.student_id
      WHERE o.student_id = ? AND s.org_id = ?
      ORDER BY o.observed_on DESC, o.id DESC`,
    [studentId, scope.orgId]
  );
}

/** Every observation across the roster — powers cohort-level views. */
export async function listAllObservations(
  scope: Scope
): Promise<ObservationRow[]> {
  return all<ObservationRow>(
    `SELECT o.* FROM observations o
       JOIN students s ON s.id = o.student_id
      WHERE s.org_id = ?
      ORDER BY o.observed_on DESC, o.id DESC`,
    [scope.orgId]
  );
}

export async function logObservation(args: {
  studentId: number;
  skill: string;
  rating: number;
  note: string;
  context: string;
  observedOn: string;
  role: string;
}): Promise<number> {
  return insert(
    `INSERT INTO observations (student_id, skill, rating, note, context, observed_on, role)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      args.studentId,
      args.skill,
      args.rating,
      args.note,
      args.context,
      args.observedOn,
      args.role,
    ]
  );
}

export async function listRounds(scope: Scope): Promise<RoundRow[]> {
  return all<RoundRow>("SELECT * FROM rounds WHERE org_id = ? ORDER BY id DESC", [
    scope.orgId,
  ]);
}

export async function getRound(
  scope: Scope,
  id: number
): Promise<RoundRow | null> {
  return (
    (await one<RoundRow>("SELECT * FROM rounds WHERE id = ? AND org_id = ?", [
      id,
      scope.orgId,
    ])) ?? null
  );
}

export async function deleteRound(scope: Scope, id: number): Promise<void> {
  await transaction(async () => {
    /* The child delete is scoped THROUGH its parent rather than trusted to
       follow it. Deleting submissions by round_id alone and the round by
       (id, org_id) would, for a mismatched org, wipe another tenant's ballots
       and then correctly decline to delete the round they belonged to — the
       worst of both answers. */
    await run(
      `DELETE FROM ballot_submissions
        WHERE round_id IN (SELECT id FROM rounds WHERE id = ? AND org_id = ?)`,
      [id, scope.orgId]
    );
    await run("DELETE FROM rounds WHERE id = ? AND org_id = ?", [
      id,
      scope.orgId,
    ]);
  });
}

function parseSubmission(r: Record<string, unknown>): SubmissionRow {
  return {
    ...(r as object),
    scores: JSON.parse(r.scores as string),
    speaker_points: JSON.parse(r.speaker_points as string),
    rfd: JSON.parse(r.rfd as string),
    feedback: JSON.parse(r.feedback as string),
  } as SubmissionRow;
}

export async function submitBallot(
  scope: Scope,
  args: {
    roundId: number;
    judgeName: string;
    role: string;
    winner: string;
    scores: unknown;
    speakerPoints: unknown;
    rfd: unknown;
    feedback: unknown;
    secondsTaken: number;
  }
): Promise<number> {
  const submissionId = await insert(
    `INSERT INTO ballot_submissions (round_id, judge_name, role, winner, scores, speaker_points, rfd, feedback, seconds_taken)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      args.roundId,
      args.judgeName,
      args.role,
      args.winner,
      JSON.stringify(args.scores ?? {}),
      JSON.stringify(args.speakerPoints ?? {}),
      JSON.stringify(args.rfd ?? {}),
      JSON.stringify(args.feedback ?? {}),
      args.secondsTaken,
    ]
  );
  // A judge who scored "Refutation 7/10" has already made the observation —
  // asking them to re-enter it in a progress tracker is how trackers stay empty.
  await attributeBallotToStudents(scope, args.roundId, submissionId, args);
  return submissionId;
}

/**
 * Fan a submitted ballot out into per-student observations, for whichever sides
 * of the round are linked to a student. Silent no-op when the round has no
 * roster links — judging must never fail because of a bookkeeping gap.
 *
 * Each judge on a panel contributes their own observations, deliberately: three
 * judges scoring the same speaker is three data points, and the profile averages
 * them rather than trusting one opinion.
 */
async function attributeBallotToStudents(
  scope: Scope,
  roundId: number,
  submissionId: number,
  args: {
    winner: string;
    scores: unknown;
    speakerPoints: unknown;
    judgeName: string;
  }
) {
  const round = await getRound(scope, roundId);
  if (!round) return;
  const links: ["pro" | "con", number | null][] = [
    ["pro", round.pro_student_id ?? null],
    ["con", round.con_student_id ?? null],
  ];
  if (!links.some(([, id]) => id)) return;

  const ballot = (await getMaterial(scope, round.ballot_id))?.content as
    | {
        criteria?: { name: string; maxPoints: number }[];
        speakerPoints?: { min: number; max: number };
      }
    | undefined;
  if (!ballot?.criteria?.length) return;

  const scores = (args.scores ?? {}) as Record<
    string,
    { pro?: number; con?: number }
  >;
  const speaker = (args.speakerPoints ?? {}) as { pro?: number; con?: number };

  for (const [side, studentId] of links) {
    if (!studentId) continue;
    const derived = observationsFromBallot({
      criteria: ballot.criteria,
      scores,
      side,
      speakerPoints: speaker,
      speakerRange: ballot.speakerPoints,
      won: args.winner === side,
    });
    for (const o of derived) {
      await logObservation({
        studentId,
        skill: o.skill,
        rating: o.rating,
        note: o.note,
        context: `${round.label}${args.judgeName ? ` · judged by ${args.judgeName}` : ""} · ballot #${submissionId}`,
        observedOn: round.held_on || new Date().toISOString().slice(0, 10),
        role: "judge",
      });
    }
  }
}

/* Ballots reach their organization through the round they were cast in — the
   same child-table rule the observations follow. */
export async function listSubmissions(
  scope: Scope,
  roundId: number
): Promise<SubmissionRow[]> {
  const rows = await all(
    `SELECT b.* FROM ballot_submissions b
       JOIN rounds r ON r.id = b.round_id
      WHERE b.round_id = ? AND r.org_id = ?
      ORDER BY b.id`,
    [roundId, scope.orgId]
  );
  return rows.map(parseSubmission);
}

export async function listAllSubmissions(
  scope: Scope
): Promise<SubmissionRow[]> {
  const rows = await all(
    `SELECT b.* FROM ballot_submissions b
       JOIN rounds r ON r.id = b.round_id
      WHERE r.org_id = ?
      ORDER BY b.id DESC`,
    [scope.orgId]
  );
  return rows.map(parseSubmission);
}

export async function countSubmissions(
  scope: Scope,
  roundId: number
): Promise<number> {
  const r = await one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ballot_submissions b
       JOIN rounds r ON r.id = b.round_id
      WHERE b.round_id = ? AND r.org_id = ?`,
    [roundId, scope.orgId]
  );
  return r!.n;
}

function parseCorrection(r: Record<string, unknown>): CorrectionRow {
  return {
    ...(r as object),
    tags: JSON.parse(r.tags as string),
  } as CorrectionRow;
}

/**
 * Log a correction captured from an author's hand-edit (an AI section rewrite
 * with a steering instruction), tagged into the same controlled vocabulary as
 * review rejections. Stored with action "edit" so insights can tell the two
 * sources apart. This is the Phase-4 capture the Memory Engine learns from.
 */
export async function logEditCorrection(
  scope: Scope,
  args: {
    materialId: number;
    role: string;
    subject: string;
    type: string;
    tags: string[];
    note: string;
  }
): Promise<void> {
  await run(
    `INSERT INTO corrections (org_id, material_id, action, role, subject, type, tags, note)
     VALUES (?, ?, 'edit', ?, ?, ?, ?, ?)`,
    [
      scope.orgId,
      args.materialId,
      args.role,
      args.subject,
      args.type,
      JSON.stringify(args.tags),
      args.note,
    ]
  );
}

/* Corrections are a ROOT table despite carrying a material_id: the material can
   go away (ON DELETE SET NULL) and the correction outlives it, so it cannot
   reach an organization by joining and holds its own org_id. */
export async function listCorrections(scope: Scope): Promise<CorrectionRow[]> {
  const rows = await all(
    "SELECT * FROM corrections WHERE org_id = ? ORDER BY id DESC",
    [scope.orgId]
  );
  return rows.map(parseCorrection);
}

export async function listCorrectionsFor(
  scope: Scope,
  materialId: number
): Promise<CorrectionRow[]> {
  const rows = await all(
    "SELECT * FROM corrections WHERE material_id = ? AND org_id = ? ORDER BY id DESC",
    [materialId, scope.orgId]
  );
  return rows.map(parseCorrection);
}

export async function saveChecklistRun(
  materialId: number,
  passed: boolean,
  results: unknown
): Promise<void> {
  await run(
    "INSERT INTO checklist_runs (material_id, passed, results) VALUES (?, ?, ?)",
    [materialId, passed ? 1 : 0, JSON.stringify(results)]
  );
}

function parseKit(r: Record<string, unknown>): StyleKitRow {
  return {
    ...(r as object),
    // re-parse so kits saved under older shapes gain newly added rule fields
    config: parseKitConfig(JSON.parse(r.config as string)),
    locked_fields: JSON.parse(r.locked_fields as string),
  } as StyleKitRow;
}

export async function listStyleKits(scope: Scope): Promise<StyleKitRow[]> {
  const rows = await all(
    "SELECT * FROM style_kits WHERE org_id = ? ORDER BY is_default DESC, name",
    [scope.orgId]
  );
  return rows.map(parseKit);
}

export async function getStyleKit(
  scope: Scope,
  id: number
): Promise<StyleKitRow | null> {
  const r = await one("SELECT * FROM style_kits WHERE id = ? AND org_id = ?", [
    id,
    scope.orgId,
  ]);
  return r ? parseKit(r) : null;
}

/** The kit a material should render with, falling back to the org's default. */
export async function getKitForMaterial(
  scope: Scope,
  styleKitId: number
): Promise<StyleKitRow | null> {
  const exact = await getStyleKit(scope, styleKitId);
  const kit = exact ?? (await listStyleKits(scope)).find((k) => k.is_default === 1);
  return kit ? rebrandUntouched(kit, scope.orgName) : null;
}

/**
 * Put the school's name on a kit that still carries the product's.
 *
 * New organizations are seeded correctly (see createDefaultStyleKit), but every
 * kit created before that shipped says "TAKENTEACH" on the footer of every
 * printed page. Rather than a one-shot data migration — this project has no
 * data-migration mechanism, only idempotent DDL — the substitution happens on
 * read, and ONLY while the value is still untouched. The moment a teacher edits
 * the brand, `brand !== DEFAULT_KIT.brand` and their choice is left alone
 * forever after; this can never overwrite an edit.
 */
function rebrandUntouched(kit: StyleKitRow, orgName?: string): StyleKitRow {
  const school = (orgName ?? "").trim();
  if (!school) return kit;
  const untouched =
    kit.config.brand === DEFAULT_KIT.brand &&
    kit.config.footerText === DEFAULT_KIT.footerText;
  if (!untouched) return kit;
  return { ...kit, config: brandedKit(kit.config, school) };
}

export async function createStyleKit(
  scope: Scope,
  name: string,
  config: StyleKitConfig,
  lockedFields: string[]
): Promise<number> {
  return insert(
    "INSERT INTO style_kits (org_id, name, config, locked_fields, is_default) VALUES (?, ?, ?, ?, 0)",
    [scope.orgId, name, JSON.stringify(config), JSON.stringify(lockedFields)]
  );
}

export async function updateStyleKit(
  scope: Scope,
  id: number,
  name: string,
  config: StyleKitConfig,
  lockedFields: string[]
): Promise<void> {
  await run(
    "UPDATE style_kits SET name = ?, config = ?, locked_fields = ? WHERE id = ? AND org_id = ?",
    [
      name,
      JSON.stringify(config),
      JSON.stringify(lockedFields),
      id,
      scope.orgId,
    ]
  );
}

/**
 * Exactly one kit is the default — PER ORGANIZATION.
 *
 * The demote used to be `UPDATE style_kits SET is_default = 0` with no WHERE at
 * all, which was correct while the installation was one academy and becomes a
 * cross-tenant write the moment it is not: one school promoting a kit would
 * clear the default flag for every school on the platform, and the next teacher
 * anywhere to open the builder would find no kit selected. It is the clearest
 * example of why "SELECT * with no org" is not a style problem.
 */
export async function setDefaultStyleKit(
  scope: Scope,
  id: number
): Promise<void> {
  await transaction(async () => {
    await run("UPDATE style_kits SET is_default = 0 WHERE org_id = ?", [
      scope.orgId,
    ]);
    await run(
      "UPDATE style_kits SET is_default = 1 WHERE id = ? AND org_id = ?",
      [id, scope.orgId]
    );
  });
}

export async function countMaterialsUsingKit(
  scope: Scope,
  id: number
): Promise<number> {
  const row = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM materials WHERE style_kit_id = ? AND org_id = ?",
    [id, scope.orgId]
  );
  return row!.n;
}

export async function deleteStyleKit(scope: Scope, id: number): Promise<void> {
  await run("DELETE FROM style_kits WHERE id = ? AND org_id = ?", [
    id,
    scope.orgId,
  ]);
}
