/**
 * BUILD ONE LESSON ON OPEN WEIGHTS, THEN JUDGE IT AGAINST THE SAME BAR.
 *
 *   OPEN_MODEL_TASKS=all npm run open:trial -- --brief "90-min novice rebuttal"
 *
 * ── WHAT THIS ANSWERS, AND WHAT IT DOES NOT ──────────────────────────────
 * It answers: for this brief, on this model, what does a pack cost, how much
 * of the checklist does it clear, and how does that compare to the same brief
 * on Claude. It does NOT answer whether open weights are good enough in
 * general — one lesson is an anecdote. It is the smallest honest experiment,
 * and the point is to run it before spending weeks on a migration.
 *
 * ── THE DECISION RULE ────────────────────────────────────────────────────
 * Cost per APPROVED pack, not cost per build. A model that is twenty-five
 * times cheaper and needs three more repair rounds, or produces a pack a coach
 * would not teach, is not cheaper. That is why this prints the gate count and
 * the readiness verdict beside the dollar figure rather than the dollar figure
 * alone.
 *
 * ── IT SPENDS MONEY ──────────────────────────────────────────────────────
 * So it is boring about it: it prints what it is about to do and needs
 * --yes to proceed, it never touches the library (the pack is built in memory
 * and written to disk as JSON), and it stops at the first stage that fails.
 */

import fs from "node:fs";
import path from "node:path";
import "../scripts/test-resolver.mjs";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const brief = arg("brief", "A 90-minute novice debate lesson on rebuttal — attacking the warrant, not the claim.");
const outDir = arg("out", "C:/Temp/claude/open-trial");
const label = arg("label", process.env.OPEN_MODEL_TASKS ? "open" : "claude");

const { lessonPackSchema, emptyLessonPack } = await import("../lib/lesson-pack-schema.ts");
const { generateLessonPack, planLesson } = await import("../lib/ai.ts");
const { runChecklist } = await import("../lib/checklist.ts");
const { packReadiness } = await import("../lib/readiness.ts");
const { scorePack } = await import("../lib/pack-score.ts").catch(() => ({ scorePack: null }));
const { withUsageMeter, describeUsage, usageBreakdown } = await import("../lib/usage-meter.ts");
const { openTasks, openModel } = await import("../lib/open-model.ts");

const open = [...openTasks()];
const model = openModel();

console.log("\n── OPEN-WEIGHT TRIAL ──");
console.log(`  brief       ${brief}`);
console.log(`  open stages ${open.length ? open.join(", ") : "(none — this run is the Claude baseline)"}`);
if (open.length) {
  if (!model) {
    console.error(`\n  OPEN_MODEL="${process.env.OPEN_MODEL}" is not a model this adapter knows. Aborting.`);
    process.exit(1);
  }
  console.log(`  model       ${model.id}  ($${model.in}/M in, $${model.out}/M out)`);
  if (!process.env[model.keyEnv]) {
    console.error(`\n  ${model.keyEnv} is not set. Put it in .env.local and re-run.`);
    process.exit(1);
  }
}
console.log(`  label       ${label}`);
console.log(`  writes to   ${outDir}`);

if (!has("yes")) {
  console.log("\n  This spends real money on a real build. Re-run with --yes to proceed.\n");
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
const started = Date.now();
let pack = null;
let failed = null;
const stages = [];

let totals = null;
await withUsageMeter(
  async () => {
    const plan = await planLesson(brief);
    console.log(`\n  planned: ${plan.skillFocus} · ${plan.gradeBand} · ${plan.durationMin}min`);

    let seed = lessonPackSchema.parse({
      ...emptyLessonPack(),
      lessonCode: plan.lessonCode || "L1",
      title: plan.coverTitle,
      skillFocus: plan.skillFocus,
      series: plan.series,
      resolution: plan.resolution,
      durationMin: plan.durationMin,
      gradeBand: plan.gradeBand,
      rigorLevel: plan.rigorLevel,
      format: plan.format,
      debateFormat: plan.debateFormat,
      brief,
    });

    try {
      for await (const ev of generateLessonPack(
        plan.subject, seed, null, [], "", undefined, null, true, "", false
      )) {
        if (ev.type === "stage-start") process.stdout.write(`  ${ev.stage}… `);
        if (ev.type === "stage-done") {
          stages.push(ev.stage);
          if (ev.pack) pack = ev.pack;
          console.log("ok");
        }
        if (ev.type === "error") {
          failed = `${ev.stage}: ${ev.error}`;
          console.log("FAILED");
          break;
        }
      }
    } catch (err) {
      failed = String(err?.message ?? err);
      console.log(`\n  build threw: ${failed.slice(0, 300)}`);
    }
  },
  async (t) => {
    totals = t;
  }
);

const mins = ((Date.now() - started) / 60000).toFixed(1);
console.log(`\n── RESULT (${mins} min) ──`);
console.log(totals && totals.calls ? `  ${describeUsage(totals)}` : "  no model calls completed");

const bd = totals && totals.calls ? JSON.parse(usageBreakdown(totals)) : {};
if (bd.byTask?.length) {
  console.log("\n  stage            calls      $");
  for (const t of bd.byTask.sort((a, b) => b.usd - a.usd))
    console.log(`  ${t.t.padEnd(16)} ${String(t.n).padStart(5)}  $${t.usd.toFixed(3)}`);
}

if (failed) {
  console.log(`\n  BUILD DID NOT FINISH — ${failed.slice(0, 400)}`);
  console.log("  A stage that cannot return valid JSON is the failure mode to watch for here.");
}

if (pack) {
  const items = runChecklist(pack).items;
  const bad = items.filter((i) => !i.passed);
  const ready = packReadiness(pack);

  console.log(`\n  pages            ${pack.activities.length}`);
  console.log(`  checklist        ${items.length - bad.length}/${items.length} passing (every gate blocks review)`);
  console.log(`  teachable        ${ready.canTeach ? "yes" : "no"}`);
  if (scorePack) {
    try { console.log(`  pack score       ${JSON.stringify(scorePack(pack)).slice(0, 200)}`); } catch {}
  }

  // The founder-standard fields — the ones the generator only recently became
  // able to emit at all, and the sharpest test of whether a weaker model
  // actually fills a large schema or merely satisfies it.
  const a = pack.activities;
  const filled = (f) => a.filter(f).length;
  console.log("\n  founder-standard fields, filled:");
  console.log(`    coaching       ${filled((x) => x.prompts.some((p) => p.guide?.trim()))}/${a.length} pages`);
  console.log(`    whyItMatters   ${filled((x) => x.whyItMatters?.trim())}/${a.length}`);
  console.log(`    cardJobs       ${filled((x) => x.cardJobs?.length)} pages`);
  console.log(`    exitBallot     ${filled((x) => x.exitBallot?.rows?.length)} pages`);
  console.log(`    figures        ${a.reduce((n, x) => n + (x.figures?.length ?? 0), 0)} total`);
  console.log(`    droppable      ${filled((x) => x.optional)} pages`);

  if (bad.length) {
    console.log(`\n  failing gates: ${bad.map((i) => i.id).join(", ")}`);
  }

  const file = path.join(outDir, `${label}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ label, brief, mins, totals, pack }, null, 2));
  console.log(`\n  pack written → ${file}`);
  console.log(`  compare two runs with:  npm run open:compare -- ${outDir}`);
}
console.log("");
