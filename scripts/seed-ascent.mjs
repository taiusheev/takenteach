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
 * WHAT THIS DOES NOT DO YET: attach the 13 existing materials, students, kits
 * and rounds to the organization. Those tables have no org_id column — that is
 * phase 2 of docs/SAAS-FOUNDATION.md, and the backfill belongs in the same
 * migration that adds the column, not in a script that would have to guess.
 */

import { hashPassword, generatePassword } from "@/lib/auth/password";
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
const FOUNDER_NAME = "Ascent Academy Founder";
const ORG_NAME = "Ascent Academy";
const ORG_SLUG = "ascent-academy";

const resetPassword = process.argv.includes("--reset-password");

function line(s = "") {
  process.stdout.write(`${s}\n`);
}

const org =
  getOrganizationBySlug(ORG_SLUG) ??
  createOrganization({
    name: ORG_NAME,
    kind: "school",
    location: "",
    sizeBand: "6-20",
  });
line(`organization  ${org.name}  (id ${org.id}, slug ${org.slug})`);

let user = getUserByEmail(FOUNDER_EMAIL);
let issued = "";

if (!user) {
  issued = generatePassword();
  user = createUser({
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
  setPassword(user.id, await hashPassword(issued), { mustChange: true });
  line(`user          ${user.email}  (id ${user.id}) — password reset`);
} else {
  line(`user          ${user.email}  (id ${user.id}) — already exists, untouched`);
}

if (!getMembership(user.id, org.id)) {
  createMembership({
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
