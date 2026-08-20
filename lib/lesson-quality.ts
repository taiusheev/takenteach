/**
 * What "high level" means, made explicit.
 *
 * These are the instructional-design standards a strong Ascent lesson meets.
 * The AI generator targets them, the self-revision pass grades against them,
 * and reviewers can use them as a shared vocabulary. Grounded in the real UBI
 * Novice exemplar: dense multi-component pages, true gradual release, evidence
 * used not just presented, and an exit ticket that tests the day's promise.
 */

export interface QualityDimension {
  id: string;
  label: string;
  standard: string;
}

export const QUALITY_RUBRIC: QualityDimension[] = [
  {
    id: "gradual-release",
    label: "Gradual release",
    standard:
      "The lesson moves I-Do → We-Do → You-Do: the teacher models the skill in full, students practise it together with support, then perform it independently. Support is removed deliberately, not abruptly — a bridge/training-wheels page sits between guided and independent work.",
  },
  {
    id: "cognitive-progression",
    label: "Cognitive progression",
    standard:
      "Activities climb from recall to application to analysis to creation. The lesson does not stay at 'define the term' — it ends with students producing and defending original work, and includes at least one transfer task that applies the skill to a NEW context.",
  },
  {
    id: "page-density",
    label: "Depth per page",
    standard:
      "Each student page is a complete, self-contained activity with multiple interlocking parts (e.g. an instruction banner + a worked component + a student-production component + an oral micro-task), not a single sparse prompt. A page a student finishes in 30 seconds is too thin.",
  },
  {
    id: "evidence-used",
    label: "Evidence is used, not just presented",
    standard:
      "Every evidence/source card is referenced by name or ID in a later activity where students actually deploy it — building an argument, spotting its limit, or weighing it. Cards that are read once and never used again are dead weight.",
  },
  {
    id: "coherence",
    label: "Coherence & cross-referencing",
    standard:
      "Vocabulary defined early is used verbatim later. Activities build on each other — the hook seeds the concept, instruction names it, practice applies it, the exit ticket assesses it. The anchor (resolution / question / focus) appears in every activity that touches content.",
  },
  {
    id: "assessment-alignment",
    label: "Assessment alignment",
    standard:
      "The exit ticket tests exactly the success criteria stated on the cover — no more, no less. The grading rubric's bands describe the specific product students actually make in this lesson. Nothing is assessed that wasn't taught and practised.",
  },
  {
    id: "engagement",
    label: "Engagement & participation",
    standard:
      "Students talk, move, and produce constantly — spars, cold-call debriefs, stand-and-deliver micro-tasks, partner work. No page is passive reading. The spy/agent theming carries through, but never at the cost of rigor. NO EMOJI anywhere.",
  },
  {
    id: "reading-level",
    label: "Calibrated reading level",
    standard:
      "Sentences are short and concrete for English learners, every term is defined on first use, and abstract ideas land through a specific analogy — WITHOUT dumbing down the intellectual demand. Accessible language, sophisticated thinking.",
  },
];

// ── Rigor level ───────────────────────────────────────────────────────────────

export const RIGOR_LEVELS = [
  "foundational",
  "standard",
  "advanced",
  "elite",
] as const;
export type RigorLevel = (typeof RIGOR_LEVELS)[number];

export const RIGOR_DEFS: Record<
  RigorLevel,
  { label: string; hint: string; guidance: string }
> = {
  foundational: {
    label: "Foundational",
    hint: "First exposure — heavier scaffolding, more modeling",
    guidance:
      "This cohort is new to the skill. Weight the lesson toward modeling and guided practice: more worked examples, more sentence frames, smaller independent steps, and an extra bridge page before independent work. Keep independent tasks tightly bounded. Still end with a real independent product, but with generous scaffolds.",
  },
  standard: {
    label: "Standard",
    hint: "Grade-level novice — the default balance",
    guidance:
      "Balance modeling, guided practice, and independent production evenly. One clear worked example, one guided round, then independent work with frames available but not required. This is the default Ascent Novice rigor.",
  },
  advanced: {
    label: "Advanced",
    hint: "Ready to stretch — less scaffolding, higher demand",
    guidance:
      "This cohort has the fundamentals. Reduce scaffolding: fewer frames, faster to independent work, and raise cognitive demand — add comparison, synthesis across multiple evidence cards, anticipating counterarguments, and a demanding transfer task to an unfamiliar context. Push analysis and evaluation, not just application.",
  },
  elite: {
    label: "Elite",
    hint: "Competitive squad — expert depth, no hand-holding",
    guidance: `This is an ELITE competitive squad. They already own the fundamentals and the vocabulary of the discipline — teaching them a definition insults them. The failure mode for this cohort is a lesson that is merely tidy and correct; it must be genuinely hard.

WHAT ELITE MEANS, CONCRETELY:
- Start where a standard lesson ENDS. No page may be satisfied by recall or by applying one rule to one clean case. Assume mastery of every prior term and skip the warm-up entirely — the hook is already a hard case.
- Work the EDGE CASES: where the technique fails, where two correct principles collide, where the textbook move is a trap. At least two pages must present a case with no clean answer, where the student must choose and justify a trade-off.
- SYNTHESIS ACROSS EVIDENCE: pages must make students hold 2–3 cards against each other — which one carries the claim, where they conflict, which is methodologically weaker and why. A page that uses one card in isolation is beneath this cohort.
- CRITIQUE THE EVIDENCE ITSELF: sample size, who funded it, what the limit actually forecloses, what a hostile expert would say about it. They should learn to attack a source's construction, not just quote it.
- PRECISION OF TERMS: this cohort is graded on using the discipline's distinctions exactly. Every label a page applies must be technically correct and consistently used, and every model answer must state WHY the label applies.
- STRATEGIC / META LEVEL: include at least one page about choosing between techniques under real conditions — time pressure, an opponent who has prepared for this, what to do when the strong move is unavailable.
- PRODUCTION LOAD: 3+ substantive prompts on production pages, demanding real writing (a full argument, a rebuttal block, a comparative), not a fill-in. NO sentence frames except where a page deliberately drills a form; scaffolds are for novices.
- The exit ticket must be genuinely discriminating — a strong student and an excellent one should not both score full marks.`,
  },
};

export function rigorGuidance(level: string | undefined): string {
  const l = (level as RigorLevel) in RIGOR_DEFS ? (level as RigorLevel) : "standard";
  return RIGOR_DEFS[l].guidance;
}

// ── Grade band → reading-level calibration ────────────────────────────────────

export const GRADE_BANDS = [
  "Grades 4–5",
  "Grades 6–8",
  "Grades 9–10",
  "Grades 11–12",
  "Mixed / adult learners",
] as const;

export function gradeBandGuidance(band: string | undefined): string {
  const b = band?.trim() || "Grades 6–8";
  // Younger bands must read like a worksheet, not an essay: hard per-block word
  // caps stop a page turning into a wall of text a novice won't read.
  const young = /\b(4|5|6|7|8)\b/.test(b) && !/\b(9|10|11|12)\b/.test(b);
  // The per-block caps are the ones that matter and they are unchanged: what
  // makes a novice stop reading is one long PARAGRAPH, not a page carrying many
  // short labelled cells. The whole-page number moved (130 → ~200) because the
  // old figure was being read as a budget to spend rather than a wall of prose
  // to avoid, and it fought the coaching lines that now print beside each box.
  // The gate sits at 240 — see `page-density` in lib/checklist.ts.
  const caps = young
    ? ` These are NOVICE / younger readers — keep text SPARSE and scannable: no single readable block over ~22 words; scene lines and prompt labels ≤14 words; a keyIdea ≤20 words; a worked-example layer ≤25 words. Total words a student must READ on any one page should stay around ~200 and never exceed 240. Density is fine; PARAGRAPHS are not — if an idea needs more room, split it across a step list, a compare table or a second page, never a block of prose.`
    : "";
  // Older bands get the opposite pressure from the novice caps: the risk there
  // is a page a strong student clears in ninety seconds and learns nothing from.
  const floor = young
    ? ""
    : ` These are OLDER readers — the danger is a page that is too THIN, not too dense. Write at their level: real sentences, technical vocabulary used precisely, examples with genuine complication. A page a capable student finishes in under two minutes without thinking hard is a failed page. Concretely: aim for roughly 250–350 words of student-facing content on a full page (the ceiling is 380), and at least two things the student must produce or decide. A page carrying one instruction and one blank is below this cohort.`;
  return `Target reading level: ${b}. Calibrate sentence length, vocabulary, and example complexity to this band while keeping the thinking demanding.${caps}${floor}`;
}

/** The rubric rendered for a generation prompt. */
export function rubricForPrompt(): string {
  return QUALITY_RUBRIC.map((d, i) => `${i + 1}. ${d.label}: ${d.standard}`).join(
    "\n"
  );
}
