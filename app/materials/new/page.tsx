import Link from "next/link";
import { requireActiveSession } from "@/lib/auth/dal";
import { getUser } from "@/lib/auth/store";
import { parsePreferences } from "@/lib/auth/preferences";
import { canCreate } from "@/lib/workflow";
import MakeSwitcher from "@/components/MakeSwitcher";
import { SUBJECTS, Subject } from "@/lib/subjects";

export const dynamic = "force-dynamic";

export default async function NewMaterialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireActiveSession();
  const { legacyRole: role } = session;
  const sp = await searchParams;

  /* PRECEDENCE: a URL parameter beats a saved default beats the hardcoded
     one. A link that says "build a Grade 9 lesson" was written by someone who
     meant it, and it must not be quietly overridden by a preference set months
     ago — the setting is where a lesson STARTS, not a rule about what it is. */
  const prefs = parsePreferences((await getUser(session.userId))?.preferences);
  if (!canCreate(role)) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-sm text-fg2">
          You&apos;re acting as a TA — TAs and judges give feedback; they
          don&apos;t build materials.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm font-bold text-accent hover:underline">
          ← Back to library
        </Link>
      </div>
    );
  }
  return (
    <MakeSwitcher
      prefillSkillFocus={sp.skillFocus ?? ""}
      prefillResolution={sp.resolution ?? ""}
      prefillGradeBand={sp.gradeBand ?? prefs.gradeBand}
      prefillDurationMin={
        sp.durationMin ? Number(sp.durationMin) : prefs.durationMin
      }
      prefillSubject={
        SUBJECTS.includes(sp.subject as Subject)
          ? (sp.subject as Subject)
          : prefs.subject
      }
      initialMode={sp.mode === "unit" ? "unit" : "lesson"}
    />
  );
}
