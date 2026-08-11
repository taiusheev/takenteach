/**
 * REGISTERS — how the foundation changes with the LEVEL of the learner.
 *
 * There are exactly two, and there will not be a third without a reference pack
 * to measure it from. The eight "designs" this replaces (playground, dossier,
 * neon, riso, blueprint…) were not levels; they were moods, and having eight of
 * them is why the same component ended up styled in nine places.
 *
 * The two registers disagree about one thing above all — INK — and everything
 * else follows from it:
 *
 *   NOVICE  near-black body copy on framed, ruled paper, heavy black cards on
 *           hard offset shadows. A twelve-year-old finds the next thing to do by
 *           looking for a heavy box, so weight is a navigation aid.
 *
 *   ELITE   grey body copy under near-black headings, flat hairline cards on
 *           white. A varsity debater reads a heavy box as a children's workbook,
 *           so seriousness is achieved by SUBTRACTION: no handwriting face, no
 *           rotation, no offset shadows, no emoji.
 *
 * Because they disagree about ink, a page gets exactly one. Mixing them would
 * resolve to whichever loaded last, which is a coin toss rather than a design.
 */
import { SLATE } from "./foundation";

export type RegisterId = "novice" | "elite";

export interface Register {
  id: RegisterId;
  label: string;
  /** one-line description for the picker */
  blurb: string;
  /** the base body size in px; every other size derives from it via SCALE */
  baseTextPx: number;
  /** the sheet's paper and the ink that sits on it */
  paper: string;
  /** body copy — the single most register-defining value in the system */
  bodyInk: string;
  /** headings and anything that must not recede */
  headingInk: string;
  /** captions, notes, field labels */
  mutedInk: string;
  rule: string;
  /** card treatment */
  card: { border: string; radius: string; shadow: string };
  /** the page frame, or "none" */
  frame: string;
  /** does the paper carry a ruled grid, and at what strength */
  paperGrid: number;
  /** which font slot each role uses — resolved against the theme's pairing */
  fonts: { display: "display" | "body"; hand: "hand" | "body" };
  /** may a component rotate, offset, or otherwise be playful */
  playful: boolean;
  /**
   * Page chrome — the filled caption bar, the masthead badge, the header rule.
   * These were the last tokens still living in the old per-design `vars` blocks;
   * they belong here because they are level decisions, not lesson ones, and
   * leaving them behind is what silently dropped five section bars to an
   * unreadable fill when the compiler took over the token layer.
   */
  chrome: {
    barBg: string;
    barFg: string;
    badgeBg: string;
    badgeFg: string;
    badgeBorder: string;
    badgeRadius: string;
    headRule: string;
    headFg: string;
    gap: string;
    pad: string;
    railW: string;
  };
}

export const REGISTERS: Record<RegisterId, Register> = {
  novice: {
    id: "novice",
    label: "Novice",
    blurb:
      "Framed ruled paper, heavy black cards on hard shadows, near-black copy — weight as a navigation aid",
    // His novice series runs 13px body under a 35px Bebas title.
    baseTextPx: 13,
    paper: SLATE[50],
    bodyInk: SLATE[900],
    headingInk: "#000000",
    mutedInk: SLATE[500],
    rule: "#000000",
    card: { border: "3px solid #000000", radius: "8px", shadow: "4px 4px 0 #000000" },
    frame: "4px solid var(--pk-accent)",
    paperGrid: 0.09,
    fonts: { display: "display", hand: "hand" },
    playful: true,
    chrome: {
      barBg: "#000000",
      barFg: "#ffffff",
      badgeBg: "#000000",
      badgeFg: "#ffffff",
      badgeBorder: "0 solid transparent",
      badgeRadius: "4px",
      headRule: "3px solid #000000",
      headFg: "#000000",
      gap: "12px",
      pad: "12px",
      railW: "4px",
    },
  },
  elite: {
    id: "elite",
    label: "Elite",
    blurb:
      "White paper, flat hairline cards, grey copy under near-black heads — seriousness by subtraction",
    // The masterclass runs 12px body under a 25px Oswald title.
    baseTextPx: 12,
    paper: "#ffffff",
    // THE defining value of this register. Grey, not near-black.
    bodyInk: SLATE[700],
    headingInk: SLATE[900],
    mutedInk: SLATE[500],
    rule: SLATE[200],
    card: { border: `1px solid ${SLATE[200]}`, radius: "9px", shadow: "none" },
    frame: `1px solid ${SLATE[200]}`,
    paperGrid: 0,
    // No handwriting face exists at this level; the slot points at body so a
    // marker font can never surface on a name line.
    fonts: { display: "display", hand: "body" },
    playful: false,
    chrome: {
      // The bar takes the lesson accent rather than black — at this level the
      // caption bar is a quiet band, not a slab.
      barBg: "var(--pk-accent-strong)",
      barFg: "#ffffff",
      badgeBg: "var(--pk-accent-soft)",
      badgeFg: "var(--pk-accent-strong)",
      badgeBorder: "0 solid transparent",
      badgeRadius: "6px",
      headRule: `1.5px solid ${SLATE[900]}`,
      headFg: SLATE[900],
      gap: "15px",
      pad: "14px",
      railW: "4px",
    },
  },
};

/**
 * Which register a grade band belongs to.
 *
 * The only input is the band, deliberately. It used to be possible to pin any of
 * eight designs per pack, which meant one pack in a cohort could render in a
 * different world from its siblings — the "different design on different pages"
 * complaint, at library scale.
 */
export function registerForGradeBand(band: string | undefined | null): RegisterId {
  const g = (band ?? "").toLowerCase();
  if (/\b(9|10|11|12)\b/.test(g) || /adult|varsity|senior|elite/.test(g)) return "elite";
  return "novice";
}
