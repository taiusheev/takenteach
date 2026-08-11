import Link from "next/link";
import { notFound } from "next/navigation";
import { getMaterial } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/dal";
import { canEdit } from "@/lib/workflow";
import BuildFlow from "@/components/BuildFlow";
import { LessonPack } from "@/lib/lesson-pack-schema";

export const dynamic = "force-dynamic";

export default async function GeneratePage(ctx: {
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
          Only draft packs can be generated, by builders.
        </p>
        <Link href={`/materials/${material.id}`} className="mt-4 inline-block text-sm font-bold text-accent hover:underline">
          ← Back to material
        </Link>
      </div>
    );
  }

  return (
    <BuildFlow
      materialId={material.id}
      type={material.type}
      title={material.title}
      subject={material.subject}
      initialPack={material.content as LessonPack}
    />
  );
}
