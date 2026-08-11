/**
 * AI-generated page HTML is injected into the printer via dangerouslySetInnerHTML.
 * It is authored by our own model from the pack's content (not third-party
 * input), but we still scrub it defensively so a stray script or an unscoped
 * global rule can never run code or bleed into the rest of the app.
 *
 * Two jobs:
 *  1. Strip anything executable — <script>, inline on*= handlers, javascript: URIs.
 *  2. Keep every CSS rule inside this page. The model is told to scope selectors
 *     under `.aidp`; we defensively wrap the markup so even an accidental bare
 *     selector (e.g. `body{}`, `*{}`) only ever matches inside this page's root.
 */
export function sanitizeDesignHtml(raw: string): string {
  if (!raw) return "";
  let html = raw.trim();

  // 1a. Drop <script>…</script> blocks entirely.
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  // 1b. Drop inline event handlers: on…="…" / on…='…' / on…=value.
  html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // 1c. Neutralise javascript: URIs.
  html = html.replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*(\2)/gi, '$1=$2#$2');

  // 2. Ensure there is an `.aidp` root wrapping the markup. If the model already
  //    emitted <div class="aidp">, keep it; otherwise wrap what's after the
  //    <style> block so all its rules stay scoped.
  if (!/class\s*=\s*("|')[^"']*\baidp\b[^"']*(\1)/i.test(html)) {
    const styleMatch = html.match(/^\s*(<style[\s\S]*?<\/style>)([\s\S]*)$/i);
    if (styleMatch) {
      html = `${styleMatch[1]}<div class="aidp">${styleMatch[2]}</div>`;
    } else {
      html = `<div class="aidp">${html}</div>`;
    }
  }
  return html;
}

/**
 * Components whose text colour is DERIVED from their own fill (see .pk-ink-auto
 * in the print stylesheet). A design system must style their fill and nothing
 * else — the ink follows automatically and can never become invisible.
 */
export const AUTO_INK_COMPONENTS = [
  "pk-prompt-side",
  "pk-turn-label",
  "pk-compare-head",
  "pk-step-num",
  "pk-card-limit",
  "pk-card-limit-label",
  "pk-badge",
  "pk-cover-band",
  // a box rather than a chip: stripping its colour and mirroring its fill lets
  // the quote inside it derive legible ink, because --pk-fill inherits
  "pk-cover-anchor",
];

/*
 * Tried and REVERTED, recorded so it isn't tried again: statically stripping
 * `color: var(--pk-paper)` from labels like .pk-say-label / .pk-prompt-label,
 * on the theory that paper-coloured text on paper is invisible by definition.
 *
 * It is not. A design system may give any of those labels a fill of its own,
 * and pack #25 does exactly that — teal and near-black chips — which makes
 * paper-coloured text the CORRECT choice there. Removing it put dark ink on a
 * dark fill and took that pack from 32 repaired elements to 45.
 *
 * The rule below is safe only because the BASE stylesheet owns those
 * components' fills, so the contract is unambiguous. For everything whose fill
 * a design may invent, only the runtime pass knows the real background — it
 * measures rather than guesses, and that is the right mechanism.
 */

/**
 * Strip decorative emoji out of CSS `content:` values — the place every other
 * emoji check was blind to.
 *
 * The generation prompt bans emoji and the content pipeline strips them, but a
 * stylesheet can smuggle one in as a **CSS unicode escape**: pack #22 carries
 * `.pk-section-label::before { content: "\2696" }`, a balance-scale glyph. It is
 * not an emoji character in the file, so a text scan of the CSS finds nothing —
 * and it prints as a tofu box, because the display fonts have no glyph for it.
 * Decoding the escapes first is what makes it visible.
 *
 * This does NOT reuse `stripEmoji`, for two reasons found by testing it:
 *  - that function trims and collapses whitespace, which in a CSS value is
 *    meaningful — `content:"◆ "` would lose the space that holds the mark off
 *    its label;
 *  - it also strips ✓, because U+2713 sits inside the pictographic range it
 *    sweeps. A tick is a functional mark the design prompt allows, so the
 *    allowlist below keeps ticks and crosses while ⚖ and friends still go.
 * Geometric marks (◆ ▸ ■ ●) are U+25xx and were never in range to begin with.
 */
const KEEP_MARKS = new Set(["✓", "✔", "✗", "✘"]);

function stripCssGlyphs(value: string): string {
  return value.replace(
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]\u{FE0F}?/gu,
    (m) => (KEEP_MARKS.has(m[0]) ? m[0] : "")
  );
}

export function stripCssContentEmoji(css: string): string {
  return css.replace(
    /(content\s*:\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/gi,
    (whole, prefix: string, quoted: string) => {
      const quote = quoted[0];
      const inner = quoted.slice(1, -1);
      // decode \XXXX / \XXXXXX escapes so the emoji ranges can actually see them
      const decoded = inner.replace(
        /\\([0-9a-fA-F]{1,6})\s?/g,
        (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16))
      );
      const cleaned = stripCssGlyphs(decoded);
      if (cleaned === decoded) return whole; // nothing decorative in there
      // re-emit as plain text; only characters were removed, so no escape needed
      const safe = cleaned.replace(/\\/g, "\\\\").replace(
        new RegExp(quote, "g"),
        `\\${quote}`
      );
      return `${prefix}${quote}${safe}${quote}`;
    }
  );
}

/**
 * Enforce the auto-ink contract on a pack's stored design stylesheet.
 *
 * The generation prompt now forbids setting `color` on a filled component, but
 * packs designed before that rule exist and their CSS is already saved. Pack
 * #27's contains, with !important:
 *
 *     .pk-root .pk-prompt--con .pk-prompt-side { color: var(--pk-con) !important }
 *
 * That component's background is ALREADY var(--pk-con), so the rule painted the
 * label the same colour as the surface under it: 1:1 contrast, invisible, on
 * fourteen pages. Because it carries !important — and the design stylesheet is
 * injected after the base one regardless — no ordinary rule can win it back.
 *
 * So the declaration is dropped at render time. This is deliberately narrow: it
 * removes ONLY `color` (never a fill, a border, a font or a motif), and only on
 * the handful of components that derive their ink. Everything else the design
 * system says is left exactly as written, and the stored CSS is untouched —
 * this runs on the way to the page, so re-designing a pack is unaffected.
 */
export function sanitizeDesignCss(raw: string): string {
  if (!raw) return "";
  return stripCssContentEmoji(raw).replace(/([^{}]+)\{([^{}]*)\}/g, (whole, selector: string, body: string) => {
    // Only rules whose TARGET (the last compound in each selector) is an
    // auto-ink component — an ancestor selector like `.pk-card-limit p` is
    // styling something else and keeps its colour.
    const targets = selector
      .split(",")
      .some((sel) => {
        const last = sel.trim().split(/[\s>+~]+/).pop() ?? "";
        return AUTO_INK_COMPONENTS.some((c) => last.includes(`.${c}`));
      });
    if (!targets) return whole;
    const decls = body.split(";").filter((decl) => !/^\s*color\s*:/i.test(decl));

    // Keep --pk-fill honest. It is what the ink is derived FROM, so a rule that
    // repaints the component's background without updating it leaves the two
    // describing different colours — which is how a white label ended up on a
    // pale limit panel at 1.2:1. Mirror the fill the rule actually paints.
    // Skipped for gradients and images: there is no single colour to derive
    // from, and the runtime pass handles those.
    const fill = decls
      .map((d) => d.match(/^\s*background(?:-color)?\s*:\s*([^;!]+)/i))
      .filter(Boolean)
      .pop()?.[1]
      ?.trim();
    if (fill && !/gradient|url\(|image/i.test(fill)) {
      decls.push(`--pk-fill:${fill}`);
    }
    return `${selector}{${decls.join(";")}}`;
  });
}

/**
 * Strip decorative picture-emoji from a string — the deterministic backstop to
 * the generation prompt's "no emoji" rule. Removes the pictographic plane,
 * emoji variation selectors and keycaps, and KEEPS arrows (→) and geometric
 * marks (◆ ▸ ■ ●), which are U+25xx and outside the swept ranges.
 *
 * NB it also removes ✓ (U+2713 falls inside the pictographic sweep), despite an
 * earlier comment here claiming otherwise. That is fine for generated CONTENT —
 * the cover's functional tick is a JSX literal and never passes through here —
 * but it is why CSS `content:` values use `stripCssGlyphs` instead.
 */
export function stripEmoji(text: string): string {
  if (!text) return text;
  // remove pictographic emoji + trailing variation selectors, then tidy spaces
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\u{FE0F}?/gu, "")
    .replace(/\u{FE0F}|\u{20E3}/gu, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/ {2,}/g, " ")
    .replace(/^\s+|\s+$/g, "");
}

/** Recursively strip emoji from every string in a plain object/array (in place-safe copy). */
/**
 * Fields the emoji strip must NOT touch.
 *
 * `coverIcon` is the one glyph a lesson is allowed, printed at 70px on its title
 * page. The ban exists because emoji were leaking into instructions, badges and
 * scene lines, where they are noise a coach has to read past — a deliberate
 * topical mark on a cover is the opposite of that, and it is how ten lessons in
 * a series get ten different title pages. Keyed by field NAME so it survives
 * wherever in the object the field sits.
 */
const EMOJI_EXEMPT = new Set(["coverIcon"]);

export function stripEmojiDeep<T>(value: T): T {
  if (typeof value === "string") return stripEmoji(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => stripEmojiDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = EMOJI_EXEMPT.has(k) ? v : stripEmojiDeep(v);
    }
    return out as T;
  }
  return value;
}

