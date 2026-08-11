/**
 * SEMESTER THEMES — the identity layer you are allowed to change, once a term.
 *
 * This is the answer to "we can change the design each semester". A theme is a
 * tiny record: a type pairing, a hue family for lesson accents, a density, and a
 * cover template. Swapping it re-skins every lesson in the cohort at once, costs
 * nothing, and cannot break anything, because it cannot touch MEANING — the
 * semantic palette and the layer code live in `foundation.ts` and are not
 * reachable from here.
 *
 * WHY A HUE FAMILY RATHER THAN A PALETTE. Each lesson still gets its own accent
 * (that is what makes ten lessons ten title pages), but if lessons chose freely
 * a series would end up with a magenta lesson next to a mustard one. A family
 * fixes a hue RANGE and a saturation, and the per-lesson seed is placed inside
 * it — so the ten accents are visibly siblings, and a new semester moves all ten
 * together by moving the range.
 *
 * WHY THE FONT PAIRING IS A CLOSED LIST. Every face here is loaded by the root
 * layout via next/font. A theme naming anything else would silently fall back to
 * a system stack, and "the fonts changed and nobody knows why" is exactly the
 * drift this system exists to end.
 */

export interface FontPairing {
  id: string;
  label: string;
  /** CSS variables — must match the faces loaded in app/layout.tsx */
  display: string;
  body: string;
  mono: string;
  hand: string;
}

/** Every pairing the app can actually render. Add a face to layout.tsx first. */
export const PAIRINGS: FontPairing[] = [
  {
    id: "academy",
    label: "Academy — Bebas / Lexend / Share Tech",
    display: "var(--font-bebas)",
    body: "var(--font-lexend)",
    mono: "var(--font-techmono)",
    hand: "var(--font-marker)",
  },
  {
    id: "masterclass",
    label: "Masterclass — Oswald / Lexend / Space Mono",
    display: "var(--font-oswald)",
    body: "var(--font-lexend)",
    mono: "var(--font-space-mono)",
    hand: "var(--font-lexend)",
  },
  {
    id: "press",
    label: "Press — Archivo Black / Plex Sans / JetBrains",
    display: "var(--font-archivo-black)",
    body: "var(--font-plex-sans)",
    mono: "var(--font-jetbrains)",
    hand: "var(--font-plex-sans)",
  },
];

/**
 * A hue family: where in the colour wheel this semester's lesson accents live.
 *
 * `from`/`to` are OKLCH hue degrees. A series walks the range in even steps, so
 * lesson 1 and lesson 10 sit at the ends and the eight between are spaced — no
 * two lessons collide and none escapes the family.
 */
export interface HueFamily {
  id: string;
  label: string;
  from: number;
  to: number;
  /** OKLCH chroma; higher is more saturated. 0.10–0.16 prints well. */
  chroma: number;
}

export const HUE_FAMILIES: HueFamily[] = [
  { id: "cool", label: "Cool — teal through indigo", from: 175, to: 285, chroma: 0.13 },
  { id: "warm", label: "Warm — amber through crimson", from: 25, to: 8, chroma: 0.14 },
  { id: "forest", label: "Forest — green through teal", from: 140, to: 195, chroma: 0.12 },
  { id: "ember", label: "Ember — crimson through violet", from: 12, to: 310, chroma: 0.14 },
  { id: "civic", label: "Civic — blue through slate", from: 235, to: 265, chroma: 0.10 },
];

export interface SemesterTheme {
  id: string;
  label: string;
  pairingId: string;
  familyId: string;
  /** multiplies the register's base sizes — a way to loosen or tighten a term */
  density: number;
  /** the cover composition (see the cover components in PrintView) */
  cover: "novice" | "elite";
}

/**
 * Shipped themes. A coach picks one per cohort; the founder can add more, and
 * adding one is a five-line record rather than a stylesheet.
 */
export const THEMES: SemesterTheme[] = [
  {
    id: "novice-standard",
    label: "Novice Standard",
    pairingId: "academy",
    familyId: "cool",
    density: 1,
    cover: "novice",
  },
  {
    id: "novice-warm",
    label: "Novice Warm",
    pairingId: "academy",
    familyId: "warm",
    density: 1,
    cover: "novice",
  },
  {
    id: "elite-standard",
    label: "Elite Standard",
    pairingId: "masterclass",
    familyId: "civic",
    density: 1,
    cover: "elite",
  },
  {
    id: "elite-press",
    label: "Elite Press",
    pairingId: "press",
    familyId: "ember",
    density: 1.04,
    cover: "elite",
  },
];

export const DEFAULT_THEME_ID = "novice-standard";

export function themeById(id: string | undefined | null): SemesterTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME_ID)!;
}
export function pairingById(id: string): FontPairing {
  return PAIRINGS.find((p) => p.id === id) ?? PAIRINGS[0];
}
export function familyById(id: string): HueFamily {
  return HUE_FAMILIES.find((f) => f.id === id) ?? HUE_FAMILIES[0];
}

/**
 * The accent for lesson N of a series, inside the semester's hue family.
 *
 * Deterministic: the same lesson in the same theme always gets the same colour,
 * so a pack does not re-skin itself when someone opens it. Walking the range by
 * index rather than hashing the title means neighbouring lessons are maximally
 * separated instead of landing wherever a hash puts them.
 *
 * `total` is how many lessons the series is expected to hold; ten is the house
 * default and the value his own UBI series uses.
 */
export function accentForLesson(
  family: HueFamily,
  index: number,
  total = 10
): { hue: number; chroma: number } {
  const n = Math.max(1, total);
  const i = ((index % n) + n) % n;
  // Shortest path around the wheel, so "warm" (25 → 8) crosses zero correctly
  // rather than sweeping the long way through green.
  let span = family.to - family.from;
  if (Math.abs(span) > 180) span -= Math.sign(span) * 360;
  const hue = (((family.from + (span * i) / Math.max(1, n - 1)) % 360) + 360) % 360;
  return { hue, chroma: family.chroma };
}
