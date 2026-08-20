/**
 * THE TWO-TOPIC ARCHITECTURE, and the rule that keeps it honest.
 *
 * A new skill is a FORM. Teaching a new form on unfamiliar content loads both
 * at once and a student fails at both, so the founder's pack teaches PEEL on a
 * class dog and a school phone ban for four pages before the researched
 * resolution carries any weight — then re-runs the same build on it for real.
 *
 * The generation prompt used to forbid this outright: everything "anchored to
 * ONE resolution", written to stop packs that were a pile of disconnected
 * worksheets. That rule worked, and the replacement does not weaken it. His
 * architecture is not two unrelated topics — it is teach-then-TRANSFER, and the
 * transfer is the connection. So the requirement moved from SAMENESS to
 * CONNECTEDNESS, and these tests are the part that makes that strictly
 * stronger: a practice topic that never hands over now fails, which is exactly
 * the disconnected worksheet the original rule was aimed at.
 *
 *   node --test lib/practice-topic.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecklist } from "./checklist.ts";
import { lessonPackSchema, type LessonPack } from "./lesson-pack-schema.ts";

function packWith(activities: unknown[], practiceTopic = ""): LessonPack {
  return lessonPackSchema.parse({
    lessonCode: "L1",
    title: "TEST PACK",
    subtitle: "f",
    skillFocus: "f",
    series: "f",
    mission: "m",
    resolution: "Resolved: the federal government should enact a moratorium.",
    practiceTopic,
    teacherGuide: { cohort: "f", assessment: "f", materialsChecklist: "f" },
    activities,
  });
}

const page = (kind: string, title: string, runsOn?: "anchor" | "practice") => ({
  kind,
  title,
  instructions: "Do the thing.",
  whyItMatters: `why ${title}`,
  ...(runsOn ? { runsOn } : {}),
});

const item = (pack: LessonPack, id: string) =>
  runChecklist(pack).items.find((i) => i.id === id);

test("a pack with no practice topic is not asked about one", () => {
  // Most packs. A lesson that introduces no new form should not invent a
  // practice topic, and inventing one just costs a page.
  const pack = packWith([page("hook", "A"), page("exit-ticket", "B")]);
  assert.equal(item(pack, "practice-transfers"), undefined);
  assert.equal(item(pack, "practice-topic-declared"), undefined);
});

test("teach on the easy topic, then hand over to the anchor — passes", () => {
  const pack = packWith(
    [
      page("i-do", "MODEL IT", "practice"),
      page("we-do", "TRY IT", "practice"),
      page("scaffolded-build", "BUILD IT FOR REAL", "anchor"),
      page("exit-ticket", "PROVE IT", "anchor"),
    ],
    "Our school should ban student phones for the entire school day"
  );
  const r = item(pack, "practice-transfers");
  assert.equal(r?.passed, true);
  assert.match(r!.detail, /transferred to the anchor/);
});

test("a practice topic that never hands over fails — this is the whole point", () => {
  const pack = packWith(
    [page("i-do", "MODEL IT", "practice"), page("we-do", "TRY IT", "practice")],
    "Our school should ban student phones"
  );
  const r = item(pack, "practice-transfers");
  assert.equal(r?.passed, false);
  assert.match(r!.detail, /never|transferred/i);
});

test("a declared practice topic no page runs on fails", () => {
  const pack = packWith(
    [page("i-do", "A"), page("exit-ticket", "B")],
    "Our school should ban student phones"
  );
  const r = item(pack, "practice-transfers");
  assert.equal(r?.passed, false);
  assert.match(r!.detail, /no page actually runs on it/);
});

test("the transfer must run forwards — anchor work before practice work fails", () => {
  // The sequence is the pedagogy: hold content trivial while the form is new,
  // then hold the form fixed while the content gets hard. Backwards is neither.
  const pack = packWith(
    [
      page("scaffolded-build", "REAL WORK FIRST", "anchor"),
      page("i-do", "EASY TOPIC AFTER", "practice"),
    ],
    "Our school should ban student phones"
  );
  const r = item(pack, "practice-transfers");
  assert.equal(r?.passed, false);
  assert.match(r!.detail, /backwards/);
});

test("a page claiming a practice topic the pack does not have is caught", () => {
  // A dangling reference: the page says "practice", and nothing tells the
  // student what they are arguing about.
  const pack = packWith([page("i-do", "ORPHAN", "practice"), page("exit-ticket", "B")]);
  const r = item(pack, "practice-topic-declared");
  assert.equal(r?.passed, false);
  assert.match(r!.detail, /empty/);
});

test("pages default to the anchor, so every pack written before this is unchanged", () => {
  const pack = packWith([page("hook", "A"), page("exit-ticket", "B")]);
  assert.ok(pack.activities.every((a) => a.runsOn === "anchor"));
  assert.equal(pack.practiceTopic, "");
});

test("interleaving is allowed as long as the last word belongs to the anchor", () => {
  // The rule checks that anchor work FOLLOWS the practice, not that the two
  // never alternate — a pack may return to the easy topic to re-teach a step.
  const pack = packWith(
    [
      page("i-do", "MODEL", "practice"),
      page("evidence-study", "REAL CARDS", "anchor"),
      page("we-do", "RE-TEACH EASY", "practice"),
      page("independent-build", "BUILD FOR REAL", "anchor"),
    ],
    "Our school should ban student phones"
  );
  assert.equal(item(pack, "practice-transfers")?.passed, true);
});
