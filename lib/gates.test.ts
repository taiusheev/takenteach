/**
 * The gates, and the resume matching, at the level where they are decidable.
 *
 * These are the pure functions the product's promises actually rest on:
 *
 *  - `batchActivities` decides which pages a build must write. It IS the resume
 *    logic — if it stops matching, an interrupted build silently re-writes and
 *    re-pays for pages that were already on disk.
 *  - `houseFloor` is the design gate. It runs against measurements from the
 *    rendered page and is the one thing standing between a bad stylesheet and
 *    print, so every threshold in it deserves a case on both sides.
 *  - `earlierSiblingVocab` decides who is at fault for a repeated word. Getting
 *    the direction wrong blames lesson 1 for lesson 5's duplicate.
 *
 * Deliberately NOT tested here: `generateLessonPack` end to end. Its stages are
 * skippable, but the validate stage re-runs the checklist and repairs anything
 * failing — so an offline test would need a hand-authored pack that passes every
 * content rule (argument chains, rigor mechanics, quoted and deployed cards,
 * judge moves). That fixture would be a lesson pack written by hand, and it
 * would break on every new checklist rule. The logic worth pinning down is here
 * instead, where it can be stated directly.
 *
 *   node --test lib/gates.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { batchActivities, SPINE_KINDS } from "./activity-batches.ts";
import { houseFloor } from "./house-design.ts";
import { earlierSiblingVocab } from "./checklist.ts";
import { attemptCycleIssues, attemptPages } from "./attempt-cycle.ts";
import {
  runChecklist,
  cardDeployment,
  misplacedOralPages,
  ORAL_KINDS,
  MAX_ORAL_BOXES,
} from "./checklist.ts";
import { emptyLessonPack, lessonPackSchema } from "./lesson-pack-schema.ts";
import { DEFAULT_KIT_CONFIG } from "./style-kit.ts";
import {
  LARGE_TEXT_PX,
  LARGE_BOLD_PX,
  isLargeText,
  minContrast,
  contrastRatio,
  findContrastIssues,
} from "./mono-contrast.ts";

// ── resume matching ──────────────────────────────────────────────────────────

const page = (kind: string, title: string) => ({ kind, title });

test("a fully written pack has nothing left to build", () => {
  // The property an interrupted build depends on: everything matched, nothing
  // outstanding, so a resume costs zero model calls.
  const plan = [
    page("hook", "The Hook"),
    page("i-do", "Watch Me Build"),
    page("we-do", "Build With Me"),
    page("exit-ticket", "Exit Ticket"),
  ];
  const existing = plan.map((p) => ({ title: p.title }));

  const { matched, spine, rest } = batchActivities(plan, existing);
  assert.deepEqual(matched, [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
  ]);
  assert.deepEqual(spine, []);
  assert.deepEqual(rest, []);
});

test("an empty pack builds the spine first, then the remainder", () => {
  // The spine is the four beats a teacher could stand up and teach on their own,
  // and it is deliberately not "the first four pages" — it lands minutes earlier
  // so the pack becomes teachable while the rest is still being written.
  const plan = [
    page("topic-intel", "Brief"),
    page("hook", "The Hook"),
    page("drill", "Sort It"),
    page("i-do", "Watch Me"),
    page("we-do", "With Me"),
    page("exit-ticket", "Exit"),
  ];
  const { matched, spine, rest } = batchActivities(plan, []);

  assert.deepEqual(matched, []);
  assert.deepEqual(spine, [1, 3, 4, 5], "the four spine beats, in outline order");
  assert.deepEqual(rest, [[0, 2]], "everything else");
  // Nothing is built twice or lost between the two groups.
  assert.deepEqual([...spine, ...rest.flat()].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
});

test("a partly written pack rebuilds only what is missing", () => {
  const plan = [
    page("hook", "The Hook"),
    page("i-do", "Watch Me"),
    page("drill", "Sort It"),
    page("exit-ticket", "Exit"),
  ];
  const { matched, spine, rest } = batchActivities(plan, [{ title: "The Hook" }]);

  assert.deepEqual(matched, [[0, 0]], "the written page is claimed");
  assert.ok(!spine.includes(0) && !rest.flat().includes(0), "and never rebuilt");
  assert.deepEqual([...spine, ...rest.flat()].sort((a, b) => a - b), [1, 2, 3]);
});

test("matching ignores case and surrounding whitespace", () => {
  // Titles round-trip through the model and the editor; an exact-string match
  // would rebuild a page over a changed capital letter.
  const plan = [page("hook", "The Hook")];
  const { matched } = batchActivities(plan, [{ title: "  the hook  " }]);
  assert.deepEqual(matched, [[0, 0]]);
});

test("two pages with the same title claim different slots", () => {
  // `takenSlot` exists so a duplicate title doesn't match both pages to slot 0,
  // leaving the second slot to be rebuilt while the page already exists.
  const plan = [page("hook", "Same"), page("drill", "Same")];
  const { matched, spine, rest } = batchActivities(plan, [
    { title: "Same" },
    { title: "Same" },
  ]);
  assert.equal(matched.length, 2);
  assert.deepEqual(matched.map(([slot]) => slot).sort(), [0, 1]);
  assert.deepEqual([...spine, ...rest.flat()], []);
});

test("only the FIRST page of each spine beat is treated as spine", () => {
  // A lesson with two hooks needs one of them teachable, not both.
  const plan = [page("hook", "Hook A"), page("hook", "Hook B")];
  const { spine, rest } = batchActivities(plan, []);
  assert.deepEqual(spine, [0]);
  assert.deepEqual(rest, [[1]]);
});

test("a large remainder is split into two balanced batches", () => {
  // No spine kinds here, so all fifteen pages are remainder — which is the case
  // that has to split, because one call for fifteen pages is the request that
  // blows the token ceiling.
  const plan = Array.from({ length: 15 }, (_, i) => page("drill", `Page ${i}`));
  const { spine, rest } = batchActivities(plan, []);
  assert.deepEqual(spine, [], "no hook/i-do/we-do/exit-ticket in this plan");
  assert.equal(rest.length, 2, "split rather than one oversized call");
  assert.equal(rest.flat().length, 15, "every page is covered exactly once");
  assert.equal(new Set(rest.flat()).size, 15, "and none is duplicated");
  assert.ok(Math.abs(rest[0].length - rest[1].length) <= 1, "balanced");
});

test("a small remainder stays in one batch", () => {
  const plan = Array.from({ length: 4 }, (_, i) => page("drill", `Page ${i}`));
  const { rest } = batchActivities(plan, []);
  assert.equal(rest.length, 1, "no point splitting a short tail");
  assert.equal(rest[0].length, 4);
});

test("SPINE_KINDS is the teachable four", () => {
  assert.deepEqual([...SPINE_KINDS], ["hook", "i-do", "we-do", "exit-ticket"]);
});

// ── the design gate ──────────────────────────────────────────────────────────

/** Measurements from a design that meets the house standard. */
const goodMetrics = {
  sheets: 14,
  overfull: 0,
  minZoom: 1,
  pageTitlePx: 24,
  bodyTextPx: 13,
  coverTitlePx: 44,
  mastheadPx: 28,
  proFill: "#1d4ed8",
  conFill: "#b91c1c",
  medianFillPct: 55,
  contrastRepairs: 2,
};

test("a design meeting the house standard passes clean", () => {
  assert.deepEqual(houseFloor(goodMetrics), []);
});

test("content running off the paper fails", () => {
  const fails = houseFloor({ ...goodMetrics, overfull: 1 });
  assert.ok(fails.some((f) => f.id === "fits"), "overflow must fail the floor");
});

test("body text below the print floor fails", () => {
  // This is the check that fired on a real pack: 11px body copy.
  const fails = houseFloor({ ...goodMetrics, bodyTextPx: 11 });
  assert.ok(fails.length > 0);
  assert.match(fails.map((f) => f.detail).join(" "), /\b11px\b/);
});

test("every failure names itself and explains why", () => {
  // These strings go straight to the author as the reason a design was dropped,
  // so an empty or id-only failure is useless at the moment it matters.
  const fails = houseFloor({ ...goodMetrics, overfull: 3, bodyTextPx: 6 });
  assert.ok(fails.length >= 2);
  for (const f of fails) {
    assert.ok(f.id && f.id.length > 0, "failure has an id");
    assert.ok(f.detail && f.detail.length > 20, `failure ${f.id} explains itself`);
  }
});

// ── series integrity ─────────────────────────────────────────────────────────

const sibling = (id: number, lessonCode: string, terms: string[]) => ({
  id,
  content: {
    lessonCode,
    vocabulary: terms.map((t) => ({ term: t, definition: "d" })),
  },
});

test("only EARLIER lessons contribute their vocabulary", () => {
  // L1 must not be blamed for a word L5 later reused — only the later lesson is
  // at fault for repeating.
  const terms = earlierSiblingVocab({ id: 10, lessonCode: "L3" }, [
    sibling(1, "L1", ["Claim"]),
    sibling(2, "L2", ["Warrant"]),
    sibling(3, "L5", ["Impact"]), // later in the curriculum
  ]);
  assert.deepEqual(terms.sort(), ["Claim", "Warrant"]);
});

test("lesson-code order wins over creation order", () => {
  // A pack written out of sequence still sits where its CODE says it does.
  const terms = earlierSiblingVocab({ id: 1, lessonCode: "L9" }, [
    sibling(99, "L2", ["Early"]), // created later, taught earlier
  ]);
  assert.deepEqual(terms, ["Early"]);
});

test("without lesson numbers it falls back to creation order", () => {
  const terms = earlierSiblingVocab({ id: 5, lessonCode: "" }, [
    sibling(2, "", ["Before"]),
    sibling(9, "", ["After"]),
  ]);
  assert.deepEqual(terms, ["Before"]);
});

test("blank terms are not collected", () => {
  const terms = earlierSiblingVocab({ id: 5, lessonCode: "L2" }, [
    sibling(1, "L1", ["  ", "Real"]),
  ]);
  assert.deepEqual(terms, ["Real"]);
});

// ── WCAG thresholds ──────────────────────────────────────────────────────────

test("large-text thresholds are WCAG's points converted to pixels", () => {
  // 18pt and 14pt-bold, at the CSS reference 1pt = 4/3px. Writing the POINT
  // numbers with a PIXEL unit is what let 14px bold headings print at 3.26:1.
  assert.equal(LARGE_TEXT_PX, 24);
  assert.ok(Math.abs(LARGE_BOLD_PX - 56 / 3) < 0.01, "14pt = 18.66px");
});

test("14px bold is NOT large text and needs the full 4.5:1", () => {
  // The exact case found on a real pack: a 14px/700 heading measured 3.26:1 and
  // was passed by both the lint and the runtime repair.
  assert.equal(isLargeText(14, 700), false);
  assert.equal(minContrast(14, 700), 4.5);
});

test("18px regular is NOT large text", () => {
  assert.equal(isLargeText(18, 400), false);
  assert.equal(minContrast(18, 400), 4.5);
});

test("genuinely large text gets the 3:1 bar", () => {
  assert.equal(minContrast(24, 400), 3, "18pt regular");
  assert.equal(minContrast(19, 700), 3, "14pt bold");
  assert.equal(minContrast(48, 400), 3, "a cover title");
});

test("weight alone does not make small text large", () => {
  assert.equal(isLargeText(11, 900), false);
  assert.equal(isLargeText(13, 700), false);
});

test("contrastRatio matches the known WCAG anchors", () => {
  assert.equal(Math.round((contrastRatio("#000000", "#ffffff") ?? 0) * 10) / 10, 21);
  assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);
  // var()/color-mix aren't statically resolvable and must not be guessed at
  assert.equal(contrastRatio("var(--pk-accent)", "#fff"), null);
});

test("the lint flags accent-on-ink that fails at heading size", () => {
  // The shape of the real defect: a mid-tone on near-black, at 14px bold.
  const issues = findContrastIssues(
    ".pk-key-head{color:#047857;background:#14181e;font-size:14px;font-weight:700}"
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].large, false, "14px bold is not large");
  assert.ok(issues[0].ratio < 4.5);
});

test("the same pairing passes once the text is genuinely large", () => {
  const issues = findContrastIssues(
    ".pk-key-head{color:#047857;background:#14181e;font-size:26px;font-weight:700}"
  );
  assert.deepEqual(issues, [], "26px clears the 3:1 bar at 3.26:1");
});

// ── the attempt → consolidation pair ─────────────────────────────────────────

/** Minimal activity shaped like the schema's defaults. */
const act = (over: Record<string, unknown> = {}) =>
  ({
    kind: "hook",
    title: "A page",
    durationMin: 10,
    instructions: "",
    attemptsBeforeTaught: false,
    likelyMisstep: "",
    consolidatesAttempt: "",
    ...over,
  }) as never;

test("a pack with no attempt pages raises nothing", () => {
  // Attempt-first is right for concepts and wrong for conventions, so a purely
  // procedural pack legitimately carries none.
  const pages = [act({ title: "Card format" }), act({ title: "Practise it" })];
  assert.deepEqual(attemptPages(pages), []);
  assert.deepEqual(attemptCycleIssues(pages), []);
});

test("a well-formed pair passes", () => {
  const pages = [
    act({ title: "THE ARENA", attemptsBeforeTaught: true, likelyMisstep: "they pick the bigger number" }),
    act({ title: "WHAT THE JUDGE WEIGHS", consolidatesAttempt: "THE ARENA" }),
  ];
  assert.equal(attemptPages(pages).length, 1);
  assert.deepEqual(attemptCycleIssues(pages), []);
});

test("an attempt with nothing resolving it fails", () => {
  // The defect that matters most: the class keeps the method they invented.
  const pages = [
    act({ title: "THE ARENA", attemptsBeforeTaught: true, likelyMisstep: "they pick the bigger number" }),
    act({ title: "SOME DRILL" }),
  ];
  const issues = attemptCycleIssues(pages);
  assert.equal(issues.length, 1);
  assert.match(issues[0].problem, /no page that resolves it/);
});

test("an attempt that never says what will go wrong fails", () => {
  const pages = [
    act({ title: "THE ARENA", attemptsBeforeTaught: true }),
    act({ title: "CONSOLIDATE", consolidatesAttempt: "THE ARENA" }),
  ];
  const issues = attemptCycleIssues(pages);
  assert.equal(issues.length, 1);
  assert.match(issues[0].problem, /never says what they are expected to get wrong/);
});

test("a consolidation placed before its attempt fails", () => {
  // Instruction-first with extra steps — the opposite of the intended design.
  const pages = [
    act({ title: "WHAT THE JUDGE WEIGHS", consolidatesAttempt: "THE ARENA" }),
    act({ title: "THE ARENA", attemptsBeforeTaught: true, likelyMisstep: "bigger number" }),
  ];
  const issues = attemptCycleIssues(pages);
  assert.ok(issues.some((i) => /comes before it/.test(i.problem)));
});

test("a consolidation pointing at a title that does not exist fails", () => {
  // What a page-title edit causes, and it silently unpairs both halves.
  const pages = [
    act({ title: "THE ARENA", attemptsBeforeTaught: true, likelyMisstep: "bigger number" }),
    act({ title: "RESOLVE", consolidatesAttempt: "THE AREENA" }),
  ];
  const issues = attemptCycleIssues(pages);
  assert.ok(issues.some((i) => /no page has that title/.test(i.problem)));
});

test("a consolidation pointing at a page that is not an attempt fails", () => {
  const pages = [
    act({ title: "AN ORDINARY DRILL" }),
    act({ title: "RESOLVE", consolidatesAttempt: "AN ORDINARY DRILL" }),
  ];
  const issues = attemptCycleIssues(pages);
  assert.ok(issues.some((i) => /not marked as an attempt/.test(i.problem)));
});

test("pairing tolerates case and spacing, like the page packer", () => {
  const pages = [
    act({ title: "THE ARENA", attemptsBeforeTaught: true, likelyMisstep: "bigger number" }),
    act({ title: "RESOLVE", consolidatesAttempt: "  the   arena " }),
  ];
  assert.deepEqual(attemptCycleIssues(pages), []);
});

test("two independent pairs both resolve", () => {
  const pages = [
    act({ title: "TRY WEIGHING", attemptsBeforeTaught: true, likelyMisstep: "bigger number" }),
    act({ title: "HOW WEIGHING WORKS", consolidatesAttempt: "TRY WEIGHING" }),
    act({ title: "TRY WARRANTING", attemptsBeforeTaught: true, likelyMisstep: "restates the claim" }),
    act({ title: "HOW WARRANTS WORK", consolidatesAttempt: "TRY WARRANTING" }),
  ];
  assert.equal(attemptPages(pages).length, 2);
  assert.deepEqual(attemptCycleIssues(pages), []);
});

// ── the evidence-deployment gate ─────────────────────────────────────────────

/** A card with every required field, so the schema parses. */
const card = (id: string) => ({
  id,
  side: "pro",
  institution: "Example Institute",
  year: "2024",
  publication: "An Example Report",
  paraphrase: "A short finding.",
  translation: "It means this.",
  tacticalNote: "Use it here.",
  limit: "Applies only to the studied population and nobody else.",
});

/** A pack carrying `cards`, whose pages cite whatever `cites` says. */
function packCiting(cards: string[], cites: string[][]) {
  const base = emptyLessonPack();
  return lessonPackSchema.parse({
    ...base,
    evidenceCards: cards.map(card),
    activities: cites.map((ids, i) => ({
      kind: "we-do",
      title: `Page ${i + 1}`,
      durationMin: 10,
      instructions: ids.map((id) => `Use Card ${id} here.`).join(" ") || "No citation.",
    })),
  });
}

const evidenceGate = (pack: ReturnType<typeof packCiting>) =>
  runChecklist(pack, "debate", DEFAULT_KIT_CONFIG).items.find(
    (i) => i.id === "evidence-used"
  )!;

test("a card cited on two pages passes", () => {
  const g = evidenceGate(packCiting(["A"], [["A"], ["A"]]));
  assert.equal(g.passed, true);
  assert.match(g.detail, /2\+ pages/);
});

test("a card cited on only ONE page fails", () => {
  // The defect the old gate missed: it flattened every page into one string and
  // asked only whether the id appeared anywhere, which one mention satisfied.
  const g = evidenceGate(packCiting(["A"], [["A"], []]));
  assert.equal(g.passed, false);
  assert.match(g.detail, /only one page/);
  assert.match(g.detail, /printed, not taught/);
});

test("a card cited nowhere fails, and says so distinctly", () => {
  const g = evidenceGate(packCiting(["A"], [[], []]));
  assert.equal(g.passed, false);
  assert.match(g.detail, /never used/);
});

test("both failure kinds are reported together", () => {
  const g = evidenceGate(packCiting(["A", "B"], [["A"], []]));
  assert.equal(g.passed, false);
  assert.match(g.detail, /never used/);
  assert.match(g.detail, /only one page/);
});

test("the detail reports how many cards are returned to 3+ times", () => {
  // Depth is the quality signal above the pass bar: 'fewer, worked harder'.
  const g = evidenceGate(packCiting(["A", "B"], [["A", "B"], ["A", "B"], ["A"]]));
  assert.equal(g.passed, true);
  assert.match(g.detail, /1 returned to 3\+ times/);
});

test("citation matching is case-insensitive and word-bounded", () => {
  // "Card A" must not be satisfied by "Card AB", or a two-card deck passes on
  // one card's mentions.
  const g = evidenceGate(packCiting(["A"], [["a"], ["a"]]));
  assert.equal(g.passed, true);
  const spurious = evidenceGate(packCiting(["A", "AB"], [["AB"], ["AB"]]));
  assert.equal(spurious.passed, false, "Card AB must not count as Card A");
  assert.match(spurious.detail, /\bA\b/);
});

test("a pack with no cards raises no evidence gate at all", () => {
  const pack = packCiting([], [[], []]);
  const g = runChecklist(pack, "debate", DEFAULT_KIT_CONFIG).items.find(
    (i) => i.id === "evidence-used"
  );
  assert.equal(g, undefined);
});

test("cardDeployment reports WHICH pages cite each card", () => {
  // The repair in lib/ai.ts routes an under-used card to a page that does not
  // already cite it, so it depends on these indices, not just the count.
  const pack = packCiting(["A", "B"], [["A"], [], ["A", "B"]]);
  const dep = cardDeployment(pack);
  assert.deepEqual(dep.find((d) => d.id === "A"), { id: "A", n: 2, pages: [0, 2] });
  assert.deepEqual(dep.find((d) => d.id === "B"), { id: "B", n: 1, pages: [2] });
});

// ── the free oral-task fix ───────────────────────────────────────────────────

const oralPack = (kinds: string[], boxes: boolean[]) =>
  lessonPackSchema.parse({
    ...emptyLessonPack(),
    activities: kinds.map((kind, i) => ({
      kind,
      title: `Page ${i + 1}`,
      durationMin: 10,
      instructions: "x",
      standAndDeliver: boxes[i] ? "Say it out loud." : "",
    })),
  });

test("a box on a page with nothing to deliver is stripped", () => {
  // `topic-intel` is not a production page — students have written nothing yet.
  const pack = oralPack(["topic-intel", "independent-build"], [true, true]);
  assert.deepEqual(misplacedOralPages(pack), [0]);
});

test("boxes on production pages are kept", () => {
  const pack = oralPack(["we-do", "independent-build", "exit-ticket"], [true, true, true]);
  assert.deepEqual(misplacedOralPages(pack), []);
});

test("surplus boxes past the cap are stripped, keeping the first four", () => {
  // Past about four it reads as a footer students skip.
  const kinds = Array(6).fill("independent-build");
  const pack = oralPack(kinds, Array(6).fill(true));
  assert.deepEqual(misplacedOralPages(pack), [4, 5]);
});

test("misplaced and surplus are both reported, without duplicates", () => {
  const pack = oralPack(
    ["drill", "we-do", "we-do", "we-do", "we-do", "we-do"],
    [true, true, true, true, true, true]
  );
  const strip = misplacedOralPages(pack);
  assert.ok(strip.includes(0), "the drill page is misplaced");
  assert.equal(strip.length, new Set(strip).size, "no index appears twice");
  // five well-placed boxes, cap of four -> exactly one surplus
  assert.equal(strip.length, 2);
});

test("the repair clears exactly what the gate faults", () => {
  // The property that matters: apply the strip, and the gate stops complaining.
  const pack = oralPack(
    ["topic-intel", "drill", "we-do", "independent-build"],
    [true, true, true, true]
  );
  const before = runChecklist(pack, "debate", DEFAULT_KIT_CONFIG).items.find(
    (i) => i.id === "oral-task-placement"
  )!;
  assert.equal(before.passed, false);

  const strip = new Set(misplacedOralPages(pack));
  const fixed = lessonPackSchema.parse({
    ...pack,
    activities: pack.activities.map((a, i) =>
      strip.has(i) ? { ...a, standAndDeliver: "" } : a
    ),
  });
  const after = runChecklist(fixed, "debate", DEFAULT_KIT_CONFIG).items.find(
    (i) => i.id === "oral-task-placement"
  );
  assert.ok(!after || after.passed, "gate satisfied with no model call");
});

test("ORAL_KINDS is the set of pages students produce on", () => {
  assert.deepEqual(
    [...ORAL_KINDS].sort(),
    ["exit-ticket", "independent-build", "scaffolded-build", "sparring", "we-do"]
  );
  assert.equal(MAX_ORAL_BOXES, 4);
});
