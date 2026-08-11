import { z } from "zod";

/**
 * Style Kits — the reusable visual + structural identity assigned per
 * semester/cohort. A kit is not decoration: its rules feed the quality
 * checklist and its palette/fonts drive print output, so two coaches building
 * in the same kit produce visually and structurally identical packs.
 *
 * The founder can LOCK field groups. A locked group cannot be overridden by an
 * individual pack (e.g. a locked palette ignores a pack's custom accent
 * colour), which is what keeps a cohort consistent.
 */

/** Font families actually loaded by the app — a kit may only choose from these. */
export const FONT_OPTIONS = {
  display: [
    { label: "Bebas Neue", cssVar: "--font-bebas" },
    { label: "Righteous", cssVar: "--font-righteous" },
  ],
  body: [
    { label: "Lexend", cssVar: "--font-lexend" },
    { label: "Comic Neue", cssVar: "--font-comic" },
  ],
  mono: [{ label: "Share Tech Mono", cssVar: "--font-techmono" }],
  handwritten: [{ label: "Permanent Marker", cssVar: "--font-marker" }],
} as const;

export type FontSlot = keyof typeof FONT_OPTIONS;

/** Resolve a kit's font label to the CSS variable the app actually loaded. */
export function fontVar(slot: FontSlot, label: string): string {
  const opts = FONT_OPTIONS[slot] as readonly { label: string; cssVar: string }[];
  const hit = opts.find((o) => o.label === label) ?? opts[0];
  return `var(${hit.cssVar})`;
}

export const styleKitConfigSchema = z.object({
  brand: z.string().min(1),
  seriesLabel: z.string(),
  footerText: z.string(),
  /**
   * The academy's logo, printed in the frame on every cover.
   *
   * Stored as a data URL on the kit rather than as a file on disk: the pack
   * database is the one thing that gets backed up (scripts/backup.mjs), a kit
   * is already the brand-level object every pack points at, and a logo that
   * lives in the row can never go missing from a pack that was exported months
   * ago. Empty means the cover falls back to the lesson code.
   */
  logoDataUrl: z.string().optional().default(""),
  /**
   * THE SEMESTER THEME — see lib/design/theme.ts.
   *
   * This is where "we change the design each semester" actually lives, and the
   * Style Kit is the right home because it is already the per-semester, per-
   * cohort object. Changing this one string re-skins every lesson in the cohort:
   * new type pairing, new hue family for the lesson accents, new density, new
   * cover. It cannot break a pack, because a theme has no way to reach the
   * semantic colour code — Pro stays blue, Con stays red, the warrant stays
   * violet, in every theme, forever.
   */
  themeId: z.string().optional().default("novice-standard"),
  palette: z.object({
    accent: z.string(),
    gold: z.string(),
    navy: z.string(),
    brickRed: z.string(),
    grassGreen: z.string(),
    warningYellow: z.string(),
  }),
  fonts: z.object({
    display: z.string(),
    body: z.string(),
    mono: z.string(),
    handwritten: z.string(),
  }),
  rules: z.object({
    paraphraseMaxWords: z.number().int().min(10).max(200),
    minVocabTerms: z.number().int().min(0).max(20),
    minActivities: z.number().int().min(0).max(40).default(8),
    minSuccessCriteria: z.number().int().min(0).max(10).default(3),
    pageSize: z.enum(["letter", "a4"]),
  }),
});
export type StyleKitConfig = z.infer<typeof styleKitConfigSchema>;

/** Field groups the founder can lock against per-pack override. */
export const LOCK_GROUPS = [
  {
    id: "branding",
    label: "Branding",
    hint: "Brand name, series label and footer line",
  },
  {
    id: "palette",
    label: "Palette",
    hint: "Locking this ignores a pack's custom accent colour",
  },
  { id: "fonts", label: "Typography", hint: "Display, body and mono families" },
  {
    id: "rules",
    label: "Structural rules",
    hint: "Paraphrase limit, word-bank minimum, page count — these drive the checklist",
  },
] as const;

export type LockGroup = (typeof LOCK_GROUPS)[number]["id"];

export function isLocked(lockedFields: string[], group: LockGroup): boolean {
  return lockedFields.includes(group);
}

/**
 * The accent a pack should actually print with: a locked palette wins over the
 * pack's own accent colour.
 */
export function resolveAccent(
  kitAccent: string,
  packAccent: string,
  lockedFields: string[],
  subjectAccent: string
): string {
  if (isLocked(lockedFields, "palette")) return kitAccent;
  return packAccent || subjectAccent || kitAccent;
}

export const DEFAULT_KIT_CONFIG: StyleKitConfig = {
  brand: "TAKENTEACH",
  seriesLabel: "Novice Series",
  footerText: "TAKENTEACH · NOVICE SERIES · SPRING 2026",
  logoDataUrl: "",
  themeId: "novice-standard",
  palette: {
    accent: "#0f766e",
    gold: "#d97706",
    navy: "#1e3a8a",
    brickRed: "#b91c1c",
    grassGreen: "#15803d",
    warningYellow: "#facc15",
  },
  fonts: {
    display: "Bebas Neue",
    body: "Lexend",
    mono: "Share Tech Mono",
    handwritten: "Permanent Marker",
  },
  rules: {
    paraphraseMaxWords: 40,
    minVocabTerms: 4,
    minActivities: 12,
    minSuccessCriteria: 3,
    pageSize: "a4",
  },
};

/** Parse a stored config, filling in any fields added since it was saved. */
export function parseKitConfig(raw: unknown): StyleKitConfig {
  const merged = {
    ...DEFAULT_KIT_CONFIG,
    ...(raw as object),
    palette: { ...DEFAULT_KIT_CONFIG.palette, ...((raw as StyleKitConfig)?.palette ?? {}) },
    fonts: { ...DEFAULT_KIT_CONFIG.fonts, ...((raw as StyleKitConfig)?.fonts ?? {}) },
    rules: { ...DEFAULT_KIT_CONFIG.rules, ...((raw as StyleKitConfig)?.rules ?? {}) },
  };
  return styleKitConfigSchema.parse(merged);
}
