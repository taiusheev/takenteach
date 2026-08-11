import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStyleKit, logActivity, setMaterialStyleKit } from "@/lib/db";
import { loadEditableMaterial } from "@/lib/api/guards";
import { notFound, readBody } from "@/lib/api/request";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  styleKitId: z.number().int().positive(),
});

/** Assign a material to a Style Kit (builders, on drafts). */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  /* Was: read the param, look the material up unscoped, THEN read a role off a
     cookie. The guard does all three in the order that is safe — identity, then
     the row within that org, then the write rule. */
  const gate = await loadEditableMaterial(ctx, {
    refusal: "Only draft packs can be reassigned, by builders.",
  });
  if (!gate.ok) return gate.response;
  const { material, role, session } = gate;
  const { scope } = session;

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  const kit = await getStyleKit(scope, parsed.data.styleKitId);
  if (!kit) return notFound("Style kit not found");

  await setMaterialStyleKit(material.id, kit.id);
  await logActivity(material.id, role, "style-kit", `→ ${kit.name}`);
  return NextResponse.json({ ok: true });
}
