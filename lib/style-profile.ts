import { z } from "zod";

/**
 * WHAT THIS TEACHER'S OWN MATERIALS SOUND LIKE.
 *
 * ── THE COLD START THIS FIXES ────────────────────────────────────────────
 * Generation already grounds itself on the closest approved pack in the
 * library (lib/memory.ts), and that is the strongest quality signal there is —
 * for a library that HAS packs in it. A coach arriving with fifteen years of
 * their own lessons in a folder has an empty exemplar pool, so their first ten
 * builds sound like the house and nothing like them, which is exactly when
 * they are deciding whether this tool is theirs.
 *
 * ── WHY A PROFILE AND NOT A FILE UPLOAD ──────────────────────────────────
 * The obvious build is "upload your PDFs". It needs file storage the product
 * does not have (the only upload today is a logo, as a data URL under 400 KB),
 * a parser per format, and it ends in a black box: a teacher cannot see what
 * was learned, cannot correct it, and cannot tell whether it is why a lesson
 * came out wrong.
 *
 * So the material is pasted, ONE model call turns it into these fields, and
 * the teacher reads them back and edits them. Every field is a short sentence
 * in plain English for that reason — this is a document about them that they
 * are entitled to check. It is also why `gaps` exists: the same read produces
 * what their materials never do, which is a recommendation grounded in their
 * own work rather than in a template.
 *
 * ── LEARN THE VOICE, NOT THE STANDARDS ───────────────────────────────────
 * The most important boundary in this file, and the reason the prompt below
 * says it twice. A teacher's own handout may have no scope limits on its
 * evidence, no exit ticket and a wall of prose — all things the checklist
 * refuses. Adopting the style must never mean adopting the weaknesses, or this
 * feature becomes the one that quietly lowers the bar on every pack it
 * touches, in a way nobody would think to look for. Voice, vocabulary and
 * recurring moves are learned. Rigor is not negotiable and is not here.
 */

export const styleProfileSchema = z.object({
  /** How they speak to students — person, register, humour. One sentence. */
  voice: z.string().max(400).catch(""),
  /** How they phrase a task ("Do this in 90 seconds" vs "Consider the following"). */
  instructionStyle: z.string().max(400).catch(""),
  /**
   * Routines that recur across their materials — the things a student of
   * theirs would recognise. This is what makes a generated pack feel like
   * theirs rather than merely competent.
   */
  signatureMoves: z.array(z.string().max(200)).max(8).catch([]),
  /**
   * Their words for things. A coach who says "claim-warrant-impact" every
   * week should not be handed a pack that says PEEL: it is the same idea and
   * it reads as somebody else's lesson.
   */
  vocabulary: z.array(z.string().max(120)).max(12).catch([]),
  /**
   * WHAT THEIR MATERIALS NEVER DO — shown as a suggestion, never applied.
   *
   * The "recommendations" half of the request, and the only part of this file
   * that is allowed to be an opinion. It is deliberately separated from
   * everything above: the fields above are applied to generation silently
   * because they are descriptions, and a gap is a judgement about someone's
   * teaching that they get to accept or ignore.
   */
  gaps: z.array(z.string().max(200)).max(6).catch([]),
  /** How many samples this was read from, and when. Provenance for the reader. */
  sampleCount: z.number().int().min(0).max(50).catch(0),
  updatedAt: z.string().max(40).catch(""),
});

export type StyleProfile = z.infer<typeof styleProfileSchema>;

export const EMPTY_PROFILE: StyleProfile = styleProfileSchema.parse({});

/** Parse whatever is in the column, falling back to empty on anything odd. */
export function parseStyleProfile(raw: string | null | undefined): StyleProfile {
  if (!raw) return styleProfileSchema.parse({});
  try {
    return styleProfileSchema.parse(JSON.parse(raw));
  } catch {
    /* Same reasoning as parsePreferences: a hand-edited or half-written value
       costs the profile and nothing more. This is read while building a
       prompt, not at a security boundary. */
    return styleProfileSchema.parse({});
  }
}

/** Is there anything here worth sending to a model? */
export function hasStyleProfile(p: StyleProfile): boolean {
  return Boolean(
    p.voice.trim() ||
      p.instructionStyle.trim() ||
      p.signatureMoves.length > 0 ||
      p.vocabulary.length > 0
  );
}

/**
 * The profile as a prompt block.
 *
 * `gaps` is deliberately NOT included. It is advice for the teacher about
 * their own habits; feeding it to the generator would turn "you rarely use
 * exit tickets" into an instruction to add one, which the house standard
 * already requires and which would make the suggestion look like it had been
 * silently acted on.
 */
export function styleProfileForPrompt(p: StyleProfile): string {
  if (!hasStyleProfile(p)) return "";
  const lines: string[] = [];
  if (p.voice.trim()) lines.push(`- Voice: ${p.voice.trim()}`);
  if (p.instructionStyle.trim())
    lines.push(`- How they phrase a task: ${p.instructionStyle.trim()}`);
  if (p.signatureMoves.length)
    lines.push(`- Routines their students would recognise: ${p.signatureMoves.join(" · ")}`);
  if (p.vocabulary.length)
    lines.push(`- Their words for things — use THESE, not the equivalents: ${p.vocabulary.join(" · ")}`);
  return `This teacher's own materials, read and summarised (they wrote and approved this description):
${lines.join("\n")}

Write this pack in that voice. It must sound like THEIR lesson, not a generic one.

THIS CHANGES THE VOICE AND NOTHING ELSE. Every rule above about rigor, evidence, scope limits, page budgets and the exit ticket still applies in full. If their style and the standard ever pull in different directions, the standard wins — you are matching how they SOUND, not lowering what a pack has to do.`;
}
