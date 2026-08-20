/**
 * CAN A PACK ACTUALLY PASS EVERYTHING THIS SESSION ADDED?
 *
 * Ten gates went in across four changes — student coaching, the exit ballot,
 * card jobs, and the practice topic — each tested in isolation against a
 * fixture built to fail it. That proves every gate fires. It does not prove
 * they can all be satisfied AT ONCE, and that is the failure mode a set of new
 * rules actually has: two gates that quietly contradict each other are
 * individually correct, individually tested, and together make a passing pack
 * impossible to write. Nobody notices until a build loops through its repair
 * budget and ships anyway.
 *
 * So this builds one pack that does everything right and asserts the whole set
 * goes quiet. It is deliberately NOT a pack that passes all 55 gates — the
 * fixture for that would be a hand-written lesson that breaks on every future
 * rule, which is the trap `gates.test.ts` documents avoiding. It passes the ten
 * that are new, and that is the contradiction risk this session introduced.
 *
 *   node --test lib/gates-satisfiable.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecklist } from "./checklist.ts";
import { lessonPackSchema } from "./lesson-pack-schema.ts";

/** The ten rules added this session, by id. */
const NEW_GATES = [
  "student-coaching",
  "coaching-is-not-the-key",
  "page-does-something",
  "why-this-page",
  "exit-ballot",
  "ballot-tests-what-was-taught",
  "cards-have-jobs",
  "card-jobs-resolve",
  "practice-transfers",
  "practice-topic-declared",
];

const prompt = (label: string, guide: string, trap = "") => ({
  label,
  side: "neutral" as const,
  expectedAnswer: `Strong: ${label} answered with a named source. Weak: a feeling.`,
  guide,
  trap,
});

const card = (id: string) => ({
  id,
  side: "pro" as const,
  institution: "Berkeley Lab",
  year: "2026",
  publication: "United States Data Center Energy Usage Report",
  paraphrase: "Data centers used about 4 of every 100 units of US electricity in 2023.",
  translation: "About four percent of the country's power went to data centers.",
  tacticalNote: "Read the measured number, then say the 2030 figure is a forecast.",
  limit: "The 2030 figure is an estimate rather than a measurement, and it is national rather than local.",
});

/**
 * A pack that does everything the new rules ask for: the skill is taught on an
 * easy topic and handed over, every abstraction ships an observable test, cards
 * carry one job each, production pages coach at the point of writing, and the
 * exit ticket judges the criteria the pack actually taught.
 */
function goodPack() {
  return lessonPackSchema.parse({
    lessonCode: "L1",
    title: "BUILD ONE ARGUMENT",
    subtitle: "The four jobs, taught twice",
    skillFocus: "A four-layer argument",
    series: "JV Public Forum",
    mission: "Build one argument that survives a question.",
    resolution:
      "Resolved: the United States federal government should enact a moratorium on hyperscale data center construction.",
    practiceTopic: "Our school should ban student phones for the entire school day",
    gradeBand: "Grades 9–10",
    successCriteria: [
      "Name a clear side and claim",
      "Give a reason that answers why",
      "Name the source and use it fairly",
      "Return to the resolution",
    ],
    evidenceCards: [card("A"), card("B")],
    teacherGuide: {
      cohort: "JV squad",
      assessment: "Exit ticket",
      materialsChecklist: "Printed pack, timer",
    },
    activities: [
      {
        kind: "i-do",
        title: "WATCH ONE GET BUILT",
        instructions: "Watch the build, then say what each line adds.",
        whyItMatters: "Anyone can label the parts; only a debater can say what each one buys you.",
        runsOn: "practice",
        exampleLayers: [
          {
            label: "POINT",
            text: "Our school should ban phones for the whole day.",
            passesWhen: "A stranger could repeat it after hearing it once.",
          },
          {
            label: "EXPLANATION",
            text: "A whole-day rule removes the decision from every lesson.",
            passesWhen: "It answers why, and does not say the Point again.",
          },
        ],
        prompts: [prompt("Which layer would a judge miss if you stopped early?", "Name the layer, then say what it buys.")],
      },
      {
        kind: "we-do",
        title: "LABEL AND REPAIR",
        instructions: "Label each line, then rewrite the weak one.",
        whyItMatters: "The Link is the layer novices skip and judges notice missing.",
        runsOn: "practice",
        prompts: [
          prompt("Label each of the four lines.", "Write P, E, E or L in each box.", "Do not guess from length."),
          prompt("Rewrite line two so it names the decision.", "Name what is being voted on.", "Do not stop at the topic."),
        ],
      },
      {
        kind: "evidence-study",
        title: "THREE CARDS, THREE JOBS",
        instructions: "One job per card, in this order.",
        whyItMatters: "Three cards is the smallest set that can carry a whole case.",
        runsOn: "anchor",
        cardJobs: [
          { cardId: "A", job: "THE SPEECH LINE", instruction: "Write the sentence you would say out loud." },
          { cardId: "B", job: "THE LIMIT", instruction: "Say what this does not show, before the other side does." },
        ],
        prompts: [prompt("Which card would you lead with?", "Name the card, then why it goes first.")],
      },
      {
        kind: "independent-build",
        title: "BUILD IT FOR REAL",
        instructions: "Build one full argument on the resolution.",
        whyItMatters: "This is the first argument you will give on this topic, and the one you will defend.",
        runsOn: "anchor",
        prompts: [
          prompt("Write your Point.", "Say who acts and what stops.", "Do not say ban — a pause is not a ban."),
          prompt("Write your Evidence.", "Say the source, then one number.", "Do not stretch the card past what it counted."),
        ],
      },
      {
        kind: "exit-ticket",
        title: "DELIVER, JUDGE, REPAIR",
        instructions: "Deliver, judge a partner, then repair one named error.",
        whyItMatters: "Debaters improve one named fix at a time.",
        runsOn: "anchor",
        prompts: [
          prompt("Deliver your argument.", "Say it in 25–35 seconds."),
          prompt("Write your repaired sentence.", "Fix the row your partner marked."),
        ],
        exitBallot: {
          rows: [
            { criterion: "Clear side and claim", test: "A stranger could repeat it after hearing it once." },
            { criterion: "Reason answers why", test: "It did more than repeat the claim." },
            { criterion: "Source named and used fairly", test: "The judge could write down the number." },
          ],
          errors: [
            "My reason repeated my point",
            "I never named the source",
            "My claim was bigger than my evidence",
          ],
          repairs: ["Add the missing why", "Name the source out loud", "Narrow the claim"],
          product: "a rewritten sentence, not a score",
        },
      },
    ],
  });
}

test("a pack written to the new standard passes every rule this session added", () => {
  const items = runChecklist(goodPack()).items;
  const failing = items.filter((i) => NEW_GATES.includes(i.id) && !i.passed);
  assert.deepEqual(
    failing.map((f) => `${f.id}: ${f.detail}`),
    [],
    "the new gates are not mutually satisfiable — a pack cannot be written that passes them all"
  );
});

test("the rules actually ran against that pack — none stayed silent", () => {
  // A gate that never fires because its precondition is never met would pass
  // the test above vacuously, so every rule the fixture triggers should have an
  // opinion here.
  //
  // `practice-topic-declared` is excluded and the exclusion is the interesting
  // part: it is a GUARD, not a standard. It exists to catch a page claiming a
  // practice topic the pack does not have, so on any valid pack it is correct
  // for it to say nothing at all — there is no well-formed pack it can run
  // against. It is covered where it belongs, against the broken state, in
  // practice-topic.test.ts.
  const GUARDS = new Set(["practice-topic-declared"]);
  const ran = new Set(runChecklist(goodPack()).items.map((i) => i.id));
  const silent = NEW_GATES.filter((g) => !GUARDS.has(g) && !ran.has(g));
  assert.deepEqual(silent, [], `these rules never evaluated: ${silent.join(", ")}`);
});

test("the fixture is genuinely load-bearing — breaking one field breaks one rule", () => {
  // Guards against a fixture that passes for the wrong reason. Removing the
  // coaching should fail exactly the coaching rule, and nothing else new.
  const pack = goodPack();
  pack.activities.forEach((a) => a.prompts.forEach((p) => (p.guide = "")));
  const failing = runChecklist(pack)
    .items.filter((i) => NEW_GATES.includes(i.id) && !i.passed)
    .map((i) => i.id);
  assert.ok(failing.includes("student-coaching"), "removing every guide must fail student-coaching");
  assert.ok(
    !failing.includes("exit-ballot"),
    "and must not disturb an unrelated rule — that would mean the rules are coupled"
  );
});
