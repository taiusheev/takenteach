import { type ChecklistItem, type ChecklistResult } from "./checklist";
import { type ClassPlan } from "./class-plan-schema";
import { type VocabSet } from "./vocab-set-schema";
import { type JudgeBallot } from "./judge-ballot-schema";
import { type StyleKitConfig } from "./style-kit";
import { type Subject, subjectDef } from "./subjects";

/**
 * Quality checklists for the lighter content types. Same contract as the
 * Lesson Pack checklist: structural rules come from the assigned Style Kit
 * where they apply, and nothing reaches review until every rule passes.
 */

function build(items: ChecklistItem[]): ChecklistResult {
  return { passed: items.every((i) => i.passed), items };
}

// ── Class Plan ───────────────────────────────────────────────────────────────

export function runClassPlanChecklist(
  plan: ClassPlan,
  subject: Subject,
  kit: StyleKitConfig
): ChecklistResult {
  const def = subjectDef(subject);
  const items: ChecklistItem[] = [];
  const add = (id: string, label: string, passed: boolean, detail: string) =>
    items.push({ id, label, passed, detail });

  const hasAnchor = plan.resolution.trim().length > 0;
  add(
    "anchor-present",
    `${def.anchorLabel} is stated`,
    hasAnchor,
    hasAnchor ? `"${plan.resolution.trim()}"` : `Every artifact in a unit carries the same ${def.anchorLabel.toLowerCase()}.`
  );

  const hasObjective = plan.objective.trim().length > 0;
  add(
    "objective",
    "Objective is stated",
    hasObjective,
    hasObjective ? plan.objective.trim() : "A plan without an objective can't be assessed."
  );

  add(
    "materials",
    "Materials are listed",
    plan.materials.trim().length > 0,
    plan.materials.trim() ? "Listed" : "List what the teacher must bring or print."
  );

  add(
    "do-now",
    "Opening Do Now / warm-up is written",
    plan.doNow.trim().length > 0,
    plan.doNow.trim() ? "Present" : "Students need something to start on as they walk in."
  );

  const segs = plan.segments;
  const covers =
    segs.length > 0 && segs[segs.length - 1].endMin >= plan.durationMin;
  add(
    "segments-cover",
    "Segments cover the full session",
    covers,
    segs.length === 0
      ? "No segments yet."
      : covers
        ? `${segs.length} segments through minute ${segs[segs.length - 1].endMin}`
        : `Segments end at minute ${segs[segs.length - 1].endMin} but the session is ${plan.durationMin} minutes.`
  );

  const gaps = segs.filter((s, i) => i > 0 && s.startMin !== segs[i - 1].endMin);
  add(
    "segments-contiguous",
    "Segment timings are contiguous (no gaps or overlaps)",
    segs.length === 0 || gaps.length === 0,
    gaps.length === 0
      ? "Timeline is continuous"
      : `${gaps.length} gap/overlap at: ${gaps.map((g) => `${g.startMin}min`).join(", ")}`
  );

  const emptySegs = segs.filter((s) => s.what.trim() === "" || s.title.trim() === "");
  add(
    "segments-described",
    "Every segment says what actually happens",
    emptySegs.length === 0,
    emptySegs.length === 0 ? "All described" : `${emptySegs.length} segment(s) missing a title or description.`
  );

  const qs = plan.keyQuestions.filter((q) => q.trim() !== "");
  add(
    "key-questions",
    "At least 3 key / check-for-understanding questions",
    qs.length >= 3,
    `${qs.length} present`
  );

  void kit;
  return build(items);
}

// ── Vocabulary Set ───────────────────────────────────────────────────────────

export function runVocabSetChecklist(
  set: VocabSet,
  subject: Subject,
  kit: StyleKitConfig
): ChecklistResult {
  const def = subjectDef(subject);
  const items: ChecklistItem[] = [];
  const add = (id: string, label: string, passed: boolean, detail: string) =>
    items.push({ id, label, passed, detail });
  const min = kit.rules.minVocabTerms;

  const hasAnchor = set.resolution.trim().length > 0;
  add(
    "anchor-present",
    `${def.anchorLabel} is stated`,
    hasAnchor,
    hasAnchor ? `"${set.resolution.trim()}"` : `These words serve a unit — name its ${def.anchorLabel.toLowerCase()}.`
  );

  add(
    "term-count",
    `At least ${min} terms`,
    set.terms.length >= min,
    set.terms.length >= min
      ? `${set.terms.length} terms`
      : `Only ${set.terms.length} — this kit's word-bank rule requires ${min}.`
  );

  const undefined_ = set.terms.filter((t) => t.definition.trim() === "");
  add(
    "definitions",
    "Every term has a definition",
    undefined_.length === 0,
    undefined_.length === 0
      ? "All defined"
      : `Undefined: ${undefined_.map((t) => t.term || "(unnamed)").join(", ")}`
  );

  const noExample = set.terms.filter((t) => t.exampleSentence.trim() === "");
  add(
    "examples",
    "Every term has an example sentence",
    set.terms.length > 0 && noExample.length === 0,
    set.terms.length === 0
      ? "No terms yet."
      : noExample.length === 0
        ? "All exemplified"
        : `Missing an example: ${noExample.map((t) => t.term || "(unnamed)").join(", ")}`
  );

  const noAnalogy = set.terms.filter((t) => t.analogy.trim() === "");
  add(
    "analogies",
    "Every term has a plain-language analogy",
    set.terms.length > 0 && noAnalogy.length === 0,
    noAnalogy.length === 0 && set.terms.length > 0
      ? "All have analogies"
      : set.terms.length === 0
        ? "No terms yet."
        : `Missing an analogy: ${noAnalogy.map((t) => t.term || "(unnamed)").join(", ")}`
  );

  const practice = set.practice.filter((p) => p.prompt.trim() !== "");
  add(
    "practice",
    "At least 4 practice items",
    practice.length >= 4,
    `${practice.length} present`
  );

  const unkeyed = [...set.practice, ...set.quickFire].filter(
    (p) => p.prompt.trim() !== "" && p.expectedAnswer.trim() === ""
  );
  add(
    "practice-keyed",
    "Every practice item has an expected answer",
    unkeyed.length === 0,
    unkeyed.length === 0 ? "All keyed" : `${unkeyed.length} item(s) missing an answer.`
  );

  return build(items);
}

// ── Judge Ballot ─────────────────────────────────────────────────────────────

export function runJudgeBallotChecklist(
  ballot: JudgeBallot,
  subject: Subject,
  kit: StyleKitConfig
): ChecklistResult {
  const items: ChecklistItem[] = [];
  const add = (id: string, label: string, passed: boolean, detail: string) =>
    items.push({ id, label, passed, detail });

  add(
    "resolution",
    "Round resolution is stated",
    ballot.resolution.trim().length > 0,
    ballot.resolution.trim() ? `"${ballot.resolution.trim()}"` : "A ballot must name the resolution being judged."
  );

  add(
    "format",
    "Debate format is named",
    (ballot.format ?? "").trim().length > 0,
    ballot.format?.trim() || "e.g. Public Forum, Lincoln-Douglas"
  );

  const crit = ballot.criteria.filter((c) => c.name.trim() !== "");
  add(
    "criteria-count",
    "At least 3 judging criteria",
    crit.length >= 3,
    `${crit.length} present`
  );

  const vagueCriteria = crit.filter((c) => c.description.trim().length < 15);
  add(
    "criteria-described",
    "Every criterion explains what the judge is looking for",
    crit.length > 0 && vagueCriteria.length === 0,
    crit.length === 0
      ? "No criteria yet."
      : vagueCriteria.length === 0
        ? "All criteria are specific"
        : `Too vague to judge consistently: ${vagueCriteria.map((c) => c.name).join(", ")}`
  );

  const sp = ballot.speakerPoints;
  add(
    "speaker-points",
    "Speaker point range is valid and explained",
    sp.max > sp.min && sp.guidance.trim().length > 0,
    sp.max <= sp.min
      ? `Range ${sp.min}–${sp.max} is invalid.`
      : sp.guidance.trim()
        ? `${sp.min}–${sp.max}, with guidance`
        : `${sp.min}–${sp.max} — add guidance so judges score consistently.`
  );

  const rfd = ballot.rfdPrompts.filter((p) => p.label.trim() !== "");
  add(
    "rfd-prompts",
    "At least 2 Reason For Decision prompts",
    rfd.length >= 2,
    rfd.length >= 2
      ? `${rfd.length} prompts`
      : `${rfd.length} — prompted RFDs are what stop "it was good" ballots.`
  );

  const fb = ballot.feedbackPrompts.filter((p) => p.label.trim() !== "");
  add(
    "feedback-prompts",
    "At least 2 debater feedback prompts",
    fb.length >= 2,
    `${fb.length} present`
  );

  add(
    "decision-rules",
    "Decision rules are stated",
    (ballot.decisionRules ?? "").trim().length > 0,
    ballot.decisionRules?.trim() ? "Stated" : "Say how a winner is decided (e.g. who best upheld the burden)."
  );

  void subject;
  void kit;
  return build(items);
}
