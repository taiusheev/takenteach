/**
 * RUN THE GOLDEN SET AND SCORE WHAT COMES BACK.
 *
 *   node --import ./scripts/test-resolver.mjs scripts/eval-run.mjs --mode economy --cases 3
 *
 * ── THIS IS THE ONLY THING IN THE REPO THAT DELIBERATELY SPENDS MONEY ────
 * So it is built to be boring about it. It refuses to start without an explicit
 * case count, prints the estimated cost and waits, records every result to
 * disk, and stops the moment the run exceeds the budget you gave it.
 *
 * ── WHAT IT ANSWERS ──────────────────────────────────────────────────────
 * One question, properly: for these briefs, under this budget mode, what is the
 * structural quality per dollar? Run it twice with different `--mode` values on
 * the same cases and the comparison is like-for-like, because the inputs are
 * fixed in lib/golden-set.ts rather than invented per run.
 *
 * ── WHAT IT DOES NOT ANSWER ──────────────────────────────────────────────
 * Whether the lessons are any good to teach. `scorePack` reads structure, not
 * meaning (see the note at the top of lib/pack-score.ts). Use this to rule
 * models OUT — a model that produces structurally broken packs is settled — and
 * read a sample by hand before ruling one IN.
 */
import fs from "node:fs";
import path from "node:path";
import { GOLDEN_SET } from "@/lib/golden-set";
import { scorePack, qualityPerDollar } from "@/lib/pack-score";
import { estimateBuild } from "@/lib/preflight";
import { BUDGET_MODE_IDS, setBudgetMode } from "@/lib/model-policy";
import { emptyLessonPack, lessonPackSchema } from "@/lib/lesson-pack-schema";
import { generateLessonPack } from "@/lib/ai";
import { withUsageMeter, usageBreakdown } from "@/lib/usage-meter";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const mode = arg("mode", "economy");
const count = Number(arg("cases", "0"));
const budgetUsd = Number(arg("budget", "15"));
const outDir = arg("out", "eval-results");

if (!BUDGET_MODE_IDS.includes(mode)) {
  console.error(`--mode must be one of: ${BUDGET_MODE_IDS.join(", ")}`);
  process.exit(1);
}
if (!count || count < 1) {
  console.error(
    "Refusing to run without --cases N. This spends real money.\n" +
      `  node --import ./scripts/test-resolver.mjs scripts/eval-run.mjs --mode ${mode} --cases 3`
  );
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set.");
  process.exit(1);
}

const cases = GOLDEN_SET.slice(0, count);
setBudgetMode(mode);

/* The estimate, before anything is spent, from the same table the build uses. */
const perCase = cases.map((c) => {
  const pack = lessonPackSchema.parse({
    ...emptyLessonPack(),
    durationMin: c.durationMin,
    gradeBand: c.gradeBand,
    rigorLevel: c.rigorLevel,
  });
  return estimateBuild(pack, "", { autoQa: true, mode });
});
const low = perCase.reduce((n, e) => n + e.usdLow, 0);
const high = perCase.reduce((n, e) => n + e.usdHigh, 0);

console.log(`\nGolden-set evaluation`);
console.log(`  mode      ${mode}`);
console.log(`  cases     ${cases.length} — ${cases.map((c) => c.id).join(", ")}`);
console.log(`  estimate  $${low.toFixed(2)}–$${high.toFixed(2)}`);
console.log(`  ceiling   $${budgetUsd.toFixed(2)} (stops the run, keeps results)`);
console.log(`\nStarting in 5s — Ctrl-C to abort.\n`);
await new Promise((r) => setTimeout(r, 5000));

fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = path.join(outDir, `${mode}-${stamp}.json`);

const results = [];
let spent = 0;

for (const c of cases) {
  if (spent >= budgetUsd) {
    console.log(`\nCeiling reached ($${spent.toFixed(2)}). Stopping with ${results.length} results.`);
    break;
  }
  process.stdout.write(`${c.id.padEnd(20)} `);
  const started = Date.now();
  let pack = lessonPackSchema.parse({
    ...emptyLessonPack(),
    skillFocus: c.brief.slice(0, 120),
    brief: c.brief,
    durationMin: c.durationMin,
    gradeBand: c.gradeBand,
    rigorLevel: c.rigorLevel,
  });

  let totals = null;
  let ok = true;
  try {
    await withUsageMeter(
      async () => {
        for await (const ev of generateLessonPack(c.subject, pack, {})) {
          if (ev.pack) pack = ev.pack;
        }
      },
      (t) => {
        totals = t;
      },
      { budgetUsd: Math.max(1, budgetUsd - spent) }
    );
  } catch (err) {
    ok = false;
    process.stdout.write(`FAILED — ${err instanceof Error ? err.message : err}\n`);
  }

  const usd = totals?.usd ?? 0;
  spent += usd;
  const score = scorePack(pack);
  const cards = pack.evidenceCards.length;

  const failures = [];
  if (score.total < c.expect.minScore) {
    failures.push(`score ${score.total} < ${c.expect.minScore}`);
  }
  if (c.expect.minEvidenceCards && cards < c.expect.minEvidenceCards) {
    failures.push(`${cards} cards < ${c.expect.minEvidenceCards}`);
  }
  if (c.expect.approxPages && Math.abs(score.pages - c.expect.approxPages) > 3) {
    failures.push(`${score.pages} pages, expected ~${c.expect.approxPages}`);
  }

  results.push({
    caseId: c.id,
    mode,
    ok,
    score: score.total,
    usd,
    ms: Date.now() - started,
    calls: totals?.calls ?? 0,
    outputTokens: totals?.output ?? 0,
    pages: score.pages,
    evidenceCards: cards,
    qaGrade: score.qaGrade,
    failures,
    qualityPerDollar: qualityPerDollar(score, usd),
    breakdown: totals ? JSON.parse(usageBreakdown(totals)) : null,
    components: score.components,
  });

  if (ok) {
    process.stdout.write(
      `score ${String(score.total).padStart(3)} · $${usd.toFixed(2)} · ` +
        `${score.pages}p · Q/$ ${qualityPerDollar(score, usd).toFixed(1)}` +
        (failures.length ? `  ⚠ ${failures.join("; ")}` : "") +
        `\n`
    );
  }
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
}

const done = results.filter((r) => r.ok);
const avg = (f) => (done.length ? done.reduce((n, r) => n + f(r), 0) / done.length : 0);

console.log(`\n── ${mode} ──`);
console.log(`  lessons        ${done.length}/${results.length} completed`);
console.log(`  spent          $${spent.toFixed(2)}`);
console.log(`  cost/lesson    $${avg((r) => r.usd).toFixed(2)}`);
console.log(`  avg score      ${avg((r) => r.score).toFixed(1)}/100`);
console.log(`  quality/$      ${avg((r) => r.qualityPerDollar).toFixed(1)}`);
console.log(`  expectations   ${done.filter((r) => r.failures.length === 0).length}/${done.length} met`);
console.log(`\n  → ${outFile}\n`);
