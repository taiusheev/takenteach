import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import { requireSession } from "@/lib/auth/dal";
import ChangePasswordForm from "./ChangePasswordForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Change your password" };

/**
 * The gate a seeded account passes through.
 *
 * `requireSession`, not `requireActiveSession` — the latter redirects here when
 * `must_change_password` is set, so using it would be a loop. This page is
 * deliberately the one authenticated screen reachable while that flag is on.
 */
export default async function ChangePasswordPage() {
  const session = await requireSession("/account/password");
  const forced = session.mustChangePassword;

  return (
    <AuthShell
      title={forced ? "Choose your own password" : "Change your password"}
      subtitle={
        forced
          ? "This account was set up with a one-time password. Pick your own before you go any further — the old one stops working immediately."
          : "You'll be signed out on your other devices."
      }
    >
      <ChangePasswordForm forced={forced} />
    </AuthShell>
  );
}
