/**
 * The two fields that move assessment and rationale onto the STUDENT's page.
 *
 * Both close gaps measured against the founder's pack: he carries a reason to
 * care on all seventeen sheets, and his exit ticket is a ballot → named error →
 * mapped repair → rewrite, on one page the student holds. Ours put the rubric
 * in the teacher guide and asked for free-text reflection, which from a novice
 * reliably produces "I did okay".
 *
 *   node --test lib/exit-ballot.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecklist, studentReadWords } from "./checklist.ts";
import { lessonPackSchema, type LessonPack } from "./lesson-pack-schema.ts";

function packWith(activities: unknown[], extra: Record<string, unknown> = {}): LessonPack {
  return lessonPackSchema.parse({
    lessonCode: "L1",
    title: "TEST PACK",
    subtitle: "f",
    skillFocus: "f",
    series: "f",
    mission: "m",
    resolution: "Resolved: this is the anchor.",
    teacherGuide: { cohort: "f", assessment: "f", materialsChecklist: "f" },
    activities,
    ...extra,
  });
}

function item(pack: LessonPack, id: string) {
  return runChecklist(pack).items.find((i) => i.id === id);
}

const fullBallot = {
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
  repairs: ["Add the missing why", "Name the source out loud"],
  product: "a rewritten sentence, not a score",
};

// ── whyItMatters ─────────────────────────────────────────────────────────────

test("a page with no reason to care fails", () => {
  const pack = packWith([{ kind: "hook", title: "OPENER", instructions: "Read it." }]);
  const r = item(pack, "why-this-page");
  assert.equal(r?.passed, false);
  assert.match(r!.detail, /OPENER/);
});

test("a distinct reason on every page passes", () => {
  const pack = packWith([
    { kind: "hook", title: "A", instructions: "Go.", whyItMatters: "You already have opinions here; this is where you learn to defend one." },
    { kind: "i-do", title: "B", instructions: "Watch.", whyItMatters: "Anyone can label the parts; only a debater can say what each one buys you." },
  ]);
  assert.equal(item(pack, "why-this-page")?.passed, true);
});

test("the same reason on two pages fails — boilerplate is the failure mode, not absence", () => {
  const same = "This page matters because debate is important.";
  const pack = packWith([
    { kind: "hook", title: "A", instructions: "Go.", whyItMatters: same },
    { kind: "drill", title: "B", instructions: "Go.", whyItMatters: same },
  ]);
  const r = item(pack, "why-this-page");
  assert.equal(r?.passed, false);
  assert.match(r!.detail, /[Rr]epeat/);
});

test("punctuation and case do not launder a repeat", () => {
  const pack = packWith([
    { kind: "hook", title: "A", instructions: "Go.", whyItMatters: "A judge votes for something." },
    { kind: "drill", title: "B", instructions: "Go.", whyItMatters: "a judge votes for something!" },
  ]);
  assert.equal(item(pack, "why-this-page")?.passed, false);
});

test("the reason counts against the page's reading budget", () => {
  const bare = packWith([{ kind: "hook", title: "A", instructions: "Go." }]);
  const withWhy = packWith([
    { kind: "hook", title: "A", instructions: "Go.", whyItMatters: "A judge trusts the debater who can say what the other side gets right." },
  ]);
  assert.ok(
    studentReadWords(withWhy.activities[0]) > studentReadWords(bare.activities[0]),
    "it prints on the student copy, so it spends the budget like any other line"
  );
});

// ── exitBallot ───────────────────────────────────────────────────────────────

test("an exit ticket with no instrument fails, naming what is missing", () => {
  const pack = packWith([
    { kind: "exit-ticket", title: "EXIT", instructions: "Reflect on today.", whyItMatters: "w" },
  ]);
  const r = item(pack, "exit-ballot");
  assert.equal(r?.passed, false);
  assert.match(r!.detail, /ballot rows/);
  assert.match(r!.detail, /named errors/);
});

test("a complete ballot passes", () => {
  const pack = packWith(
    [
      { kind: "i-do", title: "MODEL", instructions: "Watch the claim, the reason and the source.", whyItMatters: "x" },
      { kind: "exit-ticket", title: "EXIT", instructions: "Deliver, judge, repair.", whyItMatters: "y", exitBallot: fullBallot },
    ],
    { successCriteria: ["Name a clear side and claim", "Give a reason that answers why", "Name the source fairly"] }
  );
  assert.equal(item(pack, "exit-ballot")?.passed, true);
});

test("errors with no repair move fail — a diagnosis with no fix is worse than none", () => {
  const pack = packWith([
    {
      kind: "exit-ticket",
      title: "EXIT",
      instructions: "Judge it.",
      whyItMatters: "y",
      exitBallot: { ...fullBallot, repairs: [] },
    },
  ]);
  const r = item(pack, "exit-ballot");
  assert.equal(r?.passed, false);
  assert.match(r!.detail, /repair move/);
});

test("a ballot row judging something never taught is caught", () => {
  const pack = packWith(
    [
      { kind: "i-do", title: "MODEL", instructions: "Watch the claim and the reason.", whyItMatters: "x" },
      {
        kind: "exit-ticket",
        title: "EXIT",
        instructions: "Judge it.",
        whyItMatters: "y",
        exitBallot: {
          ...fullBallot,
          rows: [...fullBallot.rows, { criterion: "Kritik framework deployed", test: "" }],
        },
      },
    ],
    { successCriteria: ["Name a clear side and claim"] }
  );
  const r = item(pack, "ballot-tests-what-was-taught");
  assert.equal(r?.passed, false);
  assert.match(r!.detail, /Kritik/);
});

test("the rules stay silent on a pack with no exit ticket", () => {
  // A single-page fixture or a partial build must not fail a rule about a page
  // it does not have.
  const pack = packWith([{ kind: "drill", title: "D", instructions: "Sort.", whyItMatters: "z" }]);
  assert.equal(item(pack, "exit-ballot"), undefined);
  assert.equal(item(pack, "ballot-tests-what-was-taught"), undefined);
});

// ── backwards compatibility ──────────────────────────────────────────────────

test("packs written before either field still parse and gain empty defaults", () => {
  const old = lessonPackSchema.parse({
    lessonCode: "L1",
    title: "OLD",
    subtitle: "f",
    skillFocus: "f",
    series: "f",
    mission: "m",
    resolution: "R",
    teacherGuide: { cohort: "f", assessment: "f", materialsChecklist: "f" },
    activities: [{ kind: "exit-ticket", title: "E", instructions: "Go." }],
  });
  assert.equal(old.activities[0].whyItMatters, "");
  assert.deepEqual(old.activities[0].exitBallot.rows, []);
  assert.deepEqual(old.activities[0].exitBallot.scale, ["Yes", "Almost", "Not yet"]);
});
