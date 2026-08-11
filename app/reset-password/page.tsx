import Link from "next/link";
import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import ResetForm from "./ResetForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const token = (await searchParams).token ?? "";

  /* A link with no token at all is answered here rather than by submitting an
     empty form and reading a 400 back. The token itself is NOT validated on
     this page: doing so would need a database read on a GET, and would let
     anyone probe which tokens are live by watching which page they get. It is
     checked once, at the moment it is spent. */
  if (!token) {
    return (
      <AuthShell
        title="That link is incomplete"
        subtitle="Reset links have to be opened exactly as they arrive — copying part of one out of an email is the usual cause."
        footer={
          <Link href="/login" className="font-semibold text-brandink hover:underline">
            ← Back to sign in
          </Link>
        }
      >
        <Link href="/forgot-password" className="btn btn-primary w-full">
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Setting this will sign you out everywhere else."
      footer={
        <Link href="/login" className="font-semibold text-brandink hover:underline">
          ← Back to sign in
        </Link>
      }
    >
      <ResetForm token={token} />
    </AuthShell>
  );
}
