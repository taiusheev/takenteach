/**
 * THE ARGUMENT-LAYER COLOUR CODE.
 *
 * Measured from `ascent_UBI_hub_4_10.html` (L10), where the founder gives every
 * layer of an argument its own hue and holds it across the whole page:
 *
 *   .step-claim    { background:#dbeafe; border-color:#2563eb }   blue
 *   .step-context  { background:#ffedd5; border-color:#ea580c }   orange
 *   .step-evidence { background:#d1fae5; border-color:#059669 }   green
 *   .step-warrant  { background:#ede9fe; border-color:#7c3aed }   violet
 *   .step-impact   { background:#fef3c7; border-color:#d97706 }   amber
 *
 * WHY IT IS WORTH COPYING. Our worked examples printed every layer label in the
 * same accent, so POINT, EVIDENCE and LINK were three identical chips with
 * different words in them — the structure of an argument, drawn as a flat list.
 * His version teaches the structure with the colour: a student learns "warrant
 * is the violet one" once, and then recognises it in a model argument, in a
 * flow grid, and in their own writing, without reading a label at all.
 *
 * That only works if the mapping is ABSOLUTE. The same layer must be the same
 * colour on every page of every lesson, which is why this is a lookup table
 * here rather than a decision the page renderer or a design system makes.
 *
 * The vocabulary differs by framework — PEEL says Point/Explain/Evidence/Link,
 * CCEWI says Claim/Context/Evidence/Warrant/Impact, and coaches mix them — so
 * the classifier matches on meaning, not on an exact string.
 */

export type ArgumentLayer =
  | "claim"
  | "context"
  | "evidence"
  | "warrant"
  | "impact"
  | "none";

/** Ordered: the first pattern that matches wins, so put the specific ones first. */
const PATTERNS: [ArgumentLayer, RegExp][] = [
  // "Link" and "Impact" are the same job — the layer that says why it matters.
  // Ours also covers the Ballot Line, which is what a Link became.
  ["impact", /\b(impact|link|ballot|so[\s-]*what|weigh|therefore|conclusion)\b/i],
  // The because-step. "Explain" is PEEL's name for exactly this.
  ["warrant", /\b(warrant|explain|explanation|reasoning|because|mechanism|analysis|follows?)\b/i],
  ["evidence", /\b(evidence|proof|data|source|card|stat|example)\b/i],
  ["context", /\b(context|background|setup|situation|framing|definition)\b/i],
  ["claim", /\b(claim|point|position|assertion|thesis|contention|topic\s*sentence)\b/i],
];

/**
 * Which layer a label names — "EXPLAIN", "Warrant (why)", "E — Evidence".
 * Returns "none" for a label that isn't an argument layer at all, so the
 * renderer can fall back to the pack's accent rather than mis-colouring it.
 */
export function classifyLayer(label: string): ArgumentLayer {
  const s = (label ?? "").trim();
  if (!s) return "none";

  // A bare initial is how his packs label a PEEL model: "P", "E", "E", "L".
  // Ambiguous on its own — both Explain and Evidence are "E" — so a single
  // letter is only resolved by POSITION, which the caller supplies.
  if (/^[a-z]$/i.test(s)) {
    const letter = s.toUpperCase();
    if (letter === "P") return "claim";
    if (letter === "L") return "impact";
    if (letter === "C") return "claim";
    if (letter === "W") return "warrant";
    if (letter === "I") return "impact";
    return "none"; // "E" is genuinely ambiguous — let the caller decide
  }

  for (const [layer, re] of PATTERNS) if (re.test(s)) return layer;
  return "none";
}

/**
 * Classify a whole worked example at once.
 *
 * Position matters for the ambiguous cases: in a four-row PEEL model the two
 * "E" rows are Evidence then Explain in his packs, and a letter-only label
 * cannot say which. Resolving the sequence together gets both right, where
 * classifying each row alone would get neither.
 */
export function classifyLayers(labels: string[]): ArgumentLayer[] {
  const out = labels.map(classifyLayer);
  const bare = labels.map((l) => /^e$/i.test((l ?? "").trim()));
  // PEEL order: the first bare E is Evidence, the second is Explain (warrant).
  let seen = 0;
  for (let i = 0; i < out.length; i++) {
    if (!bare[i]) continue;
    out[i] = seen === 0 ? "evidence" : "warrant";
    seen++;
  }

  /**
   * ALL OR NOTHING per block.
   *
   * Worked examples are not always argument models. A three-row block reading
   * "STEP 1 — NAME THE WIRE / STEP 2 — CUT THE WIRE / STEP 3 — SAY THE SO-WHAT"
   * is a process, and only its third row happens to contain a word the layer
   * patterns recognise. Colouring that one row amber and leaving the other two
   * in the pack accent reads as a rendering bug, not as a code — and worse, it
   * teaches the code wrongly, because the colour would be marking a step rather
   * than a layer.
   *
   * So the code only engages when the block is genuinely an argument model:
   * more than half its rows classify, and at least two distinct layers appear.
   * Otherwise every row falls back to the accent and the block stays uniform.
   */
  const named = out.filter((l) => l !== "none");
  const distinct = new Set(named).size;
  if (named.length * 2 <= out.length || distinct < 2) {
    return out.map(() => "none" as ArgumentLayer);
  }
  return out;
}
