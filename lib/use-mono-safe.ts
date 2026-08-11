"use client";

import { type RefObject, useEffect, useState } from "react";
import { contrastRatio, minContrast } from "./mono-contrast";

/**
 * Guarantees every printed page is legible in black and white.
 *
 * These materials get photocopied for a class, so text that merely *looks* fine
 * on screen — a pale chip on a pale fill, white on a tint the design system
 * lightened — can come out of the printer as nothing at all. This pass measures
 * each text-bearing element against the fill actually behind it and, below WCAG
 * AA, forces the text to black or white: whichever that fill can carry.
 *
 * It repairs rather than reports, because a lesson going out unreadable is worse
 * than a lesson slightly off-palette. Returns how many elements it corrected —
 * a high count means the design system needs another pass, not that the safety
 * net is working well.
 *
 * Runs on the DOM after paint: the design systems write their colours as
 * `var(--pk-…)`, which only resolve once the browser has applied them.
 */
export function useMonoSafeText(
  ref: RefObject<HTMLElement | null>,
  deps: unknown[]
): number {
  const [corrected, setCorrected] = useState(0);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    for (const el of root.querySelectorAll<HTMLElement>(".mono-fail")) {
      el.classList.remove("mono-fail");
      el.style.removeProperty("color");
    }

    const audit = () => {
      // Tailwind v4 emits oklch() and color(srgb …), which getComputedStyle
      // passes straight through and a hex/rgb parser silently skips — that left
      // most of the page unchecked. Assigning to fillStyle is NOT enough either
      // (those spaces serialise straight back out); painting the colour and
      // reading the pixel is the one conversion that works everywhere.
      const ctx = document.createElement("canvas").getContext("2d", {
        willReadFrequently: true,
      });
      const cache = new Map<string, string>();
      const toRgb = (v: string) => {
        if (!ctx) return v;
        const hit = cache.get(v);
        if (hit) return hit;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#000000";
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        const out = a === 0 ? "transparent" : `rgba(${r}, ${g}, ${b}, ${a / 255})`;
        cache.set(v, out);
        return out;
      };

      /** The first ancestor fill opaque enough to actually sit behind the text. */
      const behind = (el: HTMLElement): string => {
        let node: HTMLElement | null = el;
        while (node) {
          const bg = toRgb(getComputedStyle(node).backgroundColor);
          const alpha = bg.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/);
          if (bg !== "transparent" && (!alpha || Number(alpha[1]) > 0.5)) return bg;
          node = node.parentElement;
        }
        return "rgb(255, 255, 255)";
      };

      // 30 pages is tens of thousands of elements; most share the same colour
      // pair, so memoise the ratio and keep the sweep cheap.
      const ratios = new Map<string, number | null>();
      const ratioOf = (fg: string, bg: string) => {
        const key = fg + "|" + bg;
        if (!ratios.has(key)) ratios.set(key, contrastRatio(fg, bg));
        return ratios.get(key) ?? null;
      };
      let fixed = 0;
      // Repairing a parent changes what its children inherit, so sweep until a
      // pass finds nothing new (three is plenty for this DOM depth).
      for (let pass = 0; pass < 3; pass++) {
        const before = fixed;
        for (const el of root.querySelectorAll<HTMLElement>(".print-page *")) {
          if (el.classList.contains("mono-fail")) continue;
          // Only elements holding their own visible text — but ONE character
          // counts. This read `> 1`, which quietly excluded ~50 elements a pack,
          // and they are not decoration: evidence card IDs (the "A" in "cite
          // Card A", referenced from pages all over the pack), answer-key
          // letters, callout statistics set at 32px, step numbers and
          // argument-layer initials. An invisible answer letter is a broken
          // answer key, so the safety net has to cover them too.
          const own = [...el.childNodes].some(
            (n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0
          );
          if (!own || el.getClientRects().length === 0) continue;
          const cs = getComputedStyle(el);
          const size = parseFloat(cs.fontSize) || 12;
          const weight = Number(cs.fontWeight) || 400;
          const bg = behind(el);
          const ratio = ratioOf(toRgb(cs.color), bg);
          if (ratio === null) continue;
          // Shared with the static lint, and in real WCAG pixels — see the note
          // on LARGE_TEXT_PX. The version inlined here used the point numbers
          // with a px unit, so bold 14px text was let through at 3:1.
          if (ratio >= minContrast(size, weight)) continue;
          const black = ratioOf("#000000", bg) ?? 1;
          const white = ratioOf("#ffffff", bg) ?? 1;
          // !important, because a design system's own rules carry it — a plain
          // inline colour loses to them and the repair silently does nothing.
          el.style.setProperty(
            "color",
            black >= white ? "#000000" : "#ffffff",
            "important"
          );
          el.classList.add("mono-fail");
          el.title = `Was ${ratio.toFixed(1)}:1 — forced to ${black >= white ? "black" : "white"} so it prints`;
          fixed++;
        }
        if (fixed === before) break;
      }
      setCorrected(fixed);
    };

    // after paint, so custom properties and webfont metrics have settled
    const t = setTimeout(audit, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return corrected;
}
