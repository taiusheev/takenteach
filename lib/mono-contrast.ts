/**
 * Black-and-white print safety for an AI-authored design system.
 *
 * These packs are photocopied for a class, so a colour pairing that looks fine
 * on screen can print as grey-on-grey and lose the words. WCAG contrast is a
 * luminance ratio — it already ignores hue — which makes it a good proxy for
 * "will this survive a mono laser printer".
 *
 * This is a deterministic lint over the generated CSS: for every rule that sets
 * both a text colour and a background, compute the ratio and flag the ones a
 * student could not read. No model call, so it can run on every save.
 */

export interface ContrastIssue {
  selector: string;
  color: string;
  background: string;
  /** WCAG contrast ratio, 1 (invisible) to 21 (black on white) */
  ratio: number;
  /** true when the rule's own font-size makes the laxer large-text bar apply */
  large: boolean;
}

/** #abc · #aabbcc · rgb()/rgba() → [r,g,b] 0-255, or null if not a flat colour. */
function parseColor(raw: string): [number, number, number] | null {
  const v = raw.trim().toLowerCase().replace(/\s*!important$/, "");
  if (v === "white" || v === "#fff" || v === "#ffffff") return [255, 255, 255];
  if (v === "black" || v === "#000" || v === "#000000") return [0, 0, 0];
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1];
    const p = h.length === 3 ? h.split("").map((c) => c + c) : h.match(/../g)!;
    return p.map((x) => parseInt(x, 16)) as [number, number, number];
  }
  const rgb = v.match(/^rgba?\(([^)]+)\)/);
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      return [parts[0], parts[1], parts[2]];
    }
  }
  return null; // var(), gradients, color-mix, transparent — not statically checkable
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number | null {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  const la = luminance(ca);
  const lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * WCAG's "large scale" text, converted into the pixels this code actually works in.
 *
 * The spec defines large text in POINTS — 18pt, or 14pt when bold — and every
 * measurement here is in CSS pixels. At the CSS reference resolution 1pt = 4/3px,
 * so the real thresholds are 24px and 18.66px.
 *
 * Both call sites previously used the POINT numbers with a PIXEL unit (`size >= 18
 * || (bold && size >= 14)`), which handed the relaxed 3:1 bar to text a third
 * smaller than the spec allows. That is not a rounding difference: a 14px bold
 * heading at 3.26:1 was passed as compliant by the static lint AND skipped by the
 * runtime repair, so 27 headings on one pack printed below AA with nothing
 * reporting it. Accessibility is a stated non-negotiable for this product, so the
 * two thresholds now live here, once, and both callers read them.
 */
export const LARGE_TEXT_PX = 24;
export const LARGE_BOLD_PX = 18.66;

export function isLargeText(sizePx: number, weight: number): boolean {
  return sizePx >= LARGE_TEXT_PX || (weight >= 700 && sizePx >= LARGE_BOLD_PX);
}

/** The AA ratio this text must clear: 3:1 only if it is genuinely large. */
export function minContrast(sizePx: number, weight: number): number {
  return isLargeText(sizePx, weight) ? 3 : 4.5;
}

/** Last value wins, the way the cascade resolves a repeated property. */
function declaration(body: string, prop: RegExp): string | null {
  let out: string | null = null;
  for (const m of body.matchAll(prop)) out = m[1];
  return out;
}

/**
 * Every rule in the stylesheet that puts text on a fill it can't be read
 * against, worst first. Genuinely large rules (24px+, or bold 18.66px+) use the
 * 3:1 bar, everything else 4.5:1 — the WCAG AA thresholds this project commits to.
 */
export function findContrastIssues(css: string): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim().replace(/\s+/g, " ");
    const body = rule[2];
    if (/^@/.test(selector)) continue;
    const color = declaration(body, /(?:^|[;{\s])color\s*:\s*([^;}]+)/g);
    const bg =
      declaration(body, /(?:^|[;{\s])background-color\s*:\s*([^;}]+)/g) ??
      declaration(body, /(?:^|[;{\s])background\s*:\s*([^;}]+)/g);
    if (!color || !bg) continue;
    const ratio = contrastRatio(color, bg);
    if (ratio === null) continue;
    const sizeMatch = body.match(/font-size\s*:\s*([\d.]+)px/);
    const size = sizeMatch ? Number(sizeMatch[1]) : 0;
    const bold = /font-weight\s*:\s*(?:bold|[7-9]00)/.test(body);
    const large = isLargeText(size, bold ? 700 : 400);
    if (ratio < (large ? 3 : 4.5)) {
      issues.push({
        selector,
        color: color.trim(),
        background: bg.trim(),
        ratio: Math.round(ratio * 10) / 10,
        large,
      });
    }
  }
  return issues.sort((a, b) => a.ratio - b.ratio);
}
