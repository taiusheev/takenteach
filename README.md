# TakenTeach

**Lessons, faster. Teaching, better.**

Print-ready debate, critical-thinking and academic-writing lessons, built in one house
style — with the evidence rules, scope limits and quality checks enforced rather than
suggested.

---

## Running it

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev
```

Open http://localhost:3000. There is no anonymous access: create an account at `/signup`,
or seed the founder account (below).

```bash
npm test          # node --test, offline, no database server needed
npx tsc --noEmit  # types
npm run build     # production build
```

## Where things are

| | |
|---|---|
| `app/` | Routes. `app/api/**` are the handlers; everything else is a page. |
| `lib/db.ts` | The data layer. Every content query takes a `Scope` — see below. |
| `lib/auth/` | Identity: password hashing, sessions, the DAL, the store. |
| `lib/api/guards.ts` | The chokepoint every `[id]` route passes through. |
| `lib/ai.ts` | The staged lesson-generation pipeline. Imports nothing from `lib/db`. |
| `components/` | UI. `Logo.tsx` is the mark; `globals.css` holds the design tokens. |
| `docs/` | `BLUEPRINT.md` (what it does), `SAAS-FOUNDATION.md` (how tenancy works), `DEPLOYMENT.md` (how it ships). |

## Three rules worth knowing before changing anything

**1. Tenancy is enforced in the SQL, not in the UI.** Every content query in `lib/db.ts`
takes a `Scope` as its first required parameter, so an unscoped call is a type error
rather than a cross-tenant read. The scope is built once, in `lib/auth/dal.ts`, from the
session row — never from a request body, query parameter or header. A row belonging to
another organization returns **404, not 403**, because a 403 confirms it exists.
`lib/tenancy.test.ts` proves this against the real query layer.

**2. `lib/ai.ts` must not import from `lib/db`.** It used to, and the result was a prompt
built for one school containing another school's page titles. Everything the pipeline
needs about the library arrives as `LevelHints` from the route, which knows whose library
it is asking about.

**3. Semantic washes stop at `/12`.** `bg-danger/N text-danger` is the commonest pattern
in the UI, and past about 12% the wash is dark enough to threaten its own ink. See the
note above the status chips in `app/globals.css`.

## Deploying

Target: **Vercel** (app) · **Supabase** (Postgres) · **Cloudflare** (DNS) ·
**Resend** (email), on `app.takenteach.com`. Full analysis and the current state of the
port are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Two things that will bite otherwise:

- **Use Supabase's transaction pooler** (port 6543), not the direct connection. Vercel
  opens a connection per instance and the direct limit is reached almost immediately.
- **Set the Vercel DNS record to DNS-only (grey cloud) at Cloudflare.** Proxying it
  breaks certificate issuance and produces redirect loops.

## Seeding the founder account

```bash
node --import ./scripts/test-resolver.mjs scripts/seed-ascent.mjs
```

Creates the Ascent Academy organization and its owner, printing a one-time password
**once** to the terminal. The account cannot do anything but change that password until
it has been changed. `--reset-password` issues a new one; without that flag the script is
idempotent and will not touch an existing account.
