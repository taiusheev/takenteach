/**
 * WHERE THE RIGOR MECHANICS ARE REQUIRED.
 *
 * The four blocks in `lesson-pack-schema.ts` each close a specific way a drill
 * goes soft. This module is the single place that says WHICH page kinds must
 * carry which — and it is imported by all three consumers so they cannot drift:
 *
 *   • `lib/ai.ts`      — turns it into the instruction the generator is given
 *   • `lib/checklist.ts` — turns it into a gate the pack must pass to be reviewed
 *   • `components/PrintView.tsx` — renders whatever is present
 *
 * The previous version of these rules lived only in the prompt, and prompt-only
 * rules are the ones that quietly stop being true: the model drops them under
 * load and nothing notices until a coach is standing in front of a class with
 * a checklist drill they were told had been replaced.
 *
 * THE RULE OF THUMB for adding a page kind below: require a mechanic where its
 * absence would let a student produce the right-looking artifact without doing
 * the thinking. Do not require one everywhere it would merely be nice — a page
 * carrying four mechanics teaches none of them.
 */
import { type Activity, type ActivityKind } from "./lesson-pack-schema";

export type RigorMechanic = "microFlow" | "ballotLine" | "microCrossfire" | "echoCheck";

export const RIGOR_LABELS: Record<RigorMechanic, string> = {
  microFlow: "MICRO-FLOW",
  ballotLine: "BALLOT LINE",
  microCrossfire: "MICRO-CROSSFIRE",
  echoCheck: "ECHO CHECK",
};

/**
 * Listening pages. Anywhere one student speaks and another is meant to be
 * doing something, the something is transcription — never a checklist.
 */
const MICRO_FLOW_KINDS: ActivityKind[] = ["sparring"];

/**
 * Pages that teach or demand the Link layer. A worked example that models a
 * weak Link teaches a weak Link, so the I-Do carries one too.
 */
const BALLOT_LINE_KINDS: ActivityKind[] = [
  "i-do",
  "scaffolded-build",
  "independent-build",
];

/**
 * Anywhere a student speaks without being answerable. Sparring is the obvious
 * one; the exit ticket and the stand-and-deliver close of a remix page are
 * where a one-way speech otherwise slips through.
 */
const MICRO_CROSSFIRE_KINDS: ActivityKind[] = ["sparring", "exit-ticket", "remix"];

/**
 * Solo and timed building. The echo happens when a student is writing alone
 * against the clock with a card in front of them — which is exactly these.
 */
const ECHO_CHECK_KINDS: ActivityKind[] = [
  "scaffolded-build",
  "independent-build",
  "exit-ticket",
];

const REQUIRED: Record<RigorMechanic, ActivityKind[]> = {
  microFlow: MICRO_FLOW_KINDS,
  ballotLine: BALLOT_LINE_KINDS,
  microCrossfire: MICRO_CROSSFIRE_KINDS,
  echoCheck: ECHO_CHECK_KINDS,
};

/** The mechanics a page of this kind must carry. */
export function requiredMechanics(kind: ActivityKind): RigorMechanic[] {
  return (Object.keys(REQUIRED) as RigorMechanic[]).filter((m) =>
    REQUIRED[m].includes(kind)
  );
}

/** Whether an activity actually carries a usable instance of a mechanic. */
export function hasMechanic(a: Activity, m: RigorMechanic): boolean {
  switch (m) {
    case "microFlow":
      // A flow grid with no target is a blank table nobody knows what to do with.
      return Boolean(a.microFlow?.target?.trim());
    case "ballotLine":
      // The comparison is the point: a ballot line with no `theirImpact` is
      // the old "tie it back to the motion" wearing a new label.
      return Boolean(
        a.ballotLine?.line?.trim() && a.ballotLine?.theirImpact?.trim()
      );
    case "microCrossfire":
      // Without a question the "crossfire" is thirty seconds of silence.
      return (a.microCrossfire?.questions?.length ?? 0) > 0;
    case "echoCheck":
      return (a.echoCheck?.tests?.length ?? 0) > 0;
  }
}

/** Mechanics this page should have and doesn't — the gate's raw material. */
export function missingMechanics(a: Activity): RigorMechanic[] {
  return requiredMechanics(a.kind).filter((m) => !hasMechanic(a, m));
}

/**
 * The contract, rendered for the generation prompt.
 *
 * Written as instructions rather than as a schema dump because the model is
 * already given the schema; what it needs here is WHY each block exists and
 * what a weak instance looks like, since a weak instance is what it will
 * produce by default.
 */
export const RIGOR_CONTRACT = `RIGOR MECHANICS — these replace the four places a debate drill goes soft. Each is a structured field on the activity, and a page of the listed kind that omits it FAILS review.

MICRO-FLOW (field: microFlow) — required on: sparring.
Never write a listening checklist. A box that says "gave evidence [ ]" can be ticked by a student who heard nothing, and it teaches that listening means auditing form. The listener TRANSCRIBES, in the speaker's own words: the CLAIM, the causal WARRANT (the "because" step), and the DATA point. Set target to whose speech is being flowed and captures to how many arguments (3 unless the speech is short). Fill exemplar with ONE correctly flowed row for this lesson's actual content, so the coach can show the room what a real capture looks like. A blank warrant column is a FINDING, not a failure — it means the speaker never said one, and the debrief is about that.

BALLOT LINE (field: ballotLine) — required on: i-do, scaffolded-build, independent-build.
The L of PEEL is NOT "tie your point back to the motion". That instruction produces "and that is why we support the motion", which restates and stops. A Link is impact calculus: ourImpact (what our argument causes), theirImpact (what the other side's best alternative causes), weighing (the actual comparison — scale, probability, reversibility, timeframe — pick the one that genuinely decides THIS clash), and line, the finished sentence said aloud, starting "Judge,". Never leave theirImpact empty: a student who cannot fill it has not understood that weighing is comparative, and that is the whole lesson. On an i-do page the ballot line is MODELLED; on build pages it is what the student produces.

MICRO-CROSSFIRE (field: microCrossfire) — required on: sparring, exit-ticket, remix.
Any one-way speech is immediately followed by 30 seconds of live questioning. Not a second speech — one real question, which is why the time is short: choosing the best question IS the skill. Write listenerRole in one line, and 2–3 ready questions in questions[], each tagged with what it is engineered to sever: "warrant" (break the because-step: "What has to be true for that to follow?") or "limit" (catch a claim the card's own scope LIMIT does not support: "Your card measured one city — how do you get from that to nationwide?"). Attack the reasoning, never the person; that is what makes this safe in a novice room.

ECHO CHECK (field: echoCheck) — required on: scaffolded-build, independent-build, exit-ticket.
The commonest novice defect: the Explain layer restates the statistic just quoted. "Incomes rose 12%. This shows incomes rose 12%." Set cardId to the card being cited, mechanism to the causal step a strong Explain names HERE (teacher-facing), and 2–3 tests[] a student can honestly answer alone before handing in — each phrased as a yes/no about their OWN sentence, e.g. "Does my Explain name a cause that the card does not state?" and "If I deleted the card, would my Explain still say something?". The test must be answerable without the teacher.`;
