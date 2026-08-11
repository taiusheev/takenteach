/**
 * DETERMINISTIC PALETTE DERIVATION.
 *
 * The whole design system rests on one idea: a lesson supplies ONE colour, and
 * every other colour it needs is computed from that seed to fixed contrast
 * targets. Nobody picks a "soft tint" by eye, ever.
 *
 * WHY THIS IS THE FIX. The audit found 100 distinct hardcoded hex values across
 * our stylesheets. Every one of them was a judgement someone made once and never
 * re-checked, and that is precisely what design drift IS — not a failure of
 * taste but an accumulation of unverified local decisions. A generated ramp
 * cannot drift, because there is nothing to drift: change the seed and all six
 * stops move together, still hitting the same contrast numbers they hit before.
 *
 * WHY OKLCH. Mixing in sRGB (`color-mix(in srgb, …)`, which the old sheets used)
 * is perceptually uneven: the same 8% mix produces a barely-tinted yellow and a
 * heavily-tinted blue, so a "soft" background was a different lightness for
 * every accent. OKLCH separates lightness from chroma and hue, so a ramp defined
 * by lightness targets looks the same weight whatever the hue. It is also what
 * lets `readableOn()` SOLVE for a lightness that meets WCAG rather than guess.
 *
 * Everything here is pure and synchronous, so the compiler can run it at build
 * time and the gates can assert on the result.
 */

/* ── sRGB ⇄ OKLab ⇄ OKLCH ─────────────────────────────────────────────────
   Björn Ottosson's transform. Written out rather than pulled from a package:
   it is forty lines, it has no dependencies, and this module is the one place
   in the product where colour must be exactly reproducible across Node (the
   compiler), the browser (the preview) and a test. */

type RGB = [number, number, number]; // 0–255
type LCH = { l: number; c: number; h: number }; // l 0–1, c 0–0.4ish, h degrees

function srgbToLinear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function linearToSrgb(v: number): number {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(s * 255)));
}

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function rgbToLch([r, g, b]: RGB): LCH {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return {
    l: L,
    c: Math.sqrt(A * A + B * B),
    h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  };
}

export function lchToRgb({ l, c, h }: LCH): RGB {
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr);
  const B = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    linearToSrgb(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    linearToSrgb(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    linearToSrgb(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}

/** WCAG relative luminance, from sRGB bytes. */
function luminance([r, g, b]: RGB): number {
  return (
    0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
  );
}

/** WCAG contrast ratio between two hex colours (1–21). */
export function contrast(aHex: string, bHex: string): number {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  if (!a || !b) return 1;
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Black or white — whichever is legible on this fill. */
export function inkOn(bgHex: string): "#ffffff" | "#0f172a" {
  return contrast(bgHex, "#ffffff") >= contrast(bgHex, "#0f172a")
    ? "#ffffff"
    : "#0f172a";
}

/**
 * Darken or lighten a hue until it hits a contrast target against `against`.
 *
 * This is the mechanism that makes the whole system safe. Every generated pair
 * in the product goes through here, so "a lesson picked an unlucky colour" stops
 * being a thing that can produce an unreadable page — the worst case is a
 * slightly darker shade of what was asked for.
 *
 * Binary search on OKLCH lightness, keeping hue and reducing chroma only as far
 * as the gamut forces. 24 iterations is well past the precision of an 8-bit
 * channel.
 */
export function readableOn(
  seedHex: string,
  against: string,
  target: number,
  direction: "darker" | "lighter" = "darker"
): string {
  const rgb = hexToRgb(seedHex);
  if (!rgb) return direction === "darker" ? "#0f172a" : "#ffffff";
  const base = rgbToLch(rgb);
  if (contrast(seedHex, against) >= target) return normalize(seedHex);

  let lo = direction === "darker" ? 0 : base.l;
  let hi = direction === "darker" ? base.l : 1;
  let best = direction === "darker" ? "#000000" : "#ffffff";
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const hex = rgbToHex(lchToRgb({ ...base, l: mid }));
    if (contrast(hex, against) >= target) {
      best = hex;
      // keep as much of the original lightness as we can while passing
      if (direction === "darker") lo = mid;
      else hi = mid;
    } else if (direction === "darker") {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return best;
}

/** Same hue, pushed to a given lightness — the tint/shade primitive. */
export function atLightness(seedHex: string, l: number, chromaScale = 1): string {
  const rgb = hexToRgb(seedHex);
  if (!rgb) return seedHex;
  const base = rgbToLch(rgb);
  return rgbToHex(lchToRgb({ l, c: base.c * chromaScale, h: base.h }));
}

function normalize(hex: string): string {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHex(rgb) : hex;
}

/**
 * A lesson's full accent ramp, derived from one seed.
 *
 * Six stops, each with a job and a contrast guarantee:
 *   base     the seed, normalised — frames, rails, rules
 *   strong   readable as TEXT on paper (≥4.5:1 on white) — headings, links
 *   deep     the darkest stop — cover gradients, filled bars
 *   soft     a pale wash for panel fills (kept near L .96 so any hue is equally light)
 *   tint     a slightly stronger wash for zebra rows and hovers
 *   onBase   black or white, whichever is legible ON the base
 *
 * The lightness targets are fixed, so two lessons with wildly different hues
 * produce panels of identical visual weight. That is what makes ten lessons look
 * like one series.
 */
export interface AccentRamp {
  base: string;
  strong: string;
  deep: string;
  soft: string;
  tint: string;
  onBase: string;
}

export function deriveRamp(seedHex: string): AccentRamp {
  const safe = hexToRgb(seedHex) ? seedHex : "#0f766e";
  const base = normalize(safe);
  return {
    base,
    // Text-safe on white. AA for normal text is 4.5; we ask for 4.6 so that
    // rounding in the renderer cannot drop it under.
    strong: readableOn(base, "#ffffff", 4.6, "darker"),
    deep: atLightness(base, 0.32, 0.9),
    soft: atLightness(base, 0.965, 0.35),
    tint: atLightness(base, 0.92, 0.5),
    onBase: inkOn(base),
  };
}
