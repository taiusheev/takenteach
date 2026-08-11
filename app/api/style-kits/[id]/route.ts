import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  countMaterialsUsingKit,
  deleteStyleKit,
  updateStyleKit,
} from "@/lib/db";
import { LOCK_GROUPS, parseKitConfig } from "@/lib/style-kit";
import { loadFounderKit } from "@/lib/api/guards";
import { conflict, readBody } from "@/lib/api/request";

export const dynamic = "force-dynamic";

const VALID_GROUPS = LOCK_GROUPS.map((g) => g.id) as readonly string[];

const putSchema = z.object({
  name: z.string().trim().max(120).default(""),
  // `parseKitConfig` is the real validator — it knows the palette, type scale
  // and rule shapes, and fills every missing field with the default. Its job
  // isn't duplicated here; this only has to guarantee it's handed an object.
  config: z.unknown(),
  // Unknown lock groups are dropped rather than rejected, so a kit saved from a
  // tab open since before a group was renamed still saves the groups it knows.
  lockedFields: z.array(z.string()).default([]),
});

export async function PUT(
  req: NextRequest,
  ctx: RouteContext<"/api/style-kits/[id]">
) {
  const gate = await loadFounderKit(ctx);
  if (!gate.ok) return gate.response;
  const scope = gate.session.scope;
  const { kit } = gate;

  const parsed = await readBody(req, putSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const config = parseKitConfig(body.config);
  const locked = body.lockedFields.filter((g) => VALID_GROUPS.includes(g));

  await updateStyleKit(scope, kit.id, body.name || kit.name, config, locked);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/style-kits/[id]">
) {
  const gate = await loadFounderKit(ctx);
  if (!gate.ok) return gate.response;
  const { kit, session } = gate;
  const { scope } = session;

  if (kit.is_default === 1) {
    return conflict(
      "Can't delete the default kit — make another kit the default first."
    );
  }
  const inUse = await countMaterialsUsingKit(scope, kit.id);
  if (inUse > 0) {
    return conflict(
      `${inUse} material(s) are built in this kit — reassign them before deleting it.`
    );
  }
  await deleteStyleKit(scope, kit.id);
  return NextResponse.json({ ok: true });
}
