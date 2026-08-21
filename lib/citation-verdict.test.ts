/**
 * A source the reviewer doubts must not reach a human as finished work.
 *
 * ── WHY THIS GATE EXISTS ─────────────────────────────────────────────────
 * Content QA already grades every citation `verified | plausible | suspect |
 * unsupported` with a note saying exactly what to check. That verdict went
 * into `contentQaJson` and reached nobody: no gate consulted it, and the
 * sign-off panel did not show it.
 *
 * The open-weight trial made the risk concrete. A card cited "UNEP,
 * Single-Use Plastics: A Roadmap for Sustainability, 2020" with a good scope
 * limit and a confident tactical note. The report is from 2018 and the event
 * it named does not exist — and every structural gate passed it, because they
 * confirm a card HAS a year and cannot tell you the year is wrong.
 *
 * ── THE LINE, AND WHY IT IS THERE ────────────────────────────────────────
 * Only `suspect` and `unsupported` block. `plausible` means "consistent with a
 * real source, confirm the figure" — and the person who confirms it is the
 * reviewer this gate stands in front of. Blocking on it would demand the check
 * before the checker sees the pack, and would stop every pack in the library
 * at once. That last point is not hypothetical, so it is a test.
 *
 *   node --test lib/citation-verdict.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecklist } from "./checklist.ts";
import { lessonPackSchema, emptyLessonPack } from "./lesson-pack-schema.ts";

const GATE = "citations-not-suspect";

function card(id: string, verified = false) {
  return {
    id,
    side: "pro" as const,
    institution: "United Nations Environment Programme",
    author: "",
    year: "2020",
    publication: "Single-Use Plastics: A Roadmap for Sustainability",
    paraphrase: "Single-use bottles are a large share of marine plastic.",
    translation: "Bottles are a big part of ocean plastic.",
    tacticalNote: "Use to establish magnitude.",
    limit: "Does not prove a ban removes all marine plastic.",
    verified,
  };
}

function pack(cards: ReturnType<typeof card>[], citations: unknown[] | null) {
  return lessonPackSchema.parse({
    ...emptyLessonPack(),
    evidenceCards: cards,
    contentQaJson:
      citations === null ? "" : JSON.stringify({ overallGrade: "B", citations }),
  });
}

const gate = (p: ReturnType<typeof pack>) =>
  runChecklist(p).items.find((i) => i.id === GATE);

test("a suspect citation blocks the pack", () => {
  const g = gate(
    pack([card("A")], [{ id: "A", verdict: "suspect", note: "The 2020 date is wrong; the report is 2018." }])
  );
  assert.equal(g?.passed, false);
  assert.match(g!.detail, /2018/, "the reviewer's own note must reach the author");
  assert.match(g!.detail, /Sources/, "and it must say where to go");
});

test("an unsupported citation blocks too", () => {
  const g = gate(pack([card("A")], [{ id: "A", verdict: "unsupported", note: "No such publication." }]));
  assert.equal(g?.passed, false);
});

test("A HUMAN TICK CLEARS IT — that is the whole point", () => {
  /* The gate is not a claim that the card is wrong. It is a claim that nobody
     has looked. A person opening the source and ticking it is exactly the
     resolution, and `verified` is a flag no model can set. */
  const g = gate(
    pack([card("A", true)], [{ id: "A", verdict: "suspect", note: "Check the date." }])
  );
  assert.equal(g?.passed, true);
});

test("`plausible` does NOT block", () => {
  /* It means "confirm the exact figure", and the confirmer is the reviewer
     this gate stands in front of. Blocking here demands the check before the
     checker exists. */
  const g = gate(
    pack([card("A")], [{ id: "A", verdict: "plausible", note: "Consistent with the source; confirm the number." }])
  );
  assert.equal(g?.passed, true);
});

test("`verified` from QA does not block", () => {
  const g = gate(pack([card("A")], [{ id: "A", verdict: "verified", note: "Real and correctly attributed." }]));
  assert.equal(g?.passed, true);
});

test("THE WHOLE LIBRARY MUST NOT BLOCK ON DAY ONE", () => {
  /* Every existing pack has unticked cards, and QA rates most of them
     verified-or-plausible. If either of those blocked, adding this gate would
     make every lesson in the library unsubmittable — a change that reads as
     the product breaking rather than as a new standard. */
  const g = gate(
    pack(
      [card("A"), card("B"), card("C")],
      [
        { id: "A", verdict: "verified", note: "" },
        { id: "B", verdict: "plausible", note: "Confirm the figure." },
        { id: "C", verdict: "plausible", note: "Confirm the wording." },
      ]
    )
  );
  assert.equal(g?.passed, true);
});

test("a verdict about a card that no longer exists is history, not a blocker", () => {
  // The author's fix for a suspect card may well be to delete it. That must
  // not leave the pack permanently blocked by a verdict about nothing.
  const g = gate(pack([card("A")], [{ id: "Z", verdict: "suspect", note: "gone" }]));
  assert.equal(g?.passed, true);
});

test("no QA report means no verdict to act on, not a failure", () => {
  /* Silence is not evidence against the citations. A pack that has never been
     reviewed is caught by the gates that require a review, not by this one
     inventing a fault it cannot see. */
  assert.equal(gate(pack([card("A")], null)), undefined);
});

test("an unreadable report costs the check, not the build", () => {
  const p = lessonPackSchema.parse({
    ...emptyLessonPack(),
    evidenceCards: [card("A")],
    contentQaJson: "{not json",
  });
  const g = runChecklist(p).items.find((i) => i.id === GATE);
  assert.equal(g?.passed, true, "a malformed blob must not become a phantom blocker");
});

test("case and whitespace in a card id do not let a doubt slip through", () => {
  // Ids are author-editable text. " a " and "A" are the same card, and a gate
  // that misses that is a gate someone can pass by accident.
  const g = gate(pack([card(" a ")], [{ id: "A", verdict: "suspect", note: "check" }]));
  assert.equal(g?.passed, false);
});

test("every doubted card is named, not just the first", () => {
  const g = gate(
    pack(
      [card("A"), card("B")],
      [
        { id: "A", verdict: "suspect", note: "date wrong" },
        { id: "B", verdict: "unsupported", note: "no such report" },
      ]
    )
  );
  assert.equal(g?.passed, false);
  assert.match(g!.detail, /Card A/);
  assert.match(g!.detail, /Card B/);
});
