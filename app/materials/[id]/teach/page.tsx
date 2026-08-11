import { notFound, redirect } from "next/navigation";
import { requireActiveSession } from "@/lib/auth/dal";
import { getMaterial } from "@/lib/db";
import type { LessonPack } from "@/lib/lesson-pack-schema";
import ClassroomMode from "@/components/ClassroomMode";

export const dynamic = "force-dynamic";

/**
 * Classroom Mode. Deliberately open to every role, including TAs and judges —
 * whoever is standing in front of the room needs to run the lesson, and this
 * view changes nothing.
 */
export default async function TeachPage(ctx: {
  params: Promise<{ id: string }>;
}) {
  const { scope } = await requireActiveSession();
  const { id } = await ctx.params;
  const material = getMaterial(scope, Number(id));
  if (!material) notFound();
  // Only lesson packs have per-page durations and expected answers to run from.
  if (material.type !== "lesson-pack") redirect(`/materials/${material.id}`);

  const pack = material.content as LessonPack;
  if (pack.activities.length === 0) redirect(`/materials/${material.id}`);

  return <ClassroomMode pack={pack} materialId={material.id} />;
}
