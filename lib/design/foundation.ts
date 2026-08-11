/**
 * THE FOUNDATION — everything that must never vary.
 *
 * The audit that prompted this module found 100 distinct hardcoded hex values,
 * 157 `!important` declarations across ~1200, and thirty components restyled in
 * four or more places. That is not a design system; it is five stylesheets
 * negotiating, and AI art-direction on top of it was hiding the seams rather
 * than closing them.
 *
 * The replacement rests on one distinction:
 *
 *   MEANING is fixed forever.   Pro is blue. Con is red. Teacher is green. Gold
 *                               is what matters most. The warrant is violet.
 *                               A student learns this ONCE and it must hold in
 *                               every lesson, every level, every semester.
 *
 *   IDENTITY varies.            The accent, the cover, the type pairing, the
 *                               density. This is what makes lesson 7 feel unlike
 *                               lesson 8, and spring unlike autumn.
 *
 * Everything in this file is MEANING, so nothing here is themeable and nothing
 * here takes a parameter. The variable half lives in `registers.ts` (by level)
 * and `theme.ts` (by semester); a lesson contributes exactly one seed colour.
 *
 * Values are the founder's own, measured from the packs he teaches from —
 * `war_powers_lesson4_masterclass_v10.html` for the semantic palette and the
 * elite scale, `ascent_UBI_hub_4_10.html` for the layer code and the novice
 * scale. They are not invented and they are not up for adjustment without a
 * reference to point at.
 */

/** The semantic colour code. Fixed. Not themeable. Not AI-assignable. */
export const SEMANTIC = {
  /** the two sides of a motion */
  pro: { base: "#2563eb", soft: "#eff6ff", ink: "#1d4ed8" },
  con: { base: "#b91c1c", soft: "#fef2f2", ink: "#991b1b" },
  /** anything the coach reads and the student does not */
  teacher: { base: "#047857", soft: "#f7fffb", ink: "#065f46" },
  /** reserved for the single most important thing on a page */
  gold: { base: "#facc15", soft: "#fffdf0", ink: "#92400e" },
  /** what the judge is deciding */
  judge: { base: "#f97316", soft: "#fff7ed", ink: "#9a3412" },
  /** a check or quiz */
  check: { base: "#06b6d4", soft: "#ecfeff", ink: "#155e75" },
  /** the stretch task */
  stretch: { base: "#6366f1", soft: "#eef2ff", ink: "#3730a3" },
} as const;

/**
 * THE ARGUMENT-LAYER CODE — measured from the L10 `.step-*` classes.
 * A student learns "the warrant is the violet one" once. It therefore cannot
 * move with the theme, the level, or the lesson.
 */
export const LAYERS = {
  claim: { base: "#2563eb", soft: "#dbeafe", ink: "#1e3a8a" },
  context: { base: "#ea580c", soft: "#ffedd5", ink: "#7c2d12" },
  evidence: { base: "#059669", soft: "#d1fae5", ink: "#065f46" },
  warrant: { base: "#7c3aed", soft: "#ede9fe", ink: "#5b21b6" },
  impact: { base: "#d97706", soft: "#fef3c7", ink: "#92400e" },
} as const;

/** The neutral ramp every surface and every piece of body copy is built on. */
export const SLATE = {
  50: "#f8fafc",
  100: "#f1f5f9",
  200: "#e2e8f0",
  300: "#cbd5e1",
  500: "#64748b",
  700: "#334155",
  900: "#0f172a",
} as const;

/**
 * THE SHEET. A4 at 96dpi, and the numbers the fit pass measures against.
 * Letter was tried and abandoned: the packs are printed in-region on A4 and a
 * mixed estate is how pages silently got clipped.
 */
export const SHEET = {
  widthMm: 210,
  heightMm: 297,
  /** usable content height in px at 96dpi, after page padding */
  contentPx: 950,
  /** the fit pass will not shrink a page below this — see PrintView */
  minZoom: 0.85,
} as const;

/**
 * ACCESSIBILITY FLOORS. Checked by the gates at compile time, so a theme that
 * breaches one cannot be saved rather than being caught later by the runtime
 * contrast pass — which repairs pages but tells nobody.
 */
export const A11Y = {
  /** WCAG AA for body text */
  bodyContrast: 4.5,
  /** AA for large text (≥18px, or ≥14px bold) */
  largeContrast: 3.0,
  /** the smallest type allowed to carry meaning, in px at 1× */
  minTextPx: 10,
  /** print floor — see the max(10pt, 1em) rule in globals.css */
  minPrintPt: 10,
} as const;

/**
 * THE TYPE SCALE, as RATIOS rather than sizes.
 *
 * Registers set one base size and everything else follows, which is what keeps
 * novice and elite recognisably the same publication at different weights. His
 * two systems agree on the ratios and differ only on the base: the elite pack
 * runs 12px body with a 2.08× title, the novice series 13px with 2.7×.
 */
export const SCALE = {
  label: 0.92,
  text: 1,
  lead: 1.1,
  resolution: 1.83,
} as const;

/**
 * TITLE RATIOS ARE PER-REGISTER, not shared.
 *
 * The two systems genuinely disagree here and it is not a rounding difference:
 * the elite pack runs a 25px title on 12px body (2.08×), the novice series a
 * 35px title on 13px (2.69×). The reason is the FACE — novice titles are set in
 * condensed caps, which measure much narrower at the same optical size, so the
 * number has to be larger for the block to be the same weight on the page.
 *
 * Sharing one ratio silently printed the novice standard at 27px, which is the
 * kind of error a token system is supposed to make impossible, so the value
 * lives on the register where the disagreement actually is.
 */
export const TITLE_RATIO = { novice: 2.69, elite: 2.08 } as const;
export const COVER_TITLE_RATIO = { novice: 4.8, elite: 4.33 } as const;

export type SemanticRole = keyof typeof SEMANTIC;
export type LayerName = keyof typeof LAYERS;

/**
 * The invariant half of the stylesheet, as custom properties.
 *
 * Emitted once per page and never overridden by a register, a theme or a
 * lesson. If a rule elsewhere needs a semantic colour it reads it from here;
 * that is the whole reason the 100 loose hex values can go.
 */
export function foundationVars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, c] of Object.entries(SEMANTIC)) {
    out[`--sem-${role}`] = c.base;
    out[`--sem-${role}-soft`] = c.soft;
    out[`--sem-${role}-ink`] = c.ink;
  }
  for (const [layer, c] of Object.entries(LAYERS)) {
    out[`--layer-${layer}`] = c.base;
    out[`--layer-${layer}-soft`] = c.soft;
    out[`--layer-${layer}-ink`] = c.ink;
  }
  for (const [step, hex] of Object.entries(SLATE)) out[`--s-${step}`] = hex;
  return out;
}
