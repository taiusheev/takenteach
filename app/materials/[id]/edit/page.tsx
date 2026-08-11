import Link from "next/link";
import { notFound } from "next/navigation";
import { getMaterial } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/dal";
import { canEdit } from "@/lib/workflow";
import Builder from "@/components/Builder";
import SimpleBuilder from "@/components/SimpleBuilder";
import { LessonPack } from "@/lib/lesson-pack-schema";

export const dynamic = "force-dynamic";

export default async function EditPage(ctx: {
  params: Promise<{ id: string }>;
}) {
  const { legacyRole: role, scope } = await requireActiveSession();
  const { id } = await ctx.params;
  const material = getMaterial(scope, Number(id));
  if (!material) notFound();

  if (!canEdit(material.status, role)) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-sm text-fg2">
          This pack is <strong>{material.status.replace("_", " ")}</strong>
          {role === "ta" && " and you're acting as a TA"} — it can&apos;t be
          edited right now. Only drafts are editable, by builders.
        </p>
        <Link
          href={`/materials/${material.id}`}
          className="mt-4 inline-block text-sm font-bold text-accent hover:underline"
        >
          ← Back to material
        </Link>
      </div>
    );
  }

  if (material.type !== "lesson-pack") {
    return (
      <SimpleBuilder
        materialId={material.id}
        type={material.type}
        subject={material.subject}
        initialTitle={material.title}
        initialContent={material.content}
      />
    );
  }

  return (
    <Builder
      materialId={material.id}
      subject={material.subject}
      initialTitle={material.title}
      initialPack={material.content as LessonPack}
    />
  );
}
