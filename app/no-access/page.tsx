import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import LogoutButton from "@/components/auth/LogoutButton";
import { getSession } from "@/lib/auth/dal";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "No access" };

/**
 * Where a suspended or rejected membership lands.
 *
 * It exists so that "you can't use this" is a page with an explanation and a
 * way out, rather than a redirect loop or a blank library. The two states get
 * different sentences because they need different actions from the reader: a
 * suspension is something an admin can undo, a rejection means this was the
 * wrong organization to ask for.
 */
export default async function NoAccessPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Someone who arrived here with a working membership has no business on this
  // page — most likely a stale link after an admin approved them.
  if (session.membershipStatus === "active" || session.membershipStatus === "pending") {
    redirect("/");
  }

  const rejected = session.membershipStatus === "rejected";

  return (
    <AuthShell
      title={rejected ? "That request wasn't approved" : "Your access is paused"}
      subtitle={
        rejected
          ? `${session.orgName} declined the request to join. If that looks wrong, ask a colleague there to invite you directly — an invitation adds you straight away.`
          : `An administrator at ${session.orgName} has paused this account. Your lessons are untouched and will be there when access is restored.`
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-relaxed text-fg2">
          Signed in as{" "}
          <span className="font-semibold text-fg1">{session.email}</span>.
        </p>
        <LogoutButton className="btn btn-secondary w-full">
          Sign out
        </LogoutButton>
      </div>
    </AuthShell>
  );
}
