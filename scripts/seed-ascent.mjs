/**
 * Create the Ascent Academy organization and its founder account.
 *
 *   node --import ./scripts/test-resolver.mjs scripts/seed-ascent.mjs
 *   node --import ./scripts/test-resolver.mjs scripts/seed-ascent.mjs --reset-password
 *
 * IDEMPOTENT. Running it twice does not create a second organization, a second
 * user, or a second membership — and, importantly, does not silently reset a
 * password that the founder has already changed. Re-issuing a password is an
 * explicit `--reset-password`, because a seed script that quietly locks someone
 * out on every deploy is worse than one that refuses to run.
 *
 * THE PASSWORD IS PRINTED ONCE, to this terminal, and is never written to a
 * file, a commit, or the log of any deployed process. The account is created
 * with `must_change_password = 1`, so it is a key that opens one door — the
 * change-password screen — and nothing else until the founder picks their own.
 *
 * WHAT THIS DOES NOT DO: move the existing library into the organization. That
 * is scripts/db-import.mjs, which copies the SQLite database into Postgres with
 * its ids intact — a different job with a different failure mode, and one that
 * must not be entangled with issuing a password.
 */

import { hashPassword, generatePassword } from "@/lib/auth/password";
import { ensureSchema } from "@/lib/schema";
import { closeDb } from "@/lib/pg";
import {
  createMembership,
  createOrganization,
  createUser,
  getMembership,
  getOrganizationBySlug,
  getUserByEmail,
  setPassword,
} from "@/lib/auth/store";

const FOUNDER_EMAIL = "t.aiusheev@gmail.com";
/* A PERSON'S NAME, not a job title and not the school's.
   This said "Ascent Academy Founder", which is a description of a role and
   read straight through to the product: the dashboard greets you by the first
   word of this field, so every morning it said "Good morning, Ascent" — the
   organisation, addressing its owner by its own name. `users.name` is who
   somebody is; `organizations.name` is already the other thing. */
const FOUNDER_NAME = "Timur Aiusheev";
const ORG_NAME = "Ascent Academy";
const ORG_SLUG = "ascent-academy";

const resetPassword = process.argv.includes("--reset-password");

function line(s = "") {
  process.stdout.write(`${s}\n`);
}

/* The tables have to exist before anything below can run. Cheap and idempotent,
   and it means a fresh Postgres needs one command rather than two in the right
   order. */
await ensureSchema();

/* Deliberately not `getOrganizationBySlug(...) ?? createOrganization(...)`.
   Both sides are promises now, and a promise is truthy — that one-liner would
   have created a second organization on every run while looking correct. */
const org =
  (await getOrganizationBySlug(ORG_SLUG)) ??
  (await createOrganization({
    name: ORG_NAME,
    kind: "school",
    location: "",
    sizeBand: "6-20",
  }));
line(`organization  ${org.name}  (id ${org.id}, slug ${org.slug})`);

let user = await getUserByEmail(FOUNDER_EMAIL);
let issued = "";

if (!user) {
  issued = generatePassword();
  user = await createUser({
    email: FOUNDER_EMAIL,
    passwordHash: await hashPassword(issued),
    name: FOUNDER_NAME,
    /* Super admin because this is the platform's own founder account, not
       merely an administrator of one school. It is a fact about the platform,
       which is why it lives on `users` and cannot be granted by a school. */
    platformRole: "super_admin",
    mustChangePassword: true,
  });
  line(`user          ${user.email}  (id ${user.id}) — created`);
} else if (resetPassword) {
  issued = generatePassword();
  await setPassword(user.id, await hashPassword(issued), { mustChange: true });
  line(`user          ${user.email}  (id ${user.id}) — password reset`);
} else {
  line(`user          ${user.email}  (id ${user.id}) — already exists, untouched`);
}

if (!(await getMembership(user.id, org.id))) {
  await createMembership({
    userId: user.id,
    orgId: org.id,
    orgRole: "owner",
    status: "active",
  });
  line(`membership    owner of ${org.name} — created`);
} else {
  line(`membership    owner of ${org.name} — already exists`);
}

if (issued) {
  line();
  line("┌──────────────────────────────────────────────────────────────┐");
  line("│  ONE-TIME PASSWORD — shown once, not stored anywhere else.   │");
  line("├──────────────────────────────────────────────────────────────┤");
  line(`│  ${FOUNDER_EMAIL.padEnd(58)}│`);
  line(`│  ${issued.padEnd(58)}│`);
  line("├──────────────────────────────────────────────────────────────┤");
  line("│  Sign in at /login. You will be sent straight to the         │");
  line("│  change-password screen and cannot go anywhere else until    │");
  line("│  you have set your own.                                      │");
  line("└──────────────────────────────────────────────────────────────┘");
} else {
  line();
  line("No password issued. Pass --reset-password to force a new one.");
}
line();

// The pool holds the process open otherwise.
await closeDb();
