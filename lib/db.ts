import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
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
 * SQLite data layer. One materials table holds every content type as typed
 * JSON (Phase 1: only "lesson-pack"); style kits and an activity log ride
 * alongside. The activity log doubles as groundwork for Phase 4 correction
 * capture — rejections store a tagged reason.
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

/**
 * Where the database lives.
 *
 * Overridable by env so a test can open a throwaway file instead of the real
 * library — the tenant-isolation test needs two organizations with content in
 * each, which is not something to create in the founder's actual database. It
 * is also what a deployment will need the day the data directory is not
 * alongside the code.
 */
const DB_PATH =
  process.env.TAKENTEACH_DB ?? path.join(process.cwd(), "data", "ascent.db");
const DB_DIR = path.dirname(DB_PATH);

declare global {
  var __ascentDb: Database.Database | undefined;
}

/**
 * The identity tables — see docs/SAAS-FOUNDATION.md.
 *
 * Hoisted out of createDb() and executed BEFORE the content schema, because the
 * content tables now carry foreign keys into organizations and users.
 */
const IDENTITY_SCHEMA = `
  /* ══════════════════════════════════════════════════════════════════════
     IDENTITY — phase 1 of docs/SAAS-FOUNDATION.md
     ══════════════════════════════════════════════════════════════════════
     Everything above this line was built for ONE academy: no row has an
     owner, and every list query is an unfiltered SELECT *. These five tables
     add the people. Attaching the content to them — org_id on materials,
     students, kits and the rest, and scoping every query — is phase 2, and
     nothing above is touched until then, so the app keeps working throughout.

     Written Postgres-shaped on purpose (decision 2): no column type, default
     or constraint here is anything Postgres cannot express, so the eventual
     move off SQLite is a driver swap rather than a redesign. datetime('now')
     is UTC and matches the TEXT timestamps the rest of the schema already uses.

     (No backticks in the comments below — this whole block is a JS template
     literal, and one stray backtick ends the string thirty lines early.)

     Every table below states its ON DELETE, because foreign keys ARE enforced
     on this connection — see migrateCorrectionsFk() for what it costs to
     discover that later. */

  /* Every user has one of these, always (decision 1). A solo teacher gets a
     personal org rather than a null org_id, which is what lets org_id be NOT
     NULL on every table in phase 2 — one scoping rule with no exception
     branch, instead of a "what if there is no org" case at every call site. */
  CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'individual',   -- 'school' | 'individual'
    location TEXT NOT NULL DEFAULT '',
    size_band TEXT NOT NULL DEFAULT '',
    plan TEXT NOT NULL DEFAULT 'free',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  /* platform_role lives HERE and not on memberships, deliberately: being a
     super admin is a fact about the platform, not a membership in any one
     school, and putting it on memberships would make it grantable by a school
     admin editing their own org's rows. */
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,                -- stored lowercased + trimmed
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    platform_role TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'super_admin'
    /* set on a seeded or reset account: the DAL refuses everything except the
       change-password screen while this is 1, so a printed one-time password
       cannot become a permanent one. */
    must_change_password INTEGER NOT NULL DEFAULT 0,
    email_verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  /* The join, carrying BOTH the role and the approval state — which is why it
     is a table and not an org_id column on users. A teacher awaiting a
     school's approval, a teacher who was rejected, and a teacher who has left
     are three different rows here and would be three nullable columns there. */
  CREATE TABLE IF NOT EXISTS memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- owner | admin | coach | teacher | assistant  (see lib/workflow.ts)
    org_role TEXT NOT NULL DEFAULT 'teacher',
    -- invited | pending | active | suspended | rejected
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    approved_at TEXT,
    /* SET NULL, not CASCADE: the fact that a membership was approved outlives
       the admin who approved it, exactly as a correction outlives the material
       it was written about. */
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (user_id, org_id)
  );

  /* Sessions are database rows, not signed tokens. That buys the one thing a
     JWT cannot: revocation. Logging out, suspending a member or resetting a
     password can end a session immediately, and "remember me" is just a longer
     expires_at rather than a second mechanism to get wrong.

     The cookie carries an opaque random token; only its SHA-256 is stored, so
     a leaked database backup does not hand over live sessions. */
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    /* Which org this session is acting in. A user with two memberships —
       their own workspace and a school — must have exactly one answer to
       "which org does this new lesson belong to", and this is it. */
    active_org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    user_agent TEXT NOT NULL DEFAULT ''
  );

  /* Same hashed-token shape as sessions, and for the same reason: a reset link
     in an inbox is a credential. used_at rather than a delete, so a link
     that has already been spent is distinguishable from one that never
     existed — the difference between "this link was already used" and a
     silent failure. */
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;
function createDb(): Database.Database {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  /* IDENTITY FIRST, in its own statement, because the content tables now carry
     foreign keys INTO it. SQLite resolves a REFERENCES target lazily — it will
     happily create a table pointing at one that does not exist and only fail on
     the first insert — so declaration order is not enforced for us. Getting it
     right here means the schema reads in dependency order and a fresh database
     fails loudly at creation rather than at the first signup. */
  db.exec(IDENTITY_SCHEMA);

  db.exec(`
    /* ── TENANCY ──────────────────────────────────────────────────────────
       org_id appears on the five ROOT tables only — materials, style_kits,
       students, rounds, corrections. Everything else (activity_log,
       checklist_runs, material_versions, observations, ballot_submissions)
       reaches its organization by joining its parent.

       That is a deliberate choice against denormalising org_id everywhere. A
       copy of the org on a child row is a second source of truth, and the day
       the two disagree the disagreement is invisible and the wrong one wins.
       A join costs an indexed lookup; drift costs a cross-tenant read.

       NOTE ON THE MIGRATED DATABASE. These definitions apply to a database
       created from scratch. SQLite cannot ADD COLUMN with both NOT NULL and a
       REFERENCES clause, so the existing database gets a physically nullable
       org_id from migrateTenancy() below, backfilled in the same transaction
       that adds it. The gap is closed by assertNoOrphans() at startup, which
       refuses to open a database containing a single unowned row — a louder
       guarantee than the constraint would have been, and it covers every table
       at once. The real constraint arrives with the move to Postgres. */
    /* Organization → Department → Teachers → Lessons. Declared before materials
       because materials references it. The table exists now so the shape is
       settled and materials.department_id has something to point at; nothing
       manages departments yet, which is why every material's is null. */
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS style_kits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL REFERENCES organizations(id),
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      locked_fields TEXT NOT NULL DEFAULT '[]',
      is_default INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL REFERENCES organizations(id),
      /* Who made it. Nullable and ON DELETE SET NULL on purpose: a lesson
         outlives the teacher who left, exactly as a correction outlives the
         material it was written about. Deleting a person must not delete the
         department's curriculum. */
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      /* private | organization | shared. The default is organization, NOT
         private: the entire premise is one house style across a department,
         and a default nobody can see makes a shared library that fills up
         with invisible work. */
      visibility TEXT NOT NULL DEFAULT 'organization',
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      student_level TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'lesson-pack',
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      style_kit_id INTEGER NOT NULL REFERENCES style_kits(id),
      content TEXT NOT NULL,
      created_by_role TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL REFERENCES materials(id),
      role TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS checklist_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL REFERENCES materials(id),
      passed INTEGER NOT NULL,
      results TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL REFERENCES organizations(id),
      ballot_id INTEGER NOT NULL REFERENCES materials(id),
      label TEXT NOT NULL,
      resolution TEXT NOT NULL DEFAULT '',
      pro_team TEXT NOT NULL DEFAULT '',
      con_team TEXT NOT NULL DEFAULT '',
      room TEXT NOT NULL DEFAULT '',
      held_on TEXT NOT NULL DEFAULT '',
      created_by_role TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ballot_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL REFERENCES rounds(id),
      judge_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL,
      winner TEXT NOT NULL,
      scores TEXT NOT NULL DEFAULT '{}',
      speaker_points TEXT NOT NULL DEFAULT '{}',
      rfd TEXT NOT NULL DEFAULT '{}',
      feedback TEXT NOT NULL DEFAULT '{}',
      seconds_taken INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    /* Every AI mutation overwrites the pack in place. A snapshot is taken BEFORE
       each one, so a regeneration that made a page worse is one click away from
       being undone — the difference between a teacher trusting the AI buttons
       and avoiding them. */
    CREATE TABLE IF NOT EXISTS material_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL REFERENCES materials(id),
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      /* what was about to happen when this snapshot was taken */
      label TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_versions_material
      ON material_versions (material_id, id DESC);
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL REFERENCES organizations(id),
      name TEXT NOT NULL,
      cohort TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT 'debate',
      grade_band TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    /* One tap = one row. Progress is computed from this log rather than from a
       separate assessment ritual nobody has time to run. */
    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      skill TEXT NOT NULL,
      rating INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      context TEXT NOT NULL DEFAULT '',
      observed_on TEXT NOT NULL DEFAULT (date('now')),
      role TEXT NOT NULL DEFAULT 'teacher',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    /* A root table despite the material_id: a correction outlives the pack it
       was written about (material_id goes NULL), so it cannot reach its
       organization by joining and needs its own. */
    CREATE TABLE IF NOT EXISTS corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL REFERENCES organizations(id),
      material_id INTEGER NOT NULL REFERENCES materials(id),
      action TEXT NOT NULL,
      role TEXT NOT NULL,
      subject TEXT NOT NULL,
      type TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

  `);

  // migration: subject column (added when the Critical Thinking / Writing tracks landed)
  const cols = db.prepare("PRAGMA table_info(materials)").all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === "subject")) {
    db.exec(
      "ALTER TABLE materials ADD COLUMN subject TEXT NOT NULL DEFAULT 'debate'"
    );
  }
  // migration: which student debated each side (added with the student model).
  // The link lives on the ROUND, not the submission: who debated is a fact about
  // the round, and three judges of the same round must not each re-declare it.
  const roundCols = db.prepare("PRAGMA table_info(rounds)").all() as {
    name: string;
  }[];
  if (!roundCols.some((c) => c.name === "pro_student_id")) {
    db.exec("ALTER TABLE rounds ADD COLUMN pro_student_id INTEGER");
  }
  if (!roundCols.some((c) => c.name === "con_student_id")) {
    db.exec("ALTER TABLE rounds ADD COLUMN con_student_id INTEGER");
  }

  // migration: fork lineage (added with Remix/Fork)
  if (!cols.some((c) => c.name === "forked_from")) {
    db.exec("ALTER TABLE materials ADD COLUMN forked_from INTEGER");
  }
  if (!cols.some((c) => c.name === "inherited_outline")) {
    db.exec("ALTER TABLE materials ADD COLUMN inherited_outline TEXT");
  }

  migrateCorrectionsFk(db);
  migrateTenancy(db);
  createIndexes(db);
  assertNoOrphans(db);
  return db;
}

/** The content tables that carry their own org_id. Children reach theirs by join. */
const TENANT_TABLES = [
  "materials",
  "style_kits",
  "students",
  "rounds",
  "corrections",
] as const;

/**
 * Give every existing row an organization.
 *
 * This is phase 2 of docs/SAAS-FOUNDATION.md landing on a database that was
 * built for one academy. Before it runs, no row anywhere has an owner and every
 * list query is an unfiltered SELECT *; after it, org_id is the thing every
 * query filters on.
 *
 * WHY THE COLUMN IS NULLABLE HERE AND NOT NULL IN THE CREATE TABLE ABOVE.
 * SQLite's ALTER TABLE ADD COLUMN cannot do both NOT NULL and REFERENCES: a
 * NOT NULL column needs a non-null default, and a column with a REFERENCES
 * clause must default to NULL. You can have the constraint or the foreign key,
 * not both, and choosing between them is choosing which safety net to drop.
 *
 * So the migrated database gets neither, and the guarantee is bought a
 * different way: the backfill happens in the SAME TRANSACTION as the ADD
 * COLUMN, so there is no instant at which a row exists without an org, and
 * assertNoOrphans() refuses to open a database in which one ever appears. That
 * covers all five tables in one check, which the per-column constraint would
 * not have. A fresh database gets the strict definition; this one catches up
 * when the schema moves to Postgres, where the constraint can simply be added.
 *
 * THE ORG EVERYTHING LANDS IN is the first school in the table — Ascent
 * Academy, created by scripts/seed-ascent.mjs. If there is no organization at
 * all the migration does not run: an empty database has nothing to backfill,
 * and inventing an organization to own nothing would leave a phantom in the
 * switcher of whoever signs up first.
 */
function migrateTenancy(db: Database.Database) {
  const has = (table: string, column: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
      (c) => c.name === column
    );

  const pending = TENANT_TABLES.filter((t) => !has(t, "org_id"));
  const extras: [string, string, string][] = [
    ["materials", "created_by", "INTEGER"],
    ["materials", "visibility", "TEXT NOT NULL DEFAULT 'organization'"],
    ["materials", "department_id", "INTEGER"],
    ["materials", "student_level", "TEXT NOT NULL DEFAULT ''"],
  ];
  const pendingExtras = extras.filter(([t, c]) => !has(t, c));
  if (pending.length === 0 && pendingExtras.length === 0) return;

  const legacyOrg = db
    .prepare("SELECT id FROM organizations ORDER BY id LIMIT 1")
    .get() as { id: number } | undefined;

  db.transaction(() => {
    for (const [table, column, type] of pendingExtras) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
    for (const table of pending) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN org_id INTEGER`);
      if (legacyOrg) {
        db.prepare(`UPDATE ${table} SET org_id = ? WHERE org_id IS NULL`).run(
          legacyOrg.id
        );
      }
    }
    /* The founder owns what the founder built. Every existing material predates
       accounts, so `created_by_role` is the only evidence of authorship there
       is — and it says "founder" or "teacher", not who. Attributing them to the
       organization's owner is the one answer that is defensible: it is right
       for the packs the founder built, and for the rest it names the person
       who is accountable for them rather than inventing a teacher. */
    if (legacyOrg && pendingExtras.some(([, c]) => c === "created_by")) {
      const owner = db
        .prepare(
          `SELECT user_id FROM memberships
            WHERE org_id = ? AND org_role = 'owner' AND status = 'active'
            ORDER BY id LIMIT 1`
        )
        .get(legacyOrg.id) as { user_id: number } | undefined;
      if (owner) {
        db.prepare(
          "UPDATE materials SET created_by = ? WHERE created_by IS NULL"
        ).run(owner.user_id);
      }
    }
  })();
}

/**
 * Refuse to open a database containing content nobody owns.
 *
 * This is the constraint the migrated schema could not express, moved to the
 * one place that can enforce it across every table at once. It runs on every
 * boot and costs five indexed counts on a table that is empty in the normal
 * case.
 *
 * It THROWS rather than logging. A row with no org_id is invisible to every
 * scoped query — it would not leak, it would simply vanish — and a silent
 * disappearance of a teacher's work is a worse failure than a server that
 * refuses to start and says exactly which table is wrong.
 */
function assertNoOrphans(db: Database.Database) {
  // Nothing to own anything yet: a brand-new database before the first signup.
  const orgs = db.prepare("SELECT COUNT(*) AS n FROM organizations").get() as {
    n: number;
  };
  if (orgs.n === 0) return;

  for (const table of TENANT_TABLES) {
    const { n } = db
      .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE org_id IS NULL`)
      .get() as { n: number };
    if (n > 0) {
      throw new Error(
        `${table} has ${n} row(s) with no org_id. Every row must belong to an ` +
          `organization — see migrateTenancy() in lib/db.ts. Refusing to start ` +
          `rather than serve a library with invisible lessons in it.`
      );
    }
  }
}

/**
 * A correction has to outlive the material it was written about.
 *
 * `corrections.material_id` was `NOT NULL REFERENCES materials(id)`, and
 * foreign keys ARE enforced (better-sqlite3 turns them on per connection). That
 * left deletion with only two options, both wrong: refuse to delete any pack
 * that had ever been sent back, or delete its corrections along with it. The
 * second quietly guts the Phase-4 mechanic — `recurringCorrectionGuidance`
 * aggregates by subject and tag, never by material, so a correction keeps all of
 * its value after the draft it came from is gone. Discarding a lesson is not the
 * same as unlearning what was wrong with it.
 *
 * SQLite can't alter a foreign key in place, so this is the standard
 * rebuild-and-rename, run once and guarded by the column's own nullability.
 */
function migrateCorrectionsFk(db: Database.Database) {
  const cols = db.prepare("PRAGMA table_info(corrections)").all() as {
    name: string;
    notnull: number;
  }[];
  const materialId = cols.find((c) => c.name === "material_id");
  if (!materialId || materialId.notnull === 0) return; // already migrated

  // Foreign keys must be off to swap a table out from under its references, and
  // the toggle cannot happen inside a transaction — hence the ordering here.
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE corrections_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          role TEXT NOT NULL,
          subject TEXT NOT NULL,
          type TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO corrections_new (id, material_id, action, role, subject, type, tags, note, created_at)
          SELECT id, material_id, action, role, subject, type, tags, note, created_at FROM corrections;
        DROP TABLE corrections;
        ALTER TABLE corrections_new RENAME TO corrections;
      `);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

/**
 * Indexes for the predicates the app actually queries on.
 *
 * Every one of these backs a filter that ran as a full scan: the material page
 * reads its own activity and corrections, the student profile reads its own
 * observations, a round reads its own ballots, and deletion counts forks. At
 * thirteen materials none of it is measurable; the point is that none of it
 * degrades as the library fills up, which is the whole premise of a Library and
 * Search module.
 */
function createIndexes(db: Database.Database) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_activity_material    ON activity_log (material_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_checklist_material   ON checklist_runs (material_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_corrections_material ON corrections (material_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_observations_student ON observations (student_id, observed_on DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_submissions_round    ON ballot_submissions (round_id, id);
    CREATE INDEX IF NOT EXISTS idx_materials_forked     ON materials (forked_from);
    /* Identity. users.email and organizations.slug are UNIQUE and index
       themselves; these cover the three lookups the auth paths actually make —
       a user's memberships on every request, an org's roster for the admin
       screens, and a user's live sessions when a password change has to end
       them all. */
    /* TENANCY. Every content query now opens with org_id, so every content
       table needs it leading an index or the scoping we just added turns each
       list into a full scan that filters afterwards — the right answer computed
       the wrong way. The materials index carries the sort column too, so the
       library's default "most recent first" is served straight from it. */
    CREATE INDEX IF NOT EXISTS idx_materials_org        ON materials (org_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_kits_org             ON style_kits (org_id, is_default DESC, name);
    CREATE INDEX IF NOT EXISTS idx_students_org         ON students (org_id, cohort, name);
    CREATE INDEX IF NOT EXISTS idx_rounds_org           ON rounds (org_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_corrections_org      ON corrections (org_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_departments_org      ON departments (org_id, name);
    CREATE INDEX IF NOT EXISTS idx_memberships_user     ON memberships (user_id, status);
    CREATE INDEX IF NOT EXISTS idx_memberships_org      ON memberships (org_id, status);
    CREATE INDEX IF NOT EXISTS idx_sessions_user        ON sessions (user_id);
    CREATE INDEX IF NOT EXISTS idx_materials_kit        ON materials (style_kit_id);
    /* the sibling/exemplar lookups, which filter on all three together */
    CREATE INDEX IF NOT EXISTS idx_materials_lookup     ON materials (subject, type, status);
  `);
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
export function createDefaultStyleKit(orgId: number, name?: string): number {
  const info = getDb()
    .prepare(
      `INSERT INTO style_kits (org_id, name, config, locked_fields, is_default)
       VALUES (?, ?, ?, ?, 1)`
    )
    .run(
      orgId,
      name ?? "House Style",
      JSON.stringify(DEFAULT_KIT),
      JSON.stringify(["palette", "fonts", "rules"])
    );
  return Number(info.lastInsertRowid);
}

export function getDb(): Database.Database {
  if (!globalThis.__ascentDb) {
    globalThis.__ascentDb = createDb();
  }
  return globalThis.__ascentDb;
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

export function listMaterials(scope: Scope): MaterialRow[] {
  const v = visibleTo(scope);
  return (
    getDb()
      .prepare(
        `SELECT * FROM materials WHERE ${v.sql} ORDER BY updated_at DESC`
      )
      .all(...v.params) as Record<string, unknown>[]
  ).map(parseMaterial);
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
export function getMaterial(scope: Scope, id: number): MaterialRow | null {
  const v = visibleTo(scope);
  const row = getDb()
    .prepare(`SELECT * FROM materials WHERE id = ? AND ${v.sql}`)
    .get(id, ...v.params) as Record<string, unknown> | undefined;
  return row ? parseMaterial(row) : null;
}

export function createMaterial(
  scope: Scope,
  title: string,
  styleKitId: number,
  content: AnyContent,
  role: Role,
  subject: Subject = "debate",
  lineage?: { forkedFrom: number; inheritedOutline?: unknown },
  type: string = "lesson-pack"
): number {
  const info = getDb()
    .prepare(
      `INSERT INTO materials (org_id, created_by, type, subject, title, status, style_kit_id, content, created_by_role, forked_from, inherited_outline)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`
    )
    .run(
      scope.orgId,
      scope.userId,
      type,
      subject,
      title,
      styleKitId,
      JSON.stringify(content),
      role,
      lineage?.forkedFrom ?? null,
      lineage?.inheritedOutline ? JSON.stringify(lineage.inheritedOutline) : null
    );
  logActivity(Number(info.lastInsertRowid), role, "create", title);
  return Number(info.lastInsertRowid);
}

/**
 * Sibling lessons in the same series — what has already been taught. Feeds
 * generation (so a new lesson doesn't repeat earlier ones) and the uniqueness
 * report. Series match is case/whitespace-insensitive; blank series has no
 * siblings.
 */
export function listSeriesSiblings(
  scope: Scope,
  subject: string,
  series: string,
  excludeId: number
): MaterialRow[] {
  const key = series.trim().toLowerCase();
  if (!key) return [];
  // Filtered in SQL, including the series that lives inside the content JSON.
  // This used to call listMaterials(), which reads every row and runs the full
  // zod content schema over each one — including the design stylesheet — just to
  // compare three fields. Generation calls this on every build, so the cost of
  // planning one lesson grew with the size of the whole library.
  return (
    getDb()
      .prepare(
        `SELECT * FROM materials
          WHERE org_id = ? AND subject = ? AND type = 'lesson-pack' AND id != ?
            AND lower(trim(COALESCE(json_extract(content, '$.series'), ''))) = ?
          ORDER BY updated_at DESC`
      )
      .all(scope.orgId, subject, excludeId, key) as Record<string, unknown>[]
  ).map(parseMaterial);
}

/**
 * Retrieval grounding for Quick Build: the most recently published pack of the
 * same subject serves as the exemplar the AI drafts against (Memory Engine v0
 * — the corpus grows as more lessons get published).
 */
export function getExemplar(
  scope: Scope,
  subject: Subject,
  type = "lesson-pack"
): MaterialRow | null {
  // The type filter is not optional. Without it this returned the most recent
  // published material of ANY type, which in a real library meant a judge
  // ballot was handed to the lesson generator as the standard to meet.
  const row = getDb()
    .prepare(
      "SELECT * FROM materials WHERE org_id = ? AND status = 'published' AND subject = ? AND type = ? ORDER BY updated_at DESC LIMIT 1"
    )
    .get(scope.orgId, subject, type) as Record<string, unknown> | undefined;
  return row ? parseMaterial(row) : null;
}

/**
 * Memory Engine v1 retrieval: the published lesson pack that most closely
 * matches what we're about to build (format / grade / rigor / skill), rather
 * than just the most recent one. Falls back to the most recent of the subject,
 * then any subject, so a fresh corpus still grounds on something.
 */
export function getBestExemplar(
  scope: Scope,
  subject: Subject,
  target: ExemplarTarget,
  excludeId: number
): MaterialRow | null {
  // Every lesson pack is a candidate; `pickExemplar` applies the eligibility
  // rule (reviewed at least as far as submission, and actually built) and ranks
  // by review tier before relevance. Restricting the SQL to published packs was
  // what emptied this pool in the first place.
  const rows = (all: boolean) =>
    (
      getDb()
        .prepare(
          all
            ? "SELECT * FROM materials WHERE org_id = ? AND type = 'lesson-pack' AND id != ?"
            : "SELECT * FROM materials WHERE org_id = ? AND type = 'lesson-pack' AND subject = ? AND id != ?"
        )
        .all(
          ...(all
            ? [scope.orgId, excludeId]
            : [scope.orgId, subject, excludeId])
        ) as Record<
        string,
        unknown
      >[]
    ).map(parseMaterial);
  // Same subject first; a cross-subject pack still sets a useful quality bar,
  // since the prompt frames an exemplar as a standard to beat, never a template.
  return pickExemplar(rows(false), target) ?? pickExemplar(rows(true), target);
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

export function updateMaterialContent(
  id: number,
  title: string,
  content: AnyContent
) {
  getDb()
    .prepare(
      "UPDATE materials SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(titleFromContent(title, content), JSON.stringify(content), id);
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
export function snapshotAndUpdate(
  id: number,
  label: string,
  role: string,
  title: string,
  content: AnyContent
) {
  const db = getDb();
  db.transaction(() => {
    snapshotMaterial(id, label, role);
    updateMaterialContent(id, title, content);
  })();
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

export function countForksOf(scope: Scope, id: number): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM materials WHERE forked_from = ? AND org_id = ?"
    )
    .get(id, scope.orgId) as { n: number };
  return row.n;
}

/**
 * How many rounds were run from this material as their ballot template.
 *
 * A round is opened from a ballot of ANY status, draft included, so a draft
 * ballot can have real judged rounds hanging off it. Without this check the
 * delete reached SQLite and came back "FOREIGN KEY constraint failed" as a bare
 * 500 — the same failure the missing version cleanup caused, wearing a different
 * table's name. Unlike versions, these must not be cascaded away: a judged round
 * is a record of something that happened in a room.
 */
export function countRoundsFrom(scope: Scope, materialId: number): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM rounds WHERE ballot_id = ? AND org_id = ?"
    )
    .get(materialId, scope.orgId) as { n: number };
  return row.n;
}

/**
 * Delete a material and everything that only exists because of it.
 *
 * Every table referencing `materials` has to be dealt with explicitly here.
 * `material_versions` was missed, and because foreign keys are enforced that
 * was not a leak but a hard failure: a snapshot row is created before every AI
 * build, so ANY pack that had ever been generated refused to delete with
 * "FOREIGN KEY constraint failed" — surfacing as a 500 with no explanation, on
 * the one action a founder takes to tidy up.
 *
 * Versions and checklist runs die with the material; they describe a document
 * that no longer exists. Corrections do not — they are dropped to a null
 * material by the schema's ON DELETE SET NULL and keep feeding the quality
 * signal. See `migrateCorrectionsFk`.
 */
export function deleteMaterial(scope: Scope, id: number) {
  const db = getDb();
  /* Each child delete is gated on the PARENT being ours, not merely on the id
     matching. Scoping only the final statement would erase another tenant's
     history and then correctly decline to delete the material it belonged to —
     a destructive no-op, which is the worst of both answers. */
  const owned =
    "material_id IN (SELECT id FROM materials WHERE id = ? AND org_id = ?)";
  db.transaction(() => {
    db.prepare("DELETE FROM activity_log WHERE " + owned).run(id, scope.orgId);
    db.prepare("DELETE FROM checklist_runs WHERE " + owned).run(id, scope.orgId);
    db.prepare("DELETE FROM material_versions WHERE " + owned).run(
      id,
      scope.orgId
    );
    db.prepare("DELETE FROM materials WHERE id = ? AND org_id = ?").run(
      id,
      scope.orgId
    );
  })();
}

export function setMaterialStyleKit(id: number, styleKitId: number) {
  getDb()
    .prepare(
      "UPDATE materials SET style_kit_id = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(styleKitId, id);
}

/**
 * Who may see this material.
 *
 * Scoped even though it is a write on a material the caller has already loaded,
 * because it is the one write that changes WHO CAN SEE something — the cost of
 * getting it wrong is a disclosure rather than a bad edit, so it re-states the
 * organization rather than inheriting the guard's word for it.
 */
export function setMaterialVisibility(
  scope: Scope,
  id: number,
  visibility: Visibility
) {
  getDb()
    .prepare(
      "UPDATE materials SET visibility = ?, updated_at = datetime('now') WHERE id = ? AND org_id = ?"
    )
    .run(visibility, id, scope.orgId);
}

export function setMaterialStatus(id: number, status: Status) {
  getDb()
    .prepare(
      "UPDATE materials SET status = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(status, id);
}

export function logActivity(
  materialId: number,
  role: string,
  action: string,
  detail = ""
) {
  getDb()
    .prepare(
      "INSERT INTO activity_log (material_id, role, action, detail) VALUES (?, ?, ?, ?)"
    )
    .run(materialId, role, action, detail);
}

export function listActivity(scope: Scope, materialId: number): ActivityRow[] {
  return getDb()
    .prepare(
      `SELECT a.* FROM activity_log a
         JOIN materials m ON m.id = a.material_id
        WHERE a.material_id = ? AND m.org_id = ?
        ORDER BY a.id DESC LIMIT 50`
    )
    .all(materialId, scope.orgId) as ActivityRow[];
}

/**
 * Apply a workflow transition atomically: status change, activity log, and
 * (for a send-back/unpublish) the structured correction record all land
 * together or not at all — no partial writes if one step fails.
 */
export function applyTransition(
  scope: Scope,
  args: {
    materialId: number;
    toStatus: Status;
    role: string;
    action: string;
    detail: string;
    correction?: { subject: string; type: string; tags: string[]; note: string };
  }
) {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      "UPDATE materials SET status = ?, updated_at = datetime('now') WHERE id = ? AND org_id = ?"
    ).run(args.toStatus, args.materialId, scope.orgId);
    db.prepare(
      "INSERT INTO activity_log (material_id, role, action, detail) VALUES (?, ?, ?, ?)"
    ).run(args.materialId, args.role, args.action, args.detail);
    if (args.correction) {
      db.prepare(
        `INSERT INTO corrections (org_id, material_id, action, role, subject, type, tags, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        scope.orgId,
        args.materialId,
        args.action,
        args.role,
        args.correction.subject,
        args.correction.type,
        JSON.stringify(args.correction.tags),
        args.correction.note
      );
    }
  })();
}

// ── Rounds & judging ─────────────────────────────────────────────────────────

export function createRound(
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
): number {
  const info = getDb()
    .prepare(
      `INSERT INTO rounds (org_id, ballot_id, label, resolution, pro_team, con_team, room, held_on, created_by_role, pro_student_id, con_student_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
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
      args.conStudentId ?? null
    );
  return Number(info.lastInsertRowid);
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
export function snapshotMaterial(id: number, label: string, role: string): number | null {
  const db = getDb();
  const row = db
    .prepare("SELECT title, content FROM materials WHERE id = ?")
    .get(id) as { title: string; content: string } | undefined;
  if (!row) return null;

  const info = db
    .prepare(
      "INSERT INTO material_versions (material_id, title, content, label, role) VALUES (?, ?, ?, ?, ?)"
    )
    .run(id, row.title, row.content, label, role);

  // keep the history bounded — old snapshots of a much-edited pack are noise
  db.prepare(
    `DELETE FROM material_versions
      WHERE material_id = ?
        AND id NOT IN (
          SELECT id FROM material_versions WHERE material_id = ? ORDER BY id DESC LIMIT ?
        )`
  ).run(id, id, VERSION_LIMIT);

  return Number(info.lastInsertRowid);
}

export function listVersions(scope: Scope, materialId: number): VersionRow[] {
  return (
    getDb()
      .prepare(
        // join the material's type: a version stores raw JSON and only the
        // material knows which schema to parse it against. The same join now
        // carries the tenancy check, so it costs nothing extra.
        `SELECT v.*, m.type AS material_type FROM material_versions v
           JOIN materials m ON m.id = v.material_id
          WHERE v.material_id = ? AND m.org_id = ? ORDER BY v.id DESC`
      )
      .all(materialId, scope.orgId) as Record<string, unknown>[]
  ).map((r) => ({
    ...(r as unknown as VersionRow),
    content: parseContent(String(r.material_type), JSON.parse(String(r.content))),
  }));
}

/**
 * A version is addressed by ITS OWN id, which makes it one of the few rows in
 * the schema a caller can reach without naming its material — so the join to
 * materials is load-bearing here rather than a convenience. Without the org
 * check, `/api/materials/1/versions` with someone else's version id would
 * happily restore another organization's lesson into yours.
 */
export function getVersion(scope: Scope, versionId: number): VersionRow | null {
  const r = getDb()
    .prepare(
      `SELECT v.*, m.type AS material_type FROM material_versions v
         JOIN materials m ON m.id = v.material_id
        WHERE v.id = ? AND m.org_id = ?`
    )
    .get(versionId, scope.orgId) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    ...(r as unknown as VersionRow),
    content: parseContent(String(r.material_type), JSON.parse(String(r.content))),
  };
}

/**
 * Put a previous version back. The current state is snapshotted first, so
 * restoring is itself undoable — a teacher who restores the wrong version must
 * not be worse off than one who never tried.
 */
export function restoreVersion(
  scope: Scope,
  versionId: number,
  role: string
): number | null {
  const version = getVersion(scope, versionId);
  if (!version) return null;
  const db = getDb();
  db.transaction(() => {
    // the UI renders "before <label>", so the label is the action itself
    snapshotMaterial(version.material_id, "a restore", role);
    // deliberately NOT updateMaterialContent: that function adopts a cover title
    // for a still-"Untitled" row, which is right for an edit and wrong here —
    // restoring means putting back exactly the title this version was saved with.
    db.prepare(
      "UPDATE materials SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(version.title, JSON.stringify(version.content), version.material_id);
  })();
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

export function listStudents(
  scope: Scope,
  includeArchived = false
): StudentRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM students
        WHERE org_id = ?${includeArchived ? "" : " AND archived = 0"}
        ORDER BY cohort, name`
    )
    .all(scope.orgId) as StudentRow[];
}

export function getStudent(scope: Scope, id: number): StudentRow | null {
  return (
    (getDb()
      .prepare("SELECT * FROM students WHERE id = ? AND org_id = ?")
      .get(id, scope.orgId) as StudentRow) ?? null
  );
}

export function createStudent(
  scope: Scope,
  args: {
    name: string;
    cohort: string;
    subject: string;
    gradeBand: string;
    note: string;
  }
): number {
  const info = getDb()
    .prepare(
      "INSERT INTO students (org_id, name, cohort, subject, grade_band, note) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      scope.orgId,
      args.name,
      args.cohort,
      args.subject,
      args.gradeBand,
      args.note
    );
  return Number(info.lastInsertRowid);
}

/** Roster maintenance is archive-not-delete: the observation log stays intact. */
export function setStudentArchived(
  scope: Scope,
  id: number,
  archived: boolean
) {
  getDb()
    .prepare("UPDATE students SET archived = ? WHERE id = ? AND org_id = ?")
    .run(archived ? 1 : 0, id, scope.orgId);
}

/* Observations carry no org_id of their own — they reach one through the student
   they belong to. That is the schema's rule for every child table: one source of
   truth per row, paid for with a join. A copy of org_id here would be faster and
   would eventually disagree with the student's, and the disagreement would be
   invisible. */
export function listObservations(
  scope: Scope,
  studentId: number
): ObservationRow[] {
  return getDb()
    .prepare(
      `SELECT o.* FROM observations o
         JOIN students s ON s.id = o.student_id
        WHERE o.student_id = ? AND s.org_id = ?
        ORDER BY o.observed_on DESC, o.id DESC`
    )
    .all(studentId, scope.orgId) as ObservationRow[];
}

/** Every observation across the roster — powers cohort-level views. */
export function listAllObservations(scope: Scope): ObservationRow[] {
  return getDb()
    .prepare(
      `SELECT o.* FROM observations o
         JOIN students s ON s.id = o.student_id
        WHERE s.org_id = ?
        ORDER BY o.observed_on DESC, o.id DESC`
    )
    .all(scope.orgId) as ObservationRow[];
}

export function logObservation(args: {
  studentId: number;
  skill: string;
  rating: number;
  note: string;
  context: string;
  observedOn: string;
  role: string;
}): number {
  const info = getDb()
    .prepare(
      `INSERT INTO observations (student_id, skill, rating, note, context, observed_on, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      args.studentId,
      args.skill,
      args.rating,
      args.note,
      args.context,
      args.observedOn,
      args.role
    );
  return Number(info.lastInsertRowid);
}

export function listRounds(scope: Scope): RoundRow[] {
  return getDb()
    .prepare("SELECT * FROM rounds WHERE org_id = ? ORDER BY id DESC")
    .all(scope.orgId) as RoundRow[];
}

export function getRound(scope: Scope, id: number): RoundRow | null {
  return (
    (getDb()
      .prepare("SELECT * FROM rounds WHERE id = ? AND org_id = ?")
      .get(id, scope.orgId) as RoundRow) ?? null
  );
}

export function deleteRound(scope: Scope, id: number) {
  const db = getDb();
  db.transaction(() => {
    /* The child delete is scoped THROUGH its parent rather than trusted to
       follow it. Deleting submissions by round_id alone and the round by
       (id, org_id) would, for a mismatched org, wipe another tenant's ballots
       and then correctly decline to delete the round they belonged to — the
       worst of both answers. */
    db.prepare(
      `DELETE FROM ballot_submissions
        WHERE round_id IN (SELECT id FROM rounds WHERE id = ? AND org_id = ?)`
    ).run(id, scope.orgId);
    db.prepare("DELETE FROM rounds WHERE id = ? AND org_id = ?").run(
      id,
      scope.orgId
    );
  })();
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

export function submitBallot(
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
}): number {
  const info = getDb()
    .prepare(
      `INSERT INTO ballot_submissions (round_id, judge_name, role, winner, scores, speaker_points, rfd, feedback, seconds_taken)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      args.roundId,
      args.judgeName,
      args.role,
      args.winner,
      JSON.stringify(args.scores ?? {}),
      JSON.stringify(args.speakerPoints ?? {}),
      JSON.stringify(args.rfd ?? {}),
      JSON.stringify(args.feedback ?? {}),
      args.secondsTaken
    );
  const submissionId = Number(info.lastInsertRowid);
  // A judge who scored "Refutation 7/10" has already made the observation —
  // asking them to re-enter it in a progress tracker is how trackers stay empty.
  attributeBallotToStudents(scope, args.roundId, submissionId, args);
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
function attributeBallotToStudents(
  scope: Scope,
  roundId: number,
  submissionId: number,
  args: { winner: string; scores: unknown; speakerPoints: unknown; judgeName: string }
) {
  const round = getRound(scope, roundId);
  if (!round) return;
  const links: [("pro" | "con"), number | null][] = [
    ["pro", round.pro_student_id ?? null],
    ["con", round.con_student_id ?? null],
  ];
  if (!links.some(([, id]) => id)) return;

  const ballot = getMaterial(scope, round.ballot_id)?.content as
    | { criteria?: { name: string; maxPoints: number }[]; speakerPoints?: { min: number; max: number } }
    | undefined;
  if (!ballot?.criteria?.length) return;

  const scores = (args.scores ?? {}) as Record<string, { pro?: number; con?: number }>;
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
      logObservation({
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
export function listSubmissions(
  scope: Scope,
  roundId: number
): SubmissionRow[] {
  return (
    getDb()
      .prepare(
        `SELECT b.* FROM ballot_submissions b
           JOIN rounds r ON r.id = b.round_id
          WHERE b.round_id = ? AND r.org_id = ?
          ORDER BY b.id`
      )
      .all(roundId, scope.orgId) as Record<string, unknown>[]
  ).map(parseSubmission);
}

export function listAllSubmissions(scope: Scope): SubmissionRow[] {
  return (
    getDb()
      .prepare(
        `SELECT b.* FROM ballot_submissions b
           JOIN rounds r ON r.id = b.round_id
          WHERE r.org_id = ?
          ORDER BY b.id DESC`
      )
      .all(scope.orgId) as Record<string, unknown>[]
  ).map(parseSubmission);
}

export function countSubmissions(scope: Scope, roundId: number): number {
  const r = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM ballot_submissions b
         JOIN rounds r ON r.id = b.round_id
        WHERE b.round_id = ? AND r.org_id = ?`
    )
    .get(roundId, scope.orgId) as { n: number };
  return r.n;
}

function parseCorrection(r: Record<string, unknown>): CorrectionRow {
  return { ...(r as object), tags: JSON.parse(r.tags as string) } as CorrectionRow;
}

/**
 * Log a correction captured from an author's hand-edit (an AI section rewrite
 * with a steering instruction), tagged into the same controlled vocabulary as
 * review rejections. Stored with action "edit" so insights can tell the two
 * sources apart. This is the Phase-4 capture the Memory Engine learns from.
 */
export function logEditCorrection(
  scope: Scope,
  args: {
    materialId: number;
    role: string;
    subject: string;
    type: string;
    tags: string[];
    note: string;
  }
) {
  getDb()
    .prepare(
      `INSERT INTO corrections (org_id, material_id, action, role, subject, type, tags, note)
       VALUES (?, ?, 'edit', ?, ?, ?, ?, ?)`
    )
    .run(
      scope.orgId,
      args.materialId,
      args.role,
      args.subject,
      args.type,
      JSON.stringify(args.tags),
      args.note
    );
}

/* Corrections are a ROOT table despite carrying a material_id: the material can
   go away (ON DELETE SET NULL) and the correction outlives it, so it cannot
   reach an organization by joining and holds its own org_id. */
export function listCorrections(scope: Scope): CorrectionRow[] {
  return (
    getDb()
      .prepare("SELECT * FROM corrections WHERE org_id = ? ORDER BY id DESC")
      .all(scope.orgId) as Record<string, unknown>[]
  ).map(parseCorrection);
}

export function listCorrectionsFor(
  scope: Scope,
  materialId: number
): CorrectionRow[] {
  return (
    getDb()
      .prepare(
        "SELECT * FROM corrections WHERE material_id = ? AND org_id = ? ORDER BY id DESC"
      )
      .all(materialId, scope.orgId) as Record<string, unknown>[]
  ).map(parseCorrection);
}

export function saveChecklistRun(
  materialId: number,
  passed: boolean,
  results: unknown
) {
  getDb()
    .prepare(
      "INSERT INTO checklist_runs (material_id, passed, results) VALUES (?, ?, ?)"
    )
    .run(materialId, passed ? 1 : 0, JSON.stringify(results));
}

function parseKit(r: Record<string, unknown>): StyleKitRow {
  return {
    ...(r as object),
    // re-parse so kits saved under older shapes gain newly added rule fields
    config: parseKitConfig(JSON.parse(r.config as string)),
    locked_fields: JSON.parse(r.locked_fields as string),
  } as StyleKitRow;
}

export function listStyleKits(scope: Scope): StyleKitRow[] {
  return (
    getDb()
      .prepare(
        "SELECT * FROM style_kits WHERE org_id = ? ORDER BY is_default DESC, name"
      )
      .all(scope.orgId) as Record<string, unknown>[]
  ).map(parseKit);
}

export function getStyleKit(scope: Scope, id: number): StyleKitRow | null {
  const r = getDb()
    .prepare("SELECT * FROM style_kits WHERE id = ? AND org_id = ?")
    .get(id, scope.orgId) as Record<string, unknown> | undefined;
  return r ? parseKit(r) : null;
}

/** The kit a material should render with, falling back to the org's default. */
export function getKitForMaterial(
  scope: Scope,
  styleKitId: number
): StyleKitRow | null {
  return (
    getStyleKit(scope, styleKitId) ??
    listStyleKits(scope).find((k) => k.is_default === 1) ??
    null
  );
}

export function createStyleKit(
  scope: Scope,
  name: string,
  config: StyleKitConfig,
  lockedFields: string[]
): number {
  const info = getDb()
    .prepare(
      "INSERT INTO style_kits (org_id, name, config, locked_fields, is_default) VALUES (?, ?, ?, ?, 0)"
    )
    .run(
      scope.orgId,
      name,
      JSON.stringify(config),
      JSON.stringify(lockedFields)
    );
  return Number(info.lastInsertRowid);
}

export function updateStyleKit(
  scope: Scope,
  id: number,
  name: string,
  config: StyleKitConfig,
  lockedFields: string[]
) {
  getDb()
    .prepare(
      "UPDATE style_kits SET name = ?, config = ?, locked_fields = ? WHERE id = ? AND org_id = ?"
    )
    .run(
      name,
      JSON.stringify(config),
      JSON.stringify(lockedFields),
      id,
      scope.orgId
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
export function setDefaultStyleKit(scope: Scope, id: number) {
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE style_kits SET is_default = 0 WHERE org_id = ?").run(
      scope.orgId
    );
    db.prepare(
      "UPDATE style_kits SET is_default = 1 WHERE id = ? AND org_id = ?"
    ).run(id, scope.orgId);
  })();
}

export function countMaterialsUsingKit(scope: Scope, id: number): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM materials WHERE style_kit_id = ? AND org_id = ?"
    )
    .get(id, scope.orgId) as { n: number };
  return row.n;
}

export function deleteStyleKit(scope: Scope, id: number) {
  getDb()
    .prepare("DELETE FROM style_kits WHERE id = ? AND org_id = ?")
    .run(id, scope.orgId);
}
