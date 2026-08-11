import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  countForksOf,
  countRoundsFrom,
  deleteMaterial,
  getKitForMaterial,
  updateMaterialContent,
} from "@/lib/db";
import { contentTypeDef } from "@/lib/content-types";
import { runChecklistFor } from "@/lib/checklist";
import { loadEditableMaterial, loadMaterial } from "@/lib/api/guards";
import { badRequest, conflict, forbidden, readBody } from "@/lib/api/request";

/** Delete a draft. Only drafts, and never one that other materials were forked from. */
export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/materials/[id]">
) {
  const found = await loadMaterial(ctx);
  if (!found.ok) return found.response;
  const { material, session } = found;
  const { scope, legacyRole: role } = session;
  if (material.status !== "draft") {
    return forbidden("Only drafts can be deleted. Send it back to draft first.");
  }
  if (role !== "founder" && role !== "coach") {
    return forbidden("Only founders and coaches can delete materials.");
  }
  const children = await countForksOf(scope, material.id);
  if (children > 0) {
    return conflict(
      `${children} material(s) were forked from this one — deleting it would orphan their lineage.`
    );
  }
  // A ballot can be judged while still a draft, so this is reachable from the
  // draft-only rule above rather than blocked by it.
  const rounds = await countRoundsFrom(scope, material.id);
  if (rounds > 0) {
    return conflict(
      `${rounds} round(s) were run from this ballot — deleting it would orphan their results.`
    );
  }
  await deleteMaterial(scope, material.id);
  return NextResponse.json({ ok: true });
}

/**
 * The editor sends the whole content object back. `content` is validated against
 * the material's own type schema below rather than here, because which schema
 * applies isn't known until the row has been read.
 */
const putSchema = z.object({
  content: z.unknown(),
  // Matches the cap on create — the editor sends back a title this API produced.
  title: z.string().trim().max(300).optional(),
});

export async function PUT(
  req: NextRequest,
  ctx: RouteContext<"/api/materials/[id]">
) {
  const gate = await loadEditableMaterial(ctx);
  if (!gate.ok) return gate.response;
  const { material, session } = gate;
  const { scope } = session;

  const body = await readBody(req, putSchema);
  if (!body.ok) return body.response;

  // validate against the material's own content type, not just Lesson Packs
  const def = contentTypeDef(material.type);
  const parsed = def.schema.safeParse(body.data.content);
  if (!parsed.success) {
    return badRequest(`Invalid ${def.label.toLowerCase()}`, {
      issues: parsed.error.issues,
    });
  }
  await updateMaterialContent(
    material.id,
    body.data.title || material.title,
    parsed.data
  );
  return NextResponse.json({
    ok: true,
    checklist: runChecklistFor(
      material.type,
      parsed.data,
      material.subject,
      (await getKitForMaterial(scope, material.style_kit_id))?.config
    ),
  });
}
