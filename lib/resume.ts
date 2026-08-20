import type { MaterialRow } from "./db";
import type { LessonPack } from "./lesson-pack-schema";
import { packReadiness } from "./readiness";
import { commonFields, isUnbuilt } from "./content-types";

/**
 * "WHAT WAS I IN THE MIDDLE OF?"
 *
 * The dashboard could tell a teacher how many lessons they own, how many were
 * built this month and how many are awaiting review — every true number about
 * the library as a whole — and could not tell them the one thing they opened it
 * to find out, which is where they left off. A lesson is not made in one
 * sitting: it is planned at lunch, built during a free period, and finished at
 * nine at night, and each of those returns began with reading a list of titles
 * to work out which one was the unfinished one.
 *
 * Every signal needed to answer it already existed — `packReadiness` knows how
 * far a build got, the workflow status knows whether it is the teacher's move —
 * they were just never joined up and put where the question is asked.
 *
 * Deliberately NOT a "recently viewed" list. Viewing is not progress, and a row
 * that appears because you glanced at something is noise. These are lessons with
 * work outstanding, and each carries the specific next action rather than a
 * generic "open".
 */

export interface ResumeCard {
  id: number;
  title: string;
  lessonCode: string;
  accentColor: string;
  series: string;
  /** what state the work is in, in the teacher's terms */
  headline: string;
  /** the single next action */
  action: { label: string; href: string };
  /** 0–100, or null for types that have no build progress */
  progress: number | null;
  tone: "build" | "finish" | "ready";
  updatedAt: string;
}

/**
 * The lessons with work outstanding, most recently touched first.
 *
 * Published and approved packs are finished work and never appear. Packs in
 * review are somebody else's move, so they are not here either — the review
 * queue is where those live.
 */
export function resumeCards(
  materials: MaterialRow[],
  limit = 3
): ResumeCard[] {
  const out: ResumeCard[] = [];

  for (const m of materials) {
    if (m.status !== "draft") continue;
    const fields = commonFields(m.content);
    const base = {
      id: m.id,
      title: m.title,
      lessonCode: fields.lessonCode ?? "",
      accentColor: fields.accentColor || "#2563eb",
      series: fields.series ?? "",
      updatedAt: m.updated_at,
    };

    if (m.type !== "lesson-pack") {
      if (!isUnbuilt(m.type, m.content)) continue; // a finished plan needs nothing
      out.push({
        ...base,
        headline: "Started but empty",
        action: { label: "Open it", href: `/materials/${m.id}/edit` },
        progress: null,
        tone: "build",
      });
      continue;
    }

    const pack = m.content as LessonPack;
    const readiness = packReadiness(pack);
    const planned = pack.outlinePlan?.length ?? 0;

    if (readiness.level === "empty") {
      out.push({
        ...base,
        headline: "Not built yet",
        action: { label: "Build it with AI", href: `/materials/${m.id}/generate` },
        progress: 0,
        tone: "build",
      });
    } else if (readiness.level === "planned") {
      out.push({
        ...base,
        headline: `Planned — ${planned} pages mapped, none written`,
        action: { label: "Start the build", href: `/materials/${m.id}/generate` },
        progress: 0,
        tone: "build",
      });
    } else if (readiness.level === "partial" || readiness.outstanding > 0) {
      /* A build that stopped part-way. This is the row that matters most: it
         is invisible in a plain library listing, because a half-built pack and
         a finished one look identical from the outside. */
      const total = Math.max(planned, readiness.pages);
      out.push({
        ...base,
        headline: readiness.canTeach
          ? `Teachable now — ${readiness.outstanding} page${readiness.outstanding === 1 ? "" : "s"} still to come`
          : `${readiness.pages} page${readiness.pages === 1 ? "" : "s"} written — needs ${readiness.missing[0] ?? "more work"}`,
        action: { label: "Continue the build", href: `/materials/${m.id}/generate` },
        progress: total > 0 ? Math.round((readiness.pages / total) * 100) : null,
        tone: "build",
      });
    } else {
      /* Built and teachable, but still a draft — the remaining work is reading
         it, fixing what QA found, and submitting. */
      out.push({
        ...base,
        headline: `Built — ${readiness.pages} pages, not submitted yet`,
        action: { label: "Review & finish", href: `/materials/${m.id}` },
        progress: 100,
        tone: "finish",
      });
    }
  }

  /* `updated_at` is the schema's own "YYYY-MM-DD HH:MM:SS" text, which sorts
     correctly as a string — no parsing, and no timezone to get wrong. */
  return out
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, limit);
}
