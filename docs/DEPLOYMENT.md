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
| **5. Email** ✅ | Resend implemented in `lib/mail.ts`, 7 tests | Password resets stop silently dropping. |
| **6. Deploy** | Vercel project, env vars, Cloudflare records, verify on `takenteach.com` | Last, because everything above must be true first. **Code side is ready; the runbook is §7f.** |

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

## 7e. Step 5 — email

`lib/mail.ts` sends through Resend. The seam did its job: adding a transport
touched one file and no call site.

**No SDK.** Resend publishes an npm package; this is a `fetch` POST with a
bearer token. The package would add a dependency, a version to track and a
bundle shipped into every serverless function, in exchange for wrapping fifteen
lines — the same trade that put scrypt in `lib/auth/password.ts` rather than
bcrypt.

| environment | behaviour |
|---|---|
| development | logs to the console, **including the reset link**, so the flow is testable without an inbox |
| production, no `RESEND_API_KEY` | logs that it dropped the message, returns `ok: false` |
| production, key set | sends |
| `MAIL_FORCE_SEND=1` | sends from a dev machine — for proving a new sending domain works |

Three properties are tested because each is a way this could hurt someone:

1. **It never sends from a development machine**, and never prints a live reset
   link into a production log.
2. **It never throws.** A transport failure is `ok: false`. The reset route
   answers the browser identically whether the address exists or not — saying
   "we couldn't send that" would also say "this account is real" — so an
   exception here would turn a deliverability problem into an
   account-enumeration oracle *and* a 500.
3. **The reset link never reaches an error log.** It is a live credential;
   anyone reading the log could take the account. Same reason sessions store a
   hash rather than a token. The log gets the status and Resend's message.

## 7f. Step 6 — the deploy runbook

**The code is ready. Everything below needs accounts and secrets, so it is yours
to run — I can't create accounts or enter credentials, and no key should ever be
pasted into a chat.** Every value goes into the provider's own dashboard.

Done as part of this step:

- **Next 16.2.10 → 16.3.0**, which is what §7b asked for: the proxy/middleware
  bypass, the rewrite SSRF, the postcss path traversal and the sharp/libvips
  advisories are all gone. `npm audit` now reports **0 vulnerabilities** (a plain
  `npm audit fix` cleared three further transitive ones). Type-check, lint, 111
  tests and a production build all pass on it.
- One thing the bump surfaced: a new lint rule objects to
  `window.location.assign` in `LogoutButton`. It is **deliberately** kept and the
  rule disabled with the reason — `router.push()` is a client-side transition
  that preserves Next's router cache, which holds the rendered payloads of the
  pages the user was signed in to. Obeying the rule would let Back re-display
  authenticated pages after sign-out.

### Three deploy failures worth recording

Both were found by deploying, not by reasoning, and neither shows up locally as
a hard failure.

**1. `maxDuration` is a hard ceiling, not a request.**

> Builder returned invalid maxDuration value for Serverless Function
> "api/materials/[id]/generate-section". Serverless Functions must have a
> maxDuration between 1 and 300 for plan hobby.

Vercel refuses the entire deployment rather than clamping the value, so one
over-large route takes every route down with it. `generate-section` was 600.

This also settles a number §2 had to guess at: **the real Hobby ceiling is 300 s**,
not the "tens of seconds" assumed there. That is comfortably more than the ~120 s
an average stage takes, which is why the leg budget (45 s) is a good default —
a leg stops after roughly one slow stage and still lands well inside 300 s.

**2. `next build` uses Turbopack, and Turbopack breaks on `next/font/google`.**

```
[next]/internal/font/google/ibm_plex_sans_5dbfb357.module.css:7:8
Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'
```

Turbopack generates a CSS module for each Google font and then cannot resolve
the internal loader that CSS references. Locally this is **intermittent** —
several builds in a row pass, then one fails with the same error — which is
exactly the kind of fault that gets dismissed as a flake and then fails every
time in CI. On Vercel it failed 100% of the time.

`npm run build` is therefore `next build --webpack`. That is not a workaround
invented here: `npm run dev` was already `next dev --webpack`, so the project
had met this before. Two consecutive clean webpack builds locally, against zero
successful Turbopack builds on Vercel. `npm run build:turbo` is kept so this can
be re-tested when the bug is fixed.

### 3. The direct connection is IPv6-only, and Vercel is IPv4-only

The symptom is a 500 on anything that touches the database, with this in the
runtime log — note that it is **not** an authentication error and **not**
"relation does not exist":

```
Error: Connection terminated due to connection timeout
```

The cause, established by resolving the two hostnames rather than by guessing:

| host | DNS |
|---|---|
| `db.<ref>.supabase.co` — direct | **IPv6 only**, no A record |
| `aws-0-<region>.pooler.supabase.com` — pooler | **IPv4**, three A records |

Vercel's functions have no IPv6 route, so the direct connection can never be
reached from them. It fails by timing out rather than by refusing, which is why
it looks like a hang or a firewall problem rather than a wrong address.

This is the same "use the pooler" instruction §8 already gave, but the reason
matters: it is not about connection limits at that stage, it is that the direct
host is **unreachable from Vercel at all**. Use:

```
postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

One more trap: the Supabase Connect dialog shows a banner on the transaction
pooler tab reading *"Transaction pooler uses IPv6 by default — enable the
dedicated IPv4 add-on to connect from IPv4-only networks."* For the shared
pooler that is **not true** — the hostname resolves IPv4-only, as above. Taken
at face value it pushes you toward a paid add-on you do not need, or toward the
session pooler when transaction mode is the right one for serverless.

### The order, and why

**1. Supabase.** Create the project. Take the **transaction pooler** string
(port 6543), not the direct connection (5432) — Vercel runs many short-lived
instances each opening their own connections, and the direct limit is reached
almost immediately, surfacing as unrelated-looking 500s.

**2. Schema and data, before any deploy.** Put the pooler string in
`.env.local` as `DATABASE_URL` — that file is gitignored and never leaves the
machine — then:

```bash
npm run db:migrate && npm run db:import
```

Both scripts read `.env.local` (`--env-file-if-exists`), so the connection
string lives in exactly one place and never has to be pasted into a shell, a
terminal history, or a chat window. Unset `DATABASE_URL` there afterwards if
you want local development back on PGlite.

`db:import` refuses a non-empty target, verifies every table count by reading it
back, and fast-forwards each identity sequence past the imported ids. Do this
*before* the first deploy so the site is never live against empty tables.

**3. GitHub.** There is still **no remote and nothing pushed** — the repository
is local commits only. Create the repo yourself and push; `.gitignore` already
excludes `data/*.db`, `.pglite/` and `.env*`, so no library and no credential
goes up.

**4. Vercel.** Import the repo. Environment variables, all set in Vercel's
dashboard:

| | |
|---|---|
| `DATABASE_URL` | the pooler string from step 1 |
| `ANTHROPIC_API_KEY` | moved out of your local `.env.local` |
| `RESEND_API_KEY` | step 5 |
| `MAIL_FROM` | `TakenTeach <noreply@takenteach.com>` |
| `BUILD_LEG_BUDGET_MS` | optional; lower it if builds get cut off |

`NODE_ENV` is set by Vercel. Do **not** set `PGLITE_PATH` — with no
`DATABASE_URL` the app refuses to start in production rather than come up
against an empty in-memory database, which is the failure that would otherwise
look exactly like every lesson having vanished.

**5. Resend.** Add `takenteach.com` and let Resend generate its records — a
`TXT` for DKIM, an SPF `TXT`, and an MX for the bounce subdomain. The values are
generated per domain, so take them from Resend's screen; add them at Cloudflare
as **DNS-only (grey cloud)**. Then verify delivery *before* relying on it:

```bash
MAIL_FORCE_SEND=1 npm run dev
```

and use Forgot Password against your own address.

**6. Cloudflare DNS.** My recommendation stands from §7 — **apex for the
marketing page, `app.` for the product.** For the product host, the record
Vercel shows you when you add the domain:

| type | name | value |
|---|---|---|
| `CNAME` | `app` | `cname.vercel-dns.com` |

Take the exact target from Vercel's domain screen rather than from here; it has
changed before. If you put the product on the apex instead, Vercel gives an `A`
record for it.

**Set every Vercel record to DNS-only (grey cloud).** Proxying through
Cloudflare on top of Vercel causes redirect loops and breaks Vercel's
certificate issuance — this is the single most common way this deploy goes
wrong.

**7. Verify on the domain**, in this order, because each depends on the last:
sign in → the library lists 9 packs → open one → print view → Forgot Password
arrives in a real inbox.

### What will not work well on the free tier, and is fine

**Building a pack.** A build is 7–22 minutes; step 3 makes it run in legs and
resume rather than fail, but on a tight function ceiling a slow stage can still
stall, and the client says so rather than looping. **For a demo, build packs
locally — where there is no timeout — and let the deployment serve the library.**
Nine finished packs is what the domain is for.

**The overnight batch runner** is still module-level state and still cannot work
on serverless (§4). It is untouched and should not be exercised on the
deployment.

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

## 7g. `loading.tsx` does not work here — do not add it back without testing

Route-level loading fallbacks are the framework's answer to "the page took a moment and
nothing acknowledged the click". They were added, and they broke every page they were
added to. Recorded here because the failure is silent, plausible-looking, and the obvious
next attempt.

**Symptom.** The skeleton renders and stays forever. No error in the console, no error in
the terminal, HTTP 200, and the dev overlay shows nothing.

**What is actually happening.** The server does its job: the streamed document contains
both the fallback and the finished page. On the client the page content is inserted into
the DOM inside React's hidden staging container (`document.getElementById(...)` finds it;
`offsetParent` is null and its ancestor carries `hidden`), and the boundary is never
revealed — the Suspense marker stays at `<!--$~-->`. Hydration itself is fine: the theme
toggle and the rest of the shell work normally on the stuck page.

**What was ruled out.** Not a CSP (none is set, and inline scripts execute). Not the
network (a manual `fetch()` of the same URL in the same tab receives the complete document
in 12ms). Not the skeleton markup — a `loading.tsx` returning a bare `<p>Loading…</p>`
hangs identically. Not `export const dynamic = "force-dynamic"`, and not the placement:
root and nested segments both hang.

**State of knowledge.** Reproduced only against `next dev --webpack` on 16.3.0, which is
what `npm run dev` runs. Whether `next start` behaves the same is **unverified** — the
production server refuses to boot locally by design when `DATABASE_URL` is unset
(lib/pg.ts), so testing it needs a real Postgres. Until someone has checked it against a
deployed instance, treat route-level loading fallbacks as unavailable.

**What ships instead.** `useLinkStatus` inside the sidebar links (see `NavPending` in
`components/shell/Sidebar.tsx`) — a per-link pending dot. Less capable, and it verifiably
works. `error.tsx` and `not-found.tsx` are unaffected: neither introduces a Suspense
boundary, and both are in use.
## 8. Go live — the current checklist

**Everything on the code side is done and pushed.** What is left needs an account,
a password, or a secret pasted into a form, so all of it is yours to run. Verified
state as of the last commit:

| | |
|---|---|
| GitHub | ✅ `taiusheev/takenteach`, up to date — 152 files pushed |
| Vercel | account exists (team `takenteach`), **no project imported** |
| Supabase | account exists, **no project created** |
| Cloudflare | signed out — `takenteach.com` not yet checked |
| Resend | not yet checked |

Production build succeeds, 392 tests pass, and the migration has been rehearsed
against a copy of the last-deployed schema with real data in it (§8d).

### 8a. Supabase — the database, before anything else

Create the project, then take the **transaction pooler** string (port 6543) from
Connect → Transaction pooler. Not the direct connection (5432): Vercel opens a
connection per instance and the direct limit is reached almost immediately, which
surfaces as unrelated-looking 500s. The direct host is also IPv6-only and Vercel
is IPv4-only, so it is unreachable from there at all (§7f, failure 3).

Ignore the banner on that tab claiming the transaction pooler needs an IPv4
add-on. For the shared pooler it is not true — the hostname resolves IPv4-only.

Then, locally, with that string in `.env.local` as `DATABASE_URL`:

```
npm run db:migrate && npm run db:import
```

Both read `.env.local`, so the credential never reaches a shell history. Do this
**before** the first deploy, so the site is never live against empty tables.
`db:import` refuses a non-empty target and verifies every table count by reading
it back.

### 8b. Vercel — the app

Import the repo. Framework and build command are detected; `npm run build` is
already pinned to webpack, because Turbopack cannot resolve `next/font/google`
and fails 100% of the time on Vercel while passing intermittently in local runs.

Environment variables — the four that are required, and one worth setting
deliberately:

| | |
|---|---|
| `DATABASE_URL` | the pooler string from 8a |
| `ANTHROPIC_API_KEY` | from your `.env.local` |
| `RESEND_API_KEY` | from 8c |
| `MAIL_FROM` | `TakenTeach <noreply@takenteach.com>` |
| `ORG_BUDGET_USD` | see the warning below |

**Do NOT set `PGLITE_PATH`.** With no `DATABASE_URL` the app refuses to start in
production rather than coming up against an empty in-memory database — which is
the failure that would otherwise look exactly like every lesson having vanished.

**Do NOT set `OPEN_MODEL_TASKS`.** It silently moves build stages onto an
open-weight model. No error, no banner; the only visible difference is the model
name in the cost view and the quality of the lesson.

⚠️ **`ORG_BUDGET_USD` defaults to $60 per organization per month, and signup is
open.** Until billing exists this is the only enforced ceiling — the sole thing
between a leaked key, or a stranger with a browser, and an unbounded Anthropic
bill. On a public domain that is $60 of exposure per account created. Decide the
number deliberately rather than inheriting it; $15 is a more defensible starting
point for a public launch, and it still clears two full builds.

### 8c. Resend — email

Add `takenteach.com` and let Resend generate its records: a DKIM `TXT`, an SPF
`TXT`, and an MX for the bounce subdomain. Take the values from its screen, add
them at Cloudflare as **DNS-only (grey cloud)**. Prove delivery before relying
on it:

```
MAIL_FORCE_SEND=1 npm run dev
```

then use Forgot Password against your own address.

### 8d. Cloudflare — DNS

Recommended split: apex for a marketing page, `app.` for the product.

| type | name | value |
|---|---|---|
| `CNAME` | `app` | take the exact target from Vercel's domain screen |

**Every Vercel record must be DNS-only (grey cloud).** Proxying through
Cloudflare on top of Vercel causes redirect loops and breaks certificate
issuance. It is the single most common way this deploy goes wrong.

### 8e. Verify, in this order

Each step depends on the one before it:

1. sign in
2. the library lists the imported packs
3. open one
4. print view renders
5. Forgot Password arrives in a real inbox

### 8f. What the migration will do to your data

Rehearsed, not assumed. A database was built on the schema as last deployed
(`8edd812`), given a real organization, user, style kit, material and a $4.93
usage row, and then migrated:

- `teaching_log` created
- `users.style_profile` added
- every existing row intact, spend intact
- the `ai_usage` foreign key repaired, so deleting a lesson that has cost money
  now succeeds and keeps the spend as history

`ensureSchema()` ran twice without error, because `db:migrate` may be re-run.

### 8g. Known limits, unchanged

**Building a pack on the free tier is the one thing that will disappoint.** A
build is 7–22 minutes; it runs in resumable legs and degrades rather than
failing, but a slow stage can still stall against a tight function ceiling. For
a demo, build locally — where there is no timeout — and let the deployment serve
the library.

**Vercel Hobby is non-commercial.** The day a school pays, the deployment needs
Pro. No code changes; it simply is not true that "$0/month" and "charging
schools" hold at the same time.

**The overnight batch runner cannot work on serverless** (§4) and should not be
exercised on the deployment.
