import { z } from "zod";

/**
 * Debate Lesson Pack schema — Phase 1.
 *
 * Validated against the real UBI Novice series (ascent_UBI_hub_6.html, L1 "PEEL
 * Structure"). Every field here maps to a structure that exists in that pack.
 * This module is the single source of truth: builder UI, checklist, and print
 * renderer all derive from it.
 */

export const SIDES = ["pro", "con", "neutral"] as const;

/**
 * Evidence card — the no-fabricated-citations structure. Source fields are
 * separate and required; the scope limit ("what this card cannot prove") is
 * mandatory wherever evidence is used.
 */
export const evidenceCardSchema = z.object({
  id: z.string(), // "A", "B", ...
  side: z.enum(SIDES),
  institution: z.string(), // e.g. "World Bank Group"
  author: z.string().optional().default(""), // named author if any
  year: z.string(), // publication year, e.g. "2025"
  publication: z.string(), // full publication title
  paraphrase: z.string(), // ≤40 words, enforced by checklist
  translation: z.string(), // plain-English "what it means"
  tacticalNote: z.string(), // "how to use in round"
  limit: z.string(), // ⛔ what this card CANNOT prove — mandatory
  // ── What makes a card real prep rather than a summary ──
  // Modelled directly on the academy's own elite packs, where every card is:
  //   The Claim / Real Event / a VERBATIM quotation with attribution /
  //   What this proves / Round Application ("Judge, ...")
  // A paraphrase tells a student what a source said; a quotation is the thing
  // they actually read out in a round, and the named event is what makes it
  // memorable. Without these a card is a revision note, not evidence.
  /** The concrete named event this card is about ("The 2003 Iraq War"). */
  event: z.string().optional().default(""),
  /** Verbatim quotation, 15–45 words, exactly as published. */
  quote: z.string().optional().default(""),
  /** Who is being quoted, for the read-out ("Senate Intelligence Committee"). */
  quoteAttribution: z.string().optional().default(""),
  /** The line a debater says to the judge, starting "Judge, ...". */
  roundApplication: z.string().optional().default(""),

  /* ── VERIFICATION ────────────────────────────────────────────────────────
     Every card on this deck is DRAFTED BY A MODEL, and the build screen has
     always said so: "AI-drafted citations must be verified against real
     sources before this pack goes to review." Until now that warning was the
     entire mechanism. There was nowhere to record that somebody had actually
     checked a card, so the warning applied equally to a citation nobody had
     looked at and one a coach had confirmed line by line — which means it
     stopped being read.

     These two fields make the check a fact about the card rather than a
     sentence on the page. Both are optional with defaults, so every pack
     already in the library keeps parsing: `parseContent` re-runs this schema
     on read, so existing cards gain `url: ""` and `verified: false` without a
     migration.

     `verified` is deliberately NOT set by the model. It means a person opened
     the source and confirmed the quotation exists — the one claim an AI cannot
     make about its own output. */
  /** Where the source can be read. The thing a verifier actually needs. */
  url: z.string().optional().default(""),
  /** A human opened the source and confirmed this card. Never set by the AI. */
  verified: z.boolean().optional().default(false),
});
export type EvidenceCard = z.infer<typeof evidenceCardSchema>;

/** A vocabulary term with the kid-friendly analogy the packs use. */
export const vocabTermSchema = z.object({
  term: z.string(),
  definition: z.string(),
  analogy: z.string().optional().default(""),
});
export type VocabTerm = z.infer<typeof vocabTermSchema>;

/**
 * A prompt a student writes into, with the teacher-facing expected answer
 * (drives the answer key / toggle-answers behaviour of the packs).
 *
 * ── WHY THIS CARRIES STUDENT-FACING COACHING ───────────────────────────────
 * `expectedAnswer` was doing four jobs at once: the answer key, the model
 * answer, the warning about the usual wrong move, and the coaching that tells
 * a student what belongs in the box. Three of those four are addressed to the
 * STUDENT — and the field is teacher-only, hidden behind the answer-key
 * toggle. So a page that already contained the intelligence printed a student
 * a label and a blank, and the coach had to narrate the key aloud, page by
 * page, to run the lesson at all.
 *
 * `guide` and `trap` are the student's half, split out and printed at the
 * point of writing. They are NOT a second copy of the expected answer, and
 * the distinction is the whole point:
 *
 *   guide           PROSPECTIVE, to the student — what to put in, before they
 *                   write. "Name the side, then one thing you want believed."
 *   trap            PROSPECTIVE, to the student — the specific wrong move made
 *                   here. "Do not restate the Point in new words."
 *   expectedAnswer  RETROSPECTIVE, to the teacher — what a right answer looks
 *                   like, for marking and for the cold-call debrief.
 *
 * Both are short by design. The reading budget on a page is the binding
 * constraint (see `studentReadWords`), so these earn their place only while
 * they stay one line each; the checklist holds them to it.
 */
export const promptSchema = z.object({
  label: z.string(), // e.g. "Why SHOULD Asia-Pacific governments give people regular cash?"
  side: z.enum(SIDES).default("neutral"),
  expectedAnswer: z.string(), // data-answer equivalent; answer-key source
  /**
   * STUDENT-FACING. What to put in this answer, read before writing — the
   * move, not the answer. Prints on the student copy; never hidden by the
   * answer-key toggle. One line.
   */
  guide: z.string().optional().default(""),
  /**
   * STUDENT-FACING. The specific wrong move students make in THIS box, stated
   * so it can be checked against their own sentence. Prints on the student
   * copy. One line. Empty where a page has no characteristic failure.
   */
  trap: z.string().optional().default(""),
});
export type Prompt = z.infer<typeof promptSchema>;

export const ACTIVITY_KINDS = [
  "hook", // The Arena — baseline hook
  "review", // Mission Brief — MCQ check on LAST lesson's skill (see lib/syllabus.ts)
  "topic-intel", // direct-instruction topic briefing
  "vocabulary", // vocabulary drill page (renders the word bank)
  "i-do", // teacher models (worked example / mentor text)
  "we-do", // guided practice (label & fix)
  "drill", // e.g. fact-vs-opinion sort
  "evidence-study", // students read the evidence deck
  "scaffolded-build", // frame-supported writing
  "independent-build", // free-form writing
  "sparring", // oral practice rounds / discussion protocol
  "bridge", // training-wheels transition page
  "remix", // transfer test — apply the skill to a new domain
  "exit-ticket", // end-of-lesson check
  "custom",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/**
 * A labeled layer of a worked example — e.g. the four PEEL layers of the
 * teacher's model argument, or the annotated parts of a mentor text.
 */
export const exampleLayerSchema = z.object({
  label: z.string(), // "POINT", "EVIDENCE", "TOPIC SENTENCE", …
  text: z.string(), // the model text for that layer
  note: z.string().optional().default(""), // annotation: why this works
  /**
   * THE PASS CONDITION — an observable test a student runs on their OWN
   * sentence, printed beside the layer it belongs to.
   *
   * The founder's pack does not merely define the four jobs of an argument; it
   * gives each one a test, and each test is a different SHAPE:
   *
   *   Point        "A stranger could repeat it after hearing it once."
   *   Explanation  "It answers 'why', and does not say the Point again."
   *   Evidence     "The judge could write down both the number and who said it."
   *   Link         "It names the decision, and not only the topic."
   *
   * Two things make this worth a field rather than prose in `note`. It is
   * STUDENT-FACING and self-administered — `note` is an annotation about why
   * the model works, addressed to whoever is reading the model, and a student
   * cannot apply it to a sentence they have not written yet. And it is the
   * source the exit ballot is supposed to be built from: his four ballot rows
   * ten pages later ARE these four tests, restated. A ballot that invents its
   * criteria at the end is assessing something nobody was taught, which is
   * exactly what the `ballot-tests-what-was-taught` gate now refuses.
   *
   * Observable, therefore. "Is it clear?" is not a pass condition; "could a
   * stranger repeat it after hearing it once" is, because two students would
   * agree on the answer.
   */
  passesWhen: z.string().optional().default(""),
});
export type ExampleLayer = z.infer<typeof exampleLayerSchema>;

/** One item of a sort/classification drill (e.g. fact vs. opinion). */
export const sortItemSchema = z.object({
  statement: z.string(),
  category: z.string(), // correct bucket, e.g. "FACT" / "OPINION" / "FALLACY: strawman"
  explanation: z.string().optional().default(""), // teacher-facing why
});
export type SortItem = z.infer<typeof sortItemSchema>;

/** One matching pair (term ↔ definition, cause ↔ effect, …). */
export const matchPairSchema = z.object({
  left: z.string(),
  right: z.string(),
});
export type MatchPair = z.infer<typeof matchPairSchema>;

/** A sentence-starter frame for scaffolded builds. */
export const frameSchema = z.object({
  label: z.string(), // "POINT", "EXPLAIN", "TRANSITION", …
  starter: z.string(), // "My first reason is ____ because ____."
});
export type Frame = z.infer<typeof frameSchema>;

/** One spoken turn in a scene — a short line of dialogue by one speaker. */
export const sceneTurnSchema = z.object({
  speaker: z.string(), // "PRO", "CON", "Judge", a character name
  side: z.enum(["pro", "con", "neutral"]).default("neutral"),
  line: z.string(), // a SHORT spoken line — never a paragraph
});
export type SceneTurn = z.infer<typeof sceneTurnSchema>;

/**
 * A structured, visual replacement for prose "body" text. Instead of a
 * paragraph, content is a little SCENE the renderer draws as speech bubbles (or
 * clean quote cards for older grades): a one-line situation, a short back-and-
 * forth, and a punchline that carries the point. This is how we guarantee a
 * lesson page is *looked at*, not read — no walls of text, ever.
 */
export const sceneSchema = z.object({
  setup: z.string().default(""), // one short line — the situation
  turns: z.array(sceneTurnSchema).default([]), // the dialogue / duel
  twist: z.string().default(""), // the aha / punchline — one short line
});
export type Scene = z.infer<typeof sceneSchema>;

/** One step in an ordered process (the renderer numbers it). Short text. */
export const stepSchema = z.object({
  text: z.string(), // the step, in a few words
  detail: z.string().optional().default(""), // optional tiny clarifier
});
export type Step = z.infer<typeof stepSchema>;

/** A side-by-side comparison — two labeled columns of short paired rows. */
export const compareSchema = z.object({
  leftLabel: z.string().default(""), // e.g. "WEAK", "PRO", "BEFORE"
  rightLabel: z.string().default(""), // e.g. "STRONG", "CON", "AFTER"
  rows: z.array(z.object({ left: z.string(), right: z.string() })).default([]),
});
export type Compare = z.infer<typeof compareSchema>;

/**
 * One side's full argument, mechanism by mechanism.
 *
 * The academy's own elite packs build every contested idea as a matched PAIR of
 * these — a Pro architecture beside a Con architecture — so a student can be
 * handed either side and still know the chain: what we claim, WHY it happens,
 * the case that proves it, what they'll say back, how we turn it, and which
 * measuring stick we want the judge to use.
 *
 * This is the difference between a worksheet that teaches "make an argument"
 * and prep that teaches THIS argument. A `compare` block puts two things
 * side by side; this carries the reasoning underneath each one.
 */
export const argumentChainSchema = z.object({
  side: z.enum(SIDES),
  /** the one-sentence position ("Executive secrecy causes mistaken wars") */
  claim: z.string(),
  /** WHY it happens — the causal step most novices skip entirely */
  mechanism: z.string(),
  /** the named real case that proves it ("The 2003 Iraq War") */
  example: z.string(),
  /** the strongest thing the other side says back */
  opposingResponse: z.string(),
  /** how this side answers that, or turns it into offence */
  turn: z.string(),
  /** the measuring stick this side wants the judge to use */
  weighing: z.string(),
  /**
   * The dilemma question this side asks in crossfire — "make them choose:
   * either pressure is already enough, or Congress still lacks the stop
   * button". His elite pages carry one under every architecture, because the
   * chain is what you know and this is what you DO with it in the round.
   */
  crossfireTrap: z.string().optional().default(""),
});
export type ArgumentChain = z.infer<typeof argumentChainSchema>;

/**
 * A multiple-choice check with plausible wrong answers.
 *
 * The one input type the founder's packs use constantly and ours had no way to
 * express: his review pages open every lesson with three of these on LAST
 * week's skill, and his master checks close them. The `why` field is what stops
 * it being trivia — the coach reads it aloud when the room splits, so a wrong
 * answer becomes a teaching moment instead of a tick.
 *
 * Distractors must be genuinely tempting. An option set where two choices are
 * obviously silly tests reading speed, not the skill.
 */
export const mcqSchema = z.object({
  question: z.string(),
  /** 3–4 options; exactly one is right and the rest are plausible */
  options: z.array(z.string()).default([]),
  /** 0-based index into options */
  correctIndex: z.number().int().min(0).default(0),
  /** why the right answer is right AND why the tempting wrong one fails */
  why: z.string().optional().default(""),
});
export type Mcq = z.infer<typeof mcqSchema>;

/**
 * A word bank for a scaffolded page — with deliberate dummies.
 *
 * Straight from the founder's prompt, where it is one of the few rules written
 * in bold capitals: *"Anti-Hacking Word Banks: every word bank MUST be
 * scrambled alphabetically AND include exactly TWO (2) Distractor/Dummy words
 * so students cannot just use the process of elimination."*
 *
 * A bank with exactly as many words as there are blanks is a matching puzzle a
 * student can finish without understanding a single term — which is precisely
 * the failure mode the distractors exist to close.
 */
export const wordBankSchema = z.object({
  /** the words that genuinely belong in this page's blanks */
  words: z.array(z.string()).default([]),
  /** plausible dummies that fit nothing — exactly two */
  distractors: z.array(z.string()).default([]),
});
export type WordBank = z.infer<typeof wordBankSchema>;

/** A big-number highlight — a large value with a short label under it. */
export const calloutSchema = z.object({
  value: z.string(), // the big figure, e.g. "$7", "5,000", "3×"
  label: z.string(), // what it means, in a few words
});
export type Callout = z.infer<typeof calloutSchema>;

/* ══════════════════════════════════════════════════════════════════════════
   THE RIGOR MECHANICS
   ══════════════════════════════════════════════════════════════════════════
   Four blocks that exist to kill four specific ways a debate drill goes soft.
   Each one replaces a mechanic where a student can produce the RIGHT-LOOKING
   artifact without doing the thinking — and in every case the fix is to make
   the page demand a decision rather than a tick.

   They are schema, not prompt guidance, for the same reason the prose `body`
   field was deleted: a rule the model is asked to follow is a rule it drops
   under load, and a field it must fill is one it cannot. */

/**
 * MICRO-FLOWING — replaces the passive listening checklist.
 *
 * The failure it closes: a spar where the listener ticks "gave evidence ☑".
 * A student can tick that box having heard nothing, and it teaches them that
 * listening means auditing form. Real flowing is transcription under time
 * pressure, and it is the single most transferable skill in the activity.
 *
 * So the listener writes three things per argument, in the speaker's own words:
 * the CLAIM, the causal WARRANT (the "because" step, which is the one novices
 * cannot hear because it is the one they do not yet make), and the DATA point.
 * A blank warrant column is itself the finding — it means the speaker never
 * said one, and that is what the debrief is about.
 */
export const microFlowSchema = z.object({
  /** whose speech is being flowed — "your partner's 90-second case" */
  target: z.string().default(""),
  /**
   * How many arguments must be captured; each is one row of three cells.
   *
   * `.catch()`, not just `.default()`, and the difference is worth a sentence.
   * A model asked for a page that carries no micro-flow says so by writing
   * `captures: 0` — which is out of range, and under a bare `.min(1)` threw,
   * which failed `activitySchema.parse`, which failed the whole rewrite and
   * discarded a generation the teacher had already waited a minute and paid
   * for. Over a number that nothing reads: whether a page HAS a micro-flow is
   * decided by `target` (see hasMechanic in lib/rigor.ts), and the print view
   * renders the grid only when `target` is non-empty.
   *
   * So an out-of-range count falls back to the house default instead of taking
   * the page down with it. The pedagogical rule is unaffected — it was never
   * this field's job, and the rigor gate still refuses a page that owes a
   * micro-flow and has no target.
   */
  captures: z.number().int().min(1).max(6).catch(3).default(3),
  /** teacher-facing model of ONE correctly flowed row, for this content */
  exemplar: z
    .object({
      claim: z.string().default(""),
      warrant: z.string().default(""),
      data: z.string().default(""),
    })
    .optional()
    .default({ claim: "", warrant: "", data: "" }),
});
export type MicroFlow = z.infer<typeof microFlowSchema>;

/**
 * THE BALLOT LINE — upgrades the L of PEEL.
 *
 * The failure it closes: "Link — tie your point back to the motion." That
 * instruction produces "and that is why we should support the motion", which
 * is a full stop, not a link. It restates. It never tells the judge why THIS
 * argument beats what the other side is offering.
 *
 * A Ballot Line is impact calculus in one sentence: our consequence, theirs,
 * and the reason ours decides the round. The fields are separate because a
 * student who cannot fill `theirImpact` has not yet understood that weighing
 * is COMPARATIVE — and collapsing it into one free-text box hides exactly that.
 */
export const ballotLineSchema = z.object({
  /** what our argument causes, in consequence terms */
  ourImpact: z.string().default(""),
  /** what the other side's best alternative causes */
  theirImpact: z.string().default(""),
  /** the calculus itself: scale, probability, reversibility, timeframe… */
  weighing: z.string().default(""),
  /** the finished sentence said to the judge — starts "Judge," */
  line: z.string().default(""),
});
export type BallotLine = z.infer<typeof ballotLineSchema>;

/**
 * MICRO-CROSSFIRE — defensive pressure after any one-way speech.
 *
 * The failure it closes: a student delivers into silence, sits down, and never
 * discovers that the middle of their argument does not hold. A speech nobody
 * may question is a recital.
 *
 * Thirty seconds is deliberate. It is too short to become a second speech and
 * long enough for exactly one real question — so the listener has to choose
 * their best one, which is itself the skill. The two legal targets are the
 * WARRANT (sever the because-step) and the LIMIT (catch a claim the evidence
 * card's own scope limit does not support). Both are attacks on reasoning
 * rather than on the person, which is what makes this safe to run in a novice
 * room.
 */
export const microCrossfireSchema = z.object({
  /**
   * Length of the exchange — 30s unless a page has a reason to differ.
   * `.catch()` for the same reason as microFlow.captures above: a page with no
   * crossfire is announced as `seconds: 0`, presence is decided by
   * `questions.length`, and a bad number here must not cost the whole page.
   */
  seconds: z.number().int().min(15).max(120).catch(30).default(30),
  /** what the listening partner is doing, in one line */
  listenerRole: z.string().default(""),
  /** ready-made questions, each aimed at a warrant or an evidence limit */
  questions: z
    .array(
      z.object({
        stem: z.string(),
        /** which weakness this question is engineered to expose */
        targets: z.enum(["warrant", "limit"]).default("warrant"),
      })
    )
    .default([]),
});
export type MicroCrossfire = z.infer<typeof microCrossfireSchema>;

/**
 * ECHO CHECK — stops the Explain layer parroting the Evidence layer.
 *
 * The failure it closes, and it is the most common one in novice writing: the
 * E of Explain restates the statistic that was just quoted. "The study found
 * incomes rose 12%. This shows incomes rose by 12%." The student believes they
 * have explained; they have echoed. Nothing causal has been said.
 *
 * The check is deliberately VISUAL and self-administered at the point of
 * writing — a student ticks it before handing in, against the specific card
 * they cited. It asks for the mechanism the card does NOT state, which is the
 * only thing that can distinguish an explanation from a repetition.
 */
export const echoCheckSchema = z.object({
  /** the evidence card whose wording must not be recycled ("A", "C") */
  cardId: z.string().default(""),
  /** the self-tests, each a yes/no a student can honestly answer alone */
  tests: z.array(z.string()).default([]),
  /** teacher-facing: the causal mechanism a strong Explain names here */
  mechanism: z.string().default(""),
});
export type EchoCheck = z.infer<typeof echoCheckSchema>;

/**
 * A FIGURE — the graphics the founder's pack teaches with, as data.
 *
 * His sheets are roughly 18% ink; a lot of the rest is diagram. And the
 * diagrams are not decoration — reading one IS the exercise on his page five,
 * where students argue the same picture two opposite ways. We had exactly one
 * data primitive, `callouts`: a big number and a label. You cannot draw "four
 * of every hundred, rising to twelve" with a big number.
 *
 * Four kinds, chosen because each appears in his pack AND generalises past its
 * topic. The fifth thing he draws — fifteen shaded US states — is deliberately
 * NOT here: a choropleth of one country is a picture of one dataset, not a
 * primitive, and a schema field nobody outside that lesson can fill is a field
 * that gets filled wrongly.
 *
 *   unit-chart    N of M as a grid of small boxes, optionally with a SECOND
 *                 series so a change over time is one picture rather than two.
 *                 His: 4 of 100 in 2023 → 12 of 100 by 2030.
 *   process-flow  ordered stages along a line. His: the six technical stages
 *                 from power generation to servers.
 *   ratio         two magnitudes and how many of one make the other. His: about
 *                 five ordinary data centers = one hyperscale one.
 *   balance       one subject with what it brings on one side and what it costs
 *                 on the other. His: one new center, three gains, three costs.
 *
 * ── THE FIELD THAT MATTERS MOST IS `exact` ─────────────────────────────────
 * He rounds for the picture and then prints the true number underneath it:
 * the pictogram says 4 of 100 and 12 of 100, and the line below says "Exact:
 * 4.4% measured; 11.8% estimated". That is not a caveat, it is the intellectual
 * honesty of the pack made visible — and it is the habit the lesson is trying
 * to teach, since a debater who rounds silently is a debater who will be caught
 * doing it. A figure that simplifies a number and does not print the real one
 * teaches the opposite lesson, so the checklist requires it.
 */
export const figureSchema = z.object({
  kind: z.enum(["unit-chart", "process-flow", "ratio", "balance"]),
  /** what the figure is showing, in the student's words — the headline above it */
  title: z.string().default(""),
  /** the one line a student should take away, printed under the drawing */
  caption: z.string().default(""),
  /** the unrounded truth, wherever the drawing rounds. See the note above. */
  exact: z.string().default(""),
  /** attribution — a figure is evidence and carries its source like any card */
  source: z.string().default(""),

  // ── unit-chart ──
  /** how many of `total` are filled; the "now" series */
  filled: z.number().int().min(0).default(0),
  total: z.number().int().min(1).max(400).default(100),
  /** optional second series, for a change: the "then" value and what it means */
  thenFilled: z.number().int().min(0).optional(),
  nowLabel: z.string().default(""),
  thenLabel: z.string().default(""),

  // ── process-flow ──
  /** ordered stages; the renderer numbers them and draws the line */
  stages: z.array(z.string()).default([]),

  // ── ratio ──
  /** "about five ordinary centers" = "one hyperscale center" */
  ratioLeft: z.string().default(""),
  ratioRight: z.string().default(""),
  /** how many of the left make one right, drawn as repeated marks */
  ratioCount: z.number().int().min(1).max(20).optional(),

  // ── balance ──
  /** the thing being weighed — printed in the middle */
  subject: z.string().default(""),
  bringsLabel: z.string().default("What it brings"),
  costsLabel: z.string().default("What it costs"),
  brings: z.array(z.object({ head: z.string(), detail: z.string().default("") })).default([]),
  costs: z.array(z.object({ head: z.string(), detail: z.string().default("") })).default([]),
});
export type Figure = z.infer<typeof figureSchema>;

/**
 * THE EXIT BALLOT — assessment that reaches the student's own page.
 *
 * The strongest single idea in the founder's pack, and the one our packs had no
 * way to express. Ours put the rubric in `teacherGuide.rubric` and the ballot in
 * a separate material type, so the page a student actually holds at the end of
 * a lesson asked them to reflect in free text. A novice writing free-text
 * self-assessment produces "I did okay"; a closed list forces a decision, and
 * the decision IS the learning.
 *
 * Four parts, and each one is load-bearing:
 *
 *   rows      what a partner marks. These must be the criteria the pack ALREADY
 *             TAUGHT — his four ballot rows are the four pass conditions from
 *             page 3, restated. A ballot that introduces new criteria at the
 *             end is assessing something nobody was taught.
 *   errors    a CLOSED list the student marks one of. Closed, because naming
 *             your own failure from an open field is a skill above this level,
 *             and because a fixed vocabulary is what lets a coach say "you had
 *             a number-three again" in week six.
 *   repairs   the named moves. Every error must have a move that answers it,
 *             or the student is told what went wrong and left there.
 *   product   what they physically leave with. His says it outright — "you
 *             leave with a rewritten sentence, not a score" — which is what
 *             stops the page becoming a mark out of ten.
 */
export const exitBallotSchema = z.object({
  rows: z
    .array(
      z.object({
        /** the criterion, in the words it was taught in ("Clear side and claim") */
        criterion: z.string(),
        /** the observable test a partner applies ("A stranger could repeat it") */
        test: z.string().default(""),
      })
    )
    .default([]),
  /** the marks available per row — three bands beat two, because "almost" is where most novices land */
  scale: z.array(z.string()).default(["Yes", "Almost", "Not yet"]),
  /** named failures, closed list; the student marks exactly one */
  errors: z.array(z.string()).default([]),
  /** named repair moves; between them they must answer every error above */
  repairs: z.array(z.string()).default([]),
  /** what the student leaves the room holding */
  product: z.string().default(""),
});
export type ExitBallot = z.infer<typeof exitBallotSchema>;

/**
 * A CARD WITH A JOB — the founder's evidence pedagogy, which we had no form for.
 *
 * His two evidence pages do not print three cards and hope. Each card is handed
 * ONE named job, in a fixed order, and the job is the exercise:
 *
 *   1  THE SPEECH LINE   the sentence you would really say out loud
 *   2  THE LIMIT         what it does not show, said before the other side says it
 *   3  THE WEIGH         why this cost should decide the round
 *
 * Two things follow from binding a job to a card rather than listing jobs and
 * listing cards. The student is not asked to do all three on every card, which
 * is what turns an evidence page into a worksheet nobody finishes — one job per
 * card, three cards, is the whole page. And the LIMIT stops being a caveat
 * printed under a number and becomes a thing the student has to write, which is
 * the difference between knowing a card's scope and being able to say it before
 * an opponent does.
 *
 * Measured cost of not having this: rendering the founder's own PF-08 through
 * the first JV layout, the three job boxes came out at one ruled line each while
 * two unrelated boxes on the same sheet got four. Nothing connected a job to the
 * card it belonged to, so nothing could size them.
 *
 * `cardId` points at an `evidenceCards[].id` ("A", "B"). The job lives on the
 * ACTIVITY, not on the card, because the same card carries different jobs on
 * different pages — that is the point of reusing a card five times.
 */
export const cardJobSchema = z.object({
  /** which card in the deck this job belongs to — an evidenceCards[].id */
  cardId: z.string(),
  /** the job's name, in the words the page uses ("THE LIMIT") */
  job: z.string(),
  /** what the student actually writes, one line, student-facing */
  instruction: z.string().default(""),
});
export type CardJob = z.infer<typeof cardJobSchema>;

/** One student-facing page/section of the pack. */
export const activitySchema = z.object({
  kind: z.enum(ACTIVITY_KINDS),
  title: z.string(), // header label, e.g. "THE ARENA"
  badge: z.string().optional().default(""), // header badge, e.g. "BASELINE HOOK · 12 MIN"
  durationMin: z.number().int().min(0).default(0),
  instructions: z.string(), // banner text students read first (one short line)
  body: z.string().optional().default(""), // LEGACY prose — kept for old packs; new packs use `scene`. Capped short on render.
  scene: sceneSchema.optional().default({ setup: "", turns: [], twist: "" }), // visual, low-text replacement for prose body
  steps: z.array(stepSchema).default([]), // an ordered process, shown as numbered chips
  compare: compareSchema.optional().default({ leftLabel: "", rightLabel: "", rows: [] }), // side-by-side
  callouts: z.array(calloutSchema).default([]), // big-number highlights
  prompts: z.array(promptSchema).default([]),
  // ── typed content blocks (each optional; kinds use what fits) ──
  exampleLayers: z.array(exampleLayerSchema).default([]), // i-do worked example / mentor text
  sortItems: z.array(sortItemSchema).default([]), // drills
  matchPairs: z.array(matchPairSchema).default([]), // matching activities
  frames: z.array(frameSchema).default([]), // scaffolded-build sentence starters
  // A matched Pro/Con pair of full argument chains — the structure the academy's
  // own elite packs are built on. Two entries (one per side) or none.
  argumentChains: z.array(argumentChainSchema).default([]),
  // What separates a shallow treatment of this page's move from a winning one.
  // Taken from the academy's own elite packs, which carry a "Hidden Judge Move"
  // on every section: not what the skill IS, but what the judge is actually
  // deciding when two teams both attempt it. A pack can teach a skill correctly
  // and still leave a student with no idea why one execution wins the ballot.
  hiddenJudgeMove: z.string().optional().default(""),
  /**
   * WHY THIS PAGE EXISTS — addressed to the STUDENT, one or two sentences.
   *
   * The single cheapest thing in the founder's pack and one of the strongest:
   * every one of his seventeen sheets carries it, and none of them is generic.
   * "A judge trusts the debater who can say what the other side gets right."
   * "A side that only says no gives a judge nothing to vote for." "Debaters
   * improve one named fix at a time."
   *
   * It is NOT `hiddenJudgeMove`, which is the nearest field we had and is the
   * wrong one twice over: that is teacher-facing, and it is about what wins a
   * round rather than about why a student is being asked to do this page at
   * all. Nor is it `instructions`, which says what to do. This says why doing
   * it is worth the fourteen minutes — the question every fifteen-year-old asks
   * silently and most worksheets never answer.
   *
   * A generic one is worse than none, because it teaches that the answer to
   * "why am I doing this" is boilerplate. The checklist holds it to being
   * distinct across the pack for exactly that reason.
   */
  whyItMatters: z.string().optional().default(""),
  /** One named job per evidence card used on this page; see cardJobSchema. */
  cardJobs: z.array(cardJobSchema).default([]),
  /** Diagrams the page teaches with; see figureSchema. */
  figures: z.array(figureSchema).default([]),
  /**
   * CAN THIS PAGE BE DROPPED WHEN THE ROOM RUNS BEHIND?
   *
   * Every real class runs behind. What happens then is not a planning question,
   * it is a design one: with no stated cut path the teacher improvises under
   * time pressure, and the first thing cut is whatever is at the END of the
   * pack — which is the exit ticket, the one page that must not be cut, because
   * it is where the student produces the thing the lesson was for.
   *
   * Marking the droppable pages inverts that. A coach at minute sixty can skip
   * the page the author already decided was extension work and still land the
   * assessment. The founder's own pack separates thirteen core pages from four
   * supplemental ones for exactly this reason.
   *
   * Defaults to false — "you need this" — so every pack written before this
   * field is unchanged and nothing silently becomes skippable.
   */
  optional: z.boolean().optional().default(false),
  /**
   * WHICH TOPIC THIS PAGE RUNS ON — see `practiceTopic` on the pack.
   *
   * Defaults to "anchor", so every pack written before this field existed is
   * unchanged: all of its pages run on the resolution, exactly as they did.
   */
  runsOn: z.enum(["anchor", "practice"]).optional().default("anchor"),
  /** The peer ballot + repair grid. Belongs on the exit ticket; see exitBallotSchema. */
  exitBallot: exitBallotSchema
    .optional()
    .default({ rows: [], scale: ["Yes", "Almost", "Not yet"], errors: [], repairs: [], product: "" }),
  /**
   * THE ATTEMPT / CONSOLIDATION PAIR — see `lib/attempt-cycle.ts`.
   *
   * A concept is learned deeper when students TRY it before being taught and
   * then have that attempt corrected, than when they are simply shown the
   * method. But the gain lives entirely in the correction: an attempt page with
   * nothing resolving it leaves a class holding a wrong method, which is worse
   * than teaching it straight.
   *
   * That makes the pair a structural fact about the pack, not a matter of tone —
   * so it is recorded in the schema and gated by the checklist, rather than
   * merely requested in the prompt. Prompt-only rules are the ones that quietly
   * stop being true.
   */
  /** This page asks students to attempt the lesson's concept BEFORE it is taught. */
  attemptsBeforeTaught: z.boolean().optional().default(false),
  /** The wrong move most students are expected to make here — what the consolidation must answer. */
  likelyMisstep: z.string().optional().default(""),
  /** Title of the earlier attempt page THIS page resolves. Empty on every other page. */
  consolidatesAttempt: z.string().optional().default(""),
  // Multiple-choice checks. The review page that opens a lesson runs three of
  // these on LAST week's skill; other pages use them as master checks.
  quiz: z.array(mcqSchema).default([]),
  // Scaffolded pages get a word bank with two dummies in it — see wordBankSchema.
  wordBank: wordBankSchema
    .optional()
    .default({ words: [], distractors: [] }),
  // ── The rigor mechanics (see the four schemas above) ──
  // Each is empty on pages where it does not belong; `lib/rigor.ts` decides
  // which page kinds MUST carry which, and the checklist enforces it.
  microFlow: microFlowSchema
    .optional()
    .default({ target: "", captures: 3, exemplar: { claim: "", warrant: "", data: "" } }),
  ballotLine: ballotLineSchema
    .optional()
    .default({ ourImpact: "", theirImpact: "", weighing: "", line: "" }),
  microCrossfire: microCrossfireSchema
    .optional()
    .default({ seconds: 30, listenerRole: "", questions: [] }),
  echoCheck: echoCheckSchema
    .optional()
    .default({ cardId: "", tests: [], mechanism: "" }),
  // The bonus task for whoever finishes first, so a fast student is stretched
  // rather than left talking. The founder's prompt requires one on every
  // independent writing page.
  fastFinisher: z.string().optional().default(""),
  keyIdea: z.string().optional().default(""), // "⚡ THE KEY IDEA — write this down" box
  standAndDeliver: z.string().optional().default(""), // closing oral micro-task
  /**
   * LEGACY — no longer written, and no longer rendered.
   *
   * This held a self-contained HTML fragment the model wrote for one page, and
   * the printer rendered it instead of the templated blocks. That path is
   * retired: ~2 model calls per page ($8–23 a pack), it drifted across pages,
   * and being static HTML it silently discarded everything interactive on the
   * sheet — the student/teacher toggle, the answer key, the fillable flow grid,
   * the echo checkboxes.
   *
   * The field stays so the two packs that still carry one survive a round-trip
   * through this schema without losing data. Do not read it to render.
   */
  designHtml: z.string().optional().default(""),
});
export type Activity = z.infer<typeof activitySchema>;

/**
 * One planned page in the reviewed outline — the skeleton the author approves
 * before the full pack is written. Just the shape of the page (kind, title,
 * badge, minutes, cognitive goal); the content stages fill it in.
 */
export const outlineEntrySchema = z.object({
  kind: z.enum(ACTIVITY_KINDS),
  title: z.string(),
  badge: z.string().default(""),
  durationMin: z.number().int().min(0).default(0),
  goal: z.string().default(""),
});
export type OutlineEntry = z.infer<typeof outlineEntrySchema>;

/** One row of the teacher guide's minute-by-minute plan. */
export const timingRowSchema = z.object({
  startMin: z.number().int().min(0),
  endMin: z.number().int().min(0),
  phase: z.string(), // e.g. "Hook Spar + Debrief"
  who: z.enum(["T", "Ss", "T+Ss"]),
  what: z.string(),
});
export type TimingRow = z.infer<typeof timingRowSchema>;

/**
 * How to actually run one page, for the two adults in the room.
 *
 * The academy's own packs are written for a HEAD TEACHER and a TEACHING
 * ASSISTANT working the same page at once, and they tell each of them something
 * different: the lead drives, the assistant watches specific students for
 * specific errors. They also state what good and weak execution LOOK like, in
 * observable terms, so a coach can mark the room at a glance rather than
 * guessing — and they give the same page two coaching registers, because a
 * novice and a varsity debater are in the same class.
 *
 * Our teacher guide had one undifferentiated "what" per phase, which is why our
 * packs read as a worksheet with a schedule attached rather than as a lesson
 * two people can run together.
 */
export const pageCoachingSchema = z.object({
  /** the exact page this coaches, by its activity title */
  page: z.string(),
  /** what the lead teacher does — the driving move */
  headTeacher: z.string(),
  /** what the assistant watches for while the lead drives */
  assistant: z.string(),
  /** observable evidence the page is working */
  lookForGood: z.string(),
  /** the specific failure mode to catch early */
  lookForWeak: z.string(),
  /** how to support the students who are behind */
  juniorTier: z.string().optional().default(""),
  /** how to stretch the students who are ahead */
  varsityTier: z.string().optional().default(""),
});
export type PageCoaching = z.infer<typeof pageCoachingSchema>;

/** A band of the grading rubric. */
export const rubricBandSchema = z.object({
  score: z.string(), // e.g. "4 — Exceeds"
  descriptor: z.string(),
});

export const teacherGuideSchema = z.object({
  cohort: z.string(), // e.g. "Novice · Zero Prior Exp."
  assessment: z.string(), // e.g. "PEEL + Exit Ticket"
  nextLesson: z.string().optional().default(""),
  materialsChecklist: z.string(),
  timingPlan: z.array(timingRowSchema).default([]),
  launchScripts: z
    .array(z.object({ title: z.string(), script: z.string() }))
    .default([]),
  pitfalls: z.string().optional().default(""), // prep & pitfalls + CFU questions
  /**
   * IF THE ROOM IS AHEAD OF THE PLAN — one or two sentences, at the LESSON
   * level. Distinct from two fields that already cover pacing:
   * `activity.optional` says what to CUT when the room is behind; a
   * per-activity `fastFinisher` gives one fast STUDENT something harder while
   * the rest of the room catches up. Neither answers "the whole class moved
   * faster than planned — what do I do with the extra ten minutes?", which
   * is a lesson-level call, not a per-page or per-student one.
   *
   * Optional and defaults to "" so every pack written before this field is
   * unchanged.
   */
  ifAheadOfSchedule: z.string().optional().default(""),
  // Per-page coaching for the two adults in the room — see pageCoachingSchema.
  pageCoaching: z.array(pageCoachingSchema).default([]),
  rubric: z.array(rubricBandSchema).default([]),
  // True while the timing plan is the deterministic placeholder the build writes
  // the moment the core pages exist — so a half-built pack is already teachable
  // instead of waiting on the teacher-guide stage. The real stage replaces the
  // plan and clears this; the review checklist refuses to pass while it is set.
  provisional: z.boolean().default(false),
});
export type TeacherGuide = z.infer<typeof teacherGuideSchema>;

export const lessonPackSchema = z.object({
  // ── Identity / cover ──
  lessonCode: z.string(), // "L1"
  title: z.string(), // "THE ARGUMENT SANDWICH"
  subtitle: z.string(), // "Topic Intro & The PEEL Argument"
  skillFocus: z.string(), // "PEEL Structure"
  series: z.string(), // "UBI Novice"
  resolution: z.string(), // the season's resolution — must stay consistent
  /**
   * THE PRACTICE TOPIC — a low-load subject the new skill is taught on BEFORE
   * the real anchor has to carry it.
   *
   * The strongest structural decision in the founder's pack, and the one this
   * schema previously made impossible to express. He teaches PEEL on a class
   * dog and a school phone ban for four pages; only from page five does the
   * researched resolution (a federal moratorium on hyperscale data centers)
   * carry any weight, and pages ten and eleven then re-run the same build on
   * it. The student builds the argument twice — once cheap, once real.
   *
   * WHY IT IS WORTH A FIELD. A new skill is a FORM. Teaching a new form on
   * unfamiliar content loads both at once and the student fails at both. The
   * fix is to isolate the variable: hold the content trivial while the form is
   * new, then hold the form fixed while the content gets hard.
   *
   * ── THE RULE THIS RELAXES, AND WHY IT IS NOT ACTUALLY RELAXED ────────────
   * The generation prompt required the whole arc to be "anchored to ONE
   * resolution", written to stop packs that were a pile of disconnected
   * worksheets. That rule works, and this does not weaken it — because the
   * founder's architecture is not two unrelated topics. It is: teach on the
   * easy one, then TRANSFER to the anchor, and the transfer is the connection.
   * So the requirement moves from SAMENESS to CONNECTEDNESS, which is strictly
   * stronger: a practice page now owes a later page that picks the skill back
   * up on the anchor, and the checklist refuses a pack where that handover
   * never happens. A practice topic with no transfer IS the disconnected
   * worksheet the old rule was aimed at, and it is now the thing that fails.
   *
   * Empty on most packs. A lesson that introduces no new form does not need
   * one, and inventing a practice topic for a lesson that is already about its
   * anchor just costs a page.
   */
  practiceTopic: z.string().default(""),
  durationMin: z.number().int().min(0).default(120),
  accentColor: z.string().default("#0f766e"), // per-lesson accent
  emoji: z.string().default("🌏"), // cover icon cluster
  /**
   * THE COVER'S OWN IDENTITY — the two fields that make ten lessons in a series
   * ten different title pages instead of one template printed ten times.
   *
   * His covers carry a large topical glyph and a short editorial line above the
   * title: a rocket and "The Grand Finale" on the War Powers finale, a trophy
   * and "All 9 Skills. One Full Round." on the UBI tournament lesson. Neither is
   * derivable from the title — they are a judgement about what THIS lesson is
   * for — so they are authored per pack rather than computed.
   *
   * `coverIcon` is one glyph, sized to 70px on the cover. It is the one place
   * emoji are wanted rather than stripped (see stripEmoji, which spares them):
   * on a printed cover it is furniture, not content.
   */
  coverIcon: z.string().default(""),
  /** the short line above the title — "The Grand Finale", 3–6 words */
  coverTagline: z.string().default(""),
  // The class/unit's shared thematic identity ("vintage detective dossier",
  // "mission-control ops"…). Set once per unit and inherited by every lesson in
  // it, so one class feels like one world and a NEW class feels visibly new.
  designMotif: z.string().default(""),
  // Visual design template for the printed pack (see lib/lesson-designs.ts) —
  // changes the whole look (frame, cards, bars, badges), not just the accent.
  design: z.string().default("dossier"),
  // AI-authored per-pack design system: a CSS block (scoped to the print root)
  // that gives THIS pack its own cohesive visual identity — palette, type,
  // border/card/shadow treatment, decorative flourishes — by redefining the
  // --pk-* design tokens and theming the structural classes. Empty = fall back
  // to the grade-band skin. Generated once per pack so every page matches.
  designCss: z.string().default(""),
  // One-line human description of the pack's art direction (for the UI).
  designNote: z.string().default(""),
  // Style lock for the AI-DESIGNS-THE-PAGE path (per-activity `designHtml`): a
  // compact description of the palette/fonts/masthead/motif the first designed
  // page established, fed back into every later page so the whole pack is one
  // consistent publication. Seeded (with no extra AI call) from the first page.
  designBrief: z.string().default(""),

  // Latest content-QA report (fact-check of citations + pedagogical review of
  // every activity). Stored as an opaque JSON string so the schema doesn't have
  // to import the QA shape; the material page parses and renders it. Empty until
  // the author runs QA.
  contentQaJson: z.string().default(""),
  contentQaAt: z.string().default(""), // ISO timestamp of the last QA run

  // ── Authoring inputs (the teacher's own prompt + research) ──
  // The teacher's free-form spec for this pack — goals, must-cover points,
  // examples, angle, constraints. Treated as the authoritative brief the whole
  // build is grounded in, not just a seed for the structured fields.
  brief: z.string().default(""),
  // Real source material the teacher pastes in (quotes, stats with citations,
  // article excerpts, notes, links). The evidence deck is grounded in this so
  // the teacher's research flows straight into the pack instead of the model
  // inventing sources.
  sourceMaterial: z.string().default(""),
  // Teaching-detail levers — each sharpens a different part of generation:
  // what students already know (calibrates scaffolding, stops re-teaching),
  // the mistakes they actually make (targets drills, answer keys, exit ticket),
  // and the room/material/tech reality (keeps activities runnable).
  priorKnowledge: z.string().default(""),
  misconceptions: z.string().default(""),
  constraints: z.string().default(""),

  // ── Level targeting (drives AI generation & reading level) ──
  gradeBand: z.string().default("Grades 6–8"),
  rigorLevel: z.string().default("standard"), // foundational | standard | advanced | elite
  format: z.string().default("auto"), // lesson-format id — the structural shape
  // Competitive format the squad actually debates (see lib/debate-formats.ts):
  // "public-forum", "british-parliamentary", … Empty = format-agnostic teaching.
  debateFormat: z.string().default(""),

  // ── Objectives ──
  mission: z.string(), // "Today's Mission" box
  successCriteria: z.array(z.string()).default([]), // "By the end of today I can…"

  // ── Planning ──
  // The author-reviewed page-by-page outline. When present, the full build uses
  // it verbatim instead of planning a new one — the "steer the outline" step.
  outlinePlan: z.array(outlineEntrySchema).default([]),

  // ── Content ──
  vocabulary: z.array(vocabTermSchema).default([]),
  evidenceCards: z.array(evidenceCardSchema).default([]),
  activities: z.array(activitySchema).default([]),

  // ── Teacher pack ──
  teacherGuide: teacherGuideSchema,
});
export type LessonPack = z.infer<typeof lessonPackSchema>;

/**
 * A stable fingerprint of the pack's TEACHING content (not its design/QA/meta).
 * Lets the review gate tell whether a stored content-QA report still describes
 * the current pack, so a stale pass (after any regen/revise/manual edit) can't
 * slip a changed pack through. Cheap FNV-1a over the content-relevant fields.
 */
export function packContentHash(pack: LessonPack): string {
  const relevant = {
    mission: pack.mission,
    successCriteria: pack.successCriteria,
    vocabulary: pack.vocabulary,
    evidenceCards: pack.evidenceCards,
    /**
     * Three fields are excluded, and the rule is precise: a field belongs out
     * of this hash only if the QA reviewer provably cannot observe it.
     *
     * `reviewPackContent` builds an explicit projection of each activity —
     * kind, title, instructions, keyIdea, scene, steps, worked example,
     * compare, sort items, match pairs, frames, callouts, prompts and
     * stand-and-deliver. Nothing else reaches the model.
     *
     *   designHtml   layout, never content (already excluded)
     *   badge        a decorative print label above the page title
     *   durationMin  timing, which the DETERMINISTIC checklist judges — the
     *                reviewer is never shown a single minute figure
     *
     * Why it is worth being exact: invalidating this hash forces a full
     * whole-pack content review, an Opus call costing roughly 26¢. Retiming a
     * lesson — one click per page in the editor — therefore used to buy a
     * re-review by a reviewer that cannot see timings and would return the
     * same verdict it just gave.
     *
     * DELIBERATELY STILL IN: the quiz, word bank, argument chains, hidden
     * judge move and the four rigor mechanics. The reviewer does not currently
     * see those either — but they are real teaching content, so a change to
     * them SHOULD invalidate a quality verdict. That is a gap in what QA
     * inspects, not a reason to stop tracking them; narrowing the hash to
     * match a reviewer's blind spots would silently bless edits nobody checked.
     */
    activities: pack.activities.map((a) => ({
      ...a,
      designHtml: "",
      badge: "",
      durationMin: 0,
    })),
    resolution: pack.resolution,
    skillFocus: pack.skillFocus,
  };
  const str = JSON.stringify(relevant);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** A fresh, mostly-empty pack used when a builder starts a new material. */
/**
 * A blank page, with every block the schema knows about.
 *
 * Lives here rather than in the Builder because the Builder used to spell the
 * whole object out as a literal — so every field added to `activitySchema`
 * silently broke "+ Add activity" until someone noticed the type error. Parsing
 * an empty object lets Zod fill in the defaults it already declares, which is
 * the only version that cannot drift.
 */
export function emptyActivity(kind: ActivityKind = "custom"): Activity {
  return activitySchema.parse({ kind, title: "", instructions: "" });
}

export function emptyLessonPack(): LessonPack {
  return lessonPackSchema.parse({
    lessonCode: "",
    title: "",
    subtitle: "",
    skillFocus: "",
    series: "",
    resolution: "",
    mission: "",
    teacherGuide: {
      cohort: "",
      assessment: "",
      materialsChecklist: "",
    },
  });
}

export function countWords(s: string): number {
  return s.trim() === "" ? 0 : s.trim().split(/\s+/).length;
}
