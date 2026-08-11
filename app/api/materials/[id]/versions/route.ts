import { NextRequest, NextResponse } from "next/server";
import { listVersions, restoreVersion } from "@/lib/db";
import { loadEditableMaterial, loadMaterial } from "@/lib/api/guards";
import { badRequest, notFound, readBody } from "@/lib/api/request";
import { z } from "zod";

import { LessonPack } from "@/lib/lesson-pack-schema";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  versionId: z.number().int().positive({ message: "no version given" }),
});

/** A version summarised for the timeline — never the whole pack. */
function summarise(content: unknown) {
  const p = content as Partial<LessonPack>;
  return {
    pages: p.activities?.length ?? 0,
    cards: p.evidenceCards?.length ?? 0,
    terms: p.vocabulary?.length ?? 0,
    designed: !!p.designCss,
    qa: !!p.contentQaJson,
    title: p.title ?? "",
  };
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/materials/[id]/versions">
) {
  const found = await loadMaterial(ctx);
  if (!found.ok) return found.response;
  const scope = found.session.scope;

  const versions = listVersions(scope, found.material.id).map((v) => ({
    id: v.id,
    label: v.label,
    role: v.role,
    createdAt: v.created_at,
    ...summarise(v.content),
  }));
  return NextResponse.json({ versions });
}

/** Restore a previous version. The current state is snapshotted first. */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/materials/[id]/versions">
) {
  const gate = await loadEditableMaterial(ctx, {
    refusal: "Only editable drafts can be restored, by builders.",
  });
  if (!gate.ok) return gate.response;
  const { material, role, session } = gate;
  const { scope } = session;

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { versionId } = parsed.data;

  // a version from another material must never be pasted into this one
  const owned = listVersions(scope, material.id).some((v) => v.id === versionId);
  if (!owned) {
    return badRequest("That version doesn't belong to this material.");
  }

  const restored = restoreVersion(scope, versionId, role);
  if (!restored) {
    return notFound("Version not found.");
  }
  return NextResponse.json({ ok: true });
}
