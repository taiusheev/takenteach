import { NextRequest, NextResponse } from "next/server";
import { createMaterial, logActivity } from "@/lib/db";
import {
  ForkMode,
  ForkOptions,
  duplicateContent,
  extractOutline,
  remixContent,
  remixPack,
} from "@/lib/remix";
import { LessonPack } from "@/lib/lesson-pack-schema";
import { loadMaterial, requireBuilder } from "@/lib/api/guards";
import { badRequest, readBody } from "@/lib/api/request";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // "remix" is the default because it is the safe one: a duplicate silently
  // copies a whole pack's content, and defaulting to that on a typo'd mode is
  // how a library fills up with near-identical lessons.
  mode: z.enum(["duplicate", "remix"]).catch("remix"),
  title: z.string().trim().default(""),
  lessonCode: z.string().trim().default(""),
  coverTitle: z.string().trim().default(""),
  skillFocus: z.string().trim().default(""),
  series: z.string().trim().default(""),
  resolution: z.string().trim().default(""),
  durationMin: z.number().int().min(0).max(600).optional(),
});

/** Fork a material: exact duplicate, or remix (keep skeleton, swap topic). */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/materials/[id]/fork">
) {
  const found = await loadMaterial(ctx);
  if (!found.ok) return found.response;
  const scope = found.session.scope;
  const source = found.material;

  const builder = await requireBuilder();
  if (!builder.ok) return builder.response;
  const { role } = builder;

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const mode: ForkMode = body.mode;

  // Checked here rather than in the schema because it depends on another field —
  // a duplicate legitimately has no new anchor, a remix must have one.
  if (mode === "remix" && !body.resolution) {
    return badRequest(
      "A remix needs its own anchor — that's what makes it a new lesson."
    );
  }

  const opts: ForkOptions = {
    lessonCode: body.lessonCode,
    coverTitle: body.coverTitle,
    skillFocus: body.skillFocus,
    series: body.series,
    resolution: body.resolution,
    durationMin: body.durationMin,
  };

  const isPack = source.type === "lesson-pack";
  const pack =
    mode === "duplicate"
      ? duplicateContent(source.type, source.content, opts)
      : isPack
        ? remixPack(source.content as LessonPack, opts)
        : remixContent(source.type, source.content, opts);

  // A remixed Lesson Pack carries the source's page skeleton so Quick Build
  // refills that shape instead of planning a fresh lesson. The lighter types
  // have no page structure to inherit.
  const inheritedOutline =
    mode === "remix" && isPack
      ? extractOutline(source.content as LessonPack)
      : undefined;

  const title =
    body.title?.trim() ||
    `${opts.lessonCode ? opts.lessonCode + " · " : ""}${opts.coverTitle || opts.skillFocus || source.title}` ||
    `Copy of ${source.title}`;

  const newId = createMaterial(scope, 
    title,
    source.style_kit_id,
    pack,
    role,
    source.subject,
    { forkedFrom: source.id, inheritedOutline },
    source.type
  );

  logActivity(
    source.id,
    role,
    mode === "duplicate" ? "duplicated" : "remixed",
    `→ #${newId} ${title}`
  );

  return NextResponse.json({ id: newId, mode });
}
