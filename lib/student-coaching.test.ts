/**
 * The two gates that decide whether a page reaches a STUDENT as a usable
 * activity, rather than as a label with a blank under it.
 *
 * Both were added after measuring our packs against the founder's own
 * classroom material, where the finding was not that our lessons contain less
 * thinking — they contain more — but that the thinking is printed in
 * teacher-only fields. `student-coaching` closes that. `page-does-something`
 * closes its mirror image: a page carrying plenty of teaching and no work.
 *
 * Tested here rather than through `generateLessonPack` for the reason
 * `gates.test.ts` already gives: these are the decidable parts, and they can be
 * stated directly instead of via a hand-authored pack that would break on every
 * new content rule.
 *
 *   node --test lib/student-coaching.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runChecklist,
  studentReadWords,
  COACHED_KINDS,
  HEAVY_PRODUCTION_KINDS,
} from "./checklist.ts";
import { lessonPackSchema, type LessonPack } from "./lesson-pack-schema.ts";

/**
 * The smallest pack the schema will accept, varying only the activities.
 *
 * Everything outside `activities` is inert filler: these four rules read the
 * pages, the grade band and nothing else, and the other checklist items are
 * free to fail on a fixture this bare — each test looks up its own item by id
 * rather than asserting the pack passes overall.
 */
function packWith(activities: unknown[], gradeBand = "Grades 6–8"): LessonPack {
  return lessonPackSchema.parse({
    lessonCode: "L1",
    title: "TEST PACK",
    subtitle: "fixture",
    skillFocus: "fixture",
    series: "fixture",
    mission: "fixture mission",
    resolution: "Resolved: this is the anchor.",
    gradeBand,
    teacherGuide: {
      cohort: "fixture",
      assessment: "fixture",
      materialsChecklist: "fixture",
    },
    activities,
  });
}

const prompt = (over: Record<string, unknown> = {}) => ({
  label: "Write your Point in one sentence.",
  side: "neutral",
  expectedAnswer: "Strong: names a side and one claim. Weak: a feeling.",
  ...over,
});

function item(pack: LessonPack, id: string) {
  const found = runChecklist(pack).items.find((i) => i.id === id);
  assert.ok(found, `expected the checklist to run "${id}"`);
  return found;
}

// ── student-coaching ─────────────────────────────────────────────────────────

test("a build page whose prompts have no guide fails — that is the page a teacher has to narrate", () => {
  const pack = packWith([
    { kind: "independent-build", title: "SOLO BUILD", instructions: "Build one.", prompts: [prompt()] },
  ]);
  const r = item(pack, "student-coaching");
  assert.equal(r.passed, false);
  assert.match(r.detail, /SOLO BUILD/);
});

test("a guide on every prompt passes, and the expected answer stays where it was", () => {
  const pack = packWith([
    {
      kind: "independent-build",
      title: "SOLO BUILD",
      instructions: "Build one.",
      prompts: [prompt({ guide: "Say the side, then the one thing you want believed." })],
    },
  ]);
  assert.equal(item(pack, "student-coaching").passed, true);
  assert.equal(
    pack.activities[0].prompts[0].expectedAnswer,
    "Strong: names a side and one claim. Weak: a feeling."
  );
});

test("pages outside the production kinds are not asked for coaching — a hook prompt is a quick check", () => {
  const pack = packWith([
    { kind: "hook", title: "OPENER", instructions: "Read it.", prompts: [prompt()] },
  ]);
  // No production page in the pack at all, so the rule stays silent rather than
  // failing a pack it does not apply to.
  const found = runChecklist(pack).items.find(
    (i) => i.id === "student-coaching"
  );
  assert.equal(found, undefined);
});

test("every kind the gate demands coaching on can actually carry prompts", () => {
  // Guards against a kind being added to COACHED_KINDS that the renderer or the
  // repair loop would then never fix, which is how a build starts looping.
  for (const kind of COACHED_KINDS) {
    const pack = packWith([
      { kind, title: `PAGE ${kind}`, instructions: "Do it.", prompts: [prompt()] },
    ]);
    assert.equal(item(pack, "student-coaching").passed, false, `${kind} should be gated`);
  }
});

// ── coaching-is-not-the-key ──────────────────────────────────────────────────

test("a guide long enough to be the answer fails, because that is the failure mode of the rule above", () => {
  const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
  const pack = packWith([
    {
      kind: "independent-build",
      title: "SOLO BUILD",
      instructions: "Build one.",
      prompts: [prompt({ guide: long })],
    },
  ]);
  const r = item(pack, "coaching-is-not-the-key");
  assert.equal(r.passed, false);
  assert.match(r.detail, /30 words/);
});

test("a trap that would fit any page fails; a trap specific to the page passes", () => {
  const generic = packWith([
    {
      kind: "exit-ticket",
      title: "EXIT",
      instructions: "Build one.",
      prompts: [prompt({ guide: "Name the move.", trap: "Do not be vague." })],
    },
  ]);
  assert.equal(item(generic, "coaching-is-not-the-key").passed, false);

  const specific = packWith([
    {
      kind: "exit-ticket",
      title: "EXIT",
      instructions: "Build one.",
      prompts: [
        prompt({ guide: "Name the move.", trap: "Do not repeat the Point in new words." }),
      ],
    },
  ]);
  assert.equal(item(specific, "coaching-is-not-the-key").passed, true);
});

test("the rule stays silent on a pack that carries no coaching at all", () => {
  // Otherwise every pack in the library predating the field would fail a rule
  // about the quality of something it does not have.
  const pack = packWith([
    { kind: "hook", title: "OPENER", instructions: "Read it.", prompts: [prompt()] },
  ]);
  const found = runChecklist(pack).items.find(
    (i) => i.id === "coaching-is-not-the-key"
  );
  assert.equal(found, undefined);
});

// ── page-does-something ──────────────────────────────────────────────────────

test("a page a student only reads fails, including a modelled i-do", () => {
  const pack = packWith([
    {
      kind: "i-do",
      title: "WATCH ONE BUILD",
      instructions: "Watch.",
      exampleLayers: [{ label: "POINT", text: "Our side says…" }],
    },
  ]);
  const r = item(pack, "page-does-something");
  assert.equal(r.passed, false);
  assert.match(r.detail, /WATCH ONE BUILD/);
});

test("one task is enough on a modelled page; production pages owe two", () => {
  const iDo = packWith([
    { kind: "i-do", title: "MODEL", instructions: "Watch.", prompts: [prompt()] },
  ]);
  assert.equal(item(iDo, "page-does-something").passed, true);

  for (const kind of HEAVY_PRODUCTION_KINDS) {
    const one = packWith([
      { kind, title: `ONE ${kind}`, instructions: "Do it.", prompts: [prompt()] },
    ]);
    assert.equal(
      item(one, "page-does-something").passed,
      false,
      `${kind} with one task should fail`
    );
    const two = packWith([
      { kind, title: `TWO ${kind}`, instructions: "Do it.", prompts: [prompt(), prompt()] },
    ]);
    assert.equal(
      item(two, "page-does-something").passed,
      true,
      `${kind} with two tasks should pass`
    );
  }
});

test("work counts wherever it lives, not only as prompts", () => {
  // A drill's student work is its sort items; a sparring page's is its flow and
  // its crossfire. Counting only `prompts` would fail the pages that are doing
  // the most.
  const pack = packWith([
    {
      kind: "drill",
      title: "SORT",
      instructions: "Sort each line.",
      sortItems: [
        { statement: "Homework is boring.", category: "OPINION" },
        { statement: "Homework took 3 hours.", category: "FACT" },
      ],
    },
    {
      kind: "sparring",
      title: "SPAR",
      instructions: "Spar.",
      microFlow: { target: "your partner's 60-second case", captures: 3 },
      microCrossfire: {
        seconds: 30,
        listenerRole: "Ask one question.",
        questions: [{ stem: "What has to be true for that to follow?", targets: "warrant" }],
      },
    },
  ]);
  assert.equal(item(pack, "page-does-something").passed, true);
});

// ── the reading budget ───────────────────────────────────────────────────────

test("coaching lines are counted against the reading budget — they cost words like anything else", () => {
  const bare = lessonPackSchema.parse({
    lessonCode: "L1",
    title: "T",
    subtitle: "f", skillFocus: "f", series: "f", mission: "m",
    resolution: "R",
    teacherGuide: { cohort: "f", assessment: "f", materialsChecklist: "f" },
    activities: [
      { kind: "independent-build", title: "B", instructions: "Go.", prompts: [prompt()] },
    ],
  });
  const coached = lessonPackSchema.parse({
    lessonCode: "L1",
    title: "T",
    subtitle: "f", skillFocus: "f", series: "f", mission: "m",
    resolution: "R",
    teacherGuide: { cohort: "f", assessment: "f", materialsChecklist: "f" },
    activities: [
      {
        kind: "independent-build",
        title: "B",
        instructions: "Go.",
        prompts: [
          prompt({ guide: "Name the move, not the answer.", trap: "Do not restate the Point." }),
        ],
      },
    ],
  });
  assert.ok(
    studentReadWords(coached.activities[0]) > studentReadWords(bare.activities[0]),
    "guide and trap must count toward what a student reads"
  );
});

test("the density ceiling clears the benchmark's own pages rather than rejecting them", () => {
  // The founder's pack averages ~358 student-read words per sheet. A ceiling
  // below that would have the repair loop cutting the reference material, which
  // is what the old 200/300 pair did.
  const older = packWith(
    [
      {
        kind: "evidence-study",
        title: "CARDS",
        instructions: "Read each card.",
        prompts: Array.from({ length: 6 }, () =>
          prompt({ label: Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ") })
        ),
      },
    ],
    "Grades 11–12"
  );
  const n = studentReadWords(older.activities[0]);
  assert.ok(n > 240, `fixture should exceed the novice ceiling, got ${n}`);
  assert.equal(item(older, "page-density").passed, n <= 380);
});

// ── backwards compatibility ──────────────────────────────────────────────────

test("a pack written before these fields existed still parses, and gains empty coaching", () => {
  const old = lessonPackSchema.parse({
    lessonCode: "L1",
    title: "OLD PACK",
    subtitle: "f", skillFocus: "f", series: "f", mission: "m",
    resolution: "Resolved: something.",
    teacherGuide: { cohort: "f", assessment: "f", materialsChecklist: "f" },
    activities: [
      {
        kind: "independent-build",
        title: "B",
        instructions: "Go.",
        prompts: [{ label: "Write one.", side: "neutral", expectedAnswer: "Strong: …" }],
      },
    ],
  });
  assert.equal(old.activities[0].prompts[0].guide, "");
  assert.equal(old.activities[0].prompts[0].trap, "");
  assert.equal(old.activities[0].prompts[0].expectedAnswer, "Strong: …");
});
