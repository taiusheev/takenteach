import Link from "next/link";
import { notFound } from "next/navigation";
import { getMaterial } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/dal";
import { canCreate } from "@/lib/workflow";
import { describeOutline, extractOutline } from "@/lib/remix";
import { commonFields } from "@/lib/content-types";
import { LessonPack } from "@/lib/lesson-pack-schema";
import { SUBJECT_DEFS } from "@/lib/subjects";
import ForkForm from "@/components/ForkForm";

export const dynamic = "force-dynamic";

export default async function ForkPage(ctx: {
  params: Promise<{ id: string }>;
}) {
  const { legacyRole: role, scope } = await requireActiveSession();
  const { id } = await ctx.params;
  const source = await getMaterial(scope, Number(id));
  if (!source) notFound();

  if (!canCreate(role)) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-sm text-fg2">
          You&apos;re acting as a TA — TAs and judges give feedback; they
          don&apos;t build materials.
        </p>
        <Link href={`/materials/${source.id}`} className="mt-4 inline-block text-sm font-bold text-accent hover:underline">
          ← Back to material
        </Link>
      </div>
    );
  }

  // only Lesson Packs carry an inheritable page structure
  const outline =
    source.type === "lesson-pack"
      ? extractOutline(source.content as LessonPack)
      : null;

  return (
    <ForkForm
      sourceId={source.id}
      sourceTitle={source.title}
      subjectLabel={SUBJECT_DEFS[source.subject]?.label ?? source.subject}
      anchorLabel={SUBJECT_DEFS[source.subject]?.anchorLabel ?? "Resolution"}
      anchorPlaceholder={SUBJECT_DEFS[source.subject]?.anchorPlaceholder ?? ""}
      sourcePack={commonFields(source.content)}
      inherits={
        outline
          ? describeOutline(outline)
          : ["Style, accent colour and cohort identity"]
      }
      hasStructure={outline ? outline.slots.length > 0 : true}
    />
  );
}
