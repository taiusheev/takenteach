/**
 * Subject tracks — each requires a different pedagogical approach, print
 * design, and quality checklist. The Lesson Pack schema is shared; subjects
 * change what the AI generates, which checklist rules apply, and how pages
 * render.
 */

export const SUBJECTS = ["debate", "critical-thinking", "writing"] as const;
export type Subject = (typeof SUBJECTS)[number];

export interface SubjectTheme {
  /** page border + heading accent */
  accent: string;
  /** secondary accent (badges, highlights) */
  gold: string;
  /** CSS background-image for student pages */
  pageBackground: string;
  backgroundSize: string;
  /** label shown under the brand */
  trackLabel: string;
}

export interface SubjectDef {
  id: Subject;
  label: string;
  emoji: string;
  /** what the "resolution" field means in this track */
  anchorLabel: string;
  anchorPlaceholder: string;
  /** what evidence cards are called / whether they're required */
  evidenceLabel: string;
  requiresEvidence: boolean;
  requiresRubric: boolean;
  theme: SubjectTheme;
  /** pedagogical guidance injected into AI generation prompts */
  aiGuidance: string;
}

export const SUBJECT_DEFS: Record<Subject, SubjectDef> = {
  debate: {
    id: "debate",
    label: "Debate",
    emoji: "⚡",
    anchorLabel: "Resolution",
    anchorPlaceholder:
      "Resolved: Asia-Pacific governments should adopt universal basic income.",
    evidenceLabel: "Evidence Deck",
    requiresEvidence: true,
    requiresRubric: false,
    theme: {
      accent: "#0f766e",
      gold: "#d97706",
      pageBackground:
        "linear-gradient(rgba(37,99,235,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.07) 1px, transparent 1px)",
      backgroundSize: "20px 20px",
      trackLabel: "DEBATE TRACK",
    },
    aiGuidance: `Debate lessons train competitive Public Forum-style debaters. Every lesson anchors to ONE season resolution — every activity, example, and evidence card must stay on-resolution. Core moves: PEEL/CCEWI argument structure, rebuttal, frontlines, crossfire, weighing (scope/magnitude/timeframe), summary/final focus. Students spar orally every lesson. Evidence cards are sacred: real sources only, paraphrase ≤40 words, plain-English translation, tactical "how to use in round" note, and a LIMIT block stating what the card CANNOT prove. Activities alternate: hook spar → direct instruction → I Do (teacher models) → We Do (label & fix) → drill → evidence study → scaffolded build (PRO and CON separately) → independent build → oral sparring rounds → transfer test → exit ticket.`,
  },
  "critical-thinking": {
    id: "critical-thinking",
    label: "Critical Thinking",
    emoji: "🧠",
    anchorLabel: "Central Question",
    anchorPlaceholder:
      "Central Question: How can we tell reliable information from misinformation online?",
    evidenceLabel: "Source Deck",
    requiresEvidence: true,
    requiresRubric: false,
    theme: {
      accent: "#6d28d9",
      gold: "#c026d3",
      pageBackground:
        "radial-gradient(rgba(109,40,217,0.09) 1.2px, transparent 1.2px)",
      backgroundSize: "18px 18px",
      trackLabel: "CRITICAL THINKING TRACK",
    },
    aiGuidance: `Critical Thinking lessons train reasoning skills: identifying claims vs evidence, spotting logical fallacies, evaluating source reliability, mapping arguments, distinguishing correlation from causation, recognizing bias. Every lesson anchors to ONE central question explored through real-world cases. Core moves: claim-evidence-reasoning analysis, fallacy spotting (name + explain + fix), source credibility checks (who wrote it, when, why, what's missing), argument mapping (premises → conclusion), counterexample hunting. Sources in the source deck are real; each carries a reliability note and a LIMIT stating what it cannot show. Activities alternate: provocation hook (a puzzle or misleading claim to dissect) → direct instruction on the thinking move → I Do (teacher reasons aloud) → We Do (analyze together) → sort/classification drills → source study → scaffolded analysis → independent analysis → structured discussion (think-pair-share, four corners) → transfer to a new domain → exit ticket.`,
  },
  writing: {
    id: "writing",
    label: "Academic Writing",
    emoji: "✍️",
    anchorLabel: "Writing Focus",
    anchorPlaceholder:
      "Writing Focus: Persuasive essays that argue a clear thesis with sourced evidence.",
    evidenceLabel: "Source & Mentor Deck",
    requiresEvidence: false,
    requiresRubric: true,
    theme: {
      accent: "#b45309",
      gold: "#0369a1",
      pageBackground:
        "repeating-linear-gradient(transparent, transparent 27px, rgba(180,83,9,0.12) 27px, rgba(180,83,9,0.12) 28px)",
      backgroundSize: "auto",
      trackLabel: "ACADEMIC WRITING TRACK",
    },
    aiGuidance: `Academic Writing lessons train essay craft: thesis statements, paragraph structure (topic sentence → evidence → analysis → transition), introductions/conclusions, integrating and citing sources, revision. Every lesson anchors to ONE writing focus and builds toward a written product. Core moves: mentor-text study (annotate a strong model, name WHY it works), sentence-level craft drills (combining, transitions, precise verbs), scaffolded drafting with frames, peer feedback with specific criteria, revision passes with a single lens per pass. The I Do worked example IS a mentor text with labeled parts. A grading rubric with 4 bands is mandatory — students see the rubric before drafting. Activities alternate: quickwrite hook → mentor text study → direct instruction on the craft move → I Do (teacher writes/annotates live) → We Do (improve a weak sample together) → craft drill → scaffolded draft with frames → independent draft → peer feedback protocol → revision pass → exit ticket (one polished paragraph or excerpt).`,
  },
};

export function subjectDef(s: string | null | undefined): SubjectDef {
  return SUBJECT_DEFS[(s as Subject) ?? "debate"] ?? SUBJECT_DEFS.debate;
}
