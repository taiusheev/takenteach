/**
 * The academy's actual course, as the founder teaches it.
 *
 * Every pack we have built so far was a lesson floating in space: a skill, a
 * motion, and whatever the model decided the arc should be. The founder's own
 * materials work the other way round — his master prompt opens with a section
 * headed "FIRST PRIORITY: THE SYLLABUS ENGINE", and the rule is exact:
 *
 *   "Check the Lesson Number against this exact Spring 2026 Syllabus to
 *    determine the specific skill focus. You must use the *previous* lesson for
 *    the Review section, and the *current* lesson for the core content."
 *
 * That is what makes ten packs a course instead of ten worksheets: lesson 4 is
 * rebuttal because lesson 3 was flowing, and lesson 4 opens by checking that
 * lesson 3 actually landed. Both halves of that rule are encoded here — the
 * trajectory itself, and the pointer back to what the students were taught last
 * week.
 *
 * Curated from `Ascent Academy PF Syllabuses Spring 2026`, deliberately NOT
 * AI-generated: a hallucinated skill trajectory would silently teach the wrong
 * lesson on the wrong Saturday. Same reasoning as lib/debate-formats.ts.
 */

export interface SyllabusLesson {
  /** lesson code as the packs use it — "L1"… */
  code: string;
  /** the founder's own lesson-focus label */
  focus: string;
  /** the skill, in the language of his syllabus */
  skill: string;
  /** the drill that lesson runs — his own, by name */
  drill: string;
}

export interface SyllabusTrack {
  id: string;
  label: string;
  /** who it is for, in one line */
  cohort: string;
  lessons: SyllabusLesson[];
}

/**
 * PART 1 of the Novice cycle. The trajectory repeats for each topic, which is
 * why it is stored by skill rather than by content: War Powers L4 and Corporate
 * Housing L4 are both Rebuttal, applied to different material.
 */
const PF_NOVICE: SyllabusTrack = {
  id: "pf-novice",
  label: "Public Forum · Novice",
  cohort:
    "Students with limited or no prior debate experience, working toward mastery of the standard PF round.",
  lessons: [
    {
      code: "L1",
      focus: "Topic Intro & PEEL Argument",
      skill:
        "Introduction to Public Forum structure, and the PEEL model (Point, Explanation, Evidence, Link) for a basic argument.",
      drill: "Write one PEEL paragraph arguing a side of the resolution.",
    },
    {
      code: "L2",
      focus: "Background, Link, Impact",
      skill:
        "Moving from a paragraph to a full contention: Uniqueness (the status quo), Link (how the resolution changes things), Impact (why it matters).",
      drill:
        '"Link Chain" worksheet — connecting the resolution\'s action to the impact it claims.',
    },
    {
      code: "L3",
      focus: "Delivery & Flowing",
      skill:
        "Active listening and vertical flowing, plus basic public speaking — posture, eye contact, volume.",
      drill:
        "Flow a sample round (first two speeches only). Delivery drills: pen in mouth, volume variation.",
    },
    {
      code: "L4",
      focus: "Rebuttal (Refutation)",
      skill:
        'The 4-step refutation — "They say… We say… Because… Therefore…" — aimed at the opponent\'s case.',
      drill: '"Rebuttal Redo" — two minutes to attack a single contention.',
    },
    {
      code: "L5",
      focus: "Defense & Frontlines",
      skill:
        "Defending your own case in the second rebuttal, and frontlining — responding to the response.",
      drill: "1-vs-1 drills: Student A attacks, Student B frontlines.",
    },
    {
      code: "L6",
      focus: "Crossfire",
      skill:
        "Asking strategic questions, not making speeches during cross, and poking holes in logic.",
      drill:
        '"Hot Seat" crossfire — students rotate in to ask the instructor one question each.',
    },
    {
      code: "L7",
      focus: "Full Summary",
      skill:
        "The art of condensation: dropping losing arguments and extending winning ones.",
      drill: "Two-minute summary speech condensing a whole debate.",
    },
    {
      code: "L8",
      focus: "Weighing",
      skill:
        "Impact calculus — magnitude, probability, timeframe — and saying why your impact comes first.",
      drill:
        '"Impact Battles" — students draw two impacts and argue why one outweighs the other.',
    },
    {
      code: "L9",
      focus: "Final Focus & Strategy",
      skill:
        'Voters: telling the judge exactly how to vote, and crystallising the round into a story.',
      drill: "Write the judge's ballot, then deliver the final two-minute speech.",
    },
    {
      code: "L10",
      focus: "Full Debate / Showcase Prep",
      skill: "Synthesis of every previous skill under round conditions.",
      drill: "Full practice rounds with feedback.",
    },
  ],
};

/** The same nine-step trajectory, run for depth, nuance and technical execution. */
const PF_JV: SyllabusTrack = {
  id: "pf-jv",
  label: "Public Forum · JV",
  cohort:
    "Debaters who have the mechanics and are now working on depth, nuance and technical execution.",
  lessons: [
    {
      code: "L1",
      focus: "Topic Intro & PEEL (Thesis)",
      skill:
        "Advanced thesis generation — framing the whole debate contextually before arguing inside it.",
      drill: "Write a thesis statement that frames the entire case.",
    },
    {
      code: "L2",
      focus: "Background, Link, Impact (Scenarios)",
      skill:
        "Scenario building: multiple internal links running to the same impact.",
      drill: "Build a scenario advantage with three distinct internal links.",
    },
    {
      code: "L3",
      focus: "Delivery & Tech Flowing",
      skill: "Flowing at speed, and line-by-line organisation.",
      drill: "Flow a fast round and track every dropped argument.",
    },
    {
      code: "L4",
      focus: "Rebuttal (Offense)",
      skill:
        'Generating offense with turns — not "no", but "actually, the opposite is true".',
      drill: "Generate three unique turns against a standard contention.",
    },
    {
      code: "L5",
      focus: "Defense (Strategic)",
      skill:
        'Strategic concessions: kicking a contention to buy time for the one that wins.',
      drill: "The kick drill — concede defense explicitly to focus on offense.",
    },
    {
      code: "L6",
      focus: "Crossfire (Traps)",
      skill:
        "Setting traps and getting admissions you can spend in the summary.",
      drill: "Trap drills — force an opponent onto a definition that hurts them.",
    },
    {
      code: "L7",
      focus: "Full Summary (Split)",
      skill:
        "The summary split: frontlining defense and extending offense inside three minutes.",
      drill: "50/50 summary drill — half defense, half offense.",
    },
    {
      code: "L8",
      focus: "Weighing (Meta)",
      skill:
        'Meta-weighing: arguing which weighing mechanism the judge should use at all.',
      drill: "Meta-weighing speeches on two incommensurable impacts.",
    },
    {
      code: "L9",
      focus: "Final Focus (Ballot)",
      skill: "Writing the ballot, mirroring the summary exactly.",
      drill: "Pre-write the final focus during the opponent's speech.",
    },
    {
      code: "L10",
      focus: "Full Debate (Tech)",
      skill: "Full technical execution under flow-centric judging.",
      drill: "Rounds judged on the flow.",
    },
  ],
};

export const SYLLABUS_TRACKS: SyllabusTrack[] = [PF_NOVICE, PF_JV];

/**
 * Which track a pack belongs to.
 *
 * Rigor is the signal we already collect, and it maps cleanly: foundational and
 * standard cohorts are running the novice trajectory, advanced and elite ones
 * the JV one. Non-debate subjects have no PF syllabus and get none — better no
 * trajectory than the wrong one.
 */
export function trackFor(
  subject: string,
  rigorLevel: string
): SyllabusTrack | null {
  if (subject !== "debate") return null;
  const r = (rigorLevel || "").toLowerCase();
  return r === "advanced" || r === "elite" ? PF_JV : PF_NOVICE;
}

/** Normalises "l4", "L4 ", "4" → "L4" so an author's typing can't miss the slot. */
function normaliseCode(code: string): string {
  const n = (code || "").trim().match(/\d+/)?.[0];
  return n ? `L${Number(n)}` : "";
}

export function lessonSpec(
  track: SyllabusTrack,
  code: string
): SyllabusLesson | null {
  const want = normaliseCode(code);
  return track.lessons.find((l) => l.code === want) ?? null;
}

/** The lesson before this one — the source of the review page. */
export function previousLesson(
  track: SyllabusTrack,
  code: string
): SyllabusLesson | null {
  const want = normaliseCode(code);
  const i = track.lessons.findIndex((l) => l.code === want);
  return i > 0 ? track.lessons[i - 1] : null;
}

/**
 * The syllabus section of the generation brief.
 *
 * Deliberately states BOTH lessons: the one being written, and the one whose
 * skill the review page has to check. Returns "" when the pack sits outside the
 * syllabus (a one-off lesson, a non-debate subject, a lesson code past L10), so
 * a pack that isn't part of a course is never forced to pretend it is.
 */
export function syllabusForPrompt(
  subject: string,
  rigorLevel: string,
  lessonCode: string
): string {
  const track = trackFor(subject, rigorLevel);
  if (!track) return "";
  const now = lessonSpec(track, lessonCode);
  if (!now) return "";
  const prev = previousLesson(track, lessonCode);
  return `THE COURSE THIS LESSON SITS IN — ${track.label} (${track.cohort})
This is not a standalone lesson. It is ${now.code} of ${track.lessons.length} in the academy's own syllabus, and the class has met every week before this one.

THIS WEEK — ${now.code} · ${now.focus}
- Skill to teach: ${now.skill}
- The drill this lesson is built around: ${now.drill}
Teach THIS skill. Do not drift into a neighbouring week's skill, and do not re-teach the whole course.
${
  prev
    ? `
LAST WEEK — ${prev.code} · ${prev.focus}
- What they were taught: ${prev.skill}
Open the pack with a REVIEW page that checks last week's skill before you teach this week's: three multiple-choice questions on ${prev.focus}, each with plausible wrong answers, so the coach finds out in four minutes who is ready. Assume last week's skill is known from that point on — reference it by name and build on it; never re-teach it.`
    : `
This is the FIRST lesson of the course. There is no previous week to review — open with the hook instead, and assume no prior debate experience whatsoever.`
}`;
}
