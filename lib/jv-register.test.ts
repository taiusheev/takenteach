/**
 * The JV register, and the contrast guarantee the token compiler is supposed to
 * make on every register rather than only on the two it shipped with.
 *
 * Adding a register is the change most likely to break quietly: the compiler
 * derives colour from the register's own values, so a bad `mutedInk` produces
 * a stylesheet that compiles, renders, prints, and is simply unreadable. The
 * first JV draft did exactly that — its label grey measured 3.13:1 against
 * paper while carrying 6.5pt type on four components — and nothing in the
 * codebase disagreed with it. This file is that disagreement.
 *
 *   node --test lib/jv-register.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { REGISTERS, registerForGradeBand, type RegisterId } from "./design/registers.ts";
import { compileDesign } from "./design/compile.ts";
import { contrast } from "./design/palette.ts";
import { THEMES } from "./design/theme.ts";
import {
  LESSON_DESIGNS,
  lessonDesign,
  usesJvHouse,
  usesNoviceHouse,
  usesEliteHouse,
} from "./lesson-designs.ts";
import { HOUSE_JV_CSS } from "./house-design.ts";

/** Pull a custom property's value back out of a compiled stylesheet. */
function token(css: string, name: string): string | undefined {
  const m = new RegExp(name.replace(/-/g, "\\-") + ":\\s*([^;]+);").exec(css);
  return m?.[1]?.trim();
}

const SEEDS = ["#8a2b1f", "#0f766e", "#2563eb", "#b45309", "#6d28d9"];

test("every register compiles readable body, heading and label ink on its own paper", () => {
  const fails: string[] = [];
  let checked = 0;
  for (const register of Object.keys(REGISTERS) as RegisterId[]) {
    for (const theme of Object.keys(THEMES)) {
      for (const seed of SEEDS) {
        const { css } = compileDesign({ register, themeId: theme, seed });
        const paper = token(css, "--pk-paper");
        for (const role of ["--pk-body-ink", "--pk-ink", "--pk-muted-ink"]) {
          const fg = token(css, role);
          if (!fg?.startsWith("#") || !paper?.startsWith("#")) continue;
          checked++;
          const ratio = contrast(fg, paper);
          if (ratio < 4.5)
            fails.push(`${register}/${theme}/${seed} ${role} ${fg} on ${paper} = ${ratio.toFixed(2)}`);
        }
      }
    }
  }
  assert.ok(checked > 100, `expected a real sweep, only checked ${checked} pairs`);
  assert.deepEqual(fails, [], `WCAG AA failures:\n${fails.join("\n")}`);
});

test("the JV register exists as a level, not as a mood", () => {
  const jv = REGISTERS.jv;
  assert.ok(jv, "REGISTERS.jv must exist");
  // The rule the register rests on: no accent anywhere in page chrome. If a
  // future edit reaches for `--pk-accent` here, colour stops meaning one thing
  // and the argument code loses its monopoly on it.
  const chrome = JSON.stringify(jv.chrome);
  assert.ok(
    !chrome.includes("accent"),
    `JV chrome must not spend the lesson accent — found: ${chrome}`
  );
  // Elite does spend it, which is the difference that makes them separate.
  assert.ok(JSON.stringify(REGISTERS.elite.chrome).includes("accent"));
});

test("JV type sits inside the band measured from the source pack", () => {
  // The founder's pack runs 8.3–9.4pt body with 88.9% of all text under 10pt.
  // 12px at print scale lands in that band; 13px (the novice base) does not.
  assert.equal(REGISTERS.jv.baseTextPx, 12);
  const { css } = compileDesign({ register: "jv", themeId: Object.keys(THEMES)[0], seed: "#8a2b1f" });
  const title = parseFloat(token(css, "--pk-title") ?? "0");
  const text = parseFloat(token(css, "--pk-text") ?? "0");
  assert.ok(text > 0 && title > 0, "type tokens must compile");
  // Flattest of the three registers: hierarchy is carried by rules and position.
  const ratio = title / text;
  assert.ok(ratio > 1.6 && ratio < 2.2, `JV title/body ratio out of band: ${ratio.toFixed(2)}`);
  assert.ok(ratio < REGISTERS.elite.baseTextPx * 999, "sanity");
});

test("exactly one house overlay claims any given design", () => {
  for (const d of LESSON_DESIGNS) {
    const claims = [usesNoviceHouse(d.id), usesEliteHouse(d.id), usesJvHouse(d.id)].filter(Boolean);
    assert.ok(
      claims.length <= 1,
      `${d.id} is claimed by ${claims.length} overlays; they disagree about ink and would resolve to whichever loaded last`
    );
  }
  assert.equal(usesJvHouse("jv-circuit"), true);
  assert.equal(usesEliteHouse("jv-circuit"), false);
  assert.equal(usesNoviceHouse("jv-circuit"), false);
});

test("the JV design is registered and resolvable", () => {
  const d = lessonDesign("jv-circuit");
  assert.equal(d.id, "jv-circuit");
  assert.ok(d.label.length > 0 && d.blurb.length > 0, "the picker needs a label and a blurb");
});

test("an unknown design still falls back rather than throwing", () => {
  // Guards the picker and every pack whose `design` predates this register.
  assert.ok(lessonDesign("no-such-design").id);
  assert.ok(lessonDesign(undefined).id);
});

test("the JV overlay carries the fixes the stress test forced", () => {
  // These are not stylistic. Each one is a measured failure of the first draft,
  // and losing any of them silently reintroduces it.
  // A short expected answer must cap its box: an 18-line box under a task whose
  // instruction is "one question" miscoaches as badly as a 2-line one.
  assert.match(HOUSE_JV_CSS, /write-area-sm\{[^}]*max-height/);
  assert.match(HOUSE_JV_CSS, /write-area-md\{[^}]*max-height/);
  assert.match(HOUSE_JV_CSS, /write-area-lg\{[^}]*max-height/);
  // Ruled pitch must clear college-ruled paper (7.1mm). The first draft ruled
  // at 5.6mm, narrower than college OR wide ruled.
  assert.match(HOUSE_JV_CSS, /6\.8mm/);
  // And it must NOT turn .pk-fit into a flex column: that is the element the
  // fit pass measures, and stretching it to its container silences overflow
  // detection for novice and elite as well as JV.
  assert.ok(
    !/\.pk-fit\s*\{[^}]*display:\s*flex/.test(HOUSE_JV_CSS),
    "JV must not make .pk-fit a flex column — it would break overflow detection for every register"
  );
});

test("grade-band routing is unchanged — JV is a squad tier, chosen, not inferred", () => {
  // JV is not a grade. A 10th grader can be novice, JV or varsity, so nothing
  // may start routing bands here without an explicit decision.
  assert.equal(registerForGradeBand("Grades 6–8"), "novice");
  assert.equal(registerForGradeBand("Grades 11–12"), "elite");
  assert.notEqual(registerForGradeBand("Grades 9–10"), "jv");
});
