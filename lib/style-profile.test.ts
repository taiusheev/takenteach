/**
 * Learning a teacher's voice without inheriting their shortcuts.
 *
 * This feature's failure mode is unusually quiet: a profile that describes a
 * weakness as a style gets applied to every pack that teacher builds, and the
 * only symptom is lessons that are slightly worse than the house standard in a
 * way nobody would think to trace back to a settings page. Most of what is
 * tested here is therefore about what must NOT reach the generator.
 *
 *   node --test lib/style-profile.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  styleProfileSchema,
  parseStyleProfile,
  hasStyleProfile,
  styleProfileForPrompt,
  EMPTY_PROFILE,
} from "./style-profile.ts";

const full = styleProfileSchema.parse({
  voice: "Direct and a bit dry — talks to them like junior colleagues.",
  instructionStyle: 'Short and timed: "Ninety seconds. Go."',
  signatureMoves: ["Opens with a two-minute silent write", "Makes them argue the side they disagree with"],
  vocabulary: ["claim-warrant-impact", "the flow"],
  gaps: ["No written exit task, so nothing shows what each student took away"],
  sampleCount: 2,
  updatedAt: "2026-08-21",
});

// ── the column is untrusted input ────────────────────────────────────────────

test("a missing or unparseable profile costs the profile and nothing more", () => {
  // Read while building a prompt, not at a security boundary — an exception
  // here would take down the create screen for a stray character in a column.
  assert.deepEqual(parseStyleProfile(null), EMPTY_PROFILE);
  assert.deepEqual(parseStyleProfile(""), EMPTY_PROFILE);
  assert.deepEqual(parseStyleProfile("{not json"), EMPTY_PROFILE);
});

test("unknown fields are dropped rather than stored", () => {
  const p = styleProfileSchema.parse({ voice: "Dry.", nonsense: "x" });
  assert.equal("nonsense" in p, false);
});

test("an over-long field degrades to the default instead of throwing", () => {
  // `.catch()` on every field: one bad value must not lose the whole profile.
  const p = parseStyleProfile(JSON.stringify({ voice: "x".repeat(5000), vocabulary: ["ok"] }));
  assert.equal(p.voice, "");
  assert.deepEqual(p.vocabulary, ["ok"]);
});

// ── when it is worth sending at all ──────────────────────────────────────────

test("an empty profile produces no prompt block", () => {
  assert.equal(hasStyleProfile(EMPTY_PROFILE), false);
  assert.equal(styleProfileForPrompt(EMPTY_PROFILE), "");
});

test("gaps alone are not a style", () => {
  /* A profile carrying only gaps means the read found nothing to copy. Sending
     a block that says only what they DON'T do would be worse than silence: it
     is an instruction with no positive content. */
  const p = styleProfileSchema.parse({ gaps: ["No exit task"] });
  assert.equal(hasStyleProfile(p), false);
  assert.equal(styleProfileForPrompt(p), "");
});

test("one real field is enough", () => {
  const p = styleProfileSchema.parse({ voice: "Dry and direct." });
  assert.equal(hasStyleProfile(p), true);
  assert.match(styleProfileForPrompt(p), /Dry and direct/);
});

// ── what reaches the model ───────────────────────────────────────────────────

test("the voice, the routines and their vocabulary all reach the prompt", () => {
  const s = styleProfileForPrompt(full);
  assert.match(s, /junior colleagues/);
  assert.match(s, /two-minute silent write/);
  assert.match(s, /claim-warrant-impact/);
});

test("GAPS NEVER REACH THE PROMPT", () => {
  /* The single most important assertion in this file. `gaps` is advice for the
     teacher about their own habits. Fed to the generator, "no written exit
     task" becomes an instruction to add one — which the house standard already
     requires anyway — and the suggestion on their settings page would look as
     though it had been silently acted on without their agreement. */
  const s = styleProfileForPrompt(full);
  assert.doesNotMatch(s, /exit task/);
  assert.doesNotMatch(s, /took away/);
});

test("the block tells the model this changes voice and not standards", () => {
  /* The other half of the same risk. A teacher's own handout may cite nothing
     and run to a wall of prose; matching their VOICE must never be read as
     permission to match that. Without this line the feature is a quiet way to
     lower the bar on every pack it touches. */
  const s = styleProfileForPrompt(full);
  assert.match(s, /standard wins/);
  assert.match(s, /not lowering what a pack has to do/);
});

test("their vocabulary is framed as a replacement, not an addition", () => {
  // "Also use these words" produces a pack carrying both PEEL and
  // claim-warrant-impact, which is worse than either alone.
  assert.match(styleProfileForPrompt(full), /use THESE, not the equivalents/);
});
