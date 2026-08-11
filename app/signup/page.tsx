import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import AuthShell from "@/components/auth/AuthShell";
import { getSession } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create an account" };

/**
 * The fork: "What are you using TakenTeach as?"
 *
 * A separate screen rather than a radio button on one long form, because the
 * two answers lead to genuinely different questions — a school is asked for a
 * location and a headcount, a teacher is asked which school they are at — and
 * a form that grows and shrinks under a toggle is harder to complete than two
 * short ones.
 *
 * The consequence of the choice is spelled out on each card. "Teacher" and
 * "School" are not self-explanatory to someone who does not yet know the
 * product has organizations in it, and picking wrong means starting over.
 */
export default async function SignupPage() {
  if (await getSession()) redirect("/");

  return (
    <AuthShell
      title="What are you using TakenTeach as?"
      subtitle="This decides how your lessons are organised. You can join a school later either way."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brandink hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Choice
          href="/signup/teacher"
          title="A teacher"
          body="Build lessons in your own workspace. Ask to join your school now, or keep working on your own and join later."
          icon={
            <path
              d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Zm3 5v4c0 1.1 2.24 2 5 2s5-.9 5-2v-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
        />
        <Choice
          href="/signup/school"
          title="A school or department"
          body="Set up the organization, invite your teachers, and see everything the department has built in one library."
          icon={
            <path
              d="M4 20V9l8-5 8 5v11M9.5 20v-5h5v5M4 20h16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
        />
      </div>
    </AuthShell>
  );
}

function Choice({
  href,
  title,
  body,
  icon,
}: {
  href: string;
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="card card-interactive group flex gap-4 p-4 text-left">
      <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brandsoft text-brandink">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
          {icon}
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-fg1">{title}</span>
        <span className="mt-1 block text-[13px] leading-relaxed text-fg2">{body}</span>
      </span>
      <span
        aria-hidden
        className="mt-1 shrink-0 self-start text-fg3 transition-transform group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}
