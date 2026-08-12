import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth/dal";
import { readBody } from "@/lib/api/request";
import { updateAccount } from "@/lib/auth/store";
import { preferencesSchema } from "@/lib/auth/preferences";

export const dynamic = "force-dynamic";

/**
 * Save the signed-in teacher's own name and defaults.
 *
 * ── THERE IS NO USER ID IN THE BODY, DELIBERATELY ────────────────────────
 * The obvious shape for a settings endpoint is `PATCH /api/account { id, … }`,
 * and it is the shape that turns a settings page into a way to rename anyone
 * on the platform. The id comes from the session and nowhere else, exactly as
 * `Scope` does for every content query — a value that arrives with the request
 * is a value the caller chose.
 *
 * ── EMAIL IS NOT EDITABLE HERE ───────────────────────────────────────────
 * Changing it is an identity change: it is the login, it is the reset-link
 * destination, and it is UNIQUE across the table. Doing it properly needs
 * verification of the new address before the old one stops working, which is
 * its own flow. Accepting it in this handler would mean a typo locks someone
 * out of their own account, so the field is shown read-only rather than
 * pretending to be editable.
 */
const bodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "your name can't be blank")
    .max(80, "that's longer than a name field needs to be"),
  preferences: preferencesSchema,
});

export async function PATCH(req: NextRequest) {
  const gate = await requireApiSession();
  if (!gate.ok) return gate.response;

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { name, preferences } = parsed.data;

  await updateAccount(gate.session.userId, {
    name,
    /* Re-serialised from the PARSED value, not from the raw body. Anything the
       schema does not know about is dropped rather than stored, so the column
       cannot accumulate arbitrary JSON posted by a client. */
    preferences: JSON.stringify(preferences),
  });

  return NextResponse.json({ ok: true, name, preferences });
}
