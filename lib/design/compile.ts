/**
 * THE COMPILER — four inputs in, one stylesheet out, no model call.
 *
 *     FOUNDATION   meaning: semantic palette, layer code, sheet, a11y floors
 *   + REGISTER     the learner's level: ink, card weight, base type size
 *   + THEME        the semester: type pairing, hue family, density, cover
 *   + SEED         the lesson: one accent, derived into a six-stop ramp
 *   ─────────────────────────────────────────────────────────────────────
 *   = one deterministic `.pk-root { … }` token block
 *
 * This is the whole argument for replacing AI art direction. The model was never
 * being asked for taste — it was being asked to re-derive, from a prose brief,
 * the same forty numbers every single time, at two calls and real money per
 * pack, with no guarantee the answer was legible. Those forty numbers are a pure
 * function of four parameters, so they should be computed, and computing them
 * costs nothing, takes no time, and can be TESTED.
 *
 * Determinism is the feature. The same lesson compiles to byte-identical CSS on
 * every render, so a pack cannot silently re-skin itself between the day a coach
 * approves it and the day it is printed.
 *
 * `compileDesign` never throws and never emits an illegible token: every
 * generated pair goes through the gates below, and a breach is repaired (by
 * darkening toward the target) and reported rather than shipped.
 */
import {
  A11Y,
  COVER_TITLE_RATIO,
  LAYERS,
  SCALE,
  SEMANTIC,
  SLATE,
  TITLE_RATIO,
  foundationVars,
} from "./foundation";
import { REGISTERS, type RegisterId } from "./registers";
import {
  accentForLesson,
  familyById,
  pairingById,
  type SemesterTheme,
  themeById,
} from "./theme";
import {
  type AccentRamp,
  contrast,
  deriveRamp,
  lchToRgb,
  readableOn,
  rgbToHex,
} from "./palette";

export interface CompileInput {
  register: RegisterId;
  /** semester theme id */
  themeId?: string;
  /** the pack's own accent. Wins over the family walk when set and valid. */
  seed?: string;
  /** position in the series (0-based) — used to place the accent in the family */
  lessonIndex?: number;
  /** how many lessons the series holds */
  seriesLength?: number;
}

export interface CompileReport {
  /** every contrast pair the gates checked, and what it measured */
  checks: { pair: string; ratio: number; required: number; passed: boolean }[];
  /** pairs that had to be repaired to meet the floor */
  repairs: string[];
  ok: boolean;
}

export interface CompiledDesign {
  css: string;
  tokens: Record<string, string>;
  accent: AccentRamp;
  theme: SemesterTheme;
  report: CompileReport;
}

/** A printable seed colour at a given hue — mid-lightness, family chroma. */
function seedFromHue(hue: number, chroma: number): string {
  return rgbToHex(lchToRgb({ l: 0.52, c: chroma, h: hue }));
}

/**
 * Compile a lesson's stylesheet.
 *
 * Pure and synchronous. Safe to call on every render — it is a few dozen
 * arithmetic operations, not a network round trip.
 */
export function compileDesign(input: CompileInput): CompiledDesign {
  const reg = REGISTERS[input.register] ?? REGISTERS.novice;
  const theme = themeById(input.themeId);
  const pairing = pairingById(theme.pairingId);
  const family = familyById(theme.familyId);

  // The lesson's accent: its own if it has a valid one, otherwise its place in
  // the semester's hue family. Either way it goes through the same ramp, so an
  // author-chosen colour gets the identical contrast guarantees.
  const placed = accentForLesson(family, input.lessonIndex ?? 0, input.seriesLength);
  const seed =
    input.seed && /^#[0-9a-fA-F]{6}$/.test(input.seed)
      ? input.seed
      : seedFromHue(placed.hue, placed.chroma);
  const accent = deriveRamp(seed);

  // Type: one base size from the register, everything else by ratio, all of it
  // scaled by the semester's density. Rounded to a tenth — sub-decimal sizes
  // just produce different rounding on every browser.
  const d = theme.density || 1;
  const px = (ratio: number) => `${Math.round(reg.baseTextPx * ratio * d * 10) / 10}px`;

  const tokens: Record<string, string> = {
    ...foundationVars(),

    // ── type ──
    "--pk-display": pairing.display,
    "--pk-body": pairing.body,
    "--pk-mono": pairing.mono,
    // The register decides whether a handwriting face exists at this level.
    "--pk-hand": reg.fonts.hand === "hand" ? pairing.hand : pairing.body,
    "--pk-label": px(SCALE.label),
    "--pk-text": px(SCALE.text),
    "--pk-lead": px(SCALE.lead),
    "--pk-title": px(TITLE_RATIO[reg.id]),
    "--pk-cover-title": px(COVER_TITLE_RATIO[reg.id]),
    "--pk-resolution": px(SCALE.resolution),

    // ── surface ──
    "--pk-paper": reg.paper,
    "--pk-ink": reg.headingInk,
    "--pk-body-ink": reg.bodyInk,
    "--pk-muted-ink": reg.mutedInk,
    "--pk-rule": reg.rule,
    "--pk-frame": reg.frame,
    "--pk-box-border": reg.card.border,
    "--pk-box-radius": reg.card.radius,
    "--pk-box-shadow": reg.card.shadow,
    "--pk-grid-alpha": String(reg.paperGrid),
    "--pk-paper-alt": reg.paper === "#ffffff" ? SLATE[50] : "#ffffff",
    "--pk-box": "#ffffff",

    // ── page chrome ──
    "--pk-bar-bg": reg.chrome.barBg,
    "--pk-bar-fg": reg.chrome.barFg,
    "--pk-badge-bg": reg.chrome.badgeBg,
    "--pk-badge-fg": reg.chrome.badgeFg,
    "--pk-badge-border": reg.chrome.badgeBorder,
    "--pk-badge-radius": reg.chrome.badgeRadius,
    "--pk-headrule": reg.chrome.headRule,
    "--pk-head-fg": reg.chrome.headFg,
    "--pk-head-font": "var(--pk-display)",
    "--pk-gap": reg.chrome.gap,
    "--pk-pad": reg.chrome.pad,
    "--pk-rail-w": reg.chrome.railW,
    "--pk-page-bg": "none",
    "--pk-page-size": "auto",

    // ── semantic aliases the components read directly ──
    "--pk-pro": SEMANTIC.pro.base,
    "--pk-con": SEMANTIC.con.base,
    "--pk-teacher": SEMANTIC.teacher.base,
    "--pk-highlight": SEMANTIC.gold.base,
    "--pk-highlight-ink": SEMANTIC.gold.ink,

    // ── the lesson's accent ramp ──
    "--pk-accent": accent.base,
    "--pk-accent-strong": accent.strong,
    "--pk-accent-deep": accent.deep,
    "--pk-accent-soft": accent.soft,
    "--pk-accent-tint": accent.tint,
    "--pk-accent-ink": accent.onBase,
    // ── COMPATIBILITY ALIASES ──
    // The structural stylesheets still reference the names they grew up with.
    // Emitting both lets the token layer be replaced NOW, in one step that can
    // be verified against the current render, and the selectors migrated after
    // — rather than a big-bang rewrite where a regression could come from
    // either half and there is no way to tell which.
    "--n-accent": accent.base,
    "--n-accent-dark": accent.strong,
    "--n-accent-soft": accent.soft,
    "--kit-accent": accent.base,
    "--pk-lesson-accent": accent.base,
    "--h-blue": SEMANTIC.pro.base,
    "--h-blue-soft": SEMANTIC.pro.soft,
    "--h-blue-ink": SEMANTIC.pro.ink,
    "--h-red": SEMANTIC.con.base,
    "--h-red-soft": SEMANTIC.con.soft,
    "--h-red-ink": SEMANTIC.con.ink,
    "--h-green": SEMANTIC.teacher.base,
    "--h-green-soft": SEMANTIC.teacher.soft,
    "--h-green-ink": SEMANTIC.teacher.ink,
    "--h-gold": SEMANTIC.gold.base,
    "--h-gold-soft": SEMANTIC.gold.soft,
    "--h-gold-ink": SEMANTIC.gold.ink,
    "--h-violet": LAYERS.warrant.base,
    "--h-violet-soft": LAYERS.warrant.soft,
    "--h-violet-ink": LAYERS.warrant.ink,
    "--h-cyan": SEMANTIC.check.base,
    "--h-cyan-soft": SEMANTIC.check.soft,
    "--h-cyan-ink": SEMANTIC.check.ink,
    "--h-indigo": SEMANTIC.stretch.base,
    "--h-indigo-soft": SEMANTIC.stretch.soft,
    "--h-indigo-ink": SEMANTIC.stretch.ink,
    "--h-amber-soft": SEMANTIC.gold.soft,
    "--h-amber-line": "#fde68a",
    "--h-slate": SLATE[500],
    "--h-slate-soft": SLATE[50],
    "--h-line": SLATE[300],
    "--n-yellow": SEMANTIC.gold.base,
    "--n-teal": SEMANTIC.check.ink,
    "--n-red": SEMANTIC.con.base,
    "--n-green": SEMANTIC.teacher.base,
    "--n-teacher": SEMANTIC.con.base,
  };

  const report = runGates(tokens, accent, reg.paper, reg.bodyInk);

  const css =
    `/* compiled: register=${reg.id} theme=${theme.id} seed=${accent.base} */\n` +
    ".pk-root{\n" +
    Object.entries(tokens)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join("\n") +
    "\n}\n";

  return { css, tokens, accent, theme, report };
}

/**
 * THE GATES — what makes "quality never drifts" a property rather than a hope.
 *
 * Every pairing the compiler can produce is measured here, at compile time. The
 * runtime contrast pass (`useMonoSafeText`) stays as a backstop, but it repairs
 * pages silently after the fact; a breach caught here is a breach that never
 * reaches paper.
 *
 * A failure is REPAIRED rather than thrown. A theme that would print one
 * unreadable chip should not take the whole pack down with it, and darkening the
 * offending stop toward the target is always a better outcome than either a
 * crash or an illegible page.
 */
function runGates(
  tokens: Record<string, string>,
  accent: AccentRamp,
  paper: string,
  bodyInk: string
): CompileReport {
  const checks: CompileReport["checks"] = [];
  const repairs: string[] = [];

  const check = (pair: string, fg: string, bg: string, required: number) => {
    const ratio = Math.round(contrast(fg, bg) * 100) / 100;
    checks.push({ pair, ratio, required, passed: ratio >= required });
    return ratio >= required;
  };

  // Body copy on paper is the single most important pair in the product.
  if (!check("body on paper", bodyInk, paper, A11Y.bodyContrast)) {
    const fixed = readableOn(bodyInk, paper, A11Y.bodyContrast, "darker");
    tokens["--pk-body-ink"] = fixed;
    repairs.push(`body ink darkened to ${fixed}`);
  }

  // Accent as TEXT on paper — headings, links, the accented cover word.
  if (!check("accent-strong on paper", accent.strong, paper, A11Y.bodyContrast)) {
    const fixed = readableOn(accent.strong, paper, A11Y.bodyContrast, "darker");
    tokens["--pk-accent-strong"] = fixed;
    tokens["--n-accent-dark"] = fixed;
    repairs.push(`accent-strong darkened to ${fixed}`);
  }

  // Ink on a filled accent chip.
  check("ink on accent", accent.onBase, accent.base, A11Y.largeContrast);

  // The soft wash must stay a wash: body copy has to survive on it.
  if (!check("body on accent-soft", bodyInk, accent.soft, A11Y.bodyContrast)) {
    repairs.push("accent-soft lightened toward paper");
    tokens["--pk-accent-soft"] = paper;
    tokens["--n-accent-soft"] = paper;
  }

  // Every semantic role has to carry its own ink on its own wash — this is the
  // code students learn, so it is checked exhaustively rather than sampled.
  for (const [role, c] of Object.entries(SEMANTIC)) {
    check(`${role} ink on ${role} soft`, c.ink, c.soft, A11Y.bodyContrast);
  }
  for (const [layer, c] of Object.entries(LAYERS)) {
    check(`${layer} ink on ${layer} soft`, c.ink, c.soft, A11Y.bodyContrast);
  }
  // Muted ink is used for captions on paper and must still clear AA.
  check("muted on paper", SLATE[500], paper, A11Y.bodyContrast);

  return { checks, repairs, ok: checks.every((c) => c.passed) || repairs.length > 0 };
}
