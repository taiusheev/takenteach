import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createMaterial, listStyleKits } from "@/lib/db";
import { SUBJECTS, Subject, subjectDef } from "@/lib/subjects";
import { CONTENT_TYPES, contentTypeDef, typesForSubject } from "@/lib/content-types";
import { requireBuilder } from "@/lib/api/guards";
import { readBody, serverError } from "@/lib/api/request";

/**
 * Everything the New Material form can set.
 *
 * All of it is optional and defaulted, because the form's whole point is that a
 * teacher can name a lesson and start — the fields below are the ones the
 * Quick Build page fills in over time. What matters here is that the values are
 * BOUNDED: every string lands in a prompt and then on a printed page, and an
 * unbounded one is a page that overflows or a build that costs more than the
 * founder agreed to.
 */
const bodySchema = z.object({
  // 300, not 200: the client composes this as `lessonCode · coverTitle`, so the
  // cap has to clear the sum of those two fields' own caps or a legitimate
  // create fails on a title the form itself built.
  title: z.string().trim().max(300).default(""),
  // Unknown values fall back rather than 400: an unrecognised subject or type
  // means a stale tab, and a teacher who clicks "create" should get a draft.
  subject: z.enum(SUBJECTS).catch("debate"),
  type: z.enum(CONTENT_TYPES).catch("lesson-pack"),
  lessonCode: z.string().trim().max(40).default(""),
  coverTitle: z.string().trim().max(200).default(""),
  skillFocus: z.string().trim().max(300).default(""),
  series: z.string().trim().max(200).default(""),
  resolution: z.string().trim().max(500).default(""),
  // A class period. The upper bound is a full school day — anything beyond it is
  // a typo, and it drives how many pages the builder plans.
  durationMin: z.number().int().min(0).max(600).default(0),
  gradeBand: z.string().trim().max(60).default(""),
  rigorLevel: z.string().trim().max(40).default(""),
  format: z.string().trim().max(60).default(""),
  /** competitive format the squad debates — PF, BP, LD … (lib/debate-formats.ts) */
  debateFormat: z.string().trim().max(60).default(""),
  accentColor: z.string().trim().max(40).default(""),
  emoji: z.string().trim().max(16).default(""),
  designMotif: z.string().trim().max(200).default(""),
  design: z.string().trim().max(60).default(""),
  // The author's own brief and source material. Generous, because this is where
  // a coach pastes the article the lesson is built on — but not unbounded.
  brief: z.string().trim().max(8000).default(""),
  sourceMaterial: z.string().trim().max(20000).default(""),
  priorKnowledge: z.string().trim().max(4000).default(""),
  misconceptions: z.string().trim().max(4000).default(""),
  constraints: z.string().trim().max(4000).default(""),
});

export async function POST(req: NextRequest) {
  const builder = await requireBuilder(
    "TAs and judges give feedback; they don't build materials."
  );
  if (!builder.ok) return builder.response;
  const scope = builder.session.scope;
  const { role } = builder;

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const subject: Subject = body.subject;
  const kit = (await listStyleKits(scope)).find((k) => k.is_default === 1);
  if (!kit) {
    return serverError(
      "There is no default Style Kit — every material inherits one, so nothing can be created until a kit is marked default."
    );
  }
  // the type must be one this subject track actually supports
  const typeDef = typesForSubject(subject).some((t) => t.id === body.type)
    ? contentTypeDef(body.type)
    : contentTypeDef("lesson-pack");

  const content = typeDef.schema.parse({
    ...(typeDef.empty() as object),
    lessonCode: body.lessonCode,
    title: body.coverTitle,
    skillFocus: body.skillFocus,
    series: body.series,
    resolution: body.resolution,
    durationMin: body.durationMin > 0 ? body.durationMin : 120,
    // A class/unit supplies its own design so it looks distinct; a lone lesson
    // falls back to the subject's default accent.
    accentColor: body.accentColor || subjectDef(subject).theme.accent,
    emoji: body.emoji || typeDef.emoji,
    // Who it's for. Class plans and vocabulary sets carry these too — a plan
    // drafted without an audience reads identically for a novice class and an
    // elite squad — so they are set for every type that has the fields.
    ...(typeDef.id === "lesson-pack" ||
    typeDef.id === "class-plan" ||
    typeDef.id === "vocabulary-set"
      ? {
          gradeBand: body.gradeBand || "Grades 6–8",
          rigorLevel: body.rigorLevel || "standard",
        }
      : {}),
    // the rest is lesson-pack-only targeting
    ...(typeDef.id === "lesson-pack"
      ? {
          format: body.format || "auto",
          debateFormat: body.debateFormat,
          designMotif: body.designMotif,
          design: body.design || "dossier",
          brief: body.brief,
          sourceMaterial: body.sourceMaterial,
          priorKnowledge: body.priorKnowledge,
          misconceptions: body.misconceptions,
          constraints: body.constraints,
        }
      : {}),
  });
  const id = await createMaterial(scope, 
    body.title || `Untitled ${typeDef.label.toLowerCase()}`,
    kit.id,
    content,
    role,
    subject,
    undefined,
    typeDef.id
  );
  return NextResponse.json({ id });
}
