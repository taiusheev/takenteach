/**
 * COVER ART — the title page's graphics, derived rather than authored.
 *
 * The covers had exactly three decorative elements, and all three were AI
 * fields: `coverIcon` (the 70px glyph), `coverTagline` (the pill above the
 * title) and the accent colour. Measured on two real packs, that is not a
 * design — it is a coin flip. Material #133 came back with all three and looks
 * like the reference; material #100 came back with none of them and prints as
 * seven stacked text blocks on ruled paper, because every ornament on the sheet
 * was gated on `{pack.coverIcon && …}` with nothing behind it.
 *
 * So the graphics move off the model and into the renderer. Everything here is
 * a pure function of the pack: same lesson in, same cover out, no tokens spent,
 * and — the part that actually matters — no cover can come back plain.
 *
 * TWO RULES HOLD THIS FILE:
 *
 * 1. NOTHING HERE COSTS HEIGHT. The art layer is absolutely positioned outside
 *    `.pk-fit`, so it is invisible to the fit pass and cannot push a title page
 *    off the paper. A title page has no continuation sheet; if it overflows,
 *    the content is simply gone. Decoration is never worth that risk, so it is
 *    structurally incapable of causing it rather than merely careful.
 *
 * 2. LESSON 7 AND LESSON 8 MUST NOT BE THE SAME OBJECT. That was the whole
 *    point of the authored glyph, and it survives here: the motif is chosen by
 *    hashing the lesson's own identity, so a series of ten covers is ten
 *    different sheets even when the model contributes nothing at all.
 */

export type CoverSeed = {
  lessonCode?: string;
  title?: string;
  subtitle?: string;
  skillFocus?: string;
  resolution?: string;
  mission?: string;
  coverIcon?: string;
};

/** FNV-1a. Small, stable, and — unlike `Math.random` — the same on every print. */
export function coverHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The topical glyph, when the model did not pick one.
 *
 * Keyed off what the lesson is ABOUT (its resolution and title) before what it
 * TEACHES (its skill), because a cover glyph is the reader's fastest route to
 * the topic and the skill is already spelled out in the badge underneath it.
 *
 * The house ban holds: no book, pencil, lightbulb or graduation cap. Those say
 * "this is a lesson", which is the one thing the reader already knows.
 */
/*
 * A NOTE ON THE PATTERNS, because the first draft of them was silently dead.
 *
 * These are STEM matches: `\bweigh` deliberately has no closing `\b`, so it
 * catches "weighing" and "weighs" as well as "weigh". Written the tidy-looking
 * way — `\b(weigh|impact)\b` — not one inflected form matches, because the
 * character after the stem is a word character and the boundary fails. Every
 * lesson would then have fallen through to a neutral glyph, which is exactly
 * the plain cover this file exists to prevent, and it would have done it
 * quietly.
 *
 * Short words that are the prefix of an unrelated word keep their closing `\b`
 * and are marked: `\bwar\b` must not fire on "warming", `\bcar\b` on "carbon",
 * `\bart\b` on "artificial", `\bai\b` on "aid".
 */
const TOPIC_GLYPHS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(climate|carbon|emission|environment|pollution|planet|warming|greenhouse)/i, "🌍"],
  [/\b(ocean|water|marine|fishing|river|\bsea\b)/i, "🌊"],
  [/\b(nuclear|energy|solar|electric|fossil|power grid|\boil\b)/i, "⚡"],
  [/\b(artificial intelligence|robot|algorithm|automation|machine learning|\bai\b)/i, "🤖"],
  [/\b(privacy|surveillance|encryption|tracking|\bdata\b)/i, "🔒"],
  [/\b(social media|internet|online|screen time|smartphone|phone)/i, "📱"],
  [/\b(vaccin|health|medicine|medical|hospital|doctor|disease|illness)/i, "🩺"],
  [/\b(sugar|nutrition|farming|agricultur|\bfood\b|\bdiet\b|\bmeat\b)/i, "🍎"],
  [/\b(animal|species|wildlife|extinct|\bzoo\b)/i, "🐘"],
  [/\b(mars|nasa|orbit|satellite|astronaut|\bspace\b)/i, "🚀"],
  [/\b(olympic|athlet|football|doping|sport)/i, "🏅"],
  [/\b(music|culture|museum|theatre|theater|\bart\b|\barts\b|\bfilm\b)/i, "🎭"],
  [/\b(basic income|economy|economic|wage|money|budget|poverty|welfare|\bubi\b|\btax(es|ation)?\b)/i, "💰"],
  [/\b(labour|labor|employment|worker|union|factory|\bjob\b|\bjobs\b)/i, "🏭"],
  [/\b(voting|election|democra|referendum|ballot|\bvote\b|\bvotes\b)/i, "🗳️"],
  [/\b(court|legal|constitution|justice|supreme|\blaw\b|\blaws\b|\brights\b)/i, "🏛️"],
  [/\b(military|army|troops|defence|defense|weapon|war powers|\bwar\b|\bwars\b)/i, "🎖️"],
  [/\b(immigration|border|refugee|migrant|asylum)/i, "🧭"],
  [/\b(transport|traffic|housing|urban|cities|\bcity\b|\bcar\b|\bcars\b)/i, "🚦"],
  [/\b(school|uniform|homework|curriculum|classroom|student|\bexam\b|\bexams\b)/i, "🎒"],
  [/\b(journalis|broadcast|\bnews\b|\bmedia\b|\bpress\b)/i, "📡"],
];

/** The skill glyphs — second pass, when the topic gives nothing away. */
const SKILL_GLYPHS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(rebut|refut|respond|attack|counter)/i, "🛡️"],
  [/\b(weigh|impact|compar|priorit|magnitude|trade-?off)/i, "⚖️"],
  [/\b(crossfire|cross-?examin|question|challeng)/i, "⚔️"],
  [/\b(evidence|sourc|cit(e|ing|ation)|research|proof|verif)/i, "🔍"],
  [/\b(final|tournament|championship|showcase|showdown)/i, "🏆"],
  [/\b(deliver|speak|speech|voice|rhetoric|persuas)/i, "🎙️"],
  [/\b(structur|framework|building|sandwich|outlin|signpost|\bcase\b)/i, "🧱"],
  [/\b(listen|\bnote\b|\bnotes\b|\bflow\b)/i, "🎧"],
];

/** When nothing matches, the lesson still gets its own mark, not a shared one. */
const NEUTRAL_GLYPHS = ["🎯", "⚖️", "🛡️", "⚔️", "🔍", "🏛️", "🧭", "🏆"] as const;

export function coverGlyph(pack: CoverSeed): string {
  const authored = (pack.coverIcon ?? "").trim();
  if (authored) return authored;

  const topic = `${pack.title ?? ""} ${pack.resolution ?? ""} ${pack.subtitle ?? ""}`;
  for (const [re, glyph] of TOPIC_GLYPHS) if (re.test(topic)) return glyph;

  const skill = `${pack.skillFocus ?? ""} ${pack.title ?? ""} ${pack.mission ?? ""}`;
  for (const [re, glyph] of SKILL_GLYPHS) if (re.test(skill)) return glyph;

  return NEUTRAL_GLYPHS[coverSeed(pack) % NEUTRAL_GLYPHS.length];
}

/** The per-lesson number every deterministic choice on the cover derives from. */
export function coverSeed(pack: CoverSeed): number {
  return coverHash(`${pack.lessonCode ?? ""}|${pack.title ?? ""}`);
}

/**
 * The background motif. Four of them, so a ten-lesson series does not repeat
 * within a spread, and each is a different geometry rather than a different
 * colour of the same geometry — the difference has to survive photocopying.
 */
export const COVER_MOTIFS = ["rays", "rings", "grid", "arcs"] as const;
export type CoverMotif = (typeof COVER_MOTIFS)[number];

export function coverMotif(pack: CoverSeed): CoverMotif {
  return COVER_MOTIFS[(coverSeed(pack) >>> 3) % COVER_MOTIFS.length];
}

/**
 * The big ghosted numeral in the corner — two characters, or nothing.
 *
 * Empty rather than an em dash when the pack has no lesson code: at 300px a
 * dash is a horizontal bar across the bottom corner of the sheet, which reads
 * as a printing fault rather than as a lesson number. A pack outside a numbered
 * series still gets its motif; it just doesn't get a numeral it hasn't got.
 */
export function coverNumeral(lessonCode?: string): string {
  const n = (lessonCode ?? "").replace(/^L/i, "").trim();
  if (!n) return "";
  return /^\d+$/.test(n) ? n.padStart(2, "0") : n.slice(0, 2).toUpperCase();
}
