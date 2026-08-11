import { type Scope, listMaterials } from "./db";
import { type LessonPack } from "./lesson-pack-schema";

/**
 * What the AI remembers about every pack it has already art-directed.
 *
 * Two jobs, both aimed at "every pack looks unique AND the work keeps getting
 * better":
 *  - `priorDesigns()` is the DON'T-REPEAT list. A new pack is shown the palettes,
 *    fonts and motifs already used so it has to invent something genuinely its
 *    own instead of drifting back to the same cream-and-navy every time.
 *  - the same list doubles as the BAR TO BEAT: the newest pack is told these are
 *    the standard so far and its job is to be a clear step up. Combined with the
 *    per-page critique pass, that's the self-improvement loop.
 */
export type PriorDesign = { id: number; title: string; brief: string };

export async function priorDesigns(
  scope: Scope,
  excludeId: number,
  limit = 6
): Promise<PriorDesign[]> {
  const out: PriorDesign[] = [];
  for (const m of await listMaterials(scope)) {
    if (m.id === excludeId || m.type !== "lesson-pack") continue;
    const pack = m.content as LessonPack;
    // designBrief OR designNote. `designBrief` was written only by the per-page
    // design path, which is retired — so reading it alone meant this list could
    // only ever shrink, and the don't-repeat rule would quietly stop working as
    // the packs that carry one age out. `designNote` is what the surviving
    // pack-stylesheet path writes, and it describes the same thing: the look
    // that has already been used and must not be used again.
    const brief = (pack.designBrief || pack.designNote || "").trim();
    if (!brief) continue;
    out.push({ id: m.id, title: pack.title || m.title, brief });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Page titles every other pack has already used. The outline stage only ever saw
 * the current *series*, so two packs in different series kept landing on the same
 * page names ("NEW BEAT, SAME PLAYBOOK" / "NEW BEAT, SAME LEDGER") — the arc
 * template showing through. Showing the planner the whole library's titles forces
 * genuinely new page names.
 */
export async function priorPageTitles(
  scope: Scope,
  excludeId: number,
  limit = 60
): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of await listMaterials(scope)) {
    if (m.id === excludeId || m.type !== "lesson-pack") continue;
    for (const a of (m.content as LessonPack).activities ?? []) {
      const t = a.title.trim();
      const key = t.toUpperCase();
      if (!t || seen.has(key)) continue;
      seen.add(key);
      out.push(t);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Terms already taught by any pack in the library. The series-level rule only
 * fires for siblings, so a new series happily re-taught "warrant" to a varsity
 * squad that learned it two years ago.
 */
export async function priorVocabTerms(
  scope: Scope,
  excludeId: number,
  limit = 60
): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of await listMaterials(scope)) {
    if (m.id === excludeId || m.type !== "lesson-pack") continue;
    for (const v of (m.content as LessonPack).vocabulary ?? []) {
      const t = v.term.trim();
      const key = t.toLowerCase();
      if (!t || seen.has(key)) continue;
      seen.add(key);
      out.push(t);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Render the don't-repeat list for a prompt. Empty string when this is the first pack. */
export function avoidDigest(prior: PriorDesign[]): string {
  if (prior.length === 0) return "";
  return prior
    .map((p, i) => `${i + 1}. "${p.title}" — ${p.brief}`)
    .join("\n");
}
