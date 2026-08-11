/**
 * The exemplar with its DESIGN stripped out.
 *
 * The exemplar rides in the cached system prefix of every call in a build, so
 * its size is paid once at 2× (cache write) and then read ~14 times. Measured on
 * the real pack it is **58KB / ~17k tokens**, and roughly a third of that is
 * `designCss` plus per-page `designHtml` — CSS and markup that say nothing about
 * whether a lesson is well written. It is held up as a CONTENT quality bar, so
 * only the content goes in. Also drops the stored QA report, which is a
 * critique of that pack and would read as instructions for this one.
 */
const EXEMPLAR_DROP = new Set([
  "designCss",
  "designNote",
  "designBrief",
  "contentQaJson",
  "contentQaAt",
  "outlinePlan",
]);

export function contentOnly(exemplar: unknown): unknown {
  if (!exemplar || typeof exemplar !== "object") return exemplar;
  const drop = (obj: unknown, keys: Set<string>) =>
    Object.fromEntries(
      Object.entries((obj ?? {}) as Record<string, unknown>).filter(
        ([k]) => !keys.has(k)
      )
    );
  const rest = drop(exemplar, EXEMPLAR_DROP);
  if (Array.isArray(rest.activities)) {
    rest.activities = rest.activities.map((a) => drop(a, new Set(["designHtml"])));
  }
  return rest;
}

