import { type Subject } from "./subjects";

/**
 * Lesson formats — the structural variety layer.
 *
 * Rigor alone makes lessons good; format makes them *different*. Without this,
 * every generated pack marches through the same hook→instruct→model→practise
 * skeleton and a ten-lesson series feels like one lesson ten times. Each format
 * below is a genuinely different shape of class, with its own arc, and each is
 * a real thing good teachers do.
 */

export interface LessonFormat {
  id: string;
  label: string;
  emoji: string;
  /** one line the author sees when choosing */
  blurb: string;
  subjects: Subject[];
  /** the arc the AI must build for this format */
  arc: string;
}

export const LESSON_FORMATS: LessonFormat[] = [
  {
    id: "auto",
    label: "Let AI choose",
    emoji: "✨",
    blurb: "Pick the shape that best fits this skill",
    subjects: ["debate", "critical-thinking", "writing"],
    arc: "Choose whichever format below genuinely suits this skill and say why in the subtitle. Prefer a format NOT used by the other lessons in this series.",
  },
  {
    id: "skill-drill",
    label: "Skill Drill",
    emoji: "🎯",
    blurb: "Isolate one move and rep it until it's automatic",
    subjects: ["debate", "critical-thinking", "writing"],
    arc: "Isolate ONE narrow move and build automaticity. Short teach, then many fast reps at increasing difficulty with immediate feedback each round: recognise it → fix a broken one → produce one with support → produce one cold → beat the clock. Pages are short, numerous, and repetitive by design. End with a timed solo rep as the exit ticket.",
  },
  {
    id: "case-study",
    label: "Case Study",
    emoji: "🔬",
    blurb: "Dissect one rich real example end to end",
    subjects: ["debate", "critical-thinking", "writing"],
    arc: "Anchor the whole lesson in ONE rich real case (a real dispute, article, speech, or dataset). Students meet the case, annotate it, argue about it, and extract the transferable principle from it. The case appears on nearly every page from a new angle. End by applying the extracted principle to a second, unfamiliar case.",
  },
  {
    id: "debate-lab",
    label: "Debate Lab",
    emoji: "⚔️",
    blurb: "Run rounds, then dissect what happened",
    subjects: ["debate"],
    arc: "Structure the class as live rounds with analysis between them. Short setup, then Round 1 → freeze-frame debrief naming what went wrong → targeted micro-teach → Round 2 with the fix → compare. Students spend most of the class speaking. Flow sheets and observer roles are part of the pack. Exit ticket is a self-diagnosis of their own round.",
  },
  {
    id: "workshop",
    label: "Writing Workshop",
    emoji: "✍️",
    blurb: "Draft, critique, revise in one sitting",
    subjects: ["writing", "critical-thinking"],
    arc: "A produce-critique-revise cycle. Brief mentor-text study, then students draft early and spend most of the class improving that draft: silent drafting → structured peer critique against a named criterion → targeted revision pass → second critique on a different lens → final polish. The same piece of student writing travels through every page.",
  },
  {
    id: "seminar",
    label: "Socratic Seminar",
    emoji: "🗣️",
    blurb: "Prepared discussion driven by student questions",
    subjects: ["critical-thinking", "writing", "debate"],
    arc: "Discussion-centred. Students prepare from a common text/stimulus, generate their own questions, then run a structured seminar (inner/outer circle, talk-tokens, or similar) while tracking each other's reasoning. Teacher speaks rarely. Pack includes prep pages, a question-stem bank, a discussion tracker students fill in about their peers, and a post-seminar reflection.",
  },
  {
    id: "investigation",
    label: "Investigation",
    emoji: "🕵️",
    blurb: "Solve a mystery using evidence",
    subjects: ["critical-thinking", "debate"],
    arc: "Frame the class as a case to crack. Open with a genuine puzzle, contradiction, or suspicious claim. Students receive evidence in stages, form and revise a hypothesis, hit a deliberate twist that breaks a naive reading, and reach a defended conclusion. Evidence is released page by page rather than all at once. Exit ticket is their verdict plus the reasoning chain.",
  },
  {
    id: "tournament",
    label: "Tournament",
    emoji: "🏆",
    blurb: "Competitive rounds with scoring and stakes",
    subjects: ["debate", "critical-thinking"],
    arc: "Gamified competition. Teams progress through scored challenges or bracketed matchups, with a visible scoreboard and clear scoring rules. Each stage targets a different facet of the skill and gets harder. Includes scorecards, rules pages, and a champion round. Rigor comes from the scoring criteria being the skill's real success criteria.",
  },
  {
    id: "clinic",
    label: "Error Clinic",
    emoji: "🩺",
    blurb: "Diagnose and repair broken work",
    subjects: ["debate", "critical-thinking", "writing"],
    arc: "Students are the doctors. The pack is full of deliberately flawed specimens — broken arguments, weak paragraphs, fallacious claims. Students diagnose the specific fault by name, prescribe the fix, then perform the repair. Difficulty escalates from one obvious fault to multiple subtle interacting ones. Exit ticket: repair a specimen cold, and name the fault.",
  },
];

const BY_ID = new Map(LESSON_FORMATS.map((f) => [f.id, f]));

export function lessonFormat(id: string | undefined): LessonFormat {
  return BY_ID.get(id ?? "auto") ?? BY_ID.get("auto")!;
}

export function formatsForSubject(subject: Subject): LessonFormat[] {
  return LESSON_FORMATS.filter((f) => f.subjects.includes(subject));
}

/** Format guidance for the generation prompt. */
export function formatForPrompt(id: string | undefined, subject: Subject): string {
  const f = lessonFormat(id);
  if (f.id === "auto") {
    const options = formatsForSubject(subject)
      .filter((x) => x.id !== "auto")
      .map((x) => `- ${x.label}: ${x.arc}`)
      .join("\n");
    return `LESSON FORMAT — choose the best fit for this skill, and commit to it fully:\n${options}\n\n${f.arc}`;
  }
  return `LESSON FORMAT — ${f.label.toUpperCase()}. Build the whole lesson in this shape:\n${f.arc}`;
}
