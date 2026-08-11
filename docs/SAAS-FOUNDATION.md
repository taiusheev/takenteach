# TakenTeach — SaaS Foundation

**Analysis of the existing codebase, and what has to change to make it multi-tenant.**

Written against the tree at the time of the brand refresh. Read `BLUEPRINT.md` first
for what the product *does*; this document is only about the foundation underneath it.

---

## 0. The one-paragraph verdict

The **product** is in far better shape than the **platform**. The lesson engine is
already the hard, structured, well-factored thing most projects get wrong — lessons are
typed objects, sections regenerate independently, every AI mutation is snapshotted, and
AI spend is already metered per build. Almost nothing in the request list for §9
("lesson architecture") needs building; it exists.

What does not exist is *anyone to own any of it*. There is no user table, no password,
no session, and no organization. Identity is a cookie called `ascent-role` holding the
literal string `"founder"`, which the server trusts on every mutation. Every list query
returns every row in the database. The application was built — correctly, per the
blueprint — as **one internal site for one academy**. Turning it into a SaaS is
therefore not a redesign of the product; it is the insertion of a tenancy layer
underneath a product that currently assumes it is alone in the world.

That is good news for cost and bad news for shortcuts: the change is narrow but it
touches the bottom of everything, and it cannot be done convincingly at the UI layer.

---

## 1. What already works — keep it

Verified in the tree, not assumed. This is the "do not rebuild" list.

| Capability | Where | Why it stays |
|---|---|---|
| **Lessons are structured objects** | `lib/lesson-pack-schema.ts` | A pack is a zod schema — `activities[]`, vocabulary, evidence deck, teacher guide, rubric — not one AI text blob. §9 of the request is largely already true. |
| **Per-section regeneration** | `app/api/materials/[id]/generate-section/route.ts` | Already accepts a closed enum (`vocabulary`, `evidence`, `teacher-guide`, `activity`) plus a free-text steering instruction. "Improve this activity" works today. |
| **Version history** | `material_versions` table, `snapshotAndUpdate()` | Every AI mutation snapshots first. Undo already exists. |
| **AI usage metering** | `lib/usage-meter.ts` | Tracks calls, full-price input, cache writes, cache reads and output per build, with $/M rates, scoped by `AsyncLocalStorage` so concurrent builds can't blend. The measurement is done — it is simply never *persisted*. |
| **Review workflow** | `lib/workflow.ts` | Draft → In Review → Approved → Published as one declarative `TRANSITIONS` table. Clean, and portable to org roles with no logic change. |
| **The API guard layer** | `lib/api/guards.ts` | The single most valuable file for this migration. A handler *cannot obtain a material* without passing through a guard. That is exactly the chokepoint tenancy scoping needs, and it already exists. |
| **Request validation** | `lib/api/request.ts` | `readBody` + zod on every route, with `routeId()` rejecting non-numeric ids. |
| **Design system** | `app/globals.css`, `components/Logo.tsx` | Tokenised, brand-aligned, contrast-audited. §10 is satisfied; it needs extending to new surfaces, not replacing. |

**Corollary:** the builder does not need to be touched to make this multi-tenant. It
needs its *inputs* (who am I, which org) and its *outputs* (ownership, visibility,
metered usage) wired up around it.

---

## 2. The four structural gaps

### Gap 1 — There is no authentication (critical)

```ts
// lib/role.ts — the entire identity system
export const ROLE_COOKIE = "ascent-role";
export async function getActiveRole(): Promise<Role> {
  const store = await cookies();
  const v = store.get(ROLE_COOKIE)?.value;
  return ROLES.includes(v as Role) ? (v as Role) : "teacher";
}
```

Anyone can run `document.cookie = "ascent-role=founder"` and become the founder. There
are no users, no passwords, no sessions. No auth dependency is installed
(`package.json` has no `bcrypt`/`argon2`/`jose`/`next-auth`).

This is honest — it is labelled "Phase 1 stand-in for real auth" — but it means **every
permission in the product is currently decorative**, including the ones that look
rigorous.

### Gap 2 — There is no tenancy (the architectural change)

No organization exists anywhere in the schema. And critically:

```ts
// lib/db.ts:360
export function listMaterials(): MaterialRow[] {
  return getDb().prepare("SELECT * FROM materials ORDER BY updated_at DESC").all()
}
```

`listMaterials()`, `listStudents()`, `listRounds()`, `listStyleKits()` — all unfiltered
`SELECT *`. The library page, the review queue, analytics and search all consume these.
The moment a second school exists, every school sees every other school's lessons,
students and ballots.

`style_kits.is_default` is a **single global flag**, so "the default kit" is a
property of the installation rather than of an organization.

### Gap 3 — Nothing has an owner

```sql
CREATE TABLE materials (
  ...
  created_by_role TEXT NOT NULL,   -- "teacher". Which teacher? Unanswerable.
  ...
);
```

`created_by_role` records a *kind* of person, not a person. There is no `user_id` and
no `org_id` on any row in the database.

### Gap 4 — Authorization tests status and role, never identity

```ts
// lib/workflow.ts
export function canEdit(status: Status, role: Role): boolean {
  return status === "draft" && role !== "ta";
}
```

There is no row-level check anywhere. Even after users are added, this rule says *any*
teacher may edit *any* teacher's draft. This is precisely the "changing a URL or ID"
hole in §5 of the request.

The fix is small **because the guard layer exists** — see §4.

---

## 3. Target schema

SQLite stays for now (`better-sqlite3`), but every table below is deliberately
Postgres-shaped so the eventual move is a driver swap, not a redesign. Foreign keys are
already enforced in this codebase, so **every new table needs a delete plan**.

### New tables

```
organizations   id, slug (unique), name, kind ('school'|'individual'),
                location, size_band, plan, created_at

users           id, email (unique, lowercased), password_hash, name,
                platform_role ('super_admin'|'user'), email_verified_at,
                created_at, last_login_at

memberships     id, user_id → users, org_id → organizations,
                org_role ('owner'|'admin'|'coach'|'teacher'|'assistant'),
                status ('invited'|'pending'|'active'|'suspended'|'rejected'),
                created_at, approved_at, approved_by
                UNIQUE (user_id, org_id)

sessions        id, user_id → users, token_hash, expires_at,
                created_at, last_seen_at, user_agent, ip
                -- "remember me" = a long expiry, not a second mechanism

password_resets token_hash (pk), user_id → users, expires_at, used_at

invitations     id, org_id → organizations, email, code (unique),
                org_role, invited_by → users, expires_at, accepted_at

departments     id, org_id → organizations, name
                -- Organization → Department → Teachers → Lessons

ai_generations  id, org_id, user_id, material_id, feature, model,
                calls, input, cache_write, cache_read, output,
                cost_micros, created_at
                -- persists what lib/usage-meter.ts already computes
```

### Changes to existing tables

| Table | Add |
|---|---|
| `materials` | `org_id` **NOT NULL**, `created_by` (user), `department_id` (nullable), `visibility` (`private`/`organization`/`shared`), `student_level` |
| `style_kits` | `org_id` **NOT NULL**; `is_default` becomes unique *per org* |
| `students`, `rounds`, `observations`, `corrections`, `activity_log`, `checklist_runs` | `org_id` **NOT NULL** |

`materials` already carries `type`, `subject`, `status`, `created_at`, `updated_at`, and
versions live in `material_versions` — so the §6 lesson field list is satisfied by
adding four columns, not by a new model.

### The recommendation worth arguing about: every user gets an organization

Give a solo teacher a **personal organization** (`kind='individual'`) at signup rather
than a null `org_id`.

- `org_id` can then be `NOT NULL` on every table, which deletes an entire category of
  "what happens when there's no org" bugs before it is written.
- Every query is uniformly scoped. There is exactly one rule, with no exception branch.
- "Joining a school later" becomes *a second membership*, not a schema migration of the
  user's existing work — and their lessons can be moved deliberately rather than
  appearing in the school's library by surprise.
- It matches how Slack/Notion/Linear model this, so the mental model is already familiar.

The cost is a **workspace switcher**: a session needs an `active_org_id`, because a user
with two memberships must know which org a new lesson belongs to. The UI slot for this
already exists — it is where `RoleSwitcher` sits today.

---

## 4. Roles and real authorization

### Two role systems must not both survive

The codebase has *workflow* roles (`founder`, `coach`, `teacher`, `ta`). The request
asks for *tenancy* roles (`Teacher`, `School Admin`, `Super Admin`). Running both means
every permission question has to consult two tables and they will disagree.

**Recommendation: keep the workflow engine exactly as written and re-source its input.**
`TRANSITIONS` in `lib/workflow.ts` is good code and needs no logic change — only the
role values it keys off, which become the membership's `org_role`:

| Today (cookie) | Becomes (membership) | Platform |
|---|---|---|
| `founder` | `owner` | — |
| `coach` | `admin` (School Admin) | — |
| `teacher` | `teacher` | — |
| `ta` | `assistant` | — |
| — | — | `super_admin` on `users` |

`super_admin` is deliberately on `users`, not `memberships`: it is a *platform* fact,
not a membership in any one school, and it must never be grantable by a school admin.

### Authorization becomes a guard concern, not a UI concern

`lib/api/guards.ts` already establishes the right principle, in its own words, about why
a bad id and a missing row return the same 404:

> distinguishing them would tell an unauthenticated request which ids exist

Tenancy is the same argument one level up. **A material in another org must 404, not
403** — a 403 confirms the row exists, which is itself a leak. Concretely:

```ts
// loadMaterial gains a session and one comparison
const session = await requireSession();               // 401 if absent
const material = getMaterial(materialId, session.orgId);  // scoped IN THE QUERY
if (!material) return notFound();                     // wrong org == does not exist
```

The scoping belongs **in the SQL**, not in a post-fetch `if`. A filter applied after the
query is one forgotten early-return away from being bypassed; a `WHERE org_id = ?` in
the prepared statement cannot be forgotten by a caller who never sees the SQL.

Then row-level ownership on top of the existing rule:

```ts
canEdit(status, org_role)                 // today
canEditMaterial(material, session)        // adds: own draft, or coach/admin in org
```

### Non-negotiables

- No `org_id` ever read from the request body or a query param. It comes from the
  session, always.
- Every `list*()` in `lib/db.ts` takes an `orgId` as its **first required parameter**, so
  an unscoped call is a type error rather than a silent data leak.
- Visibility is enforced in the query too: `private` → creator only; `organization` →
  any active member; `shared` → explicitly granted.

---

## 5. The organization flow

```
                         ┌─────────────────────────┐
   visitor ─────────────►│  Landing (unauth)       │
                         │  Get Started / Sign In  │
                         └───────────┬─────────────┘
                                     │
                        ┌────────────┴────────────┐
                        │ "What are you using     │
                        │  TakenTeach as?"        │
                        └──────┬───────────┬──────┘
                               │           │
                         Teacher           School
                               │           │
                               │           ▼
                               │   ┌──────────────────────────┐
                               │   │ School signup            │
                               │   │ school name, admin name, │
                               │   │ email, password,         │
                               │   │ location, ~teachers      │
                               │   └───────────┬──────────────┘
                               │               │ creates org(kind=school)
                               │               │ + membership(owner, active)
                               │               ▼
                               │        School Admin dashboard
                               │        → invite teachers
                               │
              ┌────────────────┴───────────────┐
              │ Teacher signup                 │
              │ name, email, password,         │
              │ school (optional),             │
              │ invitation code (optional)     │
              └───┬──────────┬─────────────┬───┘
                  │          │             │
       valid code │   school │      no school
                  │   named  │             │
                  ▼          ▼             ▼
        membership     membership    personal org only
        (active)       (pending)     (kind=individual)
                  │          │             │
                  │          ▼             │
                  │   ┌──────────────┐     │
                  │   │ Pending      │     │
                  │   │ approval     │     │
                  │   │ • can build  │     │
                  │   │ • lessons    │     │
                  │   │   private    │     │
                  │   │ • NO org data│     │
                  │   └──────┬───────┘     │
                  │          │ admin approves / rejects
                  │          ▼             │
                  └────► membership ◄──────┘ (can join a school later)
                         (active)
                              │
                              ▼
                    Teacher dashboard → Create Lesson → existing Builder
```

**States that must exist as real states, not just copy** (§11):
`invited`, `pending`, `active`, `suspended`, `rejected`, and *no school*. A pending
teacher is a fully working user with a private workspace — not a locked-out one. That
distinction is what stops signup from feeling like a dead end.

**Invitation-code rules:** single-use, scoped to one org, expiring, and matched on the
*email it was issued to* — otherwise a leaked code is an open door into a school.

---

## 6. Route and shell changes

| Route | Change |
|---|---|
| `/` | **Splits.** Unauthenticated → the marketing landing page (§1). Authenticated → redirect to `/dashboard`. |
| `/login`, `/signup`, `/signup/teacher`, `/signup/school`, `/forgot-password`, `/reset-password` | New. |
| `/onboarding/*` | New — account type, org join/create, pending state. |
| `/dashboard` | New. Sidebar shell (§7). The current `app/page.tsx` library becomes **`/lessons`** ("My Lessons"), which is most of the work already done. |
| `/school/*` | New. Admin: teachers, invitations, settings, usage. |
| `/materials/*` | Unchanged in behaviour; gains tenancy guards. |
| `middleware.ts` | New. Session check + redirect at the edge, so no page renders before identity is known. |

The current header nav (8 links) becomes the sidebar in §7. `components/AppChrome.tsx`
already knows how to suppress chrome per-route (it does this for Classroom Mode), so it
is the natural place to switch between *marketing shell*, *auth shell* and *app shell*.

---

## 7. Migration and the Ascent Academy account

There are 13 materials in the database today. That makes migration cheap **now** and it
will not get cheaper.

1. Add the new tables; add nullable `org_id` / `created_by` columns to existing ones.
2. Create org `ascent-academy` (`kind='school'`).
3. Backfill: every existing material, student, round, kit, observation and correction →
   `org_id = <ascent>`. Existing `created_by_role` maps to the founder user.
4. Flip the new columns to `NOT NULL`.
5. Create the founder user with an `owner` membership.

The existing schema already does exactly this dance for the `subject` column
(`lib/db.ts:196–225`) — add nullable, backfill, constrain — so the pattern to follow is
in the file.

> **Decision needed before I create the Ascent Academy founder account:** which email
> should own it, and how should the first password be delivered? The default I would
> otherwise pick is the account on this machine (`t.aiusheev@gmail.com`) with a
> one-time password printed by the seed script and forced to rotate on first login. Say
> the word and I will use that, or give me a different address.

---

## 8. Suggested phasing

Each phase leaves the app working.

| Phase | Contents | Why this order |
|---|---|---|
| **1. Identity** ✅ **done** | users, sessions, password hashing, login/signup/forgot, `proxy.ts`, `requireActiveSession()` on all 14 pages and in `lib/api/guards.ts` | Nothing else can be secured until there is someone to secure it *for*. |
| **2. Tenancy** ✅ **done** | `org_id` on the five root tables, `Scope` as the first parameter of every content query, guard scoping, visibility, the migration in §7 | The data leak is the highest-severity defect; it is fixed here and nowhere else. |
| **3. Onboarding** | account type, school signup, invitations, join requests, pending/approval states | Needs 1 and 2 to exist to be meaningful. |
| **4. Shell** | `/dashboard`, sidebar, landing page, `/lessons`, empty and error states (§11) | The visible product. Deliberately *after* the foundation, per "product foundation over visual polish". |
| **5. Org features** | school admin: teachers, usage, org settings; `visibility`; departments; persist `ai_generations` | Builds on a foundation that already supports it. |

**Phase 2 is the one that must not be skipped or half-done.** Phases 1, 3, 4 and 5 are
additive; phase 2 is the one that changes the meaning of every existing query, and it
gets more expensive with every row and every new `SELECT *` written before it lands.

### Phase 1, as built

| Piece | Where |
|---|---|
| Schema — organizations, users, memberships, sessions, password_resets | `lib/db.ts` `createDb()` |
| scrypt hashing, self-describing and upgradable | `lib/auth/password.ts` |
| Opaque tokens, stored as SHA-256 | `lib/auth/tokens.ts` |
| All identity queries | `lib/auth/store.ts` |
| Cookie lifecycle, `remember` = a longer expiry | `lib/auth/session.ts` |
| The DAL — `getSession` / `requireSession` / `requireActiveSession` / `requireApiSession` | `lib/auth/dal.ts` |
| Optimistic redirect only, no DB | `proxy.ts` |
| signup · login · logout · forgot · reset · password | `app/api/auth/*` |
| The screens, on the brand | `app/login`, `app/signup/**`, `app/forgot-password`, `app/reset-password`, `app/account/password`, `app/no-access` |
| Ascent Academy + founder seed | `scripts/seed-ascent.mjs` |

### Phase 2, as built

| Piece | Where |
|---|---|
| `org_id` on materials, style_kits, students, rounds, corrections; `created_by` / `visibility` / `department_id` / `student_level` on materials; `departments` | `lib/db.ts` |
| The migration — adds the columns and backfills in ONE transaction | `migrateTenancy()` |
| Refuses to open a database holding an unowned row | `assertNoOrphans()` |
| `Scope` — the first required parameter of every content query | `lib/db.ts`, built in `lib/auth/dal.ts` |
| Guards resolve within the session's org; another org's row 404s | `lib/api/guards.ts` |
| Proof, against the real query layer | `lib/tenancy.test.ts` |

**The rule that made it tractable:** change the signatures first, then let `tsc`
enumerate the call sites. It found 113 unscoped calls across 41 files — a worklist
nothing else would have produced completely.

**Two things fell out of the migration and were worth more than the columns:**
`setDefaultStyleKit` ran `UPDATE style_kits SET is_default = 0` with *no WHERE clause*,
so one school promoting a kit would have cleared the default for every school on the
platform. And `lib/ai.ts` was reading the whole library to build "don't repeat these
titles" prompt clauses — a cross-tenant read that would have put one school's page
titles into another's model context. `lib/ai.ts` no longer imports anything from
`lib/db`, which is what makes that un-regressable rather than merely fixed.

**The legacy role system is gone.** `lib/role.ts`, `components/RoleSwitcher.tsx` and
`app/api/role/route.ts` are deleted along with the `ascent-role` cookie. A role now
comes from a membership and nothing in the browser can change it.

**Known gap, deliberate.** `org_id` is physically nullable on the *migrated* database
and `NOT NULL` on a fresh one, because SQLite's ADD COLUMN cannot do both NOT NULL and
REFERENCES. `assertNoOrphans()` closes it across all five tables at startup; the real
constraint arrives with Postgres.

**Also still open:** `ORG_ROLES` coexists with the legacy `founder/coach/teacher/ta`
strings via `toLegacyRole()`. That is now cosmetic — one source of truth, two spellings
— but the second spelling should go when the workflow table is next touched.

---

## 9. Decisions

Settled. These are the constraints the implementation is built against — changing one
later is a migration, not an edit.

| # | Decision | Consequence |
|---|---|---|
| 1 | **Every user gets a personal organization** (`kind='individual'`) at signup | `org_id` is `NOT NULL` everywhere. One scoping rule, no exception branch. Requires `active_org_id` on the session and a workspace switcher in the `RoleSwitcher` slot. Joining a school is a *second membership*; lessons move deliberately, never automatically. |
| 2 | **SQLite stays**, schema written Postgres-shaped | Keep `better-sqlite3` and its synchronous calls, so no route needs rewriting. No column type, default or constraint that Postgres cannot express. The later move is a driver swap. |
| 3 | **One role system** — workflow roles collapse onto org roles | `founder→owner`, `coach→admin`, `teacher→teacher`, `ta→assistant`; `super_admin` on `users`. `TRANSITIONS` in `lib/workflow.ts` keeps its logic and changes only where the role value comes from. Ascent may keep "Founder"/"Coach" as *display labels*, but never as a second source of truth. |
| 4 | **Ascent Academy founder** = `t.aiusheev@gmail.com` | Seed script creates the org, backfills all existing rows to it, and creates an `owner` membership. The password is generated, printed **once** to the console, never committed, and forced to rotate on first login. |

### Still open

**Email transport.** Invitations and password resets need one and none is configured.
Phase 1 will write to a `lib/mail.ts` seam that logs to the console in development, so
the provider choice can be made at deploy time without touching call sites.
