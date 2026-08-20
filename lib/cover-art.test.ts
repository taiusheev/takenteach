import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COVER_MOTIFS,
  coverGlyph,
  coverMotif,
  coverNumeral,
  coverSeed,
} from "./cover-art.ts";

test("an authored glyph always wins", () => {
  assert.equal(coverGlyph({ coverIcon: "🥪", title: "Climate change" }), "🥪");
  // Whitespace-only is the shape an empty model field actually arrives in.
  assert.equal(coverGlyph({ coverIcon: "   ", title: "Ocean plastics" }), "🌊");
});

test("the topic decides before the skill does", () => {
  // Both signals present: the reader's fastest route to the lesson is its
  // subject, and the skill is already spelled out in the badge below.
  const glyph = coverGlyph({
    title: "Rebuttal drills",
    resolution: "This house would tax carbon emissions",
    skillFocus: "Rebuttal",
  });
  assert.equal(glyph, "🌍");
});

test("the skill decides when the topic gives nothing away", () => {
  assert.equal(coverGlyph({ title: "Session four", skillFocus: "Weighing impacts" }), "⚖️");
  assert.equal(coverGlyph({ title: "Crossfire", skillFocus: "" }), "⚔️");
});

test("stems match inflected words, not just the bare stem", () => {
  // The first draft wrote these as `\b(weigh|impact)\b`, and not one inflected
  // form matched — every lesson fell through to a neutral glyph, silently.
  const cases: Array<[string, string]> = [
    ["Weighing impacts", "⚖️"],
    ["Rebuttals", "🛡️"],
    ["Refuting a claim", "🛡️"],
    ["Sourcing and citations", "🔍"],
    ["Structured casing", "🧱"],
    ["Delivery and persuasion", "🎙️"],
    ["Comparing two harms", "⚖️"],
  ];
  for (const [skillFocus, want] of cases) {
    assert.equal(coverGlyph({ skillFocus }), want, `skill "${skillFocus}"`);
  }
});

test("short words do not fire on longer unrelated ones", () => {
  assert.equal(coverGlyph({ title: "Global warming" }), "🌍"); // not "war"
  assert.equal(coverGlyph({ title: "Carbon pricing" }), "🌍"); // not "car"
  assert.equal(coverGlyph({ title: "Artificial intelligence" }), "🤖"); // not "art"
});

test("a pack with nothing to go on still gets a mark", () => {
  const glyph = coverGlyph({ lessonCode: "L3", title: "Session three" });
  assert.ok(glyph.length > 0, "no cover may print without a glyph");
});

test("no cover is ever left plain, whatever the model returns", () => {
  // The bug this file exists to kill: every ornament gated on an AI field.
  for (const pack of [{}, { title: "" }, { coverIcon: "" }, { lessonCode: "L9" }]) {
    assert.ok(coverGlyph(pack).trim().length > 0);
    assert.ok(COVER_MOTIFS.includes(coverMotif(pack)));
  }
});

test("the same lesson prints the same cover twice", () => {
  const pack = { lessonCode: "L4", title: "War powers" };
  assert.equal(coverGlyph(pack), coverGlyph({ ...pack }));
  assert.equal(coverMotif(pack), coverMotif({ ...pack }));
  assert.equal(coverSeed(pack), coverSeed({ ...pack }));
});

test("lessons in a series are different objects", () => {
  // The whole point of the authored glyph, kept without the author.
  const motifs = new Set(
    ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"].map((lessonCode) =>
      coverMotif({ lessonCode, title: `Session ${lessonCode}` })
    )
  );
  assert.ok(motifs.size >= 3, `a series of eight produced ${motifs.size} motifs`);
});

test("the ghosted numeral is two characters, or nothing at all", () => {
  assert.equal(coverNumeral("L1"), "01");
  assert.equal(coverNumeral("7"), "07");
  assert.equal(coverNumeral("L12"), "12");
  assert.equal(coverNumeral("intro"), "IN");
  // A 300px em dash across the corner reads as a printing fault, not a number.
  assert.equal(coverNumeral(""), "");
  assert.equal(coverNumeral(undefined), "");
  assert.equal(coverNumeral("  "), "");
});
