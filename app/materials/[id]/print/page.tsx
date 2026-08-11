import { notFound } from "next/navigation";
import { getKitForMaterial, getMaterial, listSeriesSiblings } from "@/lib/db";
import { unitDesign, unitDesignLabel, unitHouseDesignId } from "@/lib/unit-identity";
import { requireActiveSession } from "@/lib/auth/dal";
import PrintView from "@/components/PrintView";
import SimplePrintView from "@/components/SimplePrintView";
import { LessonPack } from "@/lib/lesson-pack-schema";

export const dynamic = "force-dynamic";

export default async function PrintPage(ctx: {
  params: Promise<{ id: string }>;
}) {
  const { legacyRole: role, scope } = await requireActiveSession();
  const { id } = await ctx.params;
  const material = await getMaterial(scope, Number(id));
  if (!material) notFound();
  const kit = await getKitForMaterial(scope, material.style_kit_id);
  if (!kit) notFound();

  if (material.type !== "lesson-pack") {
    // A class plan or word bank adopts the visual identity of the lesson pack
    // its unit is built around, so a week's materials print as one publication.
    // No model call — the stylesheet already exists.
    const series = (material.content as { series?: string }).series ?? "";
    const siblings = series
      ? (await listSeriesSiblings(scope, material.subject, series, material.id))
          .filter((m) => m.type === "lesson-pack")
          .map((m) => {
            const c = m.content as LessonPack;
            return {
              id: m.id,
              lessonCode: c.lessonCode ?? "",
              title: m.title,
              designCss: c.designCss ?? "",
              designNote: c.designNote ?? "",
              design: c.design ?? "",
              gradeBand: c.gradeBand ?? "",
            };
          })
      : [];
    const source = unitDesign(siblings);
    return (
      <SimplePrintView
        materialId={material.id}
        type={material.type}
        content={material.content}
        kit={kit.config}
        subject={material.subject}
        lockedFields={kit.locked_fields}
        inheritedCss={source?.designCss ?? ""}
        inheritedFrom={unitDesignLabel(source)}
        // The house design comes from the unit's FIRST lesson pack whether or
        // not anything has ever been AI-designed — so a class plan prints in
        // the same paper as the pack it ships beside.
        designId={unitHouseDesignId(siblings)}
      />
    );
  }

  // The cover carries a logo slot that writes back to the kit, so the print
  // view needs the kit's row id and whether this viewer may set it. The API
  // re-checks the role independently — this only governs the affordance.

  return (
    <PrintView
      materialId={material.id}
      pack={material.content as LessonPack}
      kit={kit.config}
      kitId={kit.id}
      canEditKit={role === "founder"}
      subject={material.subject}
      lockedFields={kit.locked_fields}
    />
  );
}
