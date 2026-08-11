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
| **2b. Postgres port** | Port `lib/db.ts` + `lib/auth/store.ts`; async-ify; migrate the data; re-run `lib/tenancy.test.ts` against Postgres | The biggest mechanical change, and the tenancy test proves it landed intact. |
| **3. Stage the build** | One request per generation stage; measure each against 60 s | The blocker that is *not* fixed by step 2. |
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

**The application still runs on SQLite and is fully working.** That is deliberate: the
async conversion in the next step is all-or-nothing — half of it leaves the app broken —
so it starts from a clean, committed, green checkpoint rather than in the middle of one.

Done:

- **Repo.** `git init`, `.gitattributes` (LF normalisation, or a Windows checkout commits
  CRLF and every later diff is the whole file), `.env.example`, a real README. Two local
  commits, no remote, nothing pushed. `data/*.db` and `.env*` are excluded.
- **`lib/pg.ts` + `lib/pg.test.ts`.** Placeholder conversion, ALS-carried transactions,
  `pg`/PGlite behind one interface. 11 tests including parameter ordering and rollback.

Remaining, in order:

1. **Schema DDL** → Postgres. `INTEGER PRIMARY KEY AUTOINCREMENT` → identity columns,
   `datetime('now')` → `now()`, `json_extract` → `content::jsonb ->> 'series'`,
   `COLLATE NOCASE` → `ILIKE`, and the `PRAGMA`-based migrations replaced. **This closes
   the phase 2 gap**: `org_id` finally gets a real `NOT NULL REFERENCES`, which SQLite's
   `ALTER TABLE` could not express.
2. **Async-ify** `lib/db.ts` and `lib/auth/store.ts`, then let `tsc` enumerate the ~130
   call sites — the same technique that found 113 in phase 2 and missed none.
3. **Point `lib/tenancy.test.ts` at PGlite** and re-run the mutation check, so isolation
   is proven on Postgres and not merely assumed to have survived.
4. **Migrate the data**: 13 materials, 2 kits, 2 students, 2 rounds, 6 corrections, 2
   accounts, 2 organizations. Verify by count and by tenancy.

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
5. **Confirmation on §6** (keep the existing auth) before I start step 2, because it
   changes what the Postgres port has to carry.

---

## 9. Honest summary of cost

| | Effort |
|---|---|
| Postgres port | The bulk of it. Mechanical, type-checked, one to two sessions. |
| Staged generation | Smaller, more interesting, and improves the product for real users. |
| De-globalising state | An afternoon, mostly deletion. |
| Email + deploy config | Small. |
| **Rebuilding the product** | **None.** Auth, tenancy, roles, the builder and the design system are all untouched. |
