/**
 * TWO TRIAL RUNS, SIDE BY SIDE — is the cheaper one actually cheaper?
 *
 *   npm run open:compare -- C:/Temp/claude/open-trial
 *
 * Reads whatever `open-trial` wrote and answers the only question that
 * matters: cost per APPROVED pack. A run that is twenty-five times cheaper and
 * clears eight fewer gates has not saved anything — it has moved the work to
 * the repair ladder, or to the teacher.
 *
 * Deliberately dumb about statistics. Two runs are two anecdotes; this prints
 * them next to each other so a person can look, and says so rather than
 * computing a confident-looking verdict from n=1.
 */

import fs from "node:fs";
import path from "node:path";
import "../scripts/test-resolver.mjs";

const dir = process.argv[2] ?? "C:/Temp/claude/open-trial";
if (!fs.existsSync(dir)) {
  console.error(`No trial directory at ${dir}. Run npm run open:trial first.`);
  process.exit(1);
}

const { runChecklist } = await import("../lib/checklist.ts");
const { packReadiness } = await import("../lib/readiness.ts");
const { lessonPackSchema } = await import("../lib/lesson-pack-schema.ts");

const runs = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const pack = lessonPackSchema.parse(j.pack);
    const items = runChecklist(pack).items;
    const bad = items.filter((i) => !i.passed);
    const a = pack.activities;
    return {
      file: f,
      label: j.label,
      mins: Number(j.mins),
      usd: j.totals?.usd ?? 0,
      calls: j.totals?.calls ?? 0,
      pages: a.length,
      pass: items.length - bad.length,
      of: items.length,
      blocking: bad.filter((i) => i.blocking).length,
      teachable: packReadiness(pack).canTeach,
      failing: bad.map((i) => i.id),
      coaching: a.filter((x) => x.prompts.some((p) => p.guide?.trim())).length,
      why: a.filter((x) => x.whyItMatters?.trim()).length,
      ballots: a.filter((x) => x.exitBallot?.rows?.length).length,
      figures: a.reduce((n, x) => n + (x.figures?.length ?? 0), 0),
    };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

if (runs.length === 0) {
  console.error("No runs found.");
  process.exit(1);
}

console.log("\nrun          pages  min    $      calls  gates    block  teach  coach  why  ballot  fig");
for (const r of runs) {
  console.log(
    `${r.label.padEnd(12)} ${String(r.pages).padStart(5)}  ${String(r.mins).padStart(4)}  ` +
      `${("$" + r.usd.toFixed(2)).padStart(6)} ${String(r.calls).padStart(6)}  ` +
      `${(r.pass + "/" + r.of).padStart(6)}  ${String(r.blocking).padStart(5)}  ` +
      `${(r.teachable ? "yes" : "NO").padStart(5)}  ${String(r.coaching).padStart(5)}  ` +
      `${String(r.why).padStart(3)}  ${String(r.ballots).padStart(6)}  ${String(r.figures).padStart(3)}`
  );
}

const claude = runs.find((r) => r.label.startsWith("claude"));
const openRun = runs.find((r) => r.label.startsWith("open"));
if (claude && openRun) {
  console.log("\n── THE COMPARISON ──");
  const cheaper = claude.usd / Math.max(openRun.usd, 1e-9);
  console.log(`  cost      open is ${cheaper.toFixed(1)}x cheaper ($${openRun.usd.toFixed(2)} vs $${claude.usd.toFixed(2)})`);
  console.log(`  quality   ${openRun.pass}/${openRun.of} gates vs ${claude.pass}/${claude.of} — a gap of ${claude.pass - openRun.pass}`);
  console.log(`  teachable ${openRun.teachable ? "yes" : "NO"} vs ${claude.teachable ? "yes" : "no"}`);

  const onlyOpen = openRun.failing.filter((g) => !claude.failing.includes(g));
  if (onlyOpen.length) {
    console.log(`\n  gates ONLY the open run failed — this is the real signal:`);
    for (const g of onlyOpen) console.log(`    ${g}`);
  } else {
    console.log("\n  the open run failed nothing the Claude run did not.");
  }

  console.log("\n  VERDICT INPUT, not a verdict:");
  if (!openRun.teachable) {
    console.log("    The open pack is not teachable. Cost is irrelevant until that changes.");
  } else if (claude.pass - openRun.pass > 3) {
    console.log("    A material quality gap. The saving is real but it is being paid for");
    console.log("    in repair calls or in a coach's evening — measure a second brief before");
    console.log("    concluding anything.");
  } else {
    console.log("    Comparable quality at a fraction of the cost, on ONE brief. Worth");
    console.log("    running the golden set (scripts/eval-run.mjs) before trusting it.");
  }
}
console.log("");
