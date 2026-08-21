/**
 * READ WHAT A TRIAL ACTUALLY WROTE, WITH YOUR OWN EYES.
 *
 *   npm run open:inspect            # the newest trial pack
 *   npm run open:inspect -- claude  # the newest with that label
 *
 * ── WHY THIS EXISTS SEPARATELY FROM THE GATE COUNT ───────────────────────
 * `open-compare` counts gates, and gates are structural: they can tell you a
 * card HAS an institution, a year and a scope limit. They cannot tell you the
 * year is wrong.
 *
 * That distinction is the whole risk of a cheaper model on the evidence stage,
 * and the first trial demonstrated it exactly. gpt-oss-120b produced a card
 * citing "United Nations Environment Programme — Single-Use Plastics: A
 * Roadmap for Sustainability, 2020": real institution, real report, correct
 * scope limit, confident tactical note. The report is from 2018, and the
 * "UNEP Global Plastics Assessment 2020" it named as the event does not exist.
 * Every automated check in this repo passes that card.
 *
 * So the citations get printed in full, and a person reads them. There is no
 * substitute available — a model checking another model's citations has the
 * same failure mode, which is why `verified` is a human's flag in this schema
 * and not something the pipeline sets for itself.
 */

import fs from "node:fs";
import path from "node:path";
import "../scripts/test-resolver.mjs";

const dir = process.env.TRIAL_DIR ?? "C:/Temp/claude/open-trial";
const wanted = process.argv[2] ?? "";

if (!fs.existsSync(dir)) {
  console.error(`No trials at ${dir}. Run npm run open:trial first.`);
  process.exit(1);
}
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".json") && (!wanted || f.startsWith(wanted)))
  .sort();
if (!files.length) {
  console.error(`No trial matching "${wanted}" in ${dir}.`);
  process.exit(1);
}
const file = files[files.length - 1];
const j = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
const p = j.pack;

const rule = (s) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 62 - s.length))}`);

console.log(`\n${file}  ·  ${j.label}  ·  ${j.mins} min  ·  $${(j.totals?.usd ?? 0).toFixed(3)}`);

rule("IDENTITY");
console.log(`  ${p.title}`);
console.log(`  ${p.subtitle}`);
console.log(`  skill      ${p.skillFocus}`);
console.log(`  anchor     ${p.resolution}`);
console.log(`  practice   ${p.practiceTopic || "(none — every page runs on the anchor)"}`);

rule("MISSION & CRITERIA");
console.log(`  ${p.mission}`);
for (const c of p.successCriteria) console.log(`   · ${c}`);

rule(`VOCABULARY (${p.vocabulary.length})`);
for (const v of p.vocabulary) console.log(`  ${v.term} — ${v.definition}`);

rule(`EVIDENCE (${p.evidenceCards.length}) — READ THESE, THE GATES CANNOT`);
for (const c of p.evidenceCards) {
  console.log(`\n  [${c.id}] ${String(c.side).toUpperCase()}`);
  console.log(`    cite      ${c.institution}${c.author ? ` (${c.author})` : ""}, "${c.publication}", ${c.year}`);
  if (c.event) console.log(`    event     ${c.event}`);
  console.log(`    says      ${c.paraphrase}`);
  if (c.quote) console.log(`    quote     "${c.quote}"`);
  console.log(`    LIMIT     ${c.limit}`);
  console.log(`    verified  ${c.verified ? "yes" : "NO — nobody has checked this"}`);
}

rule(`PAGES (${p.activities.length} built, ${(p.outlinePlan ?? []).length} planned)`);
if (p.activities.length === 0) {
  for (const a of p.outlinePlan ?? [])
    console.log(`  ${String(a.durationMin).padStart(3)}min [${a.kind}] ${a.title}`);
  console.log("\n  (no pages were written — the plan is all there is)");
} else {
  for (const a of p.activities) {
    const bits = [
      a.prompts?.some((x) => x.guide?.trim()) ? "coach" : "",
      a.whyItMatters?.trim() ? "why" : "",
      a.cardJobs?.length ? "jobs" : "",
      a.exitBallot?.rows?.length ? "ballot" : "",
      a.figures?.length ? `${a.figures.length}fig` : "",
      a.optional ? "droppable" : "",
    ].filter(Boolean);
    console.log(`  ${String(a.durationMin).padStart(3)}min [${a.kind}] ${a.title}`);
    console.log(`        ${a.instructions}`);
    if (bits.length) console.log(`        + ${bits.join(" · ")}`);
  }
}
console.log("");
