/**
 * DOES THE PACK ACTUALLY RENDER? — a smoke test for the print view.
 *
 *   npm run render:check
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `npm test` proves the schema accepts a field, the checklist gates it, and the
 * reading budget counts it. None of that proves the field reaches paper. A
 * block can be added to `PrintView`, typecheck cleanly, pass every unit test,
 * and render nothing at all — a guard that is never true, a class the stylesheet
 * does not know, a field read off the wrong object. That failure is invisible
 * to every other check in this repo, and the only place it shows up is a
 * printed sheet with a hole in it.
 *
 * So this renders the real component, with a fixture that exercises every
 * student-facing block, and asserts the text comes out the other side.
 *
 * ── WHY IT IS NOT IN `npm test` ────────────────────────────────────────────
 * It takes ~110 seconds against a suite that otherwise runs in nine. The cost
 * is the TypeScript transpile of PrintView's whole import graph at load time —
 * there is no bundler here, so every .ts/.tsx file in the graph is compiled on
 * the fly. Putting that in the default suite would mean nobody runs the suite.
 * Run it after touching PrintView, the house stylesheet, or any student-facing
 * schema field.
 *
 * ── WHAT THE DUMP CANNOT TELL YOU ──────────────────────────────────────────
 * RENDER_DUMP writes a self-contained page carrying the stylesheets PrintView
 * injects — the base theme, the house sheet, the register overlay and the
 * compiled tokens. It does NOT carry Tailwind, which the app loads globally.
 * So every size written as a utility on the element (text-[11px] and friends)
 * falls back to the browser default in the dump and measures ~16px.
 *
 * Measure STRUCTURE from the dump — grid columns, which classes a sheet wears,
 * whether a block rendered at all. Do not measure TYPE from it: it will tell
 * you the body copy is 12pt when the app prints it at 8.25pt, and "our type is
 * too big" is a conclusion this file has already produced falsely once.
 *
 * ── THE ONE THING THAT MAKES IT POSSIBLE ───────────────────────────────────
 * PrintView must not pull the database into its import graph. It used to:
 * `import { StyleKitConfig } from "@/lib/db"` — a TYPE, imported from a module
 * that opens a Postgres connection. Next tree-shakes that away at build time so
 * nothing was visibly wrong, but any plain-node harness booted PGlite and hung.
 * The type now comes from `lib/style-kit`, where it is actually defined. If a
 * future edit reaches into `lib/db` from a presentational component, this
 * script is what will notice.
 */
/* The loader lives in scripts/render-loader.mjs so more than one harness can
   use it — see the note there about the lib/db import trap. */
import fs from "node:fs";
import { cleanupShim } from "./render-loader.mjs";

const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server.browser");
const { lessonPackSchema } = await import("../lib/lesson-pack-schema.ts");
const { DEFAULT_KIT_CONFIG } = await import("../lib/style-kit.ts");
const PrintView = (await import("../components/PrintView.tsx")).default;

const card = (id) => ({
  id,
  side: "pro",
  institution: "Berkeley Lab",
  year: "2026",
  publication: "US Data Center Energy Usage Report",
  paraphrase: "Data centers used about 4 of every 100 units of US electricity in 2023.",
  translation: "About four percent of the country's power went to data centers.",
  tacticalNote: "Read the measured number, then say the 2030 figure is a forecast.",
  limit: "The 2030 figure is an estimate rather than a measurement, and it is national rather than local.",
});
const prompt = (label, guide, trap = "") => ({
  label,
  side: "neutral",
  expectedAnswer: "Strong: a named source and one number. Weak: a feeling.",
  guide,
  trap,
});

/* One fixture, deliberately exercising every student-facing block at once —
   the point is coverage of the RENDERER, not a teachable lesson. */
const pack = lessonPackSchema.parse({
  lessonCode: "L1",
  title: "BUILD ONE ARGUMENT",
  subtitle: "The four jobs, taught twice",
  skillFocus: "A four-layer argument",
  series: "JV Public Forum",
  mission: "Build one argument that survives a question.",
  resolution:
    "Resolved: the United States federal government should enact a moratorium on hyperscale data center construction.",
  practiceTopic: "Our school should ban student phones for the entire school day",
  gradeBand: "Grades 9–10",
  design: "jv-circuit",
  successCriteria: ["Name a clear side and claim", "Give a reason that answers why"],
  evidenceCards: [card("A"), card("B")],
  teacherGuide: { cohort: "JV squad", assessment: "Exit ticket", materialsChecklist: "Printed pack, timer" },
  activities: [
    {
      kind: "i-do",
      title: "WATCH ONE GET BUILT",
      instructions: "Watch the build, then say what each line adds.",
      whyItMatters: "Anyone can label the parts; only a debater can say what each one buys you.",
      runsOn: "practice",
      exampleLayers: [
        { label: "POINT", text: "Our school should ban phones for the whole day.", passesWhen: "A stranger could repeat it after hearing it once." },
        { label: "EXPLANATION", text: "A whole-day rule removes the decision from every lesson.", passesWhen: "It answers why, and does not say the Point again." },
      ],
      prompts: [prompt("Which layer would a judge miss?", "Name the move, not the answer.", "Do not restate the Point in new words.")],
    },
    {
      kind: "evidence-study",
      title: "THREE CARDS, THREE JOBS",
      instructions: "One job per card, in this order.",
      whyItMatters: "Three cards is the smallest set that can carry a whole case.",
      runsOn: "anchor",
      /* His real figures, so the primitives are exercised against the data
         they were reverse-engineered from rather than invented numbers. */
      figures: [
        {
          kind: "unit-chart",
          title: "WHERE IT IS HEADED",
          filled: 12,
          total: 100,
          thenFilled: 4,
          nowLabel: "by 2030 (estimate)",
          thenLabel: "in 2023 (measured)",
          caption: "Each small box is one unit out of a hundred. Twelve is three times four.",
          exact: "4.4% measured; 11.8% estimated.",
          source: "Berkeley Lab, June 2026",
        },
        {
          kind: "process-flow",
          title: "FOLLOW THE LINE FROM LEFT TO RIGHT",
          stages: [
            "Power generation",
            "Transmission lines",
            "Substation",
            "Data center building",
            "Cooling infrastructure",
            "Servers and network",
          ],
          caption: "One data center connects to the power system and to the tools people use.",
          source: "IEA, 2025",
        },
        {
          kind: "ratio",
          title: "HOW BIG IS ONE?",
          ratioLeft: "about five ordinary centers (10 to 25 MW each)",
          ratioRight: "one hyperscale center (100 MW+)",
          ratioCount: 5,
          caption: "Roughly five ordinary centers, give or take.",
          exact: "Typical 10–25 MW; large AI-focused sites 100 MW or more.",
          source: "IEA, 2025",
        },
        {
          kind: "balance",
          title: "ONE NEW HYPERSCALE CENTER IS PROPOSED",
          subject: "One new center",
          brings: [
            { head: "Jobs and wages", detail: "Construction crews, then permanent staff." },
            { head: "Local tax base", detail: "Property tax money a county can spend." },
            { head: "Computing capacity", detail: "The servers behind AI tools and cloud storage." },
          ],
          costs: [
            { head: "A 100 MW step up", detail: "Demand no planner had scheduled." },
            { head: "New wires and poles", detail: "Substations and towers built just for it." },
            { head: "A fight over the bill", detail: "The company, or every ratepayer on the line." },
          ],
          caption: "The same project, two ledgers. You decide which one the vote turns on.",
          source: "IEA, 2025 · Loudoun County budget materials, 2026",
        },
      ],
      cardJobs: [
        { cardId: "A", job: "THE SPEECH LINE", instruction: "Write the sentence you would say out loud." },
        { cardId: "B", job: "THE LIMIT", instruction: "Say what this does not show, before the other side does." },
      ],
      prompts: [prompt("Which card would you lead with?", "Name the card, then why it goes first.")],
    },
    {
      kind: "exit-ticket",
      title: "DELIVER, JUDGE, REPAIR",
      instructions: "Deliver, judge a partner, then repair.",
      whyItMatters: "Debaters improve one named fix at a time.",
      runsOn: "anchor",
      prompts: [prompt("Write your repaired sentence.", "Fix the row your partner marked.")],
      exitBallot: {
        rows: [
          { criterion: "Clear side and claim", test: "A stranger could repeat it after hearing it once." },
          { criterion: "Reason answers why", test: "It did more than repeat the claim." },
        ],
        errors: ["My reason repeated my point", "I never named the source"],
        repairs: ["Add the missing why", "Name the source out loud"],
        product: "a rewritten sentence, not a score",
      },
    },
  ],
});

const html = renderToStaticMarkup(
  React.createElement(PrintView, { materialId: 1, pack, kit: DEFAULT_KIT_CONFIG, kitId: 1 })
);
cleanupShim();

/* Opt-in dump, for measuring the sheet geometry in a browser rather than
   asserting on strings — RENDER_DUMP=path npm run render:check */
if (process.env.RENDER_DUMP) {
  fs.writeFileSync(process.env.RENDER_DUMP, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#888">${html}</body>`);
  console.log(`dumped → ${process.env.RENDER_DUMP}`);
}

/** Each check is a student-facing block and the text that proves it rendered. */
const CHECKS = [
  ["coaching · include", "Name the move, not the answer"],
  ["coaching · don't", "Do not restate the Point in new words"],
  ["why this page", "only a debater can say what each one buys"],
  ["pass condition", "A stranger could repeat it after hearing it once"],
  ["card job · binding", "ONE JOB PER CARD"],
  ["card job · card ref", "Card A"],
  ["card job · the limit", "Say what this does not show"],
  ["practice topic band", "Our school should ban student phones"],
  ["handover band", "Same skill, real topic from here"],
  ["exit ballot · rows", "PARTNER BALLOT"],
  ["exit ballot · errors", "My reason repeated my point"],
  ["exit ballot · repairs", "Add the missing why"],
  ["exit ballot · product", "rewritten sentence, not a score"],
  ["evidence card limit", "estimate rather than a measurement"],
  ["page code", "pk-pagecode"],
  ["jv sheet class", "pk-page--jv"],
  ["jv overlay loaded", "Ascent JV standard"],
  ["figure · unit chart", "pk-unitgrid"],
  ["figure · unit chart two series", "pk-unit--then"],
  ["figure · process flow", "pk-flowline"],
  ["figure · flow stage text", "Cooling infrastructure"],
  ["figure · ratio", "pk-ratio-eq"],
  ["figure · balance", "pk-balance-subject"],
  ["figure · balance item", "Demand no planner had scheduled"],
  ["figure · exact line", "4.4% measured; 11.8% estimated"],
  ["figure · source line", "Berkeley Lab, June 2026"],
];

let failed = 0;
console.log(`rendered ${(html.length / 1024).toFixed(0)}KB · ${(html.match(/class="print-page/g) || []).length} sheets\n`);
for (const [label, needle] of CHECKS) {
  const ok = html.includes(needle);
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "MISS"}  ${label}`);
}

/* The answer key must stay teacher-only, and the coaching must NOT — the two
   travel together and the whole point of splitting them is that they render
   differently. */
/* THE REGISTER MUST REACH EVERY STUDENT SHEET.
   The evidence deck is rendered by its own component and was the one page that
   did not wear the register — which on the JV look printed an un-railed sheet
   in the middle of railed ones. Counted rather than eyeballed, because the
   deck's sheet count varies with how many cards there are. */
/* Counted off the class ATTRIBUTES, not off the whole document — the register
   overlay is inline in this page and its selectors mention `pk-page--jv` a
   dozen times, which made a first version report 11 sheets out of 4. */
const sheetClasses = [...html.matchAll(/<div class="([^"]*\bprint-page\b[^"]*)"/g)].map((m) => m[1]);
const studentSheets = sheetClasses.filter(
  (c) => c.includes("pk-page") && !c.includes("pk-page--teacher") && !c.includes("pk-cover")
).length;
const jvSheets = sheetClasses.filter((c) => c.includes("pk-page--jv")).length;
const allDressed = jvSheets === studentSheets && studentSheets > 0;
console.log("");
console.log(
  `  ${allDressed ? "ok  " : "MISS"}  every student sheet wears the register (${jvSheets}/${studentSheets})`
);
if (!allDressed) failed++;

const answerFields = (html.match(/data-answer="/g) || []).length;
const coachingGated = /class="[^"]*pk-coach[^"]*answer-key/.test(html);
console.log("");
console.log(`  ${answerFields > 0 ? "ok  " : "MISS"}  expected answers present as teacher-only fields (${answerFields})`);
console.log(`  ${!coachingGated ? "ok  " : "MISS"}  student coaching is NOT hidden by the answer-key toggle`);
if (answerFields === 0 || coachingGated) failed++;

console.log(failed === 0 ? "\nAll blocks rendered." : `\n${failed} block(s) did not render.`);
process.exit(failed === 0 ? 0 : 1);
