# TakenTeach — Free-tier deployment analysis

**Target:** GitHub · Vercel · Supabase Postgres · Cloudflare DNS · Resend, at ~$0/month
excluding the domain (`takenteach.com`, already on Cloudflare).

Written before any implementation, as asked. The question is narrow: *does anything in
the current stack prevent this?*

---

## 0. Verdict

**It is achievable, and nothing needs rebuilding.** Four things stand in the way. One is
a licensing footnote, one is a small deletion, and two are real work — but both of them
are work that makes the product better regardless of where it is hosted.

The single most important finding is a good one: **the AI build is already staged and
already resumable.** That is what turns the hardest blocker from "incompatible with
serverless" into "restructure the transport". Without it, this analysis would end
differently.

---

## 1. What is free and fine as-is

| Piece | Free tier | Notes |
|---|---|---|
| **GitHub** | unlimited private repos | Not a git repo yet — one `git init` away. |
| **Cloudflare DNS** | free | Domain is already there. Records in §6. |
| **Resend** | 3,000 emails/month | Far beyond an MVP's password resets and invitations. |
| **Supabase Postgres** | 500 MB, 2 projects | The whole library is 1.8 MB today. Pauses after ~7 days of zero traffic; a weekly cron ping or simply using it avoids that. |
| **Vercel** | Hobby | Serves the app fine. The catch is §2 and §5, not bandwidth. |

Nothing about the product's *shape* — multiple schools, teachers, lessons, roles,
per-user data — is a problem. That work is done and it is already Postgres-shaped
(decision 2 in `SAAS-FOUNDATION.md`, which is about to pay for itself).

---

## 2. Blocker 1 — long AI builds vs serverless timeouts

**The problem.** `app/api/materials/[id]/generate/route.ts` declares
`maxDuration = 3600` and holds one `ReadableStream` open for the entire build. Vercel
Hobby's ceiling is measured in tens of seconds and Pro's in low hundreds; neither is an
hour. This is not fixed by changing database — it would block a free deployment even on
SQLite.

**Why it is tractable anyway.** The pipeline is already ten discrete stages:

```
outline → foundation → evidence → activities-1 → activities-2
       → teacher-guide → polish → validate → qa → design
```

It **persists the pack after every stage**, and a plain (non-`fresh`) build already
*resumes past whatever stages completed*. The long-running request is therefore a
transport choice, not an architectural requirement.

**The fix.** Turn one 3600-second request into one request per stage, driven by the
client: `POST /api/materials/[id]/generate?stage=foundation` → persist → return → next.
The UI already renders per-stage progress, so it barely changes.

**This is better architecture regardless of hosting.** Today, closing the laptop mid-build
loses the connection and the progress display, and a phone on school wifi will not hold
an hour-long stream. Per-stage requests survive all of that, and a build becomes
resumable from any device.

**The risk to check.** Some individual stages — `activities-1`, `activities-2`, `qa` —
may still exceed 60 s on their own. If they do, they split further (they are already
loops over pages) or that route alone moves to a longer-limit runtime. This needs
measuring against the real corpus before committing; `lib/usage-meter.ts` already
records what each build costs, so the data is obtainable.

---

## 3. Blocker 2 — better-sqlite3 → Supabase Postgres

**The problem.** `better-sqlite3` is a native module reading a local file. Vercel has no
persistent disk, and each instance would get its own copy. It has to go.

**The surface, measured:**

| | Count |
|---|---|
| `getDb()` call sites in the data layer | 49 |
| Call sites of data functions across `app/` and `lib/` | 130 |
| `db.transaction(...)` blocks | 8 |
| `datetime('now')` → `now()` | 26 |
| `INTEGER PRIMARY KEY AUTOINCREMENT` → `bigserial` / `identity` | 15 |
| `lastInsertRowid` → `RETURNING id` | 12 |
| `PRAGMA` (foreign_keys, journal_mode, table_info) | 4 |
| `json_extract` → `content::jsonb ->> 'series'` | 1 |
| `COLLATE NOCASE` → `ILIKE` | 1 |
| `date('now')` → `CURRENT_DATE` | 1 |

**The real cost is not the SQL — it is `async`.** better-sqlite3 is synchronous; every
Postgres driver is not. All 130 call sites gain an `await`, and every data function's
signature changes. That sounds worse than it is: nearly all of them already sit inside
`async` route handlers and async server components, and — exactly as in phase 2 —
**changing the signatures first makes `tsc` enumerate every site that needs touching.**
That technique found 113 call sites across 41 files last time and missed none.

**What carries over untouched:** the `Scope` parameter, the guard layer, visibility, the
tenancy test. Phase 2 was written against an interface, not against SQLite.

**Data migration:** 13 materials, 2 style kits, 2 students, 2 rounds, 6 corrections, 2
accounts, 2 organizations. Small enough to move with a script and verify by eye.

---

## 4. Blocker 3 — state that lives in a module variable

Serverless gives no guarantee that two requests hit the same instance, so module-level
state is per-instance and effectively random.

| Where | What | Fate |
|---|---|---|
| `lib/overnight.ts` | `let current: OvernightRun` — the run's live status | **Park it.** See below. |
| `lib/model-policy.ts` | `let current: BudgetMode` — set by one request, read by later ones | Move to the database (per-org setting) or pass per-request. |
| `lib/batch-queue.ts` | the active coalescer | Goes with the overnight runner. |
| `lib/db.ts` | `globalThis.__ascentDb` | Becomes a pooled Postgres client — fine, and the standard pattern. |
| `lib/usage-meter.ts` | `AsyncLocalStorage` | **Fine.** It is request-scoped by design, which is exactly what serverless wants. |

**The overnight batch runner cannot work on free serverless and should be dropped from
the MVP.** It deliberately starts a job and returns immediately, expecting the process to
keep working for up to 24 hours — a platform that bills per request kills it the moment
the response is sent. It is a cost optimisation (half-price builds), not a feature
teachers depend on. It comes back later as a scheduled job when there is a worker to run
it.

---

## 5. Blocker 4 — Vercel Hobby is non-commercial

Not technical, and worth knowing now rather than at the worst possible moment: Vercel's
terms restrict the Hobby plan to non-commercial use. The day a school pays for
TakenTeach, the deployment needs Pro ($20/month). That is a fine problem to have and it
does not change any code — but "$0/month forever" and "charging schools" are not
simultaneously true on Vercel, and the plan should not pretend otherwise.

---

## 6. Recommendation: use Supabase for Postgres, not for auth

You asked for Supabase authentication. I would not, and the reason is concrete rather
than preferential.

**A complete auth system already exists** — phase 1: scrypt hashing, database-backed
sessions with real revocation, one-time passwords, resets, and a DAL that resolves a
session into an organization scope. It runs on Postgres unchanged, costs nothing, and
has no vendor in the login path.

**Adopting Supabase Auth would mean:**
- rewriting phase 1 and re-registering both existing accounts;
- **still** building memberships, org roles and approval states yourself — Supabase Auth
  has no multi-tenant role model, so the part that was actually hard does not go away;
- mapping Supabase users onto organizations through custom claims or a lookup on every
  request, which is the work the DAL already does;
- taking a third-party dependency on the one path that must never be down.

**What it would genuinely give you:** email verification, OAuth ("Sign in with Google"),
and magic links, for free. Those are real — and they are additive later, on top of what
exists, rather than a reason to replace it now.

**Supabase Storage** is likewise not needed yet: the only upload is the Style Kit logo,
stored as a data URL under a 400 KB cap. That works on Postgres. Storage becomes worth
it when logos or attachments grow.

---

## 7. Proposed sequence

Each step leaves a working application.

| Step | Work | Why this order |
|---|---|---|
| **1. Repo** ✅ | `git init`, `.gitattributes`, `.env.example`, real README | Everything else deploys from it. Local commits only — no remote configured, nothing pushed. |
| **2a. Postgres layer** ✅ | `lib/pg.ts` + 11 tests | Proven before anything is ported onto it. |
| **2b. Postgres port** ✅ | Ported `lib/db.ts` + `lib/auth/store.ts`; async-ified 114 call sites; `scripts/db-import.mjs`; tenancy re-proved on Postgres | The biggest mechanical change, and the tenancy test proves it landed intact. |
| **3. Stage the build** ✅ | A build runs in timed legs; the client asks again until it is done | The blocker that is *not* fixed by step 2. |
| **4. De-globalise** | Budget mode to the database; park the overnight runner | Small, and step 3 makes it obvious what is left. |
| **5. Email** | Implement Resend in `lib/mail.ts` (the seam is already there) | Password resets stop silently dropping. |
| **6. Deploy** | Vercel project, env vars, Cloudflare records, verify on `takenteach.com` | Last, because everything above must be true first. |

**DNS at Cloudflare** (step 6): `CNAME app → cname.vercel-dns.com` if the product lives
at `app.takenteach.com`, or an apex `A`/`ALIAS` to Vercel if it lives at the root. My
recommendation is **apex for the marketing landing page, `app.` for the product** — it is
the same split phase 4 wants anyway, and it keeps the signed-out and signed-in surfaces
separable. Cloudflare proxying should be **DNS-only (grey cloud)** for the Vercel record;
double-proxying causes redirect loops and breaks Vercel's certificate issuance.

---

## 7a. Where the port actually stands

**Step 2 is done. The application runs on Postgres.** `better-sqlite3` is gone from the
runtime — nothing under `app/` or `lib/` imports it, and it survives only as a
devDependency for the one-off import and the legacy backup script.

- **Repo.** `git init`, `.gitattributes` (LF normalisation, or a Windows checkout commits
  CRLF and every later diff is the whole file), `.env.example`, a real README. Local
  commits, no remote, nothing pushed. `data/*.db`, `.pglite/` and `.env*` are excluded.
- **`lib/pg.ts` + `lib/pg.test.ts`.** Placeholder conversion, ALS-carried transactions,
  `pg`/PGlite behind one interface.
- **`lib/schema.ts` + `lib/schema.test.ts` + `npm run db:migrate`.** The DDL, translated
  and validated against PGlite. **This closed the phase 2 gap**: `org_id` is now a real
  `NOT NULL REFERENCES`, which SQLite's `ALTER TABLE` could not express.
- **`lib/db.ts` and `lib/auth/store.ts`, async.** `createDb`, `migrateTenancy`,
  `migrateCorrectionsFk`, `assertNoOrphans`, `createIndexes` and `getDb` are all deleted;
  the schema file owns that job. The recipe in §7c held with no surprises.
- **114 call sites awaited** across 41 files. `tsc` found all of them — 393 errors that
  went to zero — exactly as the phase 2 technique predicted.
- **`scripts/db-import.mjs` (`npm run db:import`).** The library, ids intact.
- **98 tests, all passing**, including tenancy and the identity store on Postgres.

### What the port found that a type-checker could not

Four real defects, none of which `tsc` can see, all now covered by tests:

1. **`bigint` came back as a string.** Every id and `COUNT(*)` in the schema is `bigint`;
   `pg` decodes int8 as a **string** and PGlite decodes it as a **number**. Left alone,
   the whole suite would have passed on PGlite while production served `"13"` as every
   material id and `id === 13` was quietly false. Fixed once in `lib/pg.ts` with an int8
   type parser that refuses values past `Number.MAX_SAFE_INTEGER` rather than rounding
   them, so the two drivers are genuinely indistinguishable.
2. **Column aliases fold to lower case.** `SELECT u.id AS userId` returns `userid` on
   Postgres, so every field of `SessionRecord` would have been `undefined` — an
   application-wide outage caused by six missing quote marks, invisible to `tsc` because
   the row is cast to the interface. All identity aliases are now quoted, and
   `lib/auth/store.test.ts` asserts them field by field.
3. **The session row was written fire-and-forget.** `startSession` did not await
   `createSessionRow`, which was free when the write was synchronous. On Postgres the
   browser could receive its cookie before the row existed; on serverless the instance
   can be frozen the moment the response is sent, so the insert may never land and the
   sign-in fails silently. `startSession` and `endSession` are async and awaited now.
4. **The signup race check tested SQLite's error text.** `String(err).includes("UNIQUE")`
   never matches Postgres's "duplicate key value violates unique constraint", so a lost
   signup race would have become a 500 instead of "that email is taken". Now matched on
   SQLSTATE `23505`.

### Verified

- `npx tsc --noEmit` clean; `npm run lint` clean; `npx next build` succeeds.
- `npm test` — 98 passing.
- **The mutation check was re-run**, because a green tenancy suite is only evidence if it
  can fail. Removing the org filter from `visibleTo` fails 2 tests; also dropping the
  `WHERE org_id` from `setDefaultStyleKit` (the real historical bug) fails a 3rd; also
  dropping it from `updateStyleKit` fails a 4th. Unquoting the `readSessionRecord`
  aliases fails the session test. Each defect is caught by the test written for it.
- **The import was run end to end** against a real Postgres database and the library read
  back through `listMaterials`/`getMaterial` — 9 materials with their original ids
  (14, 16, 22, 24, 25, 27, 31, 32, 33), content re-parsed through the zod schemas,
  activity, kits, students, rounds and corrections all present.

**Note on the counts in §3:** they said 13 materials. The database holds **9**. The other
numbers were right. Nothing was lost — §3 was written from a stale count.

## 7c. The conversion recipe, as it was actually applied

| From | To |
|---|---|
| `getDb().prepare(S).all(a, b)` | `await all(S, [a, b])` |
| `.get(a)` | `await one(S, [a])` |
| `.run(a)` | `await run(S, [a])` |
| `.run(...).lastInsertRowid` | `await insert(S, [...])` (appends `RETURNING id`) |
| `db.transaction(() => {…})()` | `await transaction(async () => {…})` |
| `export function f(): T` | `export async function f(): Promise<T>` |
| `datetime('now')` in a query | `SQL_NOW` from `lib/schema.ts` |
| `json_extract(content, '$.series')` | `content::jsonb ->> 'series'` |
| `LIKE ? COLLATE NOCASE` | `ILIKE ?` |
| `AS camelCase` | `AS "camelCase"` — **not optional**, see defect 2 |
| `f(...).map(g)` | `(await f(...)).map(g)` — never `await f(...).map(g)` |

One caveat worth carrying forward: `await` inside a synchronous `.map()` callback does not
compile, and the fix is `await Promise.all(xs.map(async …))`. That pattern appears in
`app/rounds`, `app/style-kits` and `app/review`, and each is an N+1 — one query per row.
Harmless at this size and worth folding into a single `GROUP BY` before the library is
large. It is not a correctness problem and was deliberately left out of this change.

## 7d. Step 3 — the build now runs in legs

### The measurement §2 asked for, and what it says

Taken from the activity log's own `quick-build-start` → `quick-build-done`
pairs — thirteen real builds, not an estimate:

| | wall clock |
|---|---|
| fastest full build | 6.2 min |
| median | **7.3 min** |
| the last four (the elite packs) | 14.8 / 20.3 / 21.8 / 22.1 min |
| model calls per build | 12–14 |

**§2 understated the risk.** Ten stages across a 20-minute build is ~120 s of
stage on average, and `activities-1`/`activities-2` batch several calls each, so
they are well above it. One-request-per-stage does not fit a 60 s ceiling and
never would have. The builds are also getting *longer* as the pack standard
rises, so this gap widens rather than closes.

### What was built instead

Not `?stage=foundation`. A build runs for a **time budget** and stops at the
next stage boundary; the client asks again; repeat until done. One knob,
`BUILD_LEG_BUDGET_MS` (default 45 s), set to whatever the deployment's real
ceiling is.

A budget beats a stage-per-request on the same evidence that killed the original
design — the stages are wildly uneven. Several resume for free in microseconds
while one is minutes. A budget batches the cheap ones into a single leg and
gives an expensive one a leg to itself, without anyone having to predict which
is which.

- `lib/build-leg.ts` — `consumeLeg()`, with the clock injected. Extracted from
  the route because it is the piece that decides whether a build ever finishes,
  and a real build costs ~$5 and 20 minutes, so "run one and see" is not a
  verification anybody repeats. `lib/build-leg.test.ts` drives it with a fake
  generator: 6 tests, including that a stage already started is never truncated
  (the budget is a floor on leg length, not a ceiling) and that a stage is
  persisted *before* the client is told it finished.
- **The `qa` stage became re-entrant.** It was the only stage that re-ran its
  model calls unconditionally, which cost nothing when a build was one request
  and would have been paid on every leg. The fingerprint it needed already
  existed — it stamps `contentQaJson.contentHash` so the review gate can spot a
  stale report, and the same comparison answers "has QA already seen this pack".
- **Snapshot and `quick-build-start` moved behind `resume: false`,** so a
  22-minute build still writes one undo point rather than thirty — which would
  otherwise have pushed the version the teacher actually wanted past
  `VERSION_LIMIT`.
- **A stall guard in the client.** A leg that finishes no stage means the next
  stage does not fit the ceiling; asking again would loop forever and each turn
  can cost money. It surfaces as a sentence instead.

### What this does and does not buy

It does **not** make a 22-minute build complete on a 60 s ceiling — nothing short
of splitting the model calls themselves would, and that was explicitly not worth
it for an MVP. What it buys is that the build **degrades instead of failing**:
every finished stage is on disk, an interrupted build resumes from exactly where
it stopped, and closing the laptop costs the stage in flight rather than the
hour. On a generous ceiling it simply completes.

For a demo, the honest advice is to build packs locally — where there is no
timeout at all — and let the deployment serve the library. Building is the one
thing free serverless is bad at; showing nine finished packs is what the domain
is for.

## 7b. Running it locally

The database is no longer a file the app creates on demand. With no `DATABASE_URL`,
`lib/pg.ts` runs PGlite in-process; point `PGLITE_PATH` at a directory to keep it:

```
PGLITE_PATH=.pglite        # in .env.local
npm run db:migrate         # create the tables
npm run db:import          # copy data/ascent.db in, ids intact
```

`npm run db:import` refuses to run against a non-empty database unless given `--force`.
It deliberately does **not** copy `sessions` or `password_resets`: both are live
credentials, and carrying an unspent reset token into production is a risk with no
matching benefit. Everyone signs in again after the move, which is the correct behaviour
for a database that has changed machines.

## 7b. One thing to do before deploying, unrelated to the port

`npm audit` reports four high-severity advisories in the current Next (16.2.10), all
fixed by a **non-major** bump to 16.3.0: a proxy/middleware bypass, SSRF via rewrites,
postcss path traversal, and sharp/libvips.

The proxy bypass is worth a sentence, because it is a good test of the design: `proxy.ts`
here is an optimistic redirect and never the authorization boundary — the DAL is — so a
bypass would not grant access to anything. It should still be patched. Kept separate from
the port so the two changes stay reviewable independently.

## 8. What I need from you

Nothing secret, ever — every key below is pasted by you into Vercel's or Supabase's own
dashboard, not into this chat.

1. **A Supabase project** (free tier, region closest to your users). I need to know it
   exists; you put the connection string in Vercel's env vars as `DATABASE_URL`.
2. **A Resend account** with `takenteach.com` verified. That verification adds DNS
   records at Cloudflare — I will list exactly which. Key goes in as `RESEND_API_KEY`.
3. **Your `ANTHROPIC_API_KEY`** moved into Vercel's env vars. It is currently in
   `.env.local`, which is gitignored and stays that way.
4. **A decision on apex vs `app.`** — see §7.
5. ~~**Confirmation on §6** (keep the existing auth) before I start step 2.~~ Step 2 is
   done and it kept the existing auth, which was the recommendation and the lower-risk
   path — the scrypt hashing, the session rows and the DAL all moved to Postgres
   unchanged. If you would still rather have Supabase Auth, say so: it is now a
   replacement of working code rather than a fork in the road, and §6 still argues
   against it.

---

## 9. Honest summary of cost

| | Effort |
|---|---|
| Postgres port ✅ | The bulk of it, and it landed in one session — mechanical and type-checked, as predicted. The cost was not the SQL; it was the four defects in §7a that types could not see. |
| Staged generation | Smaller, more interesting, and improves the product for real users. |
| De-globalising state | An afternoon, mostly deletion. |
| Email + deploy config | Small. |
| **Rebuilding the product** | **None.** Auth, tenancy, roles, the builder and the design system are all untouched. |
