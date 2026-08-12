import { script } from "./pg";

/**
 * THE POSTGRES SCHEMA.
 *
 * Ported from the SQLite DDL that lived in lib/db.ts. The shape is unchanged —
 * decision 2 of docs/SAAS-FOUNDATION.md said to write it Postgres-shaped from
 * the start so this would be a translation rather than a redesign, and it was.
 *
 * ── WHAT THIS FIXES ──────────────────────────────────────────────────────
 * `org_id` is finally `NOT NULL REFERENCES organizations(id)` on every root
 * table. SQLite's ALTER TABLE could not add both constraints at once, so the
 * migrated database carried a nullable column guarded by a startup assertion
 * (SAAS-FOUNDATION §8, "known gap"). The database enforces it now, which is
 * where it belonged.
 *
 * ── WHY TIMESTAMPS ARE `text` AND NOT `timestamptz` ──────────────────────
 * This looks wrong and is deliberate. The application compares timestamps as
 * STRINGS in ~26 places — session expiry, reset-link expiry, ordering — and
 * `pg` decodes `timestamptz` into a JavaScript Date, which would break every
 * one of those comparisons silently rather than loudly.
 *
 * So the columns stay text and the default reproduces SQLite's `datetime('now')`
 * exactly: UTC, second precision, `YYYY-MM-DD HH24:MI:SS`. That format sorts
 * lexicographically in the same order it sorts chronologically, which is the
 * only property the comparisons rely on. Moving to real `timestamptz` is a
 * worthwhile follow-up and it is a separate change from this port — doing both
 * at once would mean debugging two classes of failure at the same time.
 *
 * ── WHY JSON COLUMNS ARE `text` AND NOT `jsonb` ──────────────────────────
 * Same reasoning. `pg` parses a `jsonb` column into an object automatically,
 * and every read site here does its own `JSON.parse` — through zod schemas that
 * re-validate and apply defaults. Handing them an object instead of a string
 * would break all of them. The one query that reaches inside the JSON casts at
 * the point of use (`content::jsonb ->> 'series'`), which is cheap at this size
 * and honest about being the exception.
 *
 * ── WHEN THIS RUNS ───────────────────────────────────────────────────────
 * Not on every request. `npm run db:migrate` applies it, and the test harness
 * calls it directly. A serverless app that ran DDL on each cold start would pay
 * a round trip for a no-op forever.
 */

/** SQLite's `datetime('now')`, reproduced exactly. See the note above. */
const NOW = `to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')`;
/** SQLite's `date('now')`. */
const TODAY = `to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD')`;

/** Postgres's spelling of `INTEGER PRIMARY KEY AUTOINCREMENT`. */
const ID = "bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY";

export const SCHEMA_SQL = `
-- ── IDENTITY ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id ${ID},
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'individual',   -- 'school' | 'individual'
  location text NOT NULL DEFAULT '',
  size_band text NOT NULL DEFAULT '',
  plan text NOT NULL DEFAULT 'free',
  created_at text NOT NULL DEFAULT ${NOW}
);

-- platform_role lives here and not on memberships, deliberately: being a super
-- admin is a fact about the platform, not a membership in any one school, and
-- putting it on memberships would make it grantable by a school admin editing
-- their own org's rows.
CREATE TABLE IF NOT EXISTS users (
  id ${ID},
  email text NOT NULL UNIQUE,                 -- stored lowercased + trimmed
  password_hash text NOT NULL,
  name text NOT NULL DEFAULT '',
  platform_role text NOT NULL DEFAULT 'user', -- 'user' | 'super_admin'
  -- set on a seeded or reset account: the DAL refuses everything except the
  -- change-password screen while this is 1, so a printed one-time password
  -- cannot quietly become a permanent one.
  must_change_password integer NOT NULL DEFAULT 0,
  email_verified_at text,
  created_at text NOT NULL DEFAULT ${NOW},
  last_login_at text
);

-- The join, carrying BOTH the role and the approval state — which is why it is
-- a table and not an org_id column on users. A teacher awaiting approval, one
-- who was rejected, and one who has left are three different rows here and
-- would be three nullable columns there.
CREATE TABLE IF NOT EXISTS memberships (
  id ${ID},
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  org_role text NOT NULL DEFAULT 'teacher',   -- owner|admin|coach|teacher|assistant
  status text NOT NULL DEFAULT 'active',      -- invited|pending|active|suspended|rejected
  created_at text NOT NULL DEFAULT ${NOW},
  approved_at text,
  -- SET NULL, not CASCADE: the fact that a membership was approved outlives the
  -- admin who approved it.
  approved_by bigint REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (user_id, org_id)
);

-- Sessions are rows, not signed tokens, which buys the one thing a JWT cannot:
-- revocation. Only the token's SHA-256 is stored, so a leaked backup does not
-- hand over live sessions.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_org_id bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at text NOT NULL,
  created_at text NOT NULL DEFAULT ${NOW},
  last_seen_at text NOT NULL DEFAULT ${NOW},
  user_agent text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at text NOT NULL,
  used_at text,
  created_at text NOT NULL DEFAULT ${NOW}
);

-- ── CONTENT ─────────────────────────────────────────────────────────────────
-- org_id appears on the five ROOT tables only — materials, style_kits,
-- students, rounds, corrections. Every other table reaches its organization by
-- joining its parent. A copy of org_id on a child row is a second source of
-- truth, and the day the two disagree the disagreement is invisible.

CREATE TABLE IF NOT EXISTS departments (
  id ${ID},
  org_id bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at text NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS style_kits (
  id ${ID},
  org_id bigint NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  config text NOT NULL,
  locked_fields text NOT NULL DEFAULT '[]',
  is_default integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS materials (
  id ${ID},
  org_id bigint NOT NULL REFERENCES organizations(id),
  -- Nullable and SET NULL on purpose: a lesson outlives the teacher who left.
  -- Deleting a person must not delete the department's curriculum.
  created_by bigint REFERENCES users(id) ON DELETE SET NULL,
  -- private | organization | shared. The default is organization, NOT private:
  -- the premise is one house style across a department, and a default nobody
  -- can see makes a shared library that fills with invisible work.
  visibility text NOT NULL DEFAULT 'organization',
  department_id bigint REFERENCES departments(id) ON DELETE SET NULL,
  student_level text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'lesson-pack',
  subject text NOT NULL DEFAULT 'debate',
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  style_kit_id bigint NOT NULL REFERENCES style_kits(id),
  content text NOT NULL,
  created_by_role text NOT NULL,
  -- lineage: the material this one was duplicated or remixed from
  forked_from bigint,
  -- JSON InheritedOutline — the structure a remix should be refilled with
  inherited_outline text,
  created_at text NOT NULL DEFAULT ${NOW},
  updated_at text NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS activity_log (
  id ${ID},
  material_id bigint NOT NULL REFERENCES materials(id),
  role text NOT NULL,
  action text NOT NULL,
  detail text NOT NULL DEFAULT '',
  created_at text NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS checklist_runs (
  id ${ID},
  material_id bigint NOT NULL REFERENCES materials(id),
  passed integer NOT NULL,
  results text NOT NULL,
  created_at text NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS students (
  id ${ID},
  org_id bigint NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  cohort text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT 'debate',
  grade_band text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  archived integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS rounds (
  id ${ID},
  org_id bigint NOT NULL REFERENCES organizations(id),
  ballot_id bigint NOT NULL REFERENCES materials(id),
  label text NOT NULL,
  resolution text NOT NULL DEFAULT '',
  pro_team text NOT NULL DEFAULT '',
  con_team text NOT NULL DEFAULT '',
  room text NOT NULL DEFAULT '',
  held_on text NOT NULL DEFAULT '',
  created_by_role text NOT NULL,
  -- which student debated each side, so judging feeds their progress. The link
  -- lives on the ROUND, not the submission: who debated is a fact about the
  -- round, and three judges of it must not each re-declare it.
  pro_student_id bigint,
  con_student_id bigint,
  created_at text NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS ballot_submissions (
  id ${ID},
  round_id bigint NOT NULL REFERENCES rounds(id),
  judge_name text NOT NULL DEFAULT '',
  role text NOT NULL,
  winner text NOT NULL,
  scores text NOT NULL DEFAULT '{}',
  speaker_points text NOT NULL DEFAULT '{}',
  rfd text NOT NULL DEFAULT '{}',
  feedback text NOT NULL DEFAULT '{}',
  seconds_taken integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT ${NOW}
);

-- Every AI mutation overwrites the pack in place. A snapshot is taken BEFORE
-- each one, so a regeneration that made a page worse is one click from undone.
CREATE TABLE IF NOT EXISTS material_versions (
  id ${ID},
  material_id bigint NOT NULL REFERENCES materials(id),
  title text NOT NULL DEFAULT '',
  content text NOT NULL,
  label text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  created_at text NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS observations (
  id ${ID},
  student_id bigint NOT NULL REFERENCES students(id),
  skill text NOT NULL,
  rating integer NOT NULL,
  note text NOT NULL DEFAULT '',
  context text NOT NULL DEFAULT '',
  observed_on text NOT NULL DEFAULT ${TODAY},
  role text NOT NULL DEFAULT 'teacher',
  created_at text NOT NULL DEFAULT ${NOW}
);

-- A root table despite the material_id: a correction outlives the pack it was
-- written about (SET NULL below), so it cannot reach an organization by joining
-- and holds its own org_id.
CREATE TABLE IF NOT EXISTS corrections (
  id ${ID},
  org_id bigint NOT NULL REFERENCES organizations(id),
  material_id bigint REFERENCES materials(id) ON DELETE SET NULL,
  action text NOT NULL,
  role text NOT NULL,
  subject text NOT NULL,
  type text NOT NULL,
  tags text NOT NULL DEFAULT '[]',
  note text NOT NULL DEFAULT '',
  created_at text NOT NULL DEFAULT ${NOW}
);

-- ── INDEXES ─────────────────────────────────────────────────────────────────
-- Every content query now opens with org_id, so every content table needs it
-- LEADING an index or the scoping turns each list into a full scan that filters
-- afterwards — the right answer computed the wrong way.

CREATE INDEX IF NOT EXISTS idx_materials_org        ON materials (org_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_kits_org             ON style_kits (org_id, is_default DESC, name);
CREATE INDEX IF NOT EXISTS idx_students_org         ON students (org_id, cohort, name);
CREATE INDEX IF NOT EXISTS idx_rounds_org           ON rounds (org_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_corrections_org      ON corrections (org_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_departments_org      ON departments (org_id, name);

CREATE INDEX IF NOT EXISTS idx_activity_material    ON activity_log (material_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_checklist_material   ON checklist_runs (material_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_corrections_material ON corrections (material_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_observations_student ON observations (student_id, observed_on DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_round    ON ballot_submissions (round_id, id);
CREATE INDEX IF NOT EXISTS idx_materials_forked     ON materials (forked_from);
CREATE INDEX IF NOT EXISTS idx_materials_kit        ON materials (style_kit_id);
CREATE INDEX IF NOT EXISTS idx_materials_lookup     ON materials (subject, type, status);
CREATE INDEX IF NOT EXISTS idx_versions_material    ON material_versions (material_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_memberships_user     ON memberships (user_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_org      ON memberships (org_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_user        ON sessions (user_id);

-- ── ALTERS ──────────────────────────────────────────────────────────────────
-- Columns added after the tables above were first created. They live here
-- rather than in the CREATE, because a CREATE TABLE IF NOT EXISTS does nothing
-- at all on a database that already has the table — so adding a column up there
-- would work on a fresh database and silently skip every existing one.
--
-- ADD COLUMN IF NOT EXISTS keeps ensureSchema() idempotent, which is the whole
-- contract of this file: it is run by db:migrate, possibly repeatedly, and must
-- never fail on a database that is already correct.

-- A teacher's own defaults — grade band, lesson length, preferred track.
-- Stored as JSON text for the same reason the content column is: it is read
-- straight into a zod schema that applies defaults, so adding a preference
-- later needs no migration and no backfill. Per USER, not per organization —
-- two teachers in one school teach different year groups.
--
-- (No backticks anywhere in this block. SCHEMA_SQL is one JS template literal
-- and a single stray backtick ends the string mid-comment, which is exactly
-- what the note at the top of the identity section warns about.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences text NOT NULL DEFAULT '{}';
`;

/** Apply the schema. Idempotent — every statement is IF NOT EXISTS. */
export async function ensureSchema(): Promise<void> {
  await script(SCHEMA_SQL);
}

/** The expression the application writes for "now", matching the defaults above. */
export const SQL_NOW = NOW;
