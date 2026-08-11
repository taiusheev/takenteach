import Link from "next/link";
import { requireActiveSession } from "@/lib/auth/dal";
import { canCreate } from "@/lib/workflow";
import MakeSwitcher from "@/components/MakeSwitcher";
import { SUBJECTS, Subject } from "@/lib/subjects";

export const dynamic = "force-dynamic";

export default async function NewMaterialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { legacyRole: role } = await requireActiveSession();
  const sp = await searchParams;
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
      prefillGradeBand={sp.gradeBand ?? ""}
      prefillSubject={
        SUBJECTS.includes(sp.subject as Subject) ? (sp.subject as Subject) : undefined
      }
      initialMode={sp.mode === "unit" ? "unit" : "lesson"}
    />
  );
}
