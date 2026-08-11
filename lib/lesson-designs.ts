/**
 * THE TWO REGISTERS — novice and elite. There is no third.
 *
 * This file used to hold eight "designs" (dossier, neon, riso, blueprint,
 * editorial, playground…), each with its own bespoke cover component and its own
 * token block. They were sold as distinct visual worlds; what they actually were
 * is eight places the same component got styled differently, which is most of
 * how the audit ended up counting 100 loose hex values and thirty components
 * restyled in four or more places.
 *
 * The database settled it. Every pack was pinned to `dossier` or `playground` —
 * both FORMER DEFAULTS, values written automatically and never chosen — and not
 * one pack used the other four. Six worlds nobody lived in.
 *
 * What replaced them is a real distinction: the learner's LEVEL. A twelve-year-
 * old navigates by weight and needs framed paper and heavy cards; a varsity
 * debater reads that as a children's workbook and needs grey copy on flat
 * hairlines. That difference is pedagogical, so it earns a branch. "Neon" did
 * not. Per-lesson and per-semester variety now comes from the compiled token
 * system (lib/design/) rather than from forking the stylesheet.
 *
 * The tokens below are what the printed components read through their `pk-*`
 * hooks; the structural half lives in lib/house-design.ts.
 */

export interface LessonDesign {
  id: string;
  label: string;
  emoji: string;
  /** one line shown in the picker */
  blurb: string;
  /** bespoke cover variant id (see PrintView cover components) */
  cover: string;
  /** CSS custom properties applied to the PrintView root */
  vars: Record<string, string>;
}

/**
 * Sizing/spacing tokens (added by the two grade-band skins below). The activity
 * renderer reads them with sensible fallbacks, so the older designs that don't
 * set them keep their compact defaults.
 *   --pk-text: body copy size · --pk-lead: intro/lead size
 *   --pk-title: page-title size · --pk-gap: gap between blocks
 *   --pk-pad: padding inside a block · --pk-label: small-label size
 */
export const LESSON_DESIGNS: LessonDesign[] = [
  {
    // ── THE NOVICE HOUSE LOOK — his own UBI beginner series. ──
    // Not a theme among themes: this is the design the novice packs he teaches
    // from are actually built in, so it is the default for the young bands and
    // the thing a new pack should look like unless someone chose otherwise.
    // The tokens here are the ones the renderer reads; the full treatment
    // (page frame, black rule, hard shadows, fillable fields, space cover)
    // lives in HOUSE_NOVICE_CSS, which PrintView layers on for this design.
    id: "novice",
    label: "Novice (house)",
    emoji: "🥪",
    blurb:
      "The UBI novice series — gold-framed space cover, blueprint student pages, 3px black cards on hard shadows",
    // Its own cover, built from the L6–L10 covers in the hub file: a light
    // blueprint sheet opening on a hard-bordered masthead bar, with depth
    // (2/4/6/8px offset shadows) encoding what matters most. See NoviceCover.
    cover: "novice",
    vars: {
      "--pk-frame": "4px solid #0f766e",
      "--pk-paper": "#f8fafc",
      "--pk-ink": "#0f172a",
      "--pk-page-bg":
        "linear-gradient(rgba(37,99,235,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.07) 1px, transparent 1px)",
      "--pk-page-size": "20px 20px",
      "--pk-box-border": "3px solid #000000",
      "--pk-box-shadow": "4px 4px 0 #000000",
      "--pk-box-radius": "8px",
      "--pk-bar-bg": "#000000",
      "--pk-bar-fg": "#ffffff",
      "--pk-badge-bg": "#000000",
      "--pk-badge-fg": "#ffffff",
      "--pk-badge-border": "0 solid transparent",
      "--pk-badge-radius": "4px",
      "--pk-headrule": "3px solid #000000",
      "--pk-head-fg": "#000000",
      "--pk-head-font": "var(--pk-display)",
      "--pk-rule": "#000000",
      // sizing — his measured novice scale, at the L6–L10 numbers (2.2rem
      // title / .85rem badge). NB this token sits ABOVE the house sheet in the
      // cascade, so it is the one that actually decides the size — leaving it
      // at 32px silently vetoed the house standard's own 35px.
      "--pk-text": "13px",
      "--pk-lead": "14px",
      "--pk-title": "35px",
      "--pk-gap": "12px",
      "--pk-pad": "12px",
      "--pk-label": "11px",
    },
  },
  {
    // ── THE ELITE REGISTER (9–12, adult). ──
    // Measured from war_powers_lesson4_masterclass_v10.html. The look is built
    // by SUBTRACTION: grey body copy under near-black headings, flat hairline
    // cards, and no handwriting, emoji, rotation or hard shadow anywhere. The
    // structural half lives in HOUSE_ELITE_CSS; these are the tokens.
    id: "clean-studio",
    label: "Clean Studio",
    emoji: "◻️",
    blurb: "Senior register — Oswald over Lexend, grey body on near-black heads, flat hairline cards",
    // Its own cover, not the magazine one: centred and institutional, with gold
    // and accent RAILS instead of a coloured band and a 5rem lesson number.
    cover: "elite",
    vars: {
      // His type: Oswald display, Lexend body, Space Mono labels. These override
      // the kit's fonts on purpose — Bebas Neue and Permanent Marker are the
      // novice voice, and a varsity squad reads them as a children's workbook.
      "--pk-display": "var(--font-oswald)",
      "--pk-mono": "var(--font-space-mono)",
      // No handwriting face exists in this register, so the slot points at the
      // body face rather than leaving a marker font to surface on a name line.
      "--pk-hand": "var(--font-lexend)",
      "--pk-frame": "1px solid #e5e7eb",
      "--pk-paper": "#ffffff",
      "--pk-ink": "#0f172a",
      "--pk-page-bg": "none",
      "--pk-page-size": "auto",
      "--pk-box-border": "1px solid #e2e8f0",
      "--pk-box-shadow": "none",
      "--pk-box-radius": "9px",
      "--pk-bar-bg": "var(--kit-accent)",
      "--pk-bar-fg": "#ffffff",
      "--pk-badge-bg": "color-mix(in srgb, var(--kit-accent) 12%, transparent)",
      "--pk-badge-fg": "var(--kit-accent)",
      "--pk-badge-border": "0 solid transparent",
      "--pk-badge-radius": "6px",
      "--pk-headrule": "1.5px solid #0f172a",
      "--pk-head-fg": "#0f172a",
      "--pk-head-font": "var(--pk-display)",
      "--pk-rule": "#e2e8f0",
      // His measured scale — finer than the novice one at every level.
      "--pk-text": "12px",
      "--pk-lead": "13.2px",
      "--pk-title": "25px",
      "--pk-gap": "15px",
      "--pk-pad": "14px",
      "--pk-label": "11px",
    },
  },
];

const BY_ID = new Map(LESSON_DESIGNS.map((d) => [d.id, d]));

export const DEFAULT_DESIGN_ID = "novice";

/**
 * Which designs carry the NOVICE house standard rather than the elite one.
 * PrintView reads this to decide whether to layer HOUSE_NOVICE_CSS on top.
 */
export function usesNoviceHouse(designId: string | undefined | null): boolean {
  return designId === "novice";
}

/**
 * Which designs carry the ELITE overlay — the senior register measured from the
 * War Powers masterclass: grey body copy under near-black headings, flat
 * hairline cards, Oswald over Lexend, and no handwriting, emoji or hard shadows
 * anywhere. See HOUSE_ELITE_CSS.
 *
 * The two registers are mutually exclusive by construction, because they
 * disagree about ink: novice body copy is near-black on framed paper, elite body
 * copy is grey on white. A page carrying both overlays would take whichever
 * loaded last, which is a coin toss, not a design.
 */
export function usesEliteHouse(designId: string | undefined | null): boolean {
  return designId === "clean-studio";
}

/**
 * The design adapts to the learner: young grades get his novice house look —
 * the one the UBI beginner packs are actually built in — and older grades get
 * the spacious Clean Studio skin, which sits closer to the elite War Powers
 * system. This is the default when a pack hasn't had a design pinned by hand.
 */
export function skinForGradeBand(gradeBand: string | undefined | null): string {
  const g = (gradeBand ?? "").toLowerCase();
  // "Grades 4–5" / "Grades 6–8" → young. Everything older (9–10, 11–12, adult) → Clean Studio.
  if (/\b(4|5|6|7|8)\b/.test(g) && !/\b(9|10|11|12)\b/.test(g)) return "novice";
  if (g.includes("k") || g.includes("elementary") || g.includes("primary")) return "novice";
  return "clean-studio";
}

export function lessonDesign(id: string | undefined | null): LessonDesign {
  return BY_ID.get(id ?? "") ?? BY_ID.get(DEFAULT_DESIGN_ID)!;
}

/**
 * Designs that were once `DEFAULT_DESIGN_ID`.
 *
 * A pack's `design` field is written on every save, so a pack built while X was
 * the default carries `design: "X"` without anyone ever having chosen X. Reading
 * that back as a deliberate pin is what makes an old pack refuse to follow the
 * grade band — and one pack in a library rendering in a different skin from its
 * siblings is the "different design on different pages" report, at library
 * scale. "dossier" was the original default and "playground" replaced it before
 * the novice house standard landed; neither was ever picked on purpose.
 *
 * The retired designs are listed here too. Their ids still sit in the `design`
 * field of packs saved before they were deleted, and an id that no longer
 * resolves would otherwise fall through to the default rather than to the grade
 * band — which is the same bug in a new costume. Add to this list whenever
 * DEFAULT_DESIGN_ID changes or a design is removed.
 */
const LEGACY_DEFAULTS = new Set([
  "dossier",
  "playground",
  "editorial",
  "neon",
  "riso",
  "blueprint",
]);

/**
 * Resolve the design for a pack: an explicitly-pinned design wins; otherwise it
 * follows the grade band. A former default counts as "not pinned" — see above.
 */
export function resolveDesign(
  pinned: string | undefined | null,
  gradeBand: string | undefined | null
): LessonDesign {
  if (pinned && !LEGACY_DEFAULTS.has(pinned) && BY_ID.has(pinned)) {
    return BY_ID.get(pinned)!;
  }
  return lessonDesign(skinForGradeBand(gradeBand));
}
