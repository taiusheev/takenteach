import { type MaterialRow } from "./db";
import { type LessonPack } from "./lesson-pack-schema";
import { type ClassPlan } from "./class-plan-schema";
import { type VocabSet } from "./vocab-set-schema";
import { type JudgeBallot } from "./judge-ballot-schema";
import { type AnyContent, type ContentType, commonFields, isUnbuilt } from "./content-types";
import { type Subject } from "./subjects";
import { type Status } from "./workflow";

/**
 * Library search — full-text across every pack, with structured filters.
 *
 * The corpus is internal and small (dozens of lessons), so search runs in
 * memory over the parsed packs rather than a separate FTS index: each material
 * is flattened into weighted, labeled fields, query terms are matched AND-wise,
 * and results are scored by where the match lands (title > skill > body). This
 * also yields a "matched in …" snippet so a coach can see why a result hit.
 */

export interface SearchQuery {
  q?: string;
  subject?: Subject | "all";
  /** a real status, "all", or the build-state pseudo-filters "unbuilt"/"built" */
  status?: Status | "all" | "unbuilt" | "built";
  type?: ContentType | "all";
  sort?: "recent" | "relevance" | "title";
}

export interface SearchResult {
  material: MaterialRow;
  score: number;
  matchLabel: string; // e.g. "Vocabulary" — which field the top match came from
  snippet: string; // short context window around the match
}

interface Field {
  label: string;
  weight: number;
  text: string;
}

/** Searchable fields differ per content type; identity fields are shared. */
function fields(type: string, content: AnyContent): Field[] {
  const c = commonFields(content);
  const f: Field[] = [
    { label: "Title", weight: 10, text: c.title },
    { label: "Lesson code", weight: 8, text: c.lessonCode },
    { label: "Skill focus", weight: 8, text: c.skillFocus },
    { label: "Series", weight: 6, text: c.series },
    { label: "Anchor", weight: 6, text: c.resolution },
  ];

  if (type === "class-plan") {
    const p = content as ClassPlan;
    f.push(
      { label: "Objective", weight: 5, text: p.objective },
      { label: "Do Now", weight: 3, text: p.doNow },
      { label: "Materials", weight: 2, text: p.materials },
      { label: "Segments", weight: 4, text: p.segments.map((s) => s.title).join(" · ") },
      { label: "Segment detail", weight: 1, text: p.segments.map((s) => s.what).join(" ") },
      { label: "Key questions", weight: 3, text: p.keyQuestions.join(" · ") },
      { label: "Homework", weight: 2, text: p.homework ?? "" }
    );
  } else if (type === "vocabulary-set") {
    const v = content as VocabSet;
    f.push(
      { label: "Terms", weight: 6, text: v.terms.map((t) => t.term).join(" · ") },
      {
        label: "Definitions",
        weight: 4,
        text: v.terms.map((t) => `${t.definition} ${t.analogy} ${t.exampleSentence}`).join(" "),
      },
      { label: "Practice", weight: 2, text: v.practice.map((p) => p.prompt).join(" · ") },
      { label: "Introduction", weight: 2, text: v.introduction ?? "" }
    );
  } else if (type === "judge-ballot") {
    const b = content as JudgeBallot;
    f.push(
      { label: "Format", weight: 4, text: `${b.format ?? ""} ${b.division ?? ""}` },
      { label: "Criteria", weight: 5, text: b.criteria.map((x) => x.name).join(" · ") },
      { label: "Criteria detail", weight: 2, text: b.criteria.map((x) => x.description).join(" ") },
      { label: "RFD prompts", weight: 3, text: b.rfdPrompts.map((p) => p.label).join(" · ") },
      { label: "Feedback prompts", weight: 3, text: b.feedbackPrompts.map((p) => p.label).join(" · ") },
      { label: "Decision rules", weight: 2, text: b.decisionRules ?? "" }
    );
  } else {
    const pack = content as LessonPack;
    f.push(
      { label: "Mission", weight: 3, text: pack.mission },
      { label: "Success criteria", weight: 3, text: pack.successCriteria.join(" · ") },
      {
        label: "Vocabulary",
        weight: 5,
        text: pack.vocabulary.map((v) => `${v.term}: ${v.definition}`).join(" · "),
      },
      {
        label: "Evidence",
        weight: 4,
        text: pack.evidenceCards
          .map((c2) => `${c2.institution} ${c2.year} ${c2.publication} ${c2.paraphrase}`)
          .join(" · "),
      },
      { label: "Activities", weight: 4, text: pack.activities.map((a) => a.title).join(" · ") },
      {
        label: "Activity content",
        weight: 1,
        text: pack.activities.map((a) => `${a.instructions} ${a.body} ${a.keyIdea}`).join(" "),
      },
      {
        label: "Teacher guide",
        weight: 2,
        text: [
          pack.teacherGuide.cohort,
          pack.teacherGuide.assessment,
          pack.teacherGuide.materialsChecklist,
          pack.teacherGuide.timingPlan.map((r) => r.phase).join(" · "),
        ].join(" "),
      }
    );
  }
  return f.filter((x) => x.text.trim().length > 0);
}

function snippetAround(text: string, term: string): string {
  const i = text.toLowerCase().indexOf(term);
  if (i === -1) return text.slice(0, 90);
  const start = Math.max(0, i - 35);
  const end = Math.min(text.length, i + term.length + 55);
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}

function scoreOne(material: MaterialRow, terms: string[]): SearchResult | null {
  const fs = fields(material.type, material.content);
  const haystacks = fs.map((f) => ({ ...f, lower: f.text.toLowerCase() }));

  // AND semantics: every term must appear somewhere.
  const allPresent = terms.every((t) =>
    haystacks.some((h) => h.lower.includes(t))
  );
  if (!allPresent) return null;

  let score = 0;
  let best: { field: Field; term: string } | null = null;
  for (const t of terms) {
    for (const h of haystacks) {
      if (h.lower.includes(t)) {
        score += h.weight;
        if (!best || h.weight > best.field.weight) best = { field: h, term: t };
      }
    }
  }

  const snippetField = best?.field ?? fs[0];
  return {
    material,
    score,
    matchLabel: snippetField.label,
    snippet: snippetAround(snippetField.text, best?.term ?? ""),
  };
}

export function searchMaterials(
  all: MaterialRow[],
  query: SearchQuery
): SearchResult[] {
  const terms = (query.q ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  let rows = all;
  if (query.subject && query.subject !== "all") {
    rows = rows.filter((m) => m.subject === query.subject);
  }
  // Two pseudo-statuses for the shells an abandoned build leaves behind: show
  // only those (to clear them out) or hide them (to see the real library).
  if (query.status === "unbuilt") {
    rows = rows.filter((m) => isUnbuilt(m.type, m.content));
  } else if (query.status === "built") {
    rows = rows.filter((m) => !isUnbuilt(m.type, m.content));
  } else if (query.status && query.status !== "all") {
    rows = rows.filter((m) => m.status === query.status);
  }
  if (query.type && query.type !== "all") {
    rows = rows.filter((m) => m.type === query.type);
  }

  let results: SearchResult[];
  if (terms.length === 0) {
    results = rows.map((m) => ({
      material: m,
      score: 0,
      matchLabel: "",
      snippet: "",
    }));
  } else {
    results = rows
      .map((m) => scoreOne(m, terms))
      .filter((r): r is SearchResult => r !== null);
  }

  const sort = query.sort ?? (terms.length ? "relevance" : "recent");
  results.sort((a, b) => {
    if (sort === "title") {
      return a.material.title.localeCompare(b.material.title);
    }
    if (sort === "relevance" && terms.length) {
      if (b.score !== a.score) return b.score - a.score;
    }
    // recent (also the tiebreaker)
    return (
      new Date(b.material.updated_at).getTime() -
      new Date(a.material.updated_at).getTime()
    );
  });

  return results;
}

/** Counts for the filter chips / library overview. */
export function librarySummary(all: MaterialRow[]) {
  const bySubject: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let unbuilt = 0;
  for (const m of all) {
    bySubject[m.subject] = (bySubject[m.subject] ?? 0) + 1;
    byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
    byType[m.type] = (byType[m.type] ?? 0) + 1;
    if (isUnbuilt(m.type, m.content)) unbuilt++;
  }
  return { total: all.length, bySubject, byStatus, byType, unbuilt };
}
