import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateStyleKit } from "@/lib/db";
import { parseKitConfig } from "@/lib/style-kit";
import { loadFounderKit } from "@/lib/api/guards";
import { badRequest, readBody, tooLarge } from "@/lib/api/request";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** "" clears the logo. Anything else must be a base64 data URL. */
  logoDataUrl: z.string().trim().default(""),
});

/** What a cover logo may be. SVG is excluded on purpose — see below. */
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * A cover prints the mark at ~30mm. 400KB is already generous for that, and the
 * logo is stored ON THE KIT ROW, so every byte is carried by every backup and
 * re-sent with every kit read. The cap is the same one the Style Kit editor
 * enforces client-side; this is the copy that actually binds.
 */
const MAX_BYTES = 400_000;

/**
 * Set (or clear) the academy logo that prints on every cover.
 *
 * Deliberately NOT the kit's full PUT. That route replaces the whole config, so
 * using it from the cover would mean the print view holding a complete kit
 * object and writing it back — and any field it didn't know about, or that
 * someone changed in another tab meanwhile, would be silently clobbered by a
 * stale copy. This endpoint touches one field and merges it into whatever the
 * row currently holds.
 */
export async function PUT(
  req: NextRequest,
  ctx: RouteContext<"/api/style-kits/[id]/logo">
) {
  // Branding is kit-level identity: it lands on every cover in the cohort, so
  // it stays a founder decision even though the control now lives on the page.
  const gate = await loadFounderKit(ctx, "Only the founder sets the academy logo.");
  if (!gate.ok) return gate.response;
  const scope = gate.session.scope;
  const { kit } = gate;

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const raw = parsed.data.logoDataUrl;

  if (raw !== "") {
    const m = /^data:([a-z0-9/+.-]+);base64,([a-z0-9+/=]+)$/i.exec(raw);
    if (!m) {
      return badRequest("Send the image as a base64 data URL.");
    }
    const [, mime, b64] = m;
    if (!ALLOWED.includes(mime.toLowerCase())) {
      // SVG is a script-execution surface, and this string is rendered into an
      // <img> on every cover and inlined into exports. A raster mark is the
      // safe thing to store; PNG with transparency prints identically.
      return badRequest(`Use a PNG, JPEG, WebP or GIF — ${mime} isn't allowed.`);
    }
    // base64 is 4 chars per 3 bytes; padding shrinks the last group.
    const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
    if (bytes > MAX_BYTES) {
      return tooLarge(
        `That image is ${Math.round(bytes / 1024)}KB — the limit is ${MAX_BYTES / 1000}KB. Trim or resize it.`
      );
    }
  }

  const config = parseKitConfig({ ...kit.config, logoDataUrl: raw });
  await updateStyleKit(scope, kit.id, kit.name, config, kit.locked_fields);
  return NextResponse.json({ ok: true, logoDataUrl: raw });
}
