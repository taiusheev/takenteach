import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import { getSession } from "@/lib/auth/dal";
import TeacherSignupForm from "./TeacherSignupForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create a teacher account" };

export default async function TeacherSignupPage() {
  if (await getSession()) redirect("/");

  return (
    <AuthShell
      title="Create your teacher account"
      subtitle="You'll get your own workspace straight away. Naming your school sends a request to join it — you can keep working while it's reviewed."
      footer={
        <>
          <Link href="/signup" className="font-semibold text-brandink hover:underline">
            ← Not a teacher?
          </Link>
          <span className="mx-2 text-fg3">·</span>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brandink hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <TeacherSignupForm />
    </AuthShell>
  );
}
