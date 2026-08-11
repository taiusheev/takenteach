import { type LessonPack } from "./lesson-pack-schema";

/**
 * Coherence advisory — the rubric's top quality dimension made checkable.
 *
 * The blocking checklist verifies that evidence and vocabulary *exist*; it does
 * not verify that they're actually *used*. But "evidence is used, not just
 * presented" and "vocabulary defined early is deployed later" are exactly what
 * separates a coherent pack from a worksheet dump. This report flags cards and
 * terms that never resurface in any activity — advisory, not blocking, since a
 * human decides whether a reference is genuinely missing.
 */

export interface CoherenceReport {
  /** evidence cards never referenced (by "Card X" or their institution) in any activity */
  unusedEvidence: { id: string; institution: string }[];
  /** vocabulary terms never used in any activity */
  unusedVocab: string[];
  /** how many cards / terms there were, so the UI can phrase "2 of 6" */
  evidenceCount: number;
  vocabCount: number;
}

/** All student-facing text across the activities, lower-cased, for matching. */
function activityText(pack: LessonPack): string {
  return pack.activities
    .map((a) =>
      [
        a.instructions,
        a.body,
        a.keyIdea,
        a.standAndDeliver,
        ...a.prompts.flatMap((p) => [p.label, p.expectedAnswer]),
        ...a.exampleLayers.flatMap((l) => [l.label, l.text, l.note]),
        ...a.sortItems.flatMap((s) => [s.statement, s.category, s.explanation]),
        ...a.matchPairs.flatMap((m) => [m.left, m.right]),
        ...a.frames.flatMap((f) => [f.label, f.starter]),
      ].join(" ")
    )
    .join(" \n ")
    .toLowerCase();
}

export function coherenceReport(pack: LessonPack): CoherenceReport {
  const text = activityText(pack);

  const unusedEvidence = pack.evidenceCards
    .filter((c) => {
      const id = c.id.trim().toLowerCase();
      const inst = c.institution.trim().toLowerCase();
      const byId = id.length > 0 && text.includes(`card ${id}`);
      const byInst = inst.length > 3 && text.includes(inst);
      return !(byId || byInst);
    })
    .map((c) => ({ id: c.id, institution: c.institution }));

  const unusedVocab = pack.vocabulary
    .filter((v) => {
      const t = v.term.trim().toLowerCase();
      return t.length > 2 && !text.includes(t);
    })
    .map((v) => v.term);

  return {
    unusedEvidence,
    unusedVocab,
    evidenceCount: pack.evidenceCards.length,
    vocabCount: pack.vocabulary.length,
  };
}
