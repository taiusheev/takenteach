"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Download the material as a real file.
 *
 * Two different jobs, so two different sources:
 *  - PDF / HTML / Word keep the DESIGN, so they are built from the rendered
 *    print view — the pack's own stylesheet, the A4 sheets, and the contrast
 *    repairs are all already applied in the DOM.
 *  - Markdown / plain text / JSON come from the server, which re-serialises the
 *    stored content (an editable, pasteable copy rather than a picture of one).
 *
 * PDF is the browser's own print-to-PDF: it renders the exact same page, honours
 * @page A4, and needs no server-side headless browser.
 */
export default function DownloadMenu({
  materialId,
  showAnswers,
}: {
  materialId: number;
  /** whether the answer key is currently visible — text exports follow suit */
  showAnswers: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    // revoke on the next tick so the click has definitely started
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function baseName() {
    const title = document.querySelector(".pk-cover-title")?.textContent?.trim();
    const code = document.querySelector(".pk-cover-glyph")?.textContent?.trim();
    return (
      [code, title]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 70) || "lesson"
    );
  }

  /**
   * Every rule the page is using, as text. Same-origin <link> stylesheets are
   * fetched and their relative url(…) references made absolute, so fonts and
   * images still resolve from the saved file.
   */
  async function collectCss(): Promise<string> {
    // DOCUMENT ORDER MATTERS. The app's stylesheet is a <link> in <head> and the
    // pack's design system is a <style> injected later in the body; collecting
    // all <style> tags first and appending the link inverted that, so Tailwind's
    // preflight ended up overriding the pack's typography in the saved file.
    const nodes = [
      ...document.querySelectorAll<HTMLElement>('style, link[rel="stylesheet"]'),
    ];
    const parts = await Promise.all(
      nodes.map(async (node) => {
        if (node.tagName === "STYLE") return node.textContent ?? "";
        const link = node as HTMLLinkElement;
        try {
          const text = await (await fetch(link.href)).text();
          return text.replace(
            /url\((['"]?)(?!data:|https?:|\/\/)([^'")]+)\1\)/g,
            (_m, q, path) => `url(${q}${new URL(path, link.href).href}${q})`
          );
        } catch {
          return ""; // a stylesheet we can't read just falls back to system styling
        }
      })
    );
    return parts.filter(Boolean).join("\n");
  }

  /** The printable sheets, stripped of anything that only exists on screen. */
  function sheetsHtml(): string {
    const root = document.querySelector<HTMLElement>(".pk-root");
    if (!root) return "";
    const clone = root.cloneNode(true) as HTMLElement;
    for (const el of clone.querySelectorAll(".no-print")) el.remove();
    // the proof filter is a screen affordance, never part of the artefact
    clone.classList.remove("mono-proof");
    return clone.outerHTML;
  }

  /**
   * Make the saved file portable. The app self-hosts ~14 print families, so the
   * collected CSS points at localhost for all of them — open the download on
   * another machine and the type silently falls back. Embed the faces this pack
   * actually uses as data URIs and drop the rest, which also keeps the file
   * small (three families, not fourteen).
   */
  async function embedFonts(css: string): Promise<string> {
    const used = new Set<string>();
    for (const sel of [".print-page", ".pk-title", ".pk-section-label", ".pk-cover-title"]) {
      const el = document.querySelector(sel);
      if (!el) continue;
      for (const fam of getComputedStyle(el).fontFamily.split(",")) {
        const name = fam.trim().replace(/^["']|["']$/g, "");
        if (name && !/^(sans-serif|serif|monospace|system-ui)$/.test(name)) {
          used.add(name.toLowerCase());
        }
      }
    }
    const blocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    let out = css;
    let budget = 1_500_000; // stop embedding rather than ship a 20MB file
    for (const block of blocks) {
      const fam = block
        .match(/font-family:\s*(['"]?)([^;'"]+)\1/)?.[2]
        ?.trim()
        .toLowerCase();
      if (!fam || !used.has(fam)) {
        out = out.replace(block, ""); // an unused face is dead weight
        continue;
      }
      // Each family ships one face per subset (latin, cyrillic, greek…). These
      // packs are Latin-script, so embedding every subset would multiply the
      // file for nothing — keep the basic-latin face and drop the rest.
      const range = block.match(/unicode-range:\s*([^;]+)/)?.[1];
      if (range && !/U\+0{0,3}0-0{0,2}FF/i.test(range)) {
        out = out.replace(block, "");
        continue;
      }
      const url = block.match(/url\((https?:\/\/[^)]+\.woff2?)\)/)?.[1];
      if (!url || budget <= 0) continue;
      try {
        const buf = await (await fetch(url)).arrayBuffer();
        budget -= buf.byteLength;
        let bin = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const mime = url.endsWith(".woff2") ? "font/woff2" : "font/woff";
        out = out.replace(
          block,
          block.replace(url, `data:${mime};base64,${btoa(bin)}`)
        );
      } catch {
        /* leave the absolute URL — better than no font at all */
      }
    }
    return out;
  }

  async function buildDocument(forWord: boolean): Promise<string> {
    const css = await embedFonts(await collectCss());
    // The --font-* variables next/font defines live on <html>, not on .pk-root,
    // so an export that copies only the sheets loses every typeface to the
    // system fallback. Pin the resolved families onto the exported root.
    const live = getComputedStyle(document.querySelector(".pk-root")!);
    const fonts = ["display", "body", "mono", "hand"]
      .map((k) => `--pk-${k}: ${live.getPropertyValue(`--pk-${k}`).trim()};`)
      .filter((d) => !d.endsWith(": ;"))
      .join("");

    // next/font defines every --font-* variable on a class it puts on <html>;
    // the skin rules reference those by name, so without the class the whole
    // chain resolves to nothing and the export prints in the system font.
    return `<!doctype html>
<html class="${document.documentElement.className}"><head><meta charset="utf-8">
<title>${document.title}</title>
<style>
${css}
.pk-root{${fonts}}
@page { size: A4; margin: 0; }
body { margin: 0; background: #fff; }
${forWord ? ".print-page{page-break-after:always;}" : ".print-stack{gap:0;background:#fff;padding:0;}"}
</style>
</head><body>${sheetsHtml()}</body></html>`;
  }

  async function download(kind: "html" | "doc") {
    setBusy(kind);
    try {
      const html = await buildDocument(kind === "doc");
      save(
        new Blob([html], {
          type:
            kind === "doc"
              ? "application/msword"
              : "text/html;charset=utf-8",
        }),
        `${baseName()}.${kind}`
      );
      setOpen(false);
    } finally {
      setBusy("");
    }
  }

  const serverHref = (format: string) =>
    `/api/materials/${materialId}/export?format=${format}${showAnswers ? "&answers=1" : ""}`;

  const item =
    "block w-full px-3 py-2 text-left text-xs font-semibold text-fg2 hover:bg-inkmid hover:text-fg1 transition-colors";

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-inkline px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-fg2 hover:text-fg1 transition-colors"
      >
        ⬇ Download
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-lg border border-inkline bg-inkcard shadow-2xl">
          <p className="border-b border-inkline px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-fg3">
            Keeps the design
          </p>
          <button className={item} onClick={() => { setOpen(false); window.print(); }}>
            PDF <span className="text-fg3">— print dialog → Save as PDF</span>
          </button>
          <button className={item} disabled={!!busy} onClick={() => download("html")}>
            {busy === "html" ? "Building…" : "HTML"}{" "}
            <span className="text-fg3">— one self-contained page</span>
          </button>
          <button className={item} disabled={!!busy} onClick={() => download("doc")}>
            {busy === "doc" ? "Building…" : "Word (.doc)"}{" "}
            <span className="text-fg3">— opens in Word / Google Docs</span>
          </button>
          <p className="border-y border-inkline px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-fg3">
            Editable text
          </p>
          <a className={item} href={serverHref("md")}>
            Markdown <span className="text-fg3">— .md</span>
          </a>
          <a className={item} href={serverHref("txt")}>
            Plain text <span className="text-fg3">— .txt</span>
          </a>
          <a className={item} href={serverHref("json")}>
            JSON <span className="text-fg3">— the raw pack</span>
          </a>
          <p className="border-t border-inkline px-3 py-2 text-[10px] text-fg3">
            {showAnswers
              ? "Answer key is ON — text exports include it."
              : "Answer key is OFF — text exports are the student copy."}
          </p>
        </div>
      )}
    </div>
  );
}
