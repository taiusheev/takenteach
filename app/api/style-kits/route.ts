import { NextRequest, NextResponse } from "next/server";
import { createStyleKit, getStyleKit, listStyleKits } from "@/lib/db";
import { DEFAULT_KIT_CONFIG, parseKitConfig } from "@/lib/style-kit";
import { requireApiSession } from "@/lib/auth/dal";
import { forbidden, notFound, readBody } from "@/lib/api/request";
import { z } from "zod";


export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().max(120).default(""),
  duplicateOf: z.number().int().positive().optional(),
});

/** Create a kit — blank, or duplicated from an existing one. Founder only. */
export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { scope, legacyRole: role } = auth.session;
  if (role !== "founder") {
    return forbidden("Only the founder manages Style Kits.");
  }
  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  let config = DEFAULT_KIT_CONFIG;
  let locked: string[] = [];
  let name = body.name?.trim() || "Untitled kit";

  if (body.duplicateOf) {
    const src = await getStyleKit(scope, body.duplicateOf);
    if (!src) return notFound("Source kit not found");
    config = src.config;
    locked = src.locked_fields;
    if (!body.name?.trim()) name = `${src.name} (copy)`;
  }

  const taken = (await listStyleKits(scope)).some(
    (k) => k.name.toLowerCase() === name.toLowerCase()
  );
  if (taken) name = `${name} 2`;

  const id = await createStyleKit(scope, name, parseKitConfig(config), locked);
  return NextResponse.json({ id });
}
