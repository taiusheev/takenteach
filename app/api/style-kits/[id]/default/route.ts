import { NextRequest, NextResponse } from "next/server";
import { setDefaultStyleKit } from "@/lib/db";
import { loadFounderKit } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

/** Make this the kit new materials start in. Founder only. */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/style-kits/[id]/default">
) {
  const gate = await loadFounderKit(ctx);
  if (!gate.ok) return gate.response;
  const scope = gate.session.scope;

  setDefaultStyleKit(scope, gate.kit.id);
  return NextResponse.json({ ok: true });
}
