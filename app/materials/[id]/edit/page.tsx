import Link from "next/link";
import { notFound } from "next/navigation";
import { getKitForMaterial, getMaterial } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/dal";
import { canEdit } from "@/lib/workflow";
import { runChecklistFor } from "@/lib/checklist";
import Builder from "@/components/Builder";
import SimpleBuilder from "@/components/SimpleBuilder";
import { LessonPack } from "@/lib/lesson-pack-schema";

export const dynamic = "force-dynamic";

export default async function EditPage(ctx: {
  params: Promise<{ id: string }>;
}) {
  const { legacyRole: role, scope } = await requireActiveSession();
  const { id } = await ctx.params;
  const material = await getMaterial(scope, Number(id));
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

  /* THE CHECKLIST IS COMPUTED HERE, NOT BY A SAVE ON MOUNT.
     Both editors used to fire a PUT the moment they mounted, purely to get a
     checklist back for the right rail. That meant opening a lesson to READ it
     stamped `updated_at` and pushed the pack to the top of "most recent" —
     the library's recency order quietly recorded visits, not work. It also
     left the rail empty until a round trip finished. It is a pure function of
     the content, so the page that already has the content can run it. */
  const kit = await getKitForMaterial(scope, material.style_kit_id);
  const checklist = runChecklistFor(
    material.type,
    material.content,
    material.subject,
    kit?.config
  );

  if (material.type !== "lesson-pack") {
    return (
      <SimpleBuilder
        materialId={material.id}
        type={material.type}
        subject={material.subject}
        initialTitle={material.title}
        initialContent={material.content}
        initialChecklist={checklist}
      />
    );
  }

  return (
    <Builder
      materialId={material.id}
      subject={material.subject}
      initialTitle={material.title}
      initialPack={material.content as LessonPack}
      initialChecklist={checklist}
    />
  );
}
