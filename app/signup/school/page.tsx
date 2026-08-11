import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import { getSession } from "@/lib/auth/dal";
import SchoolSignupForm from "./SchoolSignupForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up your school" };

export default async function SchoolSignupPage() {
  if (await getSession()) redirect("/");

  return (
    <AuthShell
      title="Set up your school"
      subtitle="You'll be the owner of this organization — you can invite teachers and hand over admin rights once you're in."
      footer={
        <>
          <Link href="/signup" className="font-semibold text-brandink hover:underline">
            ← Not setting up a school?
          </Link>
          <span className="mx-2 text-fg3">·</span>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brandink hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SchoolSignupForm />
    </AuthShell>
  );
}
