/**
 * DOES THE WEEK ACTUALLY RENDER, AND DOES IT KNOW WHEN TO SAY NOTHING?
 *
 *   npm run dash:check
 *
 * ── WHY THIS EXISTS SEPARATELY FROM npm test ─────────────────────────────
 * lib/weekly-digest.test.ts proves the AGGREGATION — which lessons count as
 * taught, when a pacing pattern is real. None of that touches the question
 * this answers: does the component put it on a screen, and does it disappear
 * on a quiet week rather than rendering an empty band nobody scrolls past?
 * Those are decisions in JSX, and a unit test on the digest cannot see them.
 *
 * The alternative was clicking through the running app, which needs a signed-in
 * session. This renders the real component from the real source in about a
 * second, so it can be run on every change instead of when someone remembers.
 *
 * Kept out of `npm test` only because it is a script rather than node:test —
 * it is fast, and worth running.
 */

import "./render-loader.mjs";
import { checkHtml, cleanupShim } from "./render-loader.mjs";

const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server.browser");
const ThisWeek = (await import("../components/dash/ThisWeek.tsx")).default;
const { weeklyDigest } = await import("../lib/weekly-digest.ts");

const TODAY = "2026-08-20";
let seq = 0;
const taught = (over = {}) => ({
  id: ++seq,
  material_id: 1,
  taught_by: 1,
  lesson_title: "L1 · REBUTTAL",
  cohort: "Novice · Tuesday",
  taught_on: TODAY,
  pacing: "behind",
  rating: 4,
  note: "",
  skipped: [],
  created_at: TODAY,
  ...over,
});

const material = (over = {}, optionalTitles = []) => ({
  id: 1,
  type: "lesson-pack",
  title: "L1 · REBUTTAL",
  status: "published",
  updated_at: `${TODAY} 10:00:00`,
  content: {
    series: "Novice",
    activities: ["THE HOOK", "THE MODEL", "NEW TRIAL, SAME STRUCTURE"].map((t) => ({
      kind: "drill",
      title: t,
      instructions: "Go.",
      prompts: [],
      optional: optionalTitles.includes(t),
    })),
  },
  ...over,
});

const render = (args) =>
  renderToStaticMarkup(
    React.createElement(ThisWeek, {
      digest: weeklyDigest({
        today: TODAY,
        taught: [],
        materials: [],
        students: [],
        observations: [],
        ...args,
      }),
    })
  );

let failed = 0;

/* ── a quiet week must render NOTHING ──────────────────────────────────────
   The failure this catches is a band reading "0 taught · nothing waiting"
   every Monday, which teaches people to scroll past the section — and takes
   the weeks that DO matter down with it. */
console.log("\nquiet week");
{
  const html = render({});
  const ok = html === "";
  failed += ok ? 0 : 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  renders nothing at all${ok ? "" : ` — got ${html.length} chars`}`);
}

/* ── the pacing verdict, which is the whole point ────────────────────────── */
console.log("\nthree lessons, all running out of time");
{
  const html = render({
    taught: [taught(), taught({ taught_on: "2026-08-18" }), taught({ taught_on: "2026-08-16" })],
  });
  failed += checkHtml(html, [
    ["the section appears", "This week"],
    ["the count is stated", "3 lessons taught"],
    ["the cohort is named", "Novice · Tuesday"],
    ["the pacing verdict is shown", "ran out of time"],
    ["and it says what to do", "marking more pages droppable"],
  ]);
}

/* ── a page cut repeatedly that the pack called core ─────────────────────── */
console.log("\na page cut three times, not marked droppable");
{
  const cut = "NEW TRIAL, SAME STRUCTURE";
  const html = render({
    taught: [
      taught({ skipped: [cut] }),
      taught({ taught_on: "2026-08-18", skipped: [cut] }),
      taught({ taught_on: "2026-08-16", skipped: [cut] }),
    ],
    materials: [material()],
  });
  failed += checkHtml(html, [
    ["the page is named", cut],
    ["the count is stated", "3 times"],
    ["it says the pack disagrees", "isn&#x27;t marked as a page you can drop"],
  ]);
}

/* ── the same page, but the pack DID mark it droppable ─────────────────────
   This is the cut path working exactly as designed, so it must NOT be
   reported as a problem. Getting this backwards would nag a coach about a
   page the author already told them to drop. */
console.log("\nthe same page, marked droppable — the cut path working");
{
  const cut = "NEW TRIAL, SAME STRUCTURE";
  const html = render({
    taught: [
      taught({ skipped: [cut] }),
      taught({ taught_on: "2026-08-18", skipped: [cut] }),
    ],
    materials: [material({}, [cut])],
  });
  failed += checkHtml(html, [
    ["no complaint about the skipped page", "you can drop", true],
  ]);
}

/* ── finished lessons nobody has taught ──────────────────────────────────── */
console.log("\nfinished lessons still waiting");
{
  const html = render({
    materials: [
      material({ id: 7, title: "L5 · CROSSFIRE", updated_at: "2026-07-20 10:00:00" }),
    ],
  });
  failed += checkHtml(html, [
    ["the count is stated", "1 finished"],
    ["the lesson is linked", '/materials/7"'],
    ["with how long it has waited", "31d"],
    ["and it is not phrased as a reproach", "haven&#x27;t been taught yet"],
  ]);
}

/* ── a student reaching a level ────────────────────────────────────────────
   The request behind this asked for a notification. There is none, so this
   line IS the delivery — if it does not render, the feature does not exist. */
console.log("\na student crossed into Solid");
{
  const obs = (rating, on) => ({
    id: ++seq, student_id: 5, skill: "rebuttal", rating,
    note: "", context: "", observed_on: on, role: "teacher",
  });
  const html = render({
    students: [{ id: 5, name: "Amina R.", cohort: "Novice", archived: 0 }],
    observations: [obs(3, "2026-07-10"), obs(4, "2026-08-18")],
  });
  failed += checkHtml(html, [
    ["the student is named", "Amina R."],
    ["and linked", '/students/5"'],
    ["the level reached", "Solid"],
    ["and where they came from", "up from Doing it"],
  ]);
}

/* ── the same student, no baseline ─────────────────────────────────────────
   A first-ever observation at Solid crossed nothing. Announcing it would be a
   promise the coach has to walk back to the student. */
console.log("\nfirst-ever observation at Solid — nothing was crossed");
{
  const html = render({
    students: [{ id: 5, name: "Amina R.", cohort: "Novice", archived: 0 }],
    observations: [
      { id: ++seq, student_id: 5, skill: "rebuttal", rating: 4,
        note: "", context: "", observed_on: "2026-08-18", role: "teacher" },
    ],
  });
  const ok = html === "";
  failed += ok ? 0 : 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  nothing is announced`);
}

/* ── the student's own page ────────────────────────────────────────────────
   Same milestone, different surface. These have to agree: a dashboard that
   congratulates a student whose own page says nothing is worse than either
   alone, and the shared `milestonesFor` is what guarantees it — this is the
   test that would catch someone re-implementing it. */
const RecentProgress = (await import("../components/students/RecentProgress.tsx")).default;
const { studentReport } = await import("../lib/student-report.ts");

console.log("\nthe student's own page shows the same milestone");
{
  const obs = (rating, on, note = "") => ({
    id: ++seq, student_id: 5, skill: "rebuttal", rating,
    note, context: "", observed_on: on, role: "teacher",
  });
  const html = renderToStaticMarkup(
    React.createElement(RecentProgress, {
      days: 30,
      report: studentReport({
        from: "2026-07-21",
        to: TODAY,
        studentId: 5,
        rounds: [],
        submissions: [],
        observations: [
          obs(3, "2026-07-10"),
          obs(4, "2026-08-18", "Restated their best argument before answering it."),
        ],
      }),
    })
  );
  failed += checkHtml(html, [
    ["the level reached", "Solid"],
    ["where they came from", "up from Doing it"],
    ["the coach's own words, verbatim", "Restated their best argument before answering it."],
    ["and the period is named", "Last 30 days"],
  ]);
}

console.log("\nthe student's page on a quiet period");
{
  const html = renderToStaticMarkup(
    React.createElement(RecentProgress, {
      days: 30,
      report: studentReport({
        from: "2026-07-21", to: TODAY, studentId: 5, rounds: [], submissions: [],
        observations: [],
      }),
    })
  );
  failed += checkHtml(html, [
    /* Unlike the dashboard, this one still renders — a student's page with a
       silent gap where the period should be reads as broken, and the coach
       came here specifically to look at this person. */
    ["it says so rather than vanishing", "Nothing logged in this period"],
  ]);
}

cleanupShim();
console.log(
  failed === 0 ? "\nThe week renders, and knows when to stay quiet.\n" : `\n${failed} check(s) failed.\n`
);
process.exit(failed === 0 ? 0 : 1);
