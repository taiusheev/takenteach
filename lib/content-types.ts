import { z } from "zod";
import { type LessonPack, emptyLessonPack, lessonPackSchema } from "./lesson-pack-schema";
import { type ClassPlan, classPlanSchema, emptyClassPlan } from "./class-plan-schema";
import { type VocabSet, emptyVocabSet, vocabSetSchema } from "./vocab-set-schema";
import { type JudgeBallot, emptyJudgeBallot, judgeBallotSchema } from "./judge-ballot-schema";
import { type Subject } from "./subjects";

/**
 * Content type registry. Every material has a type; the type decides its
 * schema, its quality checklist, which builder and print renderer it uses, and
 * which subject tracks it belongs to.
 *
 * Every type shares a small set of identity fields (lessonCode, title,
 * skillFocus, series, resolution, durationMin, accentColor, emoji) so the
 * library, search, fork and Style Kit machinery can treat them uniformly.
 */

export const CONTENT_TYPES = [
  "lesson-pack",
  "class-plan",
  "vocabulary-set",
  "judge-ballot",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** The identity fields every content type carries. */
export interface CommonFields {
  lessonCode: string;
  title: string;
  skillFocus: string;
  series: string;
  resolution: string;
  durationMin: number;
  accentColor: string;
  emoji: string;
}

export type AnyContent = LessonPack | ClassPlan | VocabSet | JudgeBallot;

export interface ContentTypeDef {
  id: ContentType;
  label: string;
  emoji: string;
  /** one-line pitch shown in the new-material picker */
  description: string;
  /** rough printed length, for the picker */
  scale: string;
  /** which subject tracks may use this type */
  subjects: Subject[];
  schema: z.ZodType<AnyContent>;
  empty: () => AnyContent;
  /** does Quick Build support drafting this type? */
  aiSupported: boolean;
}

export const CONTENT_TYPE_DEFS: Record<ContentType, ContentTypeDef> = {
  "lesson-pack": {
    id: "lesson-pack",
    label: "Full Lesson Pack",
    emoji: "📦",
    description:
      "The complete classroom artifact: student pages, evidence deck, worked examples, drills, teacher guide and answer key.",
    scale: "~20 pages",
    subjects: ["debate", "critical-thinking", "writing"],
    schema: lessonPackSchema as unknown as z.ZodType<AnyContent>,
    empty: emptyLessonPack,
    aiSupported: true,
  },
  "class-plan": {
    id: "class-plan",
    label: "Class Plan",
    emoji: "📋",
    description:
      "Lightweight run-sheet for a single session — objective, materials, minute-by-minute segments, key questions, homework.",
    scale: "2–4 pages",
    subjects: ["debate", "critical-thinking", "writing"],
    schema: classPlanSchema as unknown as z.ZodType<AnyContent>,
    empty: emptyClassPlan,
    aiSupported: true,
  },
  "vocabulary-set": {
    id: "vocabulary-set",
    label: "Vocabulary Set",
    emoji: "📖",
    description:
      "Standalone word bank students keep — definitions, analogies, example sentences, common errors, plus practice.",
    scale: "2–3 pages",
    subjects: ["debate", "critical-thinking", "writing"],
    schema: vocabSetSchema as unknown as z.ZodType<AnyContent>,
    empty: emptyVocabSet,
    aiSupported: true,
  },
  "judge-ballot": {
    id: "judge-ballot",
    label: "Judge Ballot",
    emoji: "⚖️",
    description:
      "Structured round feedback form — criteria, speaker points, and prompted Reason For Decision so ballots stay specific.",
    scale: "1–2 pages",
    subjects: ["debate"],
    schema: judgeBallotSchema as unknown as z.ZodType<AnyContent>,
    empty: emptyJudgeBallot,
    aiSupported: true,
  },
};

export function contentTypeDef(t: string | null | undefined): ContentTypeDef {
  return (
    CONTENT_TYPE_DEFS[(t as ContentType) ?? "lesson-pack"] ??
    CONTENT_TYPE_DEFS["lesson-pack"]
  );
}

export function typesForSubject(subject: Subject): ContentTypeDef[] {
  return CONTENT_TYPES.map((t) => CONTENT_TYPE_DEFS[t]).filter((d) =>
    d.subjects.includes(subject)
  );
}

/** Parse stored JSON against its type's schema, filling defaults for new fields. */
export function parseContent(type: string, raw: unknown): AnyContent {
  const def = contentTypeDef(type);
  const parsed = def.schema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as AnyContent);
}

/** Read the shared identity fields off any content type. */
export function commonFields(content: AnyContent): CommonFields {
  const c = content as CommonFields;
  return {
    lessonCode: c.lessonCode ?? "",
    title: c.title ?? "",
    skillFocus: c.skillFocus ?? "",
    series: c.series ?? "",
    resolution: c.resolution ?? "",
    durationMin: c.durationMin ?? 0,
    accentColor: c.accentColor ?? "#0f766e",
    emoji: c.emoji ?? "📦",
  };
}

/**
 * A material that was created but never actually built — the shell a wizard
 * leaves behind when a build is abandoned. They pile up in the library and read
 * as real lessons until you open one, so the listing marks and filters them.
 */
export function isUnbuilt(type: string, content: AnyContent): boolean {
  switch (type) {
    case "lesson-pack":
      return (content as LessonPack).activities.length === 0;
    case "vocabulary-set":
      return (content as VocabSet).terms.length === 0;
    case "class-plan":
      return !(content as ClassPlan).segments?.length;
    default:
      return false;
  }
}

/** Printed-page estimate, used in the library listing. */
export function pageEstimate(type: string, content: AnyContent): number {
  switch (type) {
    case "lesson-pack": {
      const p = content as LessonPack;
      return (
        1 + p.activities.length + Math.ceil(p.evidenceCards.length / 2) + 2
      );
    }
    case "class-plan":
      return 2;
    case "vocabulary-set": {
      const v = content as VocabSet;
      return 1 + Math.ceil(v.terms.length / 6);
    }
    case "judge-ballot":
      return 2;
    default:
      return 1;
  }
}
