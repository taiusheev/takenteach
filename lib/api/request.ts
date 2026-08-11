import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * READING A REQUEST BODY, ONCE, PROPERLY.
 *
 * An audit of the 27 mutating API routes found 18 of them doing this:
 *
 *     const body = (await req.json()) as { styleKitId: number };
 *
 * That line makes two promises it cannot keep. The cast asserts a shape TypeScript
 * never checks, so `styleKitId` may arrive as a string, an object, or absent, and
 * the first thing that touches it fails somewhere far from here. And `req.json()`
 * THROWS on a malformed or empty body — with no try/catch, a truncated upload or a
 * request with no body at all became a 500 and a stack trace, when the honest
 * answer is 400 and a sentence saying which field is wrong.
 *
 * So every mutating route now goes through here. The schema is the single source
 * of truth for what the endpoint accepts, the return type is genuinely known
 * rather than asserted, and malformed input produces one consistent, readable
 * shape instead of twenty-eight improvised ones.
 *
 * Deliberately returns a result rather than throwing: a route reads better as a
 * straight line with one early return than as a try/catch whose catch has to
 * guess whether the failure was the client's fault or ours.
 */

/** The error body every route returns for a bad request. */
export interface ApiError {
  error: string;
  /** per-field messages, when the failure is a validation one */
  fields?: Record<string, string>;
}

export type BodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse<ApiError> };

/**
 * Parse and validate a JSON request body.
 *
 * @example
 *   const parsed = await readBody(req, z.object({ styleKitId: z.number().int() }));
 *   if (!parsed.ok) return parsed.response;
 *   const { styleKitId } = parsed.data;   // genuinely a number
 */
export async function readBody<S extends z.ZodTypeAny>(
  req: NextRequest,
  schema: S
): Promise<BodyResult<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    // Empty body is the common case here — a fetch that forgot its body, or a
    // GET-shaped call to a POST route. Treat it as an empty object so a schema
    // whose fields are all optional still succeeds, which is what routes with
    // no required input actually want.
    raw = {};
  }

  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "body";
    // First message per field wins: a field with three problems is still one
    // thing for the caller to fix, and three lines about it reads as noise.
    if (fields[key]) continue;
    // A field that is ABSENT trips the type check, so Zod reports its generic
    // "Invalid input" and the helpful message written on `.min()` or `.enum()`
    // never runs — the caller is told the shape is wrong but not what to send.
    //
    // Distinguishing "missing" from "wrong type" has to be done against the RAW
    // input rather than the issue: Zod's issue shape for the two cases is the
    // same `invalid_type`, so reading the issue tells you a field is bad but not
    // whether it was sent at all. Looking it up settles it.
    fields[key] =
      issue.code === "invalid_type" && valueAt(raw, issue.path) === undefined
        ? `${key} is required`
        : issue.message;
  }
  const first = Object.entries(fields)[0];

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: first ? `${first[0]}: ${first[1]}` : "Invalid request body.",
        fields,
      },
      { status: 400 }
    ),
  };
}

/** Read a value out of the raw body by the path Zod reported it at. */
function valueAt(raw: unknown, path: readonly PropertyKey[]): unknown {
  let cur: unknown = raw;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[key];
  }
  return cur;
}

/**
 * Every failure the API can produce, in one shape.
 *
 * The routes used to hand-roll `NextResponse.json({ error }, { status })` in
 * about forty places, which is fine until a caller tries to handle failure
 * generically: some of those objects carried `error`, some `issues`, some an
 * extra payload the client needed, and a client that wants to show a message
 * had to know which route it had called. `error` is now always a sentence a
 * teacher can read, and anything else a route wants to attach rides alongside
 * it rather than replacing it.
 */
function apiError(
  status: number,
  message: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json<ApiError>({ error: message, ...extra }, { status });
}

/** A 400 with the same shape `readBody` produces, for hand-rolled checks. */
export function badRequest(
  message: string,
  extra?: Record<string, unknown>
) {
  return apiError(400, message, extra);
}

/** 403 — the caller is known but not allowed to do this. */
export function forbidden(message: string) {
  return apiError(403, message);
}

/** 404 — the thing addressed by the URL does not exist. */
export function notFound(what = "Not found") {
  return apiError(404, what);
}

/**
 * 409 — the request is well-formed and permitted, but the current state of the
 * data says no: deleting a kit that materials are built in, starting a second
 * overnight run. Distinct from 403 because retrying later can succeed.
 */
export function conflict(message: string, extra?: Record<string, unknown>) {
  return apiError(409, message, extra);
}

/**
 * 422 — understood, allowed, and refused on quality grounds. This is the
 * checklist/QA gate: the pack is real and the author may edit it, but it is not
 * good enough to move on. `extra` carries the report that says why.
 */
export function unprocessable(message: string, extra?: Record<string, unknown>) {
  return apiError(422, message, extra);
}

/** 413 — the body is bigger than the endpoint is willing to store. */
export function tooLarge(message: string) {
  return apiError(413, message);
}

/**
 * 500 — our fault. Always a written sentence, never a raw exception message:
 * an AI SDK error string can quote the prompt back, and the prompt is not
 * something to hand a browser.
 */
export function serverError(message: string) {
  return apiError(500, message);
}

/**
 * A positive integer from a URL segment.
 *
 * Every `[id]` route did `Number(id)` and passed the result straight to a query.
 * `Number("abc")` is NaN, and a NaN id silently matches no row — so a typo in the
 * URL produced "Not found", which is right by accident, while `Number("1e9")`
 * produced a real lookup for a row nobody asked for. Parse it once, properly.
 */
export function routeId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
