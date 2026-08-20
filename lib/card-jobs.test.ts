/**
 * Card jobs and pass conditions — the two Tier-1 gaps between our packs and the
 * founder's, both of which turn something printed into something done.
 *
 * A pass condition is an observable test a student runs on their OWN sentence;
 * a card job is one named task bound to one card. Both existed in his pack as
 * structure and in ours as nothing, and the measured cost of the second was
 * visible: rendering his own evidence page through our layout, the job boxes
 * came out at one ruled line while unrelated boxes on the same sheet got four,
 * because nothing connected a job to the card it belonged to.
 *
 *   node --test lib/card-jobs.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecklist, studentReadWords } from "./checklist.ts";
import { lessonPackSchema, type LessonPack } from "./lesson-pack-schema.ts";

const card = (id: string) => ({
  id,
  side: "pro" as const,
  institution: "Berkeley Lab",
  year: "2026",
  publication: "United States Data Center Energy Usage Report",
  paraphrase: "Data centers used about 4 of every 100 units of US electricity in 2023.",
  translation: "About four percent of the country's power went to data centers.",
  tacticalNote: "Read the measured number, then say the 2030 figure is a forecast.",
  limit: "The 2030 figure is an estimate, not a measurement, and it is national rather than local.",
});

function packWith(
  activities: unknown[],
  cards: unknown[] = [card("A"), card("B")]
): LessonPack {
  return lessonPackSchema.parse({
    lessonCode: "L1",
    title: "TEST PACK",
    subtitle: "f",
    skillFocus: "f",
    series: "f",
    mission: "m",
    resolution: "Resolved: this is the anchor.",
    teacherGuide: { cohort: "f", assessment: "f", materialsChecklist: "f" },
    evidenceCards: cards,
    activities,
  });
}

const item = (pack: LessonPack, id: string) =>
  runChecklist(pack).items.find((i) => i.id === id);

// ── card jobs ────────────────────────────────────────────────────────────────

test("an evidence page that prints cards with nothing to do with them fails", () => {
  const pack = packWith([
    { kind: "evidence-study", title: "THE DECK", instructions: "Read each card.", whyItMatters: "w" },
  ]);
  const r = item(pack, "cards-have-jobs");
  assert.equal(r?.passed, false);
  assert.match(r!.detail, /THE DECK/);
});

test("one job per card passes", () => {
  const pack = packWith([
    {
      kind: "evidence-study",
      title: "THE DECK",
      instructions: "One job per card.",
      whyItMatters: "w",
      cardJobs: [
        { cardId: "A", job: "THE SPEECH LINE", instruction: "Write the sentence you would say out loud." },
        { cardId: "B", job: "THE LIMIT", instruction: "Say what this does not show, before the other side does." },
      ],
    },
  ]);
  assert.equal(item(pack, "cards-have-jobs")?.passed, true);
  assert.equal(item(pack, "card-jobs-resolve")?.passed, true);
});

test("a job naming a card that is not in the deck is caught", () => {
  // The failure this prevents is silent: a student looks for card D, and the
  // deck has two cards.
  const pack = packWith([
    {
      kind: "evidence-study",
      title: "THE DECK",
      instructions: "Go.",
      whyItMatters: "w",
      cardJobs: [{ cardId: "D", job: "THE WEIGH", instruction: "Say why it decides the round." }],
    },
  ]);
  const r = item(pack, "card-jobs-resolve");
  assert.equal(r?.passed, false);
  assert.match(r!.detail, /"D"/);
});

test("a blank card id is caught too", () => {
  const pack = packWith([
    {
      kind: "evidence-study",
      title: "THE DECK",
      instructions: "Go.",
      whyItMatters: "w",
      cardJobs: [{ cardId: "", job: "THE LIMIT", instruction: "Say the scope." }],
    },
  ]);
  assert.equal(item(pack, "card-jobs-resolve")?.passed, false);
});

test("card ids resolve case- and space-insensitively", () => {
  // An author typing "a " should not produce a dangling reference.
  const pack = packWith([
    {
      kind: "evidence-study",
      title: "THE DECK",
      instructions: "Go.",
      whyItMatters: "w",
      cardJobs: [{ cardId: " a ", job: "THE SPEECH LINE", instruction: "Say it out loud." }],
    },
  ]);
  assert.equal(item(pack, "card-jobs-resolve")?.passed, true);
});

test("the resolve rule stays silent on a pack that assigns no jobs", () => {
  // Otherwise every pack predating the field fails a rule about the quality of
  // something it does not have.
  const pack = packWith([{ kind: "hook", title: "H", instructions: "Go.", whyItMatters: "w" }]);
  assert.equal(item(pack, "card-jobs-resolve"), undefined);
});

test("the jobs rule stays silent when the pack carries no evidence deck", () => {
  const pack = packWith(
    [{ kind: "evidence-study", title: "D", instructions: "Go.", whyItMatters: "w" }],
    []
  );
  assert.equal(item(pack, "cards-have-jobs"), undefined);
});

test("card jobs count against the page's reading budget", () => {
  const bare = packWith([{ kind: "evidence-study", title: "D", instructions: "Go.", whyItMatters: "w" }]);
  const withJobs = packWith([
    {
      kind: "evidence-study",
      title: "D",
      instructions: "Go.",
      whyItMatters: "w",
      cardJobs: [{ cardId: "A", job: "THE LIMIT", instruction: "Say what this does not show." }],
    },
  ]);
  assert.ok(studentReadWords(withJobs.activities[0]) > studentReadWords(bare.activities[0]));
});

// ── pass conditions ──────────────────────────────────────────────────────────

test("a pass condition survives a schema round-trip and defaults empty", () => {
  const pack = packWith([
    {
      kind: "i-do",
      title: "MODEL",
      instructions: "Watch.",
      whyItMatters: "w",
      exampleLayers: [
        { label: "POINT", text: "We should pause new building.", passesWhen: "A stranger could repeat it after hearing it once." },
        { label: "EVIDENCE", text: "NRDC estimates about $70 a month by 2028." },
      ],
    },
  ]);
  assert.equal(
    pack.activities[0].exampleLayers[0].passesWhen,
    "A stranger could repeat it after hearing it once."
  );
  assert.equal(pack.activities[0].exampleLayers[1].passesWhen, "");
});

test("pass conditions count against the reading budget — they print for the student", () => {
  const bare = packWith([
    { kind: "i-do", title: "M", instructions: "Watch.", whyItMatters: "w", exampleLayers: [{ label: "P", text: "x" }] },
  ]);
  const tested = packWith([
    {
      kind: "i-do",
      title: "M",
      instructions: "Watch.",
      whyItMatters: "w",
      exampleLayers: [{ label: "P", text: "x", passesWhen: "A stranger could repeat it after hearing it once." }],
    },
  ]);
  assert.ok(studentReadWords(tested.activities[0]) > studentReadWords(bare.activities[0]));
});

// ── backwards compatibility ──────────────────────────────────────────────────

test("packs written before either field parse and gain empty defaults", () => {
  const old = lessonPackSchema.parse({
    lessonCode: "L1",
    title: "OLD",
    subtitle: "f",
    skillFocus: "f",
    series: "f",
    mission: "m",
    resolution: "R",
    teacherGuide: { cohort: "f", assessment: "f", materialsChecklist: "f" },
    activities: [
      { kind: "evidence-study", title: "D", instructions: "Go.", exampleLayers: [{ label: "P", text: "x" }] },
    ],
  });
  assert.deepEqual(old.activities[0].cardJobs, []);
  assert.equal(old.activities[0].exampleLayers[0].passesWhen, "");
});

// ── the cut path ─────────────────────────────────────────────────────────────

test("a long pack with nothing droppable fails — the thing that gets cut is the exit ticket", () => {
  const long = Array.from({ length: 13 }, (_, i) => ({
    kind: i === 12 ? "exit-ticket" : "drill",
    title: `PAGE ${i + 1}`,
    instructions: "Go.",
    whyItMatters: `why ${i}`,
  }));
  const r = item(packWith(long), "cut-path");
  assert.equal(r?.passed, false);
  assert.match(r!.detail, /nothing marked droppable/i);
});

test("marking an extension page droppable passes", () => {
  const long = Array.from({ length: 13 }, (_, i) => ({
    kind: i === 12 ? "exit-ticket" : "drill",
    title: `PAGE ${i + 1}`,
    instructions: "Go.",
    whyItMatters: `why ${i}`,
    ...(i === 5 ? { optional: true } : {}),
  }));
  assert.equal(item(packWith(long), "cut-path")?.passed, true);
});

test("the exit ticket may never be the droppable one", () => {
  // It is the page the lesson exists to reach, and it is the page a teacher
  // running late will cut first if the pack lets them.
  const long = Array.from({ length: 13 }, (_, i) => ({
    kind: i === 12 ? "exit-ticket" : "drill",
    title: `PAGE ${i + 1}`,
    instructions: "Go.",
    whyItMatters: `why ${i}`,
    ...(i === 12 ? { optional: true } : {}),
  }));
  const r = item(packWith(long), "cut-path");
  assert.equal(r?.passed, false);
  assert.match(r!.detail, /exit ticket/i);
});

test("short packs are not asked for a cut path", () => {
  const short = [
    { kind: "hook", title: "A", instructions: "Go.", whyItMatters: "w" },
    { kind: "exit-ticket", title: "B", instructions: "Go.", whyItMatters: "x" },
  ];
  assert.equal(item(packWith(short), "cut-path"), undefined);
});

test("pages default to core, so no existing pack silently becomes skippable", () => {
  const pack = packWith([{ kind: "hook", title: "A", instructions: "Go.", whyItMatters: "w" }]);
  assert.equal(pack.activities[0].optional, false);
});
