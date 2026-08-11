import { NextResponse } from "next/server";
import { type MaterialRow, type StyleKitRow, getMaterial, getStyleKit } from "@/lib/db";
import { type Session, requireApiSession } from "@/lib/auth/dal";
import { type Role, canCreate, canEdit } from "@/lib/workflow";
import { type ApiError, badRequest, forbidden, notFound, routeId } from "./request";

/**
 * THE PREAMBLE EVERY `[id]` ROUTE WAS WRITING BY HAND.
 *
 * Eleven routes opened with the same six lines: read the param, turn it into a
 * number, look the row up, 404, read the role, refuse the write. Written out
 * eleven times it drifted — some parsed the id with `Number()` (so `/materials/abc`
 * became a lookup for NaN), some checked `canEdit` and some checked the status
 * directly, and the one that forgot a check entirely looked exactly like the ten
 * that hadn't.
 *
 * Collapsing it here makes the gate the *only* way to reach the row: a handler
 * cannot get a `material` out of this module without having passed the check
 * that guards it. The messages stay per-route, because "Only draft packs can be
 * QA'd" and "Only draft packs can be redesigned" are worth the difference.
 *
 * ── WHAT CHANGED WHEN ACCOUNTS LANDED ─────────────────────────────────────
 * Every write gate below now starts with a real session instead of a role read
 * off a cookie the browser could set to `founder`. That single line is what
 * turns twenty-seven routes' worth of permission checks from decoration into
 * enforcement, and it is only one line because this file exists.
 *
 * `proxy.ts` does NOT do this job. It checks that a session cookie is present,
 * which a forged cookie also satisfies; it runs in the edge runtime and cannot
 * reach the database at all. The check that counts is here.
 *
 * ── TENANCY (phase 2) ─────────────────────────────────────────────────────
 * `getMaterial` now takes the session's Scope and resolves within one
 * organization. A material belonging to another org comes back null and this
 * file turns that into a 404 — the same answer as a bad id and a deleted row,
 * on purpose. A 403 would confirm the row exists, which is precisely the leak
 * `loadMaterial` already refuses to produce between a malformed id and a
 * missing one; tenancy is that same argument one level up.
 *
 * The scope is never assembled here. It arrives on the session, built once in
 * lib/auth/dal.ts from the session ROW — never from a body, a query parameter
 * or a header, because an organization the caller supplied is an organization
 * the caller chose.
 */

/** Same shape as `BodyResult`: unwrap on success, return the response on failure. */
export type Guard<T> =
  | ({ ok: true } & T)
  | { ok: false; response: NextResponse<ApiError> };

/** The `ctx` argument Next hands a dynamic route handler. */
type IdContext = { params: Promise<{ id: string }> };

/**
 * Resolve `[id]` to a material, or a 404.
 *
 * A bad id and a missing row are deliberately the same answer. They are the same
 * fact to the caller — the URL addresses nothing — and distinguishing them would
 * tell an unauthenticated request which ids exist.
 */
export async function loadMaterial(
  ctx: IdContext
): Promise<Guard<{ material: MaterialRow; session: Session }>> {
  /* Identity BEFORE the row, in that order and not the other way round: a 404
     and a 401 answered in the wrong sequence let an anonymous caller walk the
     id space and learn which materials exist, which is the same leak this
     function already refuses to produce between a bad id and a missing row. */
  const auth = await requireApiSession();
  if (!auth.ok) return auth;

  const { id } = await ctx.params;
  const materialId = routeId(id);
  if (materialId === null) return { ok: false, response: notFound() };
  // Scoped in the query. Another organization's material is not forbidden here,
  // it simply does not exist — see the note at the top of this file.
  const material = await getMaterial(auth.session.scope, materialId);
  if (!material) return { ok: false, response: notFound() };
  return { ok: true, material, session: auth.session };
}

export interface EditableOptions {
  /**
   * Refuse anything that isn't a Lesson Pack, naming the feature in the message.
   * e.g. `"Content QA"` → "Content QA is a Lesson Pack feature."
   */
  packOnly?: string;
  /** The refusal shown when the material isn't an editable draft. */
  refusal?: string;
}

/**
 * Resolve `[id]` to a material the active role is allowed to WRITE to.
 *
 * `canEdit` is the single rule — draft status, and not a TA — so a route cannot
 * accidentally implement a laxer version of it. Everything past this point in a
 * handler is free to mutate.
 */
export async function loadEditableMaterial(
  ctx: IdContext,
  opts: EditableOptions = {}
): Promise<Guard<{ material: MaterialRow; role: Role; session: Session }>> {
  // loadMaterial already establishes the session — one check, not two.
  const found = await loadMaterial(ctx);
  if (!found.ok) return found;
  const { material, session } = found;

  const role = session.legacyRole;
  if (!canEdit(material.status, role)) {
    // `canEdit` fails for two unrelated reasons and they need different
    // sentences. Collapsing them produced "A draft pack can't be edited by a
    // ta. Only drafts are editable." — which tells a TA their draft is not a
    // draft, and leaves them with nothing to do about it.
    return {
      ok: false,
      response: forbidden(
        opts.refusal ??
          (material.status !== "draft"
            ? `A ${material.status.replace("_", " ")} pack can't be edited. Send it back to draft first.`
            : "TAs and judges give feedback; they don't edit materials.")
      ),
    };
  }
  // 400 rather than 403: the caller is allowed to write here, the request just
  // doesn't mean anything for this content type. Asking a Vocabulary Set for a
  // page-by-page outline is a malformed request, not a permission problem.
  if (opts.packOnly && material.type !== "lesson-pack") {
    return {
      ok: false,
      response: badRequest(`${opts.packOnly} is a Lesson Pack feature.`),
    };
  }
  return { ok: true, material, role, session };
}

/**
 * The active role, refused if it isn't a builder.
 *
 * TAs and judges are not lesser users — feedback is their whole job and they
 * have surfaces of their own — they just don't author materials.
 */
export async function requireBuilder(
  refusal = "TAs and judges give feedback; they don't build materials."
): Promise<Guard<{ role: Role; session: Session }>> {
  const auth = await requireApiSession();
  if (!auth.ok) return auth;
  const role = auth.session.legacyRole;
  if (!canCreate(role)) return { ok: false, response: forbidden(refusal) };
  return { ok: true, role, session: auth.session };
}

/**
 * Resolve `[id]` to a Style Kit, founder only.
 *
 * A kit is cohort-wide identity: one edit restyles every cover every teacher
 * prints this semester, so it stays the founder's call in all three routes that
 * touch one.
 */
export async function loadFounderKit(
  ctx: IdContext,
  refusal = "Only the founder manages Style Kits."
): Promise<Guard<{ kit: StyleKitRow; role: Role; session: Session }>> {
  const auth = await requireApiSession();
  if (!auth.ok) return auth;

  const { id } = await ctx.params;
  const kitId = routeId(id);
  if (kitId === null) return { ok: false, response: notFound() };
  const kit = await getStyleKit(auth.session.scope, kitId);
  if (!kit) return { ok: false, response: notFound() };

  const role = auth.session.legacyRole;
  if (role !== "founder") return { ok: false, response: forbidden(refusal) };
  return { ok: true, kit, role, session: auth.session };
}
