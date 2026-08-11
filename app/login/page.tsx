import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import { getSession } from "@/lib/auth/dal";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  /* Already signed in — a login form is not a useful thing to show someone who
     is. Checked on the server so it never flashes. */
  if (await getSession()) redirect(safeNext(sp.next));

  return (
    <AuthShell
      title="Sign in to TakenTeach"
      subtitle="Pick up where your last lesson left off."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-semibold text-brandink hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {/* The two states a visitor can arrive in with something to be told. */}
      {sp.reset === "1" && (
        <Banner>
          Your password has been changed. Sign in with the new one.
        </Banner>
      )}
      {sp.next && (
        <Banner>Sign in to open that page.</Banner>
      )}
      <LoginForm next={safeNext(sp.next)} />
    </AuthShell>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 rounded-lg border border-brand/30 bg-brandsoft/60 px-3.5 py-2.5 text-[13px] font-medium text-brandink">
      {children}
    </div>
  );
}

/**
 * A path, or the front page.
 *
 * `next` arrives in the query string, which means it arrives from anywhere —
 * including a link an attacker mailed to a teacher. Anything not starting with
 * a single `/` is discarded, so a successful sign-in can never bounce the
 * freshly-authenticated browser to another origin. `//evil.example` is the case
 * the second test catches: it is protocol-relative, so the browser reads it as
 * a different host despite the leading slash.
 */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
