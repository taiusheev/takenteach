"use client";

import Link from "next/link";
import { ORG_ROLE_LABELS, type OrgRole } from "@/lib/workflow";
import LogoutButton from "@/components/auth/LogoutButton";

export interface AccountSummary {
  name: string;
  email: string;
  orgName: string;
  orgRole: OrgRole;
  orgKind: "school" | "individual";
  membershipStatus: string;
  /** Other organizations this user belongs to — the switcher's future home. */
  otherOrgs: { orgName: string; status: string }[];
}

/**
 * Who you are, and the way out.
 *
 * Replaces the role switcher for signed-in users. That control let anyone
 * choose their own permissions, which was honest while there was no auth and is
 * indefensible now — a select box that changes what you are allowed to do is
 * not a preference.
 *
 * Built on `<details>` for the same reason NavLinks is: Escape and outside-click
 * close it for free, it keyboard-opens like a real menu, and there is no focus
 * trap of our own to get wrong.
 */
export default function AccountMenu({ account }: { account: AccountSummary }) {
  const initials =
    account.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || account.email[0]?.toUpperCase();

  const pending = account.membershipStatus === "pending";

  return (
    <details className="group relative shrink-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-surface-alt [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-onbrand"
          style={{ backgroundImage: "var(--grad-brand)" }}
        >
          {initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[9rem] truncate text-[13px] font-semibold text-fg1">
            {account.name || account.email}
          </span>
          <span className="block max-w-[9rem] truncate text-[11px] text-fg3">
            {account.orgName}
          </span>
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden
          className="shrink-0 opacity-60 transition-transform group-open:rotate-180"
        >
          <path
            d="M1 3.5 5 7l4-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <span className="sr-only">Account menu</span>
      </summary>

      <div className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-xl border border-inkline bg-surface p-1.5 shadow-[var(--elev-lg)]">
        <div className="border-b border-inkline px-3 py-2.5">
          <div className="truncate text-[13px] font-semibold text-fg1">
            {account.name || "—"}
          </div>
          <div className="truncate text-xs text-fg3">{account.email}</div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="truncate text-[11px] font-semibold text-fg2">
              {account.orgName}
            </span>
            <span className="shrink-0 rounded bg-surface-alt px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg3">
              {ORG_ROLE_LABELS[account.orgRole]}
            </span>
          </div>
        </div>

        {/* A pending join is a state the user needs told, not a silent one —
            they typed a school name at signup and nothing visible happened. */}
        {account.otherOrgs
          .filter((o) => o.status === "pending")
          .map((o) => (
            <div
              key={o.orgName}
              className="mx-1.5 mt-2 rounded-lg border border-warn/40 bg-warn/12 px-2.5 py-2 text-[11px] leading-relaxed text-warn"
            >
              Waiting on <span className="font-bold">{o.orgName}</span> to approve
              you. You can keep building in your own workspace meanwhile.
            </div>
          ))}
        {pending && (
          <div className="mx-1.5 mt-2 rounded-lg border border-warn/40 bg-warn/12 px-2.5 py-2 text-[11px] leading-relaxed text-warn">
            Your membership of {account.orgName} is awaiting approval.
          </div>
        )}

        <div className="mt-1.5 flex flex-col">
          <Link
            href="/account/password"
            className="rounded-lg px-3 py-2 text-[13px] font-medium text-fg2 transition-colors hover:bg-surface-alt hover:text-fg1"
          >
            Change password
          </Link>
          <LogoutButton className="rounded-lg px-3 py-2 text-left text-[13px] font-medium text-fg2 transition-colors hover:bg-surface-alt hover:text-fg1" />
        </div>
      </div>
    </details>
  );
}
