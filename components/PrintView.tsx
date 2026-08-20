"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { Activity, EvidenceCard, Figure, LessonPack, Scene } from "@/lib/lesson-pack-schema";
import { useMonoSafeText } from "@/lib/use-mono-safe";
import DownloadMenu from "@/components/DownloadMenu";
import CoverLogo from "@/components/CoverLogo";
import { Subject, SUBJECT_DEFS, SubjectTheme } from "@/lib/subjects";
import { resolveAccent, type StyleKitConfig } from "@/lib/style-kit";
import {
  LESSON_DESIGNS,
  lessonDesign,
  resolveDesign,
  usesNoviceHouse,
  usesEliteHouse,
  usesJvHouse,
  LessonDesign,
} from "@/lib/lesson-designs";
import { sanitizeDesignCss } from "@/lib/sanitize-design";
import { BASE_THEME_CSS } from "@/lib/print-theme";
import { HOUSE_DESIGN_CSS, HOUSE_NOVICE_CSS, HOUSE_ELITE_CSS, HOUSE_JV_CSS } from "@/lib/house-design";
import { classifyLayers } from "@/lib/argument-layers";
import { coverGlyph, coverMotif, coverNumeral, coverSeed } from "@/lib/cover-art";
import { compileDesign } from "@/lib/design/compile";
/** the schema default — a pack still carrying it never had a colour chosen */
const DEFAULT_ACCENT = "#0f766e";

type Mode = "all" | "student" | "teacher";


/**
 * Print-ready rendering of a lesson pack in its Style Kit. Mirrors the visual
 * language of the approved UBI Novice packs: letter pages, header rows with
 * badges, blueprint-style student pages, red-bordered teacher pages, evidence
 * cards with the ⛔ LIMIT block, and a toggleable answer key.
 */
export default function PrintView({
  materialId,
  pack,
  kit,
  kitId,
  canEditKit = false,
  subject = "debate",
  lockedFields = [],
}: {
  materialId: number;
  pack: LessonPack;
  kit: StyleKitConfig;
  /** the kit's row id — the cover logo writes back to it */
  kitId: number;
  /** founder: may set the academy logo from the cover (the API re-checks) */
  canEditKit?: boolean;
  subject?: Subject;
  lockedFields?: string[];
}) {
  const [mode, setMode] = useState<Mode>("all");
  const [showAnswers, setShowAnswers] = useState(false);
  // Live design switcher — starts from the design that fits this pack (a pinned
  // choice wins, else the grade-band skin), but the author can flip through
  // every template here to preview them before printing.
  const [designId, setDesignId] = useState<string>(
    resolveDesign(pack.design, pack.gradeBand).id
  );
  const design = lessonDesign(designId);
  const stackRef = useRef<HTMLDivElement>(null);
  const [overfull, setOverfull] = useState<number[]>([]);
  /* Cards no human has signed off — see the band below the toolbar. */
  const unverifiedCards = (pack.evidenceCards ?? []).filter((c) => !c.verified);
  // These packs get photocopied for a class, and a pairing that reads on screen
  // can print as grey-on-grey. This proofs the mono output before anyone prints.
  const [monoProof, setMonoProof] = useState(false);
  // every printed page is forced legible in mono; the count is what the design
  // system got wrong, surfaced in the B/W proof
  const lowContrast = useMonoSafeText(stackRef, [pack, mode, showAnswers, designId]);
  const [designBusy, setDesignBusy] = useState(false);
  const [designErr, setDesignErr] = useState("");
  // what the design flow is doing right now (generate -> proof-read)
  const [designStep, setDesignStep] = useState("");

  /** Ask the AI to (re)author this pack's cohesive visual identity. */
  /**
   * Measure what the stylesheet ACTUALLY produced on the rendered sheets.
   *
   * The generator writes CSS having never seen a page, so these numbers — not
   * the CSS's own description of itself — are what the proof-read pass judges.
   */
  function measureDesign() {
    const pages = [...document.querySelectorAll<HTMLElement>(".print-page")];
    const px = (sel: string) => {
      const el = document.querySelector(sel);
      return el ? Math.round(parseFloat(getComputedStyle(el).fontSize)) : 0;
    };
    const fill = (sel: string) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).backgroundColor : "";
    };
    // The RAIL, not just the fill. His own Pro and Con cards are #eff6ff and
    // #fef2f2 — two tints five thousandths apart in lightness, which merge in
    // greyscale — and the pack is still perfectly usable, because the side is
    // carried by a 4px left border in the side colour. Judging sides on the
    // fill alone would fail his design and pass one that separates by hue.
    const rail = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return "";
      const cs = getComputedStyle(el);
      return parseFloat(cs.borderLeftWidth) >= 3 ? cs.borderLeftColor : "";
    };
    const zooms = pages.map(
      (p) => parseFloat(p.querySelector<HTMLElement>(".pk-fit")?.style.zoom || "1") || 1
    );
    // how full each sheet really is: sum the content children, ignoring the
    // footer, which margin-top:auto pushes to the bottom of every page
    const fills = pages
      .map((p) => {
        const fit = p.querySelector<HTMLElement>(".pk-fit");
        if (!fit) return null;
        const h = [...fit.children]
          .filter((k) => !/footer/i.test(k.className))
          .reduce((a, k) => a + k.getBoundingClientRect().height, 0);
        return Math.round((h / p.clientHeight) * 100);
      })
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    const masthead = document.querySelector<HTMLElement>(".pk-masthead");
    const mh = masthead
      ? Math.round(
          masthead.getBoundingClientRect().height +
            parseFloat(getComputedStyle(masthead).marginBottom || "0")
        )
      : 0;
    return {
      sheets: pages.length,
      overfull: document.querySelectorAll(".is-overfull").length,
      minZoom: zooms.length ? Number(Math.min(...zooms).toFixed(2)) : 1,
      pageTitlePx: px(".pk-title"),
      bodyTextPx: px(".pk-prompt-label, .pk-bubble, .pk-chain-row"),
      coverTitlePx: px(".pk-cover-title"),
      mastheadPx: mh,
      proFill: fill(".pk-prompt--pro, .pk-turn--pro, .pk-chain--pro"),
      conFill: fill(".pk-prompt--con, .pk-turn--con, .pk-chain--con"),
      proRail: rail(".pk-prompt--pro, .pk-turn--pro, .pk-chain--pro"),
      conRail: rail(".pk-prompt--con, .pk-turn--con, .pk-chain--con"),
      medianFillPct: fills.length ? fills[Math.floor(fills.length / 2)] : 0,
      contrastRepairs: lowContrast,
    };
  }

  /**
   * Art-direct the pack, then PROOF-READ it against the rendered result.
   *
   * The second half is the point. A stylesheet that reads well as source can
   * still overflow fourteen sheets, set a 46px page title, or paint Pro and Con
   * boxes that look alike — faults a person spots instantly and a model writing
   * CSS blind cannot see at all. So the design is rendered, measured, and handed
   * back to the model to correct against real numbers before anyone sees it.
   */
  async function generateDesign() {
    setDesignBusy(true);
    setDesignErr("");
    setDesignStep("Art-directing the pack…");
    try {
      const res = await fetch(`/api/materials/${materialId}/design`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Design generation failed");

      // Apply the new stylesheet to the live page so it can be measured before
      // the reload — this is the proof, and it has to be the real thing.
      const css: string = data?.pack?.designCss ?? "";
      if (css) {
        const tag = document.createElement("style");
        tag.id = "pk-proof";
        tag.textContent = css;
        document.head.appendChild(tag);
        // let layout settle, and give the fit pass a frame to run
        await new Promise((r) => setTimeout(r, 900));
      }

      setDesignStep("Proof-reading the printed pages…");
      const metrics = measureDesign();
      const rev = await fetch(`/api/materials/${materialId}/design-review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metrics }),
      });
      const revData = await rev.json().catch(() => ({}));
      // A failed proof-read must not lose a working design — the pack still has
      // the stylesheet that was just saved.
      if (rev.ok && revData.applied) {
        setDesignStep(`Fixed: ${(revData.issues ?? []).slice(0, 2).join("; ")}`);
        // Re-measure the CORRECTED stylesheet and enforce the house floor. The
        // corrective pass is a model call like any other: it can miss, and a
        // design that is still below the academy's own printed standard must
        // not ship. If it fails here the pack falls back to the house
        // stylesheet, which meets the floor by construction.
        const proof = document.getElementById("pk-proof");
        if (proof) proof.textContent = revData.css ?? css;
        await new Promise((r) => setTimeout(r, 900));
        const enforced = await fetch(`/api/materials/${materialId}/design-review`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ metrics: measureDesign(), enforce: true }),
        });
        const encData = await enforced.json().catch(() => ({}));
        if (encData.reverted) {
          setDesignStep("Below the house standard — kept the house design.");
        }
      }
      window.location.reload();
    } catch (err) {
      setDesignErr(err instanceof Error ? err.message : "Design generation failed");
      setDesignBusy(false);
      setDesignStep("");
    }
  }

  /* THE PER-PAGE AI DESIGN PATH IS RETIRED — see the note at the top of
     lib/house-design.ts. It let the model write each page's HTML from scratch:
     ~2 model calls per page, $8–23 for a 28-page pack, and it drifted, because
     twenty-eight independently authored stylesheets cannot help but.

     Three things killed it. The house standard is the founder's own design and
     already prints every pack for free. The pack-level stylesheet (✨ AI Design
     below) buys a bespoke look for ~4 calls with a floor test behind it. And an
     AI page is static HTML, so it silently discarded everything interactive on
     the sheet — the student/teacher toggle, the answer key, and as of the rigor
     mechanics the fillable flow grid and the echo checkboxes too. It had stopped
     being a trade-off and become a regression. */

  const def = SUBJECT_DEFS[subject];
  const theme = def.theme;

  /**
   * Compile this lesson's tokens. Pure arithmetic — a few dozen operations, so
   * it runs on every render rather than being cached or persisted, which means
   * a theme change takes effect the moment the Style Kit is saved.
   *
   * The lesson's position in its series places its accent inside the semester's
   * hue family, so ten lessons come out as visible siblings rather than ten
   * unrelated colours. Its own accentColor still wins when set.
   */
  const compiled = compileDesign({
    register: usesJvHouse(design.id) ? "jv" : usesEliteHouse(design.id) ? "elite" : "novice",
    themeId: kit.themeId,
    // The seed is passed ONLY when someone deliberately chose it. A pack still
    // carrying the schema default was never given a colour, and should take its
    // place in the semester's hue family instead — otherwise changing the theme
    // would restyle the type and leave every lesson the colour it has always
    // been, which is half a semester change and the confusing half.
    seed:
      pack.accentColor && pack.accentColor !== DEFAULT_ACCENT
        ? pack.accentColor
        : undefined,
    lessonIndex: Math.max(0, (parseInt(pack.lessonCode.replace(/\D/g, ""), 10) || 1) - 1),
  });
  // a locked palette overrides the pack's own accent — that's what keeps a
  // cohort's output identical across coaches
  const accent = resolveAccent(
    kit.palette.accent,
    pack.accentColor,
    lockedFields,
    theme.accent
  );

  // Evidence pages slot in after the evidence-study activity if there is one.
  const evidenceAfter = pack.activities.findIndex(
    (a) => a.kind === "evidence-study"
  );
  const evidencePages = packEvidenceCards(pack.evidenceCards);

  const studentVisible = mode !== "teacher";
  const teacherVisible = mode !== "student";


  /**
   * No page may EVER spill onto a second sheet. AI-drafted pages vary in length,
   * so after every render we measure each page's natural height and, if it
   * exceeds 11in, shrink just that page (via CSS `zoom`, which scales layout so
   * print pagination fits too) down to one sheet. A generous floor keeps a page
   * from ever becoming unreadably small; anything that would need more shrink
   * than the floor is still flagged (the real fix there is fewer blocks / a
   * paginated reference page, not tiny text).
   */
  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    // Readability floor. Shrinking is a safety net for estimate slack, NOT a
    // way to fit three pages onto one — below ~0.85 the text stops being
    // readable for the age groups these packs are written for. Pages that would
    // need more than this are left at the floor and FLAGGED loudly, so the real
    // fix (splitting the page / trimming content) is visible instead of hidden.
    //
    // The shared constant, not a second copy of the number: the packer sizes its
    // sheets against this, and the two silently disagreeing would mean pages
    // built for one floor and rescued against another.
    const FLOOR = SHRINK_FLOOR;
    const HARD_FLOOR = CLIP_RESCUE_FLOOR;
    const fit = () => {
      // Scale the INNER content column (.pk-fit), never the A4 frame — so every
      // sheet stays the same size and only over-long content shrinks. NB: `zoom`
      // is reflected by getBoundingClientRect but NOT offsetHeight — measure with
      // the rect throughout.
      const fitters = Array.from(stack.querySelectorAll<HTMLElement>(".pk-fit"));
      fitters.forEach((el) => {
        el.style.zoom = "1";
        el.parentElement?.removeAttribute("data-tight");
      });
      const over: number[] = [];
      fitters.forEach((el, i) => {
        const page = el.parentElement;
        if (!page) return;
        /* Recomputed after each tightening step: level 2 changes the sheet's
           own padding, so the space available is not a constant here. */
        const availNow = () => {
          const cs = getComputedStyle(page);
          return (
            page.clientHeight -
            parseFloat(cs.paddingTop) -
            parseFloat(cs.paddingBottom)
          );
        };
        let avail = availNow();
        if (avail <= 0) return;
        let h = el.getBoundingClientRect().height;
        if (h <= avail + 2) {
          el.style.zoom = "1";
          page.classList.remove("is-overfull");
          return;
        }

        /* TIGHTEN FIRST — see the note in globals.css. On a real pack a third of
           the overflow on the worst sheet was white space between blocks, and
           removing white space costs a reader nothing while shrinking type costs
           them the page. Only pages that are actually over get tightened, so a
           comfortable sheet keeps its full rhythm. */
        for (const level of ["1", "2"]) {
          if (h <= avail + 2) break;
          page.setAttribute("data-tight", level);
          avail = availNow();
          h = el.getBoundingClientRect().height;
        }
        if (h <= avail + 2) {
          el.style.zoom = "1";
          page.classList.remove("is-overfull");
          return;
        }

        // CONVERGE, don't guess once. `zoom` re-lays-out the content, so height
        // does NOT scale linearly with the factor: shrinking rewraps text, and a
        // paragraph that loses a line drops more height than the factor
        // predicted, while one that gains a wrapped word drops less. A single
        // `(avail - 6) / h` therefore lands close but not reliably under, and
        // the leftover was printing as a clipped last line. Re-measuring and
        // re-applying converges in two or three passes; the floor still binds,
        // so a page that genuinely holds too much is flagged rather than
        // shrunk into illegibility.
        let factor = 1;
        for (let pass = 0; pass < 4 && h > avail + 2 && factor > FLOOR; pass++) {
          factor = Math.max(FLOOR, factor * ((avail - 6) / h));
          el.style.zoom = String(factor);
          h = el.getBoundingClientRect().height;
        }

        /* LAST RESORT — and the reason it exists is what happens without it.
           `.print-page` is `overflow: hidden`, so a sheet that is still over at
           the floor does not print small: it prints CLIPPED. The bottom of the
           page is silently missing on paper, which on a student worksheet means
           a prompt with no answer line, or an exit ticket cut in half.
           Between type at 78% and content that does not exist, the type wins
           every time. This is deliberately below the readability floor and
           deliberately only reachable after tightening has already been spent —
           and the page is still reported, so the author knows which sheet is
           carrying too much and can cut it. */
        if (h > avail + 2) {
          for (let pass = 0; pass < 3 && h > avail + 2 && factor > HARD_FLOOR; pass++) {
            factor = Math.max(HARD_FLOOR, factor * ((avail - 6) / h));
            el.style.zoom = String(factor);
            h = el.getBoundingClientRect().height;
          }
        }

        /* Reported when the page needed rescuing below the readability floor,
           not only when it still spills — a sheet printing at 78% is a sheet
           whose content should be cut, and silence there is how a pack drifts
           into being unreadable one page at a time. */
        const stillOver = h > avail + 2 || factor < FLOOR - 0.001;
        page.classList.toggle("is-overfull", stillOver);
        if (stillOver) over.push(i + 1);
      });
      setOverfull(over);
    };
    // fonts change metrics; re-fit once they've settled
    fit();
    const t = setTimeout(fit, 350);
    document.fonts?.ready.then(fit).catch(() => {});

    // A design swap changes type scale, leading and block padding — every height
    // this pass just measured. `designId` was missing from the deps, so a pack
    // fitted under one design kept those zoom factors under the next one: pages
    // that no longer needed shrinking stayed small, and pages that now overran
    // were never caught at all.
    //
    // (Deliberately NOT a ResizeObserver on `.pk-fit`: this effect sets `zoom`
    // on exactly those elements, so observing them means our own correction
    // retriggers the observer, forever.)
    return () => clearTimeout(t);
  }, [pack, mode, showAnswers, designId]);

  // Fill/clear every answer field when the key is toggled. Re-runs on mode and
  // design changes too, because both remount the pages the fields live on.
  useAnswerKey(stackRef, showAnswers, [pack, mode, designId]);


  return (
    <div
      className={`pk-root ${showAnswers ? "" : "answers-hidden"}${monoProof ? " mono-proof" : ""}`}
      data-design={design.id}
      style={
        {
          "--kit-accent": accent,
          "--kit-gold": kit.palette.gold,
          "--kit-red": kit.palette.brickRed,
          "--kit-green": kit.palette.grassGreen,
          "--kit-yellow": kit.palette.warningYellow,
        } as React.CSSProperties
      }
    >
      {/* Layered as stylesheet rules (not inline) so each layer can override the
          previous. Inline styles would out-specify and block the AI CSS.

          ORDER MATTERS, and it used to be wrong. Every layer here writes into
          the same `.pk-root{}` block, so the LAST one wins — and the design's
          own tokens used to be first, underneath the house sheet. The result
          was that a design could declare 30px titles and 3px black cards and
          silently print at the house 25px hairline instead: every skin in the
          system rendered as the elite one, which is exactly the bug that made
          novice packs come out looking like the War Powers masterclass.

          So the house standard is a FLOOR, laid down first, and the design
          answers it: base defaults → house standard → the design's tokens →
          the pack's own AI design system. A design that sets nothing still
          gets his standard whole; one that has an opinion gets to keep it. */}
      <style dangerouslySetInnerHTML={{ __html: BASE_THEME_CSS }} />
      {/* The house standard — the founder's own lesson design, as a stylesheet.
          The WORST a pack can print as is his standard. See lib/house-design.ts. */}
      <style dangerouslySetInnerHTML={{ __html: HOUSE_DESIGN_CSS }} />
      {/* Then exactly ONE register overlay. The two disagree about ink — novice
          body copy is near-black on framed paper, elite body copy is grey on
          white — so a page carrying both would take whichever loaded last. */}
      {usesNoviceHouse(design.id) && (
        <style dangerouslySetInnerHTML={{ __html: HOUSE_NOVICE_CSS }} />
      )}
      {usesEliteHouse(design.id) && (
        <style dangerouslySetInnerHTML={{ __html: HOUSE_ELITE_CSS }} />
      )}
      {usesJvHouse(design.id) && (
        <style dangerouslySetInnerHTML={{ __html: HOUSE_JV_CSS }} />
      )}
      {/* ── THE COMPILED TOKEN LAYER ──
          Every custom property the sheets above read is now COMPUTED, by a pure
          function of four inputs: the foundation (meaning — fixed), the register
          (the learner's level), the semester theme (on the Style Kit), and the
          lesson's own accent seed. See lib/design/compile.ts.

          This replaces a hand-written block per design. The audit that motivated
          it counted 100 distinct hardcoded hex values and 157 !important
          declarations across our stylesheets — a hundred unverified local
          decisions, which is what design drift actually is. Compiled tokens
          cannot drift: every colour is derived to a contrast target, and 1360
          generated pairs across every theme × register × lesson are checked at
          compile time.

          It is also why the AI design path is no longer needed. The model was
          never being asked for taste; it was being asked to re-derive these same
          forty numbers from a prose brief, at two calls a pack, with no
          guarantee the result was legible. */}
      <style dangerouslySetInnerHTML={{ __html: compiled.css }} />
      {/* The design's remaining structural tokens, for the skins the compiler
          does not yet cover (dossier, neon, riso, blueprint). The two house
          registers set nothing here, so they take the compiled values whole. */}
      {!usesNoviceHouse(design.id) && !usesEliteHouse(design.id) && !usesJvHouse(design.id) && (
        <style
          dangerouslySetInnerHTML={{
            __html: `.pk-root{${Object.entries(design.vars)
              .map(([k, v]) => `${k}:${v}`)
              .join(";")}}`,
          }}
        />
      )}
      {pack.designCss && designId === resolveDesign(pack.design, pack.gradeBand).id && (
        <style dangerouslySetInnerHTML={{ __html: sanitizeDesignCss(pack.designCss) }} />
      )}

      {/* ── Controls (never printed) ── */}
      <div className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-inkline bg-inkmid px-5 py-3">
        <Link
          href={`/materials/${materialId}`}
          className="text-sm font-bold text-fg3 hover:text-fg1 transition-colors"
        >
          ← Back
        </Link>
        <span className="mx-2 text-xs uppercase tracking-widest text-fg3">
          Pages:
        </span>
        {(["all", "student", "teacher"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
              mode === m
                ? "bg-accent text-ink"
                : "border border-inkline text-fg2 hover:text-fg1"
            }`}
          >
            {m}
          </button>
        ))}
        <button
          onClick={() => setMonoProof((v) => !v)}
          title="Preview exactly what a black-and-white printer will produce"
          className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
            monoProof
              ? "bg-accent text-ink"
              : "border border-inkline text-fg2 hover:text-fg1"
          }`}
        >
          B/W proof
        </button>
        {monoProof && (
          <span
            className={`text-xs font-bold ${lowContrast > 0 ? "text-red-700" : "text-emerald-700"}`}
          >
            {lowContrast > 0
              ? `${lowContrast} auto-corrected for print — outlined`
              : "All text readable in mono"}
          </span>
        )}
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs text-fg3">
          <span className="uppercase tracking-widest">Design</span>
          <select
            value={designId}
            onChange={(e) => setDesignId(e.target.value)}
            className="rounded-md border border-inkline bg-inkcard px-2 py-1.5 text-xs font-bold text-fg1 outline-none focus:border-accent/60"
            title={design.blurb}
          >
            {LESSON_DESIGNS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.emoji} {d.label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={generateDesign}
          disabled={designBusy}
          title={
            designErr ||
            pack.designNote ||
            "Let the AI art-direct this pack — a cohesive look all its own"
          }
          className="rounded-md border border-violet-500/50 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-500/10 disabled:opacity-50 transition-colors"
        >
          {designBusy ? (designStep || "✨ Designing…") : pack.designCss ? "✨ Redesign" : "✨ AI Design"}
        </button>
        <button
          onClick={() => setShowAnswers((v) => !v)}
          className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
            showAnswers
              ? "bg-amber-400 text-ink"
              : "border border-inkline text-fg2 hover:text-fg1"
          }`}
        >
          🔑 {showAnswers ? "Answers ON" : "Answers OFF"}
        </button>
        <DownloadMenu materialId={materialId} showAnswers={showAnswers} />
        <button
          onClick={() => window.print()}
          className="rounded-md bg-sky-700 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-sky-600 transition-colors"
        >
          🖨 Print
        </button>
      </div>

      {overfull.length > 0 && (
        <div className="no-print border-b border-amber-500/40 bg-amber-500/10 px-5 py-2.5 text-xs text-amber-700">
          ⚠️ {overfull.length === 1 ? "Page" : "Pages"}{" "}
          <strong>{overfull.join(", ")}</strong>{" "}
          {overfull.length === 1 ? "runs" : "run"} past the bottom of the sheet
          and will spill onto an extra page when printed — trim that content in
          the Builder, or split it across two activities.
        </div>
      )}

      {/* ── THE LAST RESPONSIBLE MOMENT ──
          Every citation in this pack was drafted by a model, and `verified` is
          set only when a person has opened the source and seen the quotation.
          Until now that fact lived in the editor's Sources panel, which is not
          where anyone is standing when they hand thirty copies to a class — so
          the one screen that could still stop an unchecked citation reaching
          students said nothing about it. This is not a nag: it disappears the
          moment the deck is signed off, and it names the count rather than
          scolding. */}
      {unverifiedCards.length > 0 && (
        <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-amber-500/40 bg-amber-500/10 px-5 py-2.5 text-xs text-amber-700">
          <span>
            <strong>
              {unverifiedCards.length} of {pack.evidenceCards.length} source
              {pack.evidenceCards.length === 1 ? "" : "s"}
            </strong>{" "}
            {unverifiedCards.length === 1 ? "has" : "have"} not been checked
            against the real publication
            {unverifiedCards.length <= 4 && (
              <> — {unverifiedCards.map((c) => c.id || "?").join(", ")}</>
            )}
            . No AI can confirm a quotation exists; a person has to look.
          </span>
          <a
            href={`/materials/${materialId}/edit`}
            className="font-bold underline underline-offset-2"
          >
            Check them
          </a>
        </div>
      )}

      <div
        ref={stackRef}
        className="print-stack flex flex-col items-center gap-10 bg-[#1e293b] py-10 print:bg-white print:py-0 print:gap-0"
      >
        {studentVisible && (
          <CoverPage
            pack={pack}
            kit={kit}
            kitId={kitId}
            canEditKit={canEditKit}
            accent={accent}
            theme={theme}
            design={design}
          />
        )}

        {studentVisible &&
          pack.activities.map((a, i) => (
            <div key={i} className="contents">
              <ActivityPage
                pack={pack}
                kit={kit}
                activity={a}
                accent={accent}
                design={design}
              />
              {i === evidenceAfter &&
                evidencePages.map((cards, j) => (
                  <EvidencePage key={j} pack={pack} kit={kit} cards={cards} pageNo={j + 1} evidenceLabel={def.evidenceLabel} design={design} />
                ))}
            </div>
          ))}

        {studentVisible &&
          evidenceAfter === -1 &&
          evidencePages.map((cards, j) => (
            <EvidencePage key={j} pack={pack} kit={kit} cards={cards} pageNo={j + 1} evidenceLabel={def.evidenceLabel} design={design} />
          ))}

        {teacherVisible && <TeacherGuidePage pack={pack} kit={kit} />}
        {teacherVisible && pack.teacherGuide.launchScripts.length > 0 && (
          <LaunchScriptsPage pack={pack} kit={kit} />
        )}
        {teacherVisible && <AnswerKeyPage pack={pack} kit={kit} />}
      </div>
    </div>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// resolved from the assigned Style Kit on the PrintView root
const displayFont = { fontFamily: "var(--pk-display), sans-serif", letterSpacing: "1px" };
const monoFont = { fontFamily: "var(--pk-mono), monospace" };

/**
 * A fixed A4 sheet. The frame (.print-page) is always the same size; children
 * live in the inner .pk-fit column that the fit pass scales to fit. Every page
 * type renders through this so all sheets are identical A4.
 */
function Sheet({
  style,
  className = "",
  children,
}: {
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`print-page ${className}`} style={style}>
      <div className="pk-fit">{children}</div>
    </div>
  );
}

/** Footer with the auto-incrementing page number (see .print-footer::after). */
function Footer({ text, accent }: { text: string; accent?: string }) {
  return (
    <div
      className="print-footer"
      style={accent ? { borderTopColor: accent, color: accent } : undefined}
    >
      <span className="truncate">{text}</span>
    </div>
  );
}

/**
 * Where a student answers.
 *
 * A real textarea, not a ruled box — his packs are worked on screen as often as
 * they are printed, and a `<textarea>` prints exactly as it looks, so making it
 * fillable costs the paper version nothing. The expected answer rides along in
 * `data-answer` (his `.full-textarea[data-answer]` convention verbatim) and the
 * answer toggle swaps it into the field as red marker ink; see `useAnswerKey`.
 *
 * `defaultValue=""` deliberately: React must not own this value, or every
 * keystroke a student types would be reverted on the next render.
 *
 * Height scales with how much the expected answer suggests they need to write.
 */
function WriteArea({
  expectedAnswer,
  size,
}: {
  expectedAnswer: string;
  size?: "sm" | "md" | "lg";
}) {
  const auto =
    expectedAnswer.length > 220 ? "lg" : expectedAnswer.length > 90 ? "md" : "sm";
  return (
    <textarea
      className={`pk-input write-area write-area-${size ?? auto} pk-input--${size ?? auto}`}
      data-answer={expectedAnswer}
      defaultValue=""
      spellCheck={false}
    />
  );
}

/**
 * Drive the answer key across every fillable field on the sheet.
 *
 * Done against the DOM rather than by threading `showAnswers` through the
 * thirty-odd blocks that render a field: the fields are uncontrolled (a student
 * types in them), so their live text is in the DOM and nowhere else. Turning
 * the key ON parks whatever they wrote in `data-student` and writes the
 * expected answer in; turning it OFF hands their own work back untouched.
 *
 * This is his `toggleAnswers()`, kept in the one place that can guarantee the
 * student's writing survives a toggle in both directions.
 */
function useAnswerKey(
  root: React.RefObject<HTMLDivElement | null>,
  showAnswers: boolean,
  deps: unknown[]
) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const fields = el.querySelectorAll<HTMLTextAreaElement>(".pk-input[data-answer]");
    fields.forEach((f) => {
      if (showAnswers) {
        if (f.dataset.student === undefined) f.dataset.student = f.value;
        f.value = f.dataset.answer ?? "";
        f.readOnly = true;
      } else {
        if (f.dataset.student !== undefined) {
          f.value = f.dataset.student;
          delete f.dataset.student;
        }
        f.readOnly = false;
      }
    });
    // Tick boxes are checkboxes, so the key has to move the checked state too —
    // CSS alone can style a box but cannot tick it.
    el.querySelectorAll<HTMLInputElement>(".pk-mcq-box").forEach((b) => {
      if (showAnswers) {
        if (b.dataset.student === undefined) b.dataset.student = String(b.checked);
        b.checked = b.classList.contains("pk-mcq-box--right");
        b.disabled = true;
      } else {
        if (b.dataset.student !== undefined) {
          b.checked = b.dataset.student === "true";
          delete b.dataset.student;
        }
        b.disabled = false;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAnswers, ...deps]);
}

function HeaderRow({
  title,
  badge,
  badgeColor,
  code,
}: {
  title: string;
  badge: string;
  /** a semantic colour (e.g. side green) overrides the design badge; omit for the design's own badge */
  badgeColor?: string;
  /** the page's stable address ("L1-04"); rendered only where a design shows it */
  code?: string;
}) {
  return (
    <div className="pk-masthead pk-headrule mb-3 flex items-center justify-between gap-3 pb-1.5">
      {/* The colour lives in the stylesheet, NOT here. Inline beats every
          stylesheet, so while it was an inline prop a design system could fill
          the masthead with a band but had no way to lighten the title on it —
          #22 printed a near-black title on a navy band at 1.8:1, on 26 pages. */}
      {/* Always emitted, shown only by registers that want it — a page code is
          navigation furniture, and the novice look has no room for it. */}
      {code && (
        <span className="pk-pagecode shrink-0" style={monoFont}>
          {code}
        </span>
      )}
      <h2 className="pk-title text-3xl">{title}</h2>
      {badge &&
        (badgeColor ? (
          <span
            className="px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white"
            style={{ background: badgeColor, ...monoFont }}
          >
            {badge}
          </span>
        ) : (
          <span
            className="pk-badge pk-ink-auto px-3 py-1 text-[11px] font-bold uppercase tracking-widest"
            style={monoFont}
          >
            {badge}
          </span>
        ))}
    </div>
  );
}

// ── Cover ────────────────────────────────────────────────────────────────────
// Each design gets a fully bespoke cover — its own composition, not a reskin.

type CoverProps = {
  pack: LessonPack;
  kit: StyleKitConfig;
  accent: string;
  theme: SubjectTheme;
  /** the kit row the cover's logo slot writes to */
  kitId: number;
  /** whether this viewer may set the logo from the cover */
  canEditKit: boolean;
};

/**
 * THE COVER'S TEXT BUDGET.
 *
 * A cover is an anchor, not a briefing: the resolution, what today's skill is,
 * and a name to write. Everything else on it is a preview of work that appears
 * again inside the pack.
 *
 * These caps exist because a generated pack does not know that. Its mission
 * runs to a full paragraph and it will happily return six success criteria, and
 * the covers stack those into a CENTRED column — so once the content passed the
 * sheet, it did not push or paginate, it OVERLAPPED. Trimming at the source is
 * the fix, and it belongs here rather than in one cover: all six read from
 * `coverFields`, so the balance is the same wherever the design lands.
 *
 * Nothing is lost — and that is now TRUE rather than merely asserted. This
 * comment used to promise that "every criterion prints in full in the teacher
 * guide"; a grep for `successCriteria` found exactly one use in this file, the
 * cover, so the cap was silently discarding them. They are now genuinely on the
 * teacher-guide page, uncapped, and off the cover entirely.
 */
const COVER_MISSION_WORDS = 26;

/**
 * The two fields that had no cap, and were the two that overflowed.
 *
 * Measured on a real elite pack: the cover carried 1,044 characters and ran 7%
 * past the sheet. The mission and the criteria were capped and behaved; the
 * SKILL FOCUS came back at 131 characters ("Evidence analysis — distinguishing
 * statistical scope from claimed conclusion, and attacking the warrant behind a
 * card") and the SUBTITLE at 261. Both are model-written, neither had a bound,
 * and a title page is the one sheet with no room to absorb a surprise — it is
 * already carrying a glyph, a title, the resolution and a name box.
 *
 * The caps are deliberately tight, because a cover is a title page and not a
 * summary. Nothing is lost: the full skill focus is on the library card and in
 * the teacher guide, and the full subtitle is in the pack's own header.
 */
const COVER_SKILL_WORDS = 10;
const COVER_SUBTITLE_WORDS = 18;

/**
 * The single character that stands for a layer label.
 *
 * "POINT" → P, "EVIDENCE" → E, "Warrant (the because step)" → W. His packs set
 * this big and in the layer's colour beside each row; a whole word there would
 * be a second label competing with the one inside the card.
 */
function layerInitial(label: string): string {
  const first = (label ?? "").trim().match(/[A-Za-z0-9]/);
  return first ? first[0].toUpperCase() : "•";
}

/**
 * Break a cover title into its two tones.
 *
 * His covers set the title across two lines with the second one in the accent
 * ("THE ARGUMENT" / "SANDWICH"), and that single move carries the page. The
 * break has to land somewhere meaningful, so: a colon or a dash is the author's
 * own division and wins; failing that, a title of three words or more breaks
 * before its last word. Two words or fewer stay on one line — "SANDWICH" alone
 * in amber would be a subtitle, not a title.
 */
function splitTitle(title: string): { head: string; tail: string } {
  const t = (title ?? "").trim();
  const punct = t.match(/^(.+?)\s*[:—–-]\s*(.+)$/);
  if (punct) return { head: punct[1].trim(), tail: punct[2].trim() };
  const words = t.split(/\s+/);
  if (words.length < 3) return { head: t, tail: "" };
  return { head: words.slice(0, -1).join(" "), tail: words[words.length - 1] };
}

function coverFields(pack: LessonPack) {
  return {
    num: (pack.lessonCode.replace(/^L/i, "") || "").padStart(2, "0") || "—",
    title: pack.title || "Untitled",
    subtitle: pack.subtitle ? capWords(pack.subtitle, COVER_SUBTITLE_WORDS) : "",
    skill: pack.skillFocus ? capWords(pack.skillFocus, COVER_SKILL_WORDS) : "",
    resolution: pack.resolution || "No resolution set",
    mission: pack.mission ? capWords(pack.mission, COVER_MISSION_WORDS) : "",
    tagline: pack.coverTagline ?? "",
  };
}

/* ── THE COVER ART LAYER ──────────────────────────────────────────────────────
   Why this is a separate, absolutely-positioned layer and not part of the
   composition: a title page has no continuation sheet. Every other page in the
   pack can be re-flowed or scaled by the fit pass; if the cover overflows, the
   content at the bottom is simply gone, because `.print-page` is
   `overflow: hidden`. Decoration is never worth that trade.

   So none of it is laid out. The frame is absolutely positioned on the sheet;
   the seal is absolutely positioned inside a flex spacer that only ever
   consumes space the page already had spare. The fit pass measures `.pk-fit`
   and neither can add a pixel to it, which makes the graphics structurally
   incapable of pushing a cover off the paper rather than merely unlikely to.

   Everything is derived (see lib/cover-art.ts), so it costs no tokens and no
   cover can come back plain. */

/* THE ELITE FRAME — page-level, because it is measured from the trim.
   A double rule inset into the margin and four registration marks: the elite
   cover is meant to be a quiet, institutional page, so it gets ruled geometry
   rather than a motif with any weight. The A4 sheet is 794×1123 at 96dpi and
   the viewBox matches it exactly, so these are page pixels. */
function CoverFrame() {
  return (
    <svg
      className="pk-cvr-art"
      viewBox="0 0 794 1123"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <g
        style={{ color: "var(--pk-accent, #0f766e)" }}
        fill="none"
        stroke="currentColor"
        opacity={0.28}
        strokeWidth={1}
      >
        <rect x={26} y={26} width={742} height={1071} />
        <rect x={32} y={32} width={730} height={1059} opacity={0.5} />
        {[
          [26, 26, 1, 1],
          [768, 26, -1, 1],
          [26, 1097, 1, -1],
          [768, 1097, -1, -1],
        ].map(([x, y, sx, sy], i) => (
          <path key={i} d={`M${x} ${y + sy * 22}V${y}H${x + sx * 22}`} strokeWidth={2.5} />
        ))}
      </g>
    </svg>
  );
}

/* THE SEAL — the numbered motif, and the thing that fills the hole.
   It draws in ITS OWN coordinate space, not the page's, and that is the whole
   trick. It used to be page-positioned at a hard-coded y, which meant the
   anchor had to be guessed against one pack's content height and re-guessed
   whenever the composition moved. Now it is centred inside the lower spacer —
   the void itself — so it re-centres on every pack automatically, however tall
   that pack's title and cards turn out to be, with no coordinate to maintain.

   620 tall so the widest ring (286 radius, 572 across) clears its own box. */
function CoverSeal({ pack, variant }: { pack: LessonPack; variant: "novice" | "elite" }) {
  const motif = coverMotif(pack);
  const seed = coverSeed(pack);
  const numeral = coverNumeral(pack.lessonCode);
  const elite = variant === "elite";

  // The ink. Novice draws in its own accent; elite in the pack accent, which is
  // the same colour its rails already use.
  const ink = elite ? "var(--pk-accent, #0f766e)" : "var(--n-accent, #0f766e)";

  const cx = 397;
  const cy = 310;

  const rot = (seed % 7) - 3; // ±3°, so two adjacent lessons are not congruent

  /* The ring radii start OUTSIDE the numeral and run past the trim on both
     sides. The part that survives in the side gutters is the part the reader
     sees; the rest is clipped by the sheet, which is what stops a centred
     motif from reading as a logo stamped in the middle of the page. */
  const rings = [152, 196, 240, 286];

  return (
    <svg
      className="pk-cvr-seal"
      viewBox="0 0 794 620"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <g style={{ color: ink }} fill="none" stroke="currentColor">
        {motif === "rays" && (
          <g opacity={elite ? 0.09 : 0.13} strokeWidth={elite ? 1.5 : 2.5}>
            {Array.from({ length: 24 }, (_, i) => {
              const a = ((i * 360) / 24 + rot) * (Math.PI / 180);
              const r0 = 150;
              const r1 = r0 + (i % 2 ? 42 : 96);
              return (
                <line
                  key={i}
                  x1={cx + Math.cos(a) * r0}
                  y1={cy + Math.sin(a) * r0}
                  x2={cx + Math.cos(a) * r1}
                  y2={cy + Math.sin(a) * r1}
                  strokeLinecap="round"
                />
              );
            })}
          </g>
        )}

        {motif === "rings" && (
          <g opacity={elite ? 0.1 : 0.14} strokeWidth={elite ? 1.5 : 2.5}>
            {rings.map((r, i) => (
              <circle key={r} cx={cx} cy={cy} r={r} strokeDasharray={i % 2 ? "6 12" : undefined} />
            ))}
          </g>
        )}

        {motif === "grid" && (
          <g opacity={elite ? 0.11 : 0.15} strokeWidth={elite ? 1.5 : 2.5}>
            {Array.from({ length: 44 }, (_, i) => {
              const col = i % 11;
              const row = Math.floor(i / 11);
              const x = 44 + col * 71;
              const y = cy - 168 + row * 112;
              // The crosses clear the numeral's own box rather than colliding
              // with it — the numeral is the object, this is the field it sits in.
              if (Math.abs(x - cx) < 150 && Math.abs(y - cy) < 100) return null;
              return <path key={i} d={`M${x - 7} ${y}H${x + 7}M${x} ${y - 7}V${y + 7}`} />;
            })}
          </g>
        )}

        {motif === "arcs" && (
          <g opacity={elite ? 0.1 : 0.14} strokeWidth={elite ? 1.5 : 2.5}>
            {rings.map((r) => (
              <path
                key={r}
                d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy - r}`}
                strokeLinecap="round"
              />
            ))}
            {rings.map((r) => (
              <path
                key={`b${r}`}
                d={`M${cx + r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy + r}`}
                strokeLinecap="round"
              />
            ))}
          </g>
        )}

        {/* THE GHOSTED NUMERAL, centred inside the motif rather than tucked in a
            corner. Concentric with the rings it makes ONE object — a numbered
            seal filling the void — where a numeral in the corner and a motif in
            the middle would have been two weak ones. */}
        {numeral && (
          <text
            className="pk-cvr-art-num"
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={elite ? 230 : 200}
            fill="currentColor"
            stroke="none"
            opacity={elite ? 0.07 : 0.09}
          >
            {numeral}
          </text>
        )}
      </g>
    </svg>
  );
}

function CoverPage({
  design,
  ...props
}: CoverProps & { design: LessonDesign }) {
  // Two registers, two covers. There is no third — see lib/design/registers.ts.
  return design.cover === "elite" ? <EliteCover {...props} /> : <NoviceCover {...props} />;
}

/* ── Novice — the cover, built from the founder's own L1 title page ──
   Two corrections are baked in here, both from his review.

   FIRST: his covers are LIGHT. I built the first version dark, from L1 of the
   older file; the dark gradient he does still use (theme-matrix) is for
   milestone pages inside a pack — the speed round, the reference card, the
   completion sheet — never for page one.

   SECOND, and the one he actually called: THE COVER IS THE QUIET PAGE. I then
   over-corrected off the L10 cover and gave this one a masthead slab and a
   2/4/6/8px shadow hierarchy, and it came out shouting in four directions. His
   L1 cover has no offset shadows at all: hairline borders, generous radius,
   small tracked mono labels. The heavy 3px-black-on-hard-shadow treatment
   belongs on the inside pages, where a student is hunting for the next thing to
   do. On a title page there is nothing to hunt for, so weight is just noise.

   ONE THING IS LOUD: the title, set across two lines with the second in the
   accent (his "THE ARGUMENT" / "SANDWICH"). Everything else supports it.

   The composition, top to bottom:
     a thin strip under a hairline rule (logo · brand · lesson tag)
     ONE skill pill — it used to print here and again below the title
     the title as the page's hero, two-tone
     the resolution, then a quiet mission strip, then the criteria
     a tabbed DEBATER FILE card with a handwritten name line */
function NoviceCover({ pack, kit, kitId, canEditKit, theme }: CoverProps) {
  const f = coverFields(pack);
  return (
    <div className="pk-cover pk-cover--novice print-page">
      {/* ── THE COVER GOES THROUGH THE FIT PASS LIKE EVERY OTHER SHEET ──
          It did not, and it was the only page in the pack that did not: the
          fitter selects `.pk-fit`, and the cover had no such wrapper. So the one
          sheet that can never be re-flowed — a title page has no continuation —
          was also the one sheet nothing could measure or rescue, and an
          over-long title, resolution or subtitle simply printed off the paper.
          Measured on a real elite pack at 1.07 of the sheet.
          `.pk-fit` is already `flex-direction: column; min-height: 100%`, which
          is exactly the layout this cover relies on, so the `mt-auto` name box
          still sits on the bottom edge. */}
      <div className="pk-fit">
      {/* THE MASTHEAD BAR. His cover opens with a white slab, not a hairline
          kicker — 4px black border on a 4px offset shadow, holding the mark, the
          wordmark and the lesson tag. It is the single strongest object at the
          top of the sheet and it sets the whole pack's register. */}
      {/* THE MASTHEAD SLAB — white, 4px black, on a 4px offset. */}
      <div className="pk-cvr-bar">
        <div className="flex min-w-0 items-center gap-3">
          <CoverLogo
            kitId={kitId}
            brand={kit.brand}
            logoDataUrl={kit.logoDataUrl}
            canEdit={canEditKit}
            className="pk-cvr-logo"
          />
          {pack.coverIcon && <span className="pk-cvr-bar-icon">{pack.coverIcon}</span>}
          <span className="pk-cvr-brand truncate" style={displayFont}>
            {kit.brand}
          </span>
        </div>
        <span className="pk-cvr-lesson shrink-0" style={monoFont}>
          LESSON {f.num}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center text-center">
        {/* ── WHERE THE SLACK GOES ────────────────────────────────────────
            The composition used to hang off the masthead: content stacked
            from the top, the name card pinned to the bottom by `mt-auto`,
            and every spare pixel — 300 of them on a typical pack — dumped
            into one hole underneath. The page read top-heavy because it was.

            Two spacers split that slack 1:2 instead. The content drops by a
            third of whatever is going spare, and the remaining two thirds
            stay as the void the seal sits in. Both are `flex-grow` on a
            zero-height box, which is the property that matters: they can
            only ever consume space the sheet ALREADY had. On a full cover
            they collapse to nothing and the layout is exactly what it was,
            so this cannot be the reason a title page overflows. */}
        <div className="pk-cvr-space" aria-hidden="true" />

        {/* The editorial line, then the topical glyph at 70px on a hard drop
            shadow — the two devices that make lesson 7 and lesson 8 different
            objects rather than the same template with the words swapped.

            THE GLYPH IS NO LONGER GATED ON THE MODEL. It was `{pack.coverIcon
            && …}`, and on a pack where the field came back empty the cover lost
            its only picture and printed as stacked text blocks on ruled paper.
            `coverGlyph` prefers the authored icon and derives a topical one
            when there isn't one, so the slot is always filled. */}
        {f.tagline && <div className="pk-cvr-tagline">{f.tagline}</div>}
        <div className="pk-cvr-hero">
          <span>{coverGlyph(pack)}</span>
        </div>

        {/* One line, with a word carried in the accent. */}
        <h1 className="pk-cover-title" style={displayFont}>
          {(() => {
            const { head, tail } = splitTitle(f.title);
            return tail ? (
              <>
                {head} <span className="pk-cvr-title-accent">{tail}</span>
              </>
            ) : (
              head
            );
          })()}
        </h1>

        {/* The skill badge: black, rotated two degrees, on an ACCENT-coloured
            offset. Printed once — it used to appear here AND as a pill above. */}
        {f.skill && (
          <div className="pk-cvr-skill" style={displayFont}>
            Skill focus: {f.skill}
          </div>
        )}

        {/* THE TWO DEEP CARDS. His cover gives the resolution and the objective
            the same 8px offset, because on a title page those are the two things
            that matter and they matter equally: what we are arguing about, and
            what you will be able to do by the end. Both set in serif — the only
            serif in the pack — so they read as statements, not labels. */}
        <div className="pk-cover-anchor">
          <h3 className="pk-bigq-label" style={displayFont}>Mission resolution</h3>
          <p className="pk-cvr-res">{f.resolution}</p>
        </div>

        {f.mission && (
          <div className="pk-cvr-objective">
            <h3 className="pk-cvr-objective-label" style={displayFont}>The objective</h3>
            <p className="pk-cvr-objective-text">{f.mission}</p>
          </div>
        )}

        {/* ── THE CRITERIA ARE NOT ON THE COVER ──
            A title page has one job: say what this lesson is, in the two
            seconds someone looks at it. It was carrying seven text blocks —
            skill focus, title, subtitle, resolution, objective, four criteria
            and a name card — measured at 1,044 characters and 7% past the
            sheet, and the criteria alone were 341 of those characters and
            200px of the height. Four of those blocks are the same statement at
            four levels of detail, so the page said one thing four times and had
            no room left to say it well.
            They now print IN FULL and uncapped on the teacher guide, which is
            where a coach reads the plan and where a comment in this file has
            always claimed they were. The cover keeps what a reader actually
            needs on it: the mark, the glyph, the title, the resolution, the
            mission and somewhere to write their name. */}

        {/* The void, and the seal centred in it. The spacer IS the hole, so
            the art needs no page coordinate — it follows the composition. */}
        <div className="pk-cvr-space pk-cvr-space--seal" aria-hidden="true">
          <CoverSeal pack={pack} variant="novice" />
        </div>

        <div className="pk-cover-name w-full max-w-md">
          <div className="pk-cvr-tab" style={displayFont}>Classified debater file</div>
          <div className="pk-cvr-namecard">
            <label className="pk-cover-name-label" style={monoFont}>
              Agent name
            </label>
            <input type="text" className="pk-cvr-nameline" aria-label="Agent name" />
            <div className="pk-cvr-fields" style={monoFont}>
              <span>
                Side: <span style={{ color: kit.palette.grassGreen }}>Pro</span> /{" "}
                <span style={{ color: kit.palette.brickRed }}>Con</span>
              </span>
              <span>{theme.trackLabel}</span>
            </div>
          </div>
        </div>
      </div>
      <Footer text={kit.footerText} />
      </div>
    </div>
  );
}

/* ── Elite — the senior cover, from war_powers_lesson4_masterclass_v10.html ──
   The magazine cover this replaces for the 9–12 band was the least serious thing
   in the elite pack: a coloured band across the top and the lesson number set at
   5rem. His actual senior cover is institutional rather than editorial — centred,
   symmetrical, quiet, and it spends its only two colours on RAILS: gold down the
   resolution, the accent down the objective. Nothing is rotated, nothing is
   offset, there is no glyph and no handwriting.

   Almost all of the styling arrives from HOUSE_DESIGN_CSS, whose `.pk-cover`
   rules were measured off this exact page (48mm logo frame, 52px title, 17px
   subtitle, gold-railed hero box). This component's job is to emit those hooks
   in his order and otherwise stay out of the way. */
function EliteCover({ pack, kit, kitId, canEditKit, theme }: CoverProps) {
  const f = coverFields(pack);
  return (
    <div className="pk-cover print-page">
      <CoverFrame />
      {/* Same fit wrapper as the novice cover — see the note there. */}
      <div className="pk-fit">
      <div className="pk-cover-kicker flex items-center justify-between" style={monoFont}>
        <span>{kit.brand} · {theme.trackLabel}</span>
        <span>{kit.seriesLabel} · Lesson {f.num}</span>
      </div>

      {/* `justify-center` is gone: it centred the whole column as one block,
          which left no gap the seal could occupy and no way to weight the
          slack. The 1:2 spacers below do the same job with control — see the
          note on the novice cover. */}
      <div className="flex flex-1 flex-col items-center text-center">
        <div className="pk-cvr-space" aria-hidden="true" />
        <CoverLogo
          kitId={kitId}
          brand={kit.brand}
          logoDataUrl={kit.logoDataUrl}
          canEdit={canEditKit}
          fallback={pack.lessonCode}
        />

        {f.skill && (
          <div className="pk-cover-skill" style={monoFont}>
            Skill focus · {f.skill}
          </div>
        )}
        <h1 className="pk-cover-title" style={displayFont}>{f.title}</h1>
        {f.subtitle && <p className="pk-cover-subtitle">{f.subtitle}</p>}

        {/* The gold rail is reserved, here as everywhere in his packs, for the
            single most important thing on the sheet. */}
        <div className="pk-cover-anchor">
          <div className="pk-bigq-label" style={monoFont}>Resolution</div>
          <p className="pk-cover-anchor-text pk-ink-auto">{f.resolution}</p>
        </div>

        {f.mission && (
          <div className="pk-cover-focus">
            <div className="pk-cover-focus-label" style={monoFont}>The objective</div>
            <p className="pk-cover-focus-text">{f.mission}</p>
          </div>
        )}

        {/* Off the cover for the same reason as the novice one above — they
            print in full on the teacher guide. */}

        <div className="pk-cvr-space pk-cvr-space--seal" aria-hidden="true">
          <CoverSeal pack={pack} variant="elite" />
        </div>

        <div className="pk-cover-name">
          <div className="grid flex-1 grid-cols-2 gap-8 text-left">
            <div>
              <div className="pk-cover-name-label" style={monoFont}>Name</div>
              <div className="pk-cover-rule" />
            </div>
            <div>
              <div className="pk-cover-name-label" style={monoFont}>Side / Division</div>
              <div className="pk-cover-rule" />
            </div>
          </div>
        </div>
      </div>
      <Footer text={kit.footerText} />
      </div>
    </div>
  );
}

// ── Scene block — the visual, low-text replacement for prose ─────────────────

/**
 * The printed order of a word bank: real words and dummies mixed together,
 * deterministically.
 *
 * Two rules from the founder's own spec, and both matter. The dummies are
 * printed indistinguishably from the real words — a bank that lists them last
 * is a bank with two words crossed out. And the order must not be alphabetical
 * or the order the blanks appear in, or a student can fill the page by position
 * without reading a single term.
 *
 * Deterministic (hashed by word) rather than random so the same pack prints the
 * same sheet twice — a teacher who photocopies page 7 on Tuesday and page 7
 * again on Friday must get the same paper.
 */
function scrambleBank(bank?: { words?: string[]; distractors?: string[] }): string[] {
  const all = [...(bank?.words ?? []), ...(bank?.distractors ?? [])].filter((w) =>
    w?.trim()
  );
  return all
    .map((w) => {
      let h = 0;
      for (let i = 0; i < w.length; i++) h = (Math.imul(31, h) + w.charCodeAt(i)) | 0;
      return { w, k: h >>> 0 };
    })
    .sort((a, b) => a.k - b.k)
    .map(({ w }) => w);
}

/**
 * Which family a page belongs to, for the masthead band.
 *
 * His pages change colour by what the page IS — student navy-to-blue, teacher
 * green, extension violet — and ours ran one band across all fourteen, which is
 * what made a printed pack read as the same sheet over and over. Four student
 * families plus teacher: learn (meet the idea), practise (work it), produce
 * (make something), assess (prove it). The band is the ONLY thing that changes;
 * the semantic code inside the page — blue Pro, red Con, green teacher, gold
 * matters-most — is identical on every sheet, because that one has to be
 * learned once and trusted everywhere.
 */
function pageFamily(kind: string): string {
  if (["hook", "review", "topic-intel", "vocabulary", "i-do"].includes(kind))
    return "pk-page--learn";
  if (["we-do", "drill", "evidence-study", "bridge"].includes(kind))
    return "pk-page--practise";
  if (["scaffolded-build", "independent-build", "remix", "custom"].includes(kind))
    return "pk-page--produce";
  return "pk-page--assess"; // sparring, exit-ticket
}

/** Keep at most `n` words; the hard backstop against a legacy prose wall. */
function capWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= n ? text : words.slice(0, n).join(" ") + "…";
}

/**
 * A speaker's marker — emoji-free, print-first: the initial of the speaker (or
 * a role letter) in a token-styled disc, so the shared design system can restyle
 * every avatar at once. Judge → "J", otherwise the first letter of the speaker
 * or the side.
 */
function sceneAvatar(speaker: string, side: string): string {
  if (/judge|referee|umpire|ref\b/i.test(speaker)) return "J";
  const src = (speaker || side || "•").trim();
  const letter = src.charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(letter) ? letter : side === "pro" ? "P" : side === "con" ? "C" : "•";
}

/**
 * Draws a scene. Young grades (playful) get speech bubbles with avatars; older
 * grades get the same beats as sober, clean quote cards — engaging without being
 * childish. Either way it's a picture of the idea, not a paragraph.
 */
function SceneBlock({
  scene,
  accent,
  playful,
}: {
  scene: Scene;
  accent: string;
  playful: boolean;
}) {
  const bodySize = "var(--pk-text, 12px)";
  const turns = scene.turns;
  const duel = turns.length === 2;

  if (playful) {
    return (
      <div
        className="pk-scene avoid-break mb-3 overflow-hidden rounded-2xl bg-white"
      >
        {scene.setup && (
          <div
            className="pk-scene-setup pk-ink-auto px-4 py-2 font-bold leading-snug"
          >
            {scene.setup}
          </div>
        )}
        <div className="flex flex-col gap-3 p-4">
          {turns.length > 0 && (
            <div className={duel ? "grid grid-cols-2 gap-3" : "flex flex-col gap-2.5"}>
              {turns.map((t, i) => (
                <div key={i} className={`pk-turn pk-turn--${t.side} ${duel ? "flex flex-col items-center gap-1.5 text-center" : "flex items-start gap-2.5"}`}>
                  <div
                    className="pk-avatar grid shrink-0 place-items-center rounded-full font-black"
                  >
                    {sceneAvatar(t.speaker, t.side)}
                  </div>
                  <div className={duel ? "w-full" : "flex-1"}>
                    <span
                      className="pk-turn-label pk-ink-auto mb-1 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide"
                    >
                      {t.speaker || t.side}
                    </span>
                    <div
                      className="pk-bubble rounded-xl px-3 py-2 font-bold leading-snug"
                    >
                      “{t.line}”
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {scene.twist && (
            <div
              className="pk-twist flex items-center gap-3 rounded-xl px-3.5 py-2.5"
            >
              <p className="pk-twist-text font-black leading-snug">{scene.twist}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Sober treatment for older grades — clean quote cards, no avatars/emoji.
  return (
    <div className="avoid-break mb-3 flex flex-col gap-2.5">
      {scene.setup && (
        <p className="pk-scene-setup-plain pk-muted leading-snug" style={{ fontSize: bodySize }}>{scene.setup}</p>
      )}
      {turns.map((t, i) => (
        <div
          key={i}
          className={`pk-turn pk-turn--plain pk-turn--${t.side} rounded-lg bg-white px-4 py-2.5`}
        >
          <div className="pk-turn-label text-[10px] font-bold uppercase tracking-widest">
            {t.speaker || t.side}
          </div>
          <p className="mt-0.5 leading-snug text-gray-800" style={{ fontSize: bodySize }}>{t.line}</p>
        </div>
      ))}
      {scene.twist && (
        <div
          className="rounded-lg px-4 py-3"
          style={{ border: `1.5px solid ${accent}`, background: `color-mix(in srgb, ${accent} 5%, white)` }}
        >
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>The point</div>
          <p className="mt-0.5 font-semibold leading-snug" style={{ fontSize: "var(--pk-lead, 13px)" }}>{scene.twist}</p>
        </div>
      )}
    </div>
  );
}

/** Ordered process shown as numbered chips — e.g. a 4-step move. */
function StepsBlock({ steps }: { steps: { text: string; detail: string }[] }) {
  return (
    <div className="avoid-break mb-3 flex flex-col gap-2">
      {steps.map((s, i) => (
        <div
          key={i}
          className="pk-step flex items-center gap-3 rounded-xl bg-white px-3 py-2"
        >
          <span className="pk-step-num pk-ink-auto grid shrink-0 place-items-center rounded-full font-black">
            {i + 1}
          </span>
          <div className="pk-step-text">
            <span className="font-bold">{s.text}</span>
            {s.detail && <span className="pk-step-detail pk-muted"> — {s.detail}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Side-by-side comparison — two labeled columns of short paired rows. */
function CompareBlock({
  compare,
}: {
  compare: { leftLabel: string; rightLabel: string; rows: { left: string; right: string }[] };
}) {
  // colour comes from `.pk-compare--left/--right` in the component stylesheet
  const cols = [
    { lab: compare.leftLabel || "THIS", pick: (r: { left: string; right: string }) => r.left },
    { lab: compare.rightLabel || "THAT", pick: (r: { left: string; right: string }) => r.right },
  ];
  return (
    <div className="avoid-break mb-3 grid grid-cols-2 gap-3">
      {cols.map((col, ci) => (
        <div
          key={ci}
          className={`pk-compare pk-compare--${ci === 0 ? "left" : "right"} overflow-hidden rounded-2xl bg-white`}
        >
          <div className="pk-compare-head pk-ink-auto px-3 py-1.5 text-center font-black uppercase tracking-wide">
            {col.lab}
          </div>
          <div className="flex flex-col gap-1.5 p-3">
            {compare.rows.map((r, ri) => (
              <p key={ri} className="pk-compare-row leading-snug">
                {col.pick(r)}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Big-number highlights — a striking figure with a short label. */
function CalloutsBlock({ callouts }: { callouts: { value: string; label: string }[] }) {
  return (
    <div
      className="avoid-break mb-3 grid gap-3"
      style={{ gridTemplateColumns: `repeat(${Math.min(callouts.length, 3) || 1}, 1fr)` }}
    >
      {callouts.map((c, i) => (
        <div
          key={i}
          className="pk-callout rounded-2xl bg-white px-3 py-4 text-center"
        >
          <div className="pk-callout-value font-black leading-none">
            {c.value}
          </div>
          <div className="pk-callout-label mt-1.5 font-bold text-gray-600">
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Student activity page ────────────────────────────────────────────────────

/** One composable block of a student page, with its estimated printed height. */
type PBlock = { key: string; est: number; node: React.ReactNode };

/**
 * Spread blocks over as many A4 sheets as they need. A page that holds three
 * pages' worth of content used to be squashed to ~50% by the fit pass (real
 * result: a vocabulary page at 0.54 and a case-file at 0.52 — unreadable for the
 * ELL 8th-graders these are written for). Now it simply becomes two or three
 * sheets. Estimates are calibrated against measured renders; the runtime fit
 * pass stays on as a safety net for whatever the estimate misses.
 */
// A4 minus frame padding, masthead and footer. Raised from 955 when the page
// margins moved to the academy's own 8mm/12mm/5mm: the usable column measured
// 1029px before and 1069px after, so the old budget was leaving ~40px of every
// sheet unusable and paying for it in extra sheets. The runtime ceiling is
// (usable − 6) / 0.85 ≈ 1250px, so 1000 keeps a wide margin over the floor.
const PAGE_CONTENT_BUDGET = 1000;

/**
 * How far the runtime fit pass may shrink a sheet before text stops being
 * comfortable. Must match FLOOR in the fit effect — a page is only ever
 * *allowed* to hold more than the budget because that pass will scale it down.
 */
const SHRINK_FLOOR = 0.85;

/**
 * The absolute smallest a sheet may be scaled, used only to avoid CLIPPING.
 *
 * .print-page is overflow:hidden, so a page still over at SHRINK_FLOOR does not
 * print small — it prints with its bottom missing. 0.72 of the 10pt body floor
 * is about 7.2pt: tight, still legible, and unambiguously better than a
 * worksheet whose last prompt has no answer line. Any page that reaches this is
 * flagged, because the real fix is to cut its content.
 *
 * WHY 0.72 AND NOT 0.78. Measured on a real pack: the elite "Full Autopsy"
 * sheet carries a 402px chain block, a 341px block and a ballot into a 1092px
 * column, and at 0.78 it was still 3% over — so it printed clipped. The floor
 * was set where legibility gets uncomfortable, but that is the wrong thing to
 * optimise at this rung: by the time a page is here the choice is not "small
 * type or comfortable type", it is "small type or missing content". Six points
 * of extra headroom cost about half a point of type on the rare page that
 * needs it, and buy back the bottom of the sheet. The flag still fires, so the
 * author is still told the page wants cutting.
 */
const CLIP_RESCUE_FLOOR = 0.72;

/**
 * How much OVER the comfortable budget a sheet may be packed.
 *
 * This is the packer's tolerance for its own estimate error. It is NOT
 * `1 / SHRINK_FLOOR` (1.176): filling to what the fit pass can rescue means
 * every sheet is pre-committed to maximum shrink, so the safety net is spent
 * before the page renders and the first low `est` clips.
 *
 * CALIBRATED, not chosen — the two failure modes pull in opposite directions and
 * this is the last value that avoids the worse one. Measured over two real packs:
 *
 *   slack   clipped pages          sheets   sparse (>25% white)
 *   1.05    0                      32 / 38  20 / 20
 *   1.08    0                      31 / 37  10 / 17
 *   1.12    1  ← content lost      29 / 32   7 /  8
 *
 * Looser packs sheets fuller and splits less (less white space), but overruns
 * the floor and starts clipping. Tighter never clips but splits more, and a
 * split prints as two part-empty sheets. Clipped content is the unrecoverable
 * failure, so this sits at the top of the safe range.
 *
 * The real fix for the remaining white space is to stop estimating: measure the
 * rendered blocks and re-flow from that. Then the slack question disappears.
 */
const PACK_SLACK = 1.08;

/**
 * How many evidence cards fit on one sheet — by SIZE, not by counting to two.
 *
 * The deck used to be `chunk(cards, 2)`. That was right when a card was an id,
 * an institution and a paraphrase; it stopped being right when a card grew a
 * verbatim quote, its attribution, a named event and a "Judge, …" round
 * application. Measured on a real pack, two cards came to 1076px against a
 * 1066px column — every deck sheet in the library was overflowing by a hair and
 * being rescued to 0.85, which is the whole deck printing 15% small.
 *
 * Cards are wildly uneven (501px and 575px on the same sheet), so the fix is to
 * measure them rather than count them. The estimate is deliberately crude — a
 * base for the chrome every card carries, plus a line-count guess for each prose
 * field — because it only has to be good enough to decide "does the next one
 * still fit"; the runtime fit pass corrects the remainder.
 */
function estimateCardHeight(c: LessonPack["evidenceCards"][number]): number {
  // ~64 chars a line at the card's measure, ~15px a line. CHROME is the card's
  // own fixed furniture: the id/side/institution header, its rules, padding and
  // the LIMIT bar.
  //
  // Calibrated against measured renders, and deliberately NOT rounded up "to be
  // safe": over-estimating here is not the harmless direction. A card that
  // measures 427px and is estimated at 480 pushes its partner onto a sheet of
  // its own, and a deck of six then prints as six half-empty pages. Estimates
  // that ran ~11% high did exactly that. Under-estimating is the cheaper error,
  // because the runtime fit pass absorbs it.
  const lines = (s: string | undefined, perLine = 64) =>
    Math.ceil((s?.trim().length ?? 0) / perLine);
  const CHROME = 120;
  return (
    CHROME +
    15 *
      (lines(c.paraphrase) +
        lines(c.translation) +
        lines(c.tacticalNote) +
        lines(c.limit) +
        lines(c.quote) +
        lines(c.roundApplication) +
        lines(c.event, 40) +
        lines(c.quoteAttribution, 40))
  );
}

/**
 * The deck's sheet budget: the real usable column minus the evidence page's own
 * masthead, intro line and footer (measured at ~147px together).
 *
 * NOT `PAGE_CONTENT_BUDGET - chrome`. That budget is already a conservative
 * reading of the ~1066px column, so subtracting chrome from it discounts twice
 * and cost roughly a card per sheet.
 */
const EVIDENCE_CARD_BUDGET = 910;

function packEvidenceCards(
  cards: LessonPack["evidenceCards"]
): LessonPack["evidenceCards"][] {
  if (cards.length === 0) return [];
  const packed = packIntoPages(
    cards.map((c) => ({ card: c, est: estimateCardHeight(c) })),
    EVIDENCE_CARD_BUDGET
  );
  return packed.map((page) => page.map((b) => b.card));
}

/**
 * Lay blocks out over as few sheets as possible, and BALANCE what's left over.
 *
 * The old version was plain first-fit: cram sheet one to the brim, dump the
 * remainder on sheet two. That produced the thing this was reported for — a
 * packed page followed by a nearly-blank "(cont.)" page holding one prompt.
 * Two problems, both fixed here:
 *
 *  1. IT SPLIT TOO EAGERLY. Overflowing the budget by any amount started a new
 *     sheet, even though the fit pass can shrink a page to 85% and absorb it.
 *     Anything up to `budget / SHRINK_FLOOR` now stays on ONE sheet — which is
 *     where most continuation pages were coming from, since content that
 *     overshoots by a little is far more common than content that doubles.
 *
 *  2. WHEN A SPLIT IS GENUINELY NEEDED, IT WAS LOPSIDED. Now the sheet count is
 *     decided first, then blocks are spread toward an even share of the total,
 *     so 1.2 pages of content prints as two half-full sheets rather than one
 *     full and one almost empty. Same number of sheets, both readable.
 *
 * A single block taller than a whole sheet still gets its own page and is left
 * to the fit pass, which is the only thing that can rescue it.
 */
function packIntoPages<T extends { est: number }>(
  blocks: T[],
  budget = PAGE_CONTENT_BUDGET
): T[][] {
  if (blocks.length === 0) return [[]];

  const total = blocks.reduce((n, b) => n + b.est, 0);

  // `budget` is the COMFORTABLE height; `ceiling` is what a sheet is allowed to
  // carry. Both the sheet count and the per-sheet cap have to use the same
  // number — computing the count from `budget` while capping fill at `budget`
  // looks consistent but isn't: block granularity means a sheet rarely reaches
  // the cap exactly, so the arithmetic promised N sheets and the loop needed
  // N+1, leaving a runt. (Caught by the packer's own test: 19 blocks of 100
  // gave [900, 900, 100].)
  //
  // The ceiling used to be `budget / SHRINK_FLOOR` — the packer filled every
  // sheet to the most the fit pass could ever rescue. That spent the safety net
  // in advance: a sheet arrived at the renderer already needing ~0.90, so the
  // moment an `est` ran low there was nothing left and the page visibly spilled.
  // Measured on a real pack, that put 16 of 27 pages under the scaler and 5 of
  // them at the floor. `est` values are estimates over AI-written prose, so
  // they will always run low sometimes; the fix is to leave them room. A modest
  // slack keeps sheet counts about the same while letting a correct estimate
  // print at 100% and reserving the whole 0.85 floor for the ones that miss.
  const ceiling = budget * PACK_SLACK;

  // Everything the fit pass can absorb stays on one sheet.
  if (total <= ceiling) return [blocks];

  // Fewest sheets that can physically hold it, then an equal share on each.
  const sheets = Math.max(2, Math.ceil(total / ceiling));
  const target = total / sheets;

  const pages: T[][] = [];
  let cur: T[] = [];
  let used = 0;

  blocks.forEach((b, i) => {
    const remaining = blocks.length - i;
    // Never open a sheet we can't fill: leave at least one block for each of
    // the sheets still to come.
    const sheetsLeft = sheets - pages.length;
    const mustKeepGoing = remaining <= sheetsLeft - 1;

    const wouldOverflow = used + b.est > ceiling;
    const pastFairShare = used >= target;

    if (cur.length > 0 && !mustKeepGoing && (wouldOverflow || pastFairShare)) {
      pages.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(b);
    used += b.est;
  });

  if (cur.length > 0) pages.push(cur);
  return pages;
}

/** Estimated height of a dialogue scene block. */
function sceneEst(s: Scene): number {
  return 30 + (s.setup ? 34 : 0) + s.turns.length * 52 + (s.twist ? 52 : 0);
}

function ActivityPage({
  pack,
  kit,
  activity,
  accent,
  design,
}: {
  pack: LessonPack;
  kit: StyleKitConfig;
  activity: Activity;
  accent: string;
  design: LessonDesign;
}) {
  // Side colour is no longer resolved here: a `pk-*--pro/con/neutral` class sets
  // --pk-side and the component stylesheet reads it, so the design system can
  // recolour every bubble, prompt and tag by redefining one token.
  const playful = design.id === "playground";
  const scene = activity.scene;
  const hasScene = !!scene && (scene.turns.length > 0 || !!scene.setup || !!scene.twist);

  /* A page's stored `activity.designHtml` is NO LONGER RENDERED. Two packs still
     carry one from before the per-page path was retired, and the field is kept
     so their data survives a round-trip through the schema — but a static HTML
     page cannot answer the student/teacher toggle, the answer key, the fillable
     flow grid or the echo checkboxes, so rendering it would silently drop the
     interactive half of the sheet. Every page now renders through the templated
     blocks below on the house standard. */

  const blocks: PBlock[] = [];
  const push = (key: string, est: number, node: React.ReactNode) =>
    blocks.push({ key, est, node });

  if (activity.instructions)
    push(
      "instructions",
      82,
        <div
          className="pk-instructions avoid-break mb-3 flex items-start gap-2 rounded-xl px-3 py-2 font-semibold leading-snug"
          style={{
            background: "color-mix(in srgb, var(--kit-accent, #2563eb) 10%, white)",
            color: "var(--pk-ink)",
            fontSize: "var(--pk-lead, 13px)",
          }}
        >
          <span>{activity.instructions}</span>
        </div>
      );

  /* WHICH TOPIC THIS PAGE RUNS ON — see `practiceTopic` on the pack.
     A page teaching the skill on the easy topic must SAY so, or a student
     reasonably assumes every page is about the resolution on the cover and
     writes about the wrong thing. And the handover — the first anchor page
     after the practice pages — is the pedagogical moment of the whole
     architecture, so it is marked rather than left to be inferred. Both bands
     are derived from data already on the pack; neither is authored. */
  if (pack.practiceTopic?.trim()) {
    const idx = pack.activities.indexOf(activity);
    const lastPractice = pack.activities.reduce(
      (last, a, i) => (a.runsOn === "practice" ? i : last),
      -1
    );
    if (activity.runsOn === "practice")
      push(
        "topic-band",
        44,
        <div className="pk-topicband pk-topicband--practice avoid-break mb-3 rounded-lg px-3 py-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest" style={monoFont}>
            Practice topic
          </p>
          <p className="text-[11px] font-semibold leading-snug">{pack.practiceTopic}</p>
        </div>
      );
    else if (lastPractice >= 0 && idx === lastPractice + 1)
      push(
        "topic-band",
        48,
        <div className="pk-topicband pk-topicband--handover avoid-break mb-3 rounded-lg px-3 py-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest" style={monoFont}>
            Same skill, real topic from here
          </p>
          <p className="text-[11px] font-semibold leading-snug">{pack.resolution}</p>
        </div>
      );
  }

  /* WHY THIS PAGE EXISTS — student-facing, see the schema.
     Pushed immediately after the instruction banner so it lands on the FIRST
     sheet when a long page packs into two: the reason to care is worthless on
     the continuation sheet, which a student reaches only after deciding to
     carry on. Deliberately quiet — a hairline rail and small caps, not another
     tinted banner competing with the instruction above it. */
  if (activity.whyItMatters)
    push(
      "why",
      46,
      <div className="pk-why avoid-break mb-3 border-l-2 pl-2.5">
        <p
          className="pk-why-label text-[10px] font-black uppercase tracking-widest"
          style={monoFont}
        >
          Why this page
        </p>
        <p className="pk-why-text text-[11px] leading-snug">{activity.whyItMatters}</p>
      </div>
    );

  if (hasScene)
    push(
      "scene",
      sceneEst(scene!),
      <SceneBlock scene={scene!} accent={accent} playful={playful} />
    );
  else if (activity.body)
    push(
      "body",
      120,
      // Legacy prose only — hard-capped so an old pack can never show a wall.
      <div
        className="avoid-break mb-3 pk-box pk-box--pad bg-white leading-relaxed"
      >
        {capWords(activity.body, 45)}
      </div>
    );

  if (activity.callouts.length > 0)
    push("callouts", 92, <CalloutsBlock callouts={activity.callouts} />);

  if (activity.steps.length > 0)
    push(
      "steps",
      26 + activity.steps.length * 40,
      <StepsBlock steps={activity.steps} />
    );

  if (activity.compare && activity.compare.rows.length > 0)
    push(
      "compare",
      44 + activity.compare.rows.length * 34,
      <CompareBlock compare={activity.compare} />
    );

  if (activity.exampleLayers.length > 0) {
    // Each layer is coloured by WHAT IT IS, not by the pack's accent — see
    // lib/argument-layers.ts. Classified as a sequence, because a PEEL model
    // labels its rows "P E E L" and only the order says which E is which.
    const layers = classifyLayers(activity.exampleLayers.map((l) => l.label));

    /* THE LAYER STRIP — his `matrix-card step-*` band (hub L10, page 4).
       When a block really is an argument model, the layers get shown as a SHAPE
       first: five cards across, one per layer, in the layer colours. A student
       sees the whole argument at once before reading a word of the model
       underneath it, and the strip is what makes the colour code learnable —
       it is the legend, printed on the page that needs it.

       Only when the classifier engaged (see classifyLayers): a strip built from
       "STEP 1 / STEP 2 / STEP 3" would be teaching a process as if it were an
       argument. */
    if (layers.some((l) => l !== "none")) {
      push(
        "layer-strip",
        58,
        <div
          className="pk-layer-strip avoid-break mb-3"
          style={{ ["--layer-cols" as string]: String(activity.exampleLayers.length) }}
        >
          {activity.exampleLayers.map((l, i) => (
            <div key={i} className={`pk-layer-cell pk-layer-cell--${layers[i]}`}>
              <div className="pk-layer-cell-name">{l.label}</div>
              {l.note && <p className="pk-layer-cell-hint">{capWords(l.note, 7)}</p>}
            </div>
          ))}
        </div>
      );
    }

    push(
      "example",
      /* 52 per layer, plus 15 for any layer carrying a pass condition — that
         line is a rule, a small-caps label and a wrapped sentence, and leaving
         it out of the estimate is how a four-layer model silently overshoots
         its sheet by ~60px and lands on the shrink floor. */
      34 +
        activity.exampleLayers.length * 52 +
        activity.exampleLayers.filter((l) => l.passesWhen?.trim()).length * 15,
        <div className="avoid-break mb-3 overflow-hidden pk-box">
          <div className="pk-section-label pk-bar px-3 py-1 text-[11px] font-bold tracking-widest">
            WORKED EXAMPLE — STUDY EVERY LAYER
          </div>
          <div className="flex flex-col bg-white">
            {/* HIS `peel-row`: a big layer INITIAL in the layer's own colour,
                then a tinted card carrying the model text. The initial does the
                work a full-width grey label chip was doing badly — it is bigger,
                takes a quarter of the width, and a student reading four rows
                sees P / E / E / L down the left edge in four colours, which is
                the structure of the argument drawn rather than described. */}
            {activity.exampleLayers.map((l, i) => (
              <div
                key={i}
                className={`pk-layer pk-layer--${layers[i]} flex items-start gap-2.5 px-2.5 py-2`}
              >
                <div
                  className="pk-layer-initial shrink-0"
                  style={layers[i] === "none" ? { color: accent, ...displayFont } : displayFont}
                >
                  {layerInitial(l.label)}
                </div>
                <div className="pk-layer-card flex-1">
                  <span className="pk-layer-name">{l.label}</span>
                  <p className="pk-layer-text">{l.text}</p>
                  {l.note && <p className="pk-layer-note">{l.note}</p>}
                  {/* The pass condition is the student's own test on their own
                      sentence, so it prints on the student copy — unlike the
                      note above it, which annotates the model for whoever is
                      reading it. Kept visually distinct for that reason. */}
                  {l.passesWhen?.trim() && (
                    <p className="pk-layer-passes">
                      <span className="pk-layer-passes-label" style={monoFont}>
                        Passes when
                      </span>{" "}
                      {l.passesWhen}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
  }

  if (activity.sortItems.length > 0)
    push(
      "sort",
      34 + activity.sortItems.length * 26,
        <div className="avoid-break mb-3 overflow-hidden pk-box">
          <div className="pk-section-label pk-bar px-3 py-1 text-[11px] font-bold tracking-widest">
            SORT IT — WRITE THE CATEGORY IN THE BLANK
          </div>
          <div className="grid grid-cols-1 bg-white p-2">
            {activity.sortItems.map((s, i) => (
              <div key={i} className="flex items-start gap-2 border-b border-dashed border-gray-200 py-1.5 text-xs last:border-b-0">
                <span className="pk-sort-num pk-muted font-black" style={monoFont}>{i + 1}.</span>
                <span className="flex-1 text-gray-800">{s.statement}</span>
                <span className="blank w-28 shrink-0">
                  <span className="answer-key text-[10px]">{s.category}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      );

  if (activity.matchPairs.length > 0)
    push(
      "match",
      40 + activity.matchPairs.length * 30,
        <div className="avoid-break mb-3 overflow-hidden pk-box">
          <div className="pk-section-label pk-bar px-3 py-1 text-[11px] font-bold tracking-widest">
            MATCH — DRAW A LINE OR WRITE THE LETTER
          </div>
          <div className="grid grid-cols-2 gap-0 bg-white p-3 text-xs">
            <div className="space-y-2 border-r-2 border-dashed border-gray-300 pr-3">
              {activity.matchPairs.map((m, i) => (
                <p key={i}>
                  <strong>{String.fromCharCode(65 + i)}.</strong> {m.left}
                </p>
              ))}
            </div>
            <div className="space-y-2 pl-3">
              {[...activity.matchPairs]
                .map((m, i) => ({ right: m.right, letter: String.fromCharCode(65 + i) }))
                .sort((x, y) => x.right.localeCompare(y.right))
                .map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="blank !min-w-8 w-8">
                      <span className="answer-key text-[10px]">{m.letter}</span>
                    </span>
                    {m.right}
                  </div>
                ))}
            </div>
          </div>
        </div>
      );

  if (activity.frames.length > 0)
    push(
      "frames",
      activity.frames.length * 76,
      <div className="mb-3 flex flex-col gap-2">
        {activity.frames.map((f, i) => (
            <div key={i} className="rounded-lg border-2 bg-white p-2" style={{ borderColor: accent }}>
              <span
                className="mr-2 rounded px-1.5 py-0.5 text-[10px] font-black text-white"
                style={{ background: accent, ...monoFont }}
              >
                {f.label}
              </span>
              <span className="text-xs italic text-gray-700">{f.starter}</span>
              {/* No data-answer: a sentence starter is the student's to finish,
                  so the key has nothing to reveal here. */}
              <textarea
                className="pk-input write-area write-area-sm pk-input--sm mt-1.5"
                defaultValue=""
                spellCheck={false}
              />
            </div>
          ))}
      </div>
    );

  // Multiple choice — the review page's whole job, and a master check elsewhere.
  // The correct box fills in only when answers are revealed, so the same sheet
  // prints as a student check and as the coach's key.
  if ((activity.quiz ?? []).length > 0)
    push(
      "quiz",
      30 + (activity.quiz ?? []).length * 96,
      <div className="pk-quiz avoid-break mb-3 overflow-hidden pk-box">
        <div className="pk-section-label pk-bar px-3 py-1 text-[11px] font-bold tracking-widest">
          CHECK — TICK ONE BOX PER QUESTION
        </div>
        <div className="flex flex-col gap-2.5 bg-white p-3">
          {(activity.quiz ?? []).map((q, i) => (
            <div key={i} className="pk-mcq text-xs">
              <p className="font-bold text-gray-900">
                <span style={monoFont}>{i + 1}.</span> {q.question}
              </p>
              <div className="mt-1.5 grid grid-cols-1 gap-1">
                {(q.options ?? []).map((o, k) => (
                  // A real checkbox a student can tick on screen. The correct
                  // one is marked in the CLASS, not the checked state, so the
                  // sheet prints blank as a student check and filled as the
                  // coach's key — the same paper, twice. See useAnswerKey.
                  <label key={k} className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className={`pk-mcq-box mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-2 ${
                        k === q.correctIndex ? "pk-mcq-box--right" : ""
                      }`}
                      style={{ borderColor: accent }}
                    />
                    <span className="text-gray-800">
                      <span className="font-bold" style={monoFont}>
                        {String.fromCharCode(65 + k)}.
                      </span>{" "}
                      {o}
                    </span>
                  </label>
                ))}
              </div>
              {q.why && (
                <p className="answer-key mt-1 text-[10px] italic">{q.why}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );

  // Scrambled bank with two dummies in it — see wordBankSchema. The dummies are
  // printed indistinguishably from the real words on purpose; only the answer
  // key marks them, so elimination stops being a strategy.
  if (
    ((activity.wordBank?.words ?? []).length > 0 ||
      (activity.wordBank?.distractors ?? []).length > 0)
  )
    push(
      "wordbank",
      66,
      <div className="pk-wordbank avoid-break mb-3 rounded-xl border-2 border-dashed p-2.5" style={{ borderColor: accent }}>
        <span className="pk-wordbank-label mr-2 text-[10px] font-black uppercase tracking-widest" style={monoFont}>
          Word bank
        </span>
        <span className="text-xs text-gray-800">
          {scrambleBank(activity.wordBank).join("  |  ")}
        </span>
        {(activity.wordBank?.distractors ?? []).length > 0 && (
          <p className="answer-key mt-1 text-[10px] italic">
            Dummies (fit nothing): {(activity.wordBank?.distractors ?? []).join(", ")}
          </p>
        )}
      </div>
    );

  // The word bank is the single biggest block on a vocabulary page (measured
  // 704px for six terms). Emit it a row at a time so the packer can flow it
  // across sheets instead of forcing one crushed page.
  if (activity.kind === "vocabulary" && pack.vocabulary.length > 0)
    chunk(pack.vocabulary, 2).forEach((row, ri) =>
      push(
        `vocab-${ri}`,
        240,
        <div className="mb-3 grid grid-cols-2 gap-3">
          {row.map((v, i) => (
            <div key={i} className="pk-vocab avoid-break pk-box pk-box--pad bg-white">
              <div className="pk-vocab-term text-xl font-black">
                {v.term.toUpperCase()}
              </div>
              <p className="pk-vocab-def mt-1 text-gray-800">{v.definition}</p>
              {v.analogy && (
                <p className="pk-analogy mt-2 rounded-lg bg-yellow-50 p-2 text-gray-700">
                  <strong>Like:</strong> {v.analogy}
                </p>
              )}
            </div>
          ))}
        </div>
      )
    );

  activity.prompts.forEach((p, i) => {
    /* THE COACHING LINE — see promptSchema. `guide` and `trap` are the
       student's half of what used to sit entirely inside `expectedAnswer`,
       and they print at the point of writing rather than in the key.

       Deliberately NOT `.answer-key`: that class is display:none under
       `.answers-hidden`, which is exactly how the expected answer stays off
       the student copy. These two must survive that toggle — a student
       holding the sheet is the whole audience for them. */
    const guide = p.guide?.trim();
    const trap = p.trap?.trim();
    push(
      `prompt-${i}`,
      175 + (guide ? 17 : 0) + (trap ? 17 : 0),
        <div
          className={`pk-prompt pk-prompt--${p.side} avoid-break mb-3 rounded-2xl p-3.5`}
        >
          <div className="mb-2 flex items-center gap-2">
            {p.side !== "neutral" && (
              <span
                className="pk-prompt-side pk-ink-auto rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide"
              >
                {p.side}
              </span>
            )}
            <span className="pk-prompt-label font-bold text-gray-900">{p.label}</span>
          </div>
          {(guide || trap) && (
            <div className="pk-coach mb-2 flex flex-col gap-0.5">
              {guide && (
                <p className="pk-coach-row pk-coach-row--do text-[11px] leading-snug">
                  <span className="pk-coach-tag font-black uppercase tracking-widest">
                    Include
                  </span>{" "}
                  {guide}
                </p>
              )}
              {trap && (
                <p className="pk-coach-row pk-coach-row--dont text-[11px] leading-snug">
                  <span className="pk-coach-tag font-black uppercase tracking-widest">
                    Don&rsquo;t
                  </span>{" "}
                  {trap}
                </p>
              )}
            </div>
          )}
          <WriteArea expectedAnswer={p.expectedAnswer} />
        </div>
    );
  });

  // The matched Pro/Con architectures — each side's chain, mechanism by
  // mechanism, so a student handed either side knows the whole line of argument
  // rather than just a position.
  if (activity.argumentChains && activity.argumentChains.length > 0)
    push(
      "arg-chains",
      64 +
        activity.argumentChains.length *
          (168 +
            (activity.argumentChains.some((c) => c.crossfireTrap?.trim())
              ? 26
              : 0)),
      <div className="pk-chains avoid-break mb-3 grid gap-2.5 md:grid-cols-2">
        {activity.argumentChains.map((ch, n) => (
          <div key={n} className={`pk-chain pk-chain--${ch.side} rounded-xl p-3`}>
            <p className="pk-chain-side pk-ink-auto mb-1.5 inline-block rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
              {ch.side}
            </p>
            {(
              [
                ["Claim", ch.claim],
                ["Why it happens", ch.mechanism],
                ["Proof", ch.example],
                ["They say", ch.opposingResponse],
                ["We turn it", ch.turn],
                ["Judge on", ch.weighing],
              ] as [string, string][]
            )
              .filter(([, v]) => v?.trim())
              .map(([label, v]) => (
                <p key={label} className="pk-chain-row mb-1 text-[11px] leading-snug">
                  <span className="pk-chain-label font-black uppercase tracking-wide">
                    {label}:
                  </span>{" "}
                  {v}
                </p>
              ))}
            {ch.crossfireTrap?.trim() && (
              <p className="pk-chain-trap mt-1.5 rounded px-2 py-1 text-[11px] font-semibold leading-snug">
                <span className="pk-chain-label font-black uppercase tracking-wide">
                  Ask them:
                </span>{" "}
                {ch.crossfireTrap}
              </p>
            )}
          </div>
        ))}
      </div>
    );

  // THE ATTEMPT FRAME — on a page students meet before the concept is taught.
  //
  // Two audiences, one block. The student line is there because the known cost
  // of attempting before instruction is that it feels like failure: a page that
  // says "you have not been taught this yet, a rough answer is the point" turns
  // the same struggle from evidence of being bad at debate into the task. The
  // teacher line carries `likelyMisstep`, and it prints on the teacher copy
  // only — it is the one thing the coach needs to be watching for, and it is
  // useless to them buried in the guide four sheets away.
  if (activity.attemptsBeforeTaught)
    push(
      "attempt-frame",
      // Measured at 93px with the misstep line present; the estimate was 74 and
      // the shortfall pushed two pages onto the shrink floor.
      95,
      <div className="pk-attempt avoid-break mb-3 rounded-2xl border-2 border-dashed p-3.5">
        <p className="pk-attempt-label text-[11px] font-black uppercase tracking-widest opacity-70">
          First attempt · not taught yet
        </p>
        <p className="pk-attempt-text font-semibold leading-snug">
          You have not been taught this yet. Have a real go — a rough answer you
          can defend is exactly what this page wants. We fix it together next.
        </p>
        {/* `.answer-key` is the pack's real teacher-only mechanism — it is
            display:none under `.answers-hidden`, which is how every expected
            answer already stays off the student copy. (`.pk-teacheronly` is only
            a font hook and hides nothing; using it here would have printed the
            misstep on the students' own page, which is the one place it must
            never appear.) */}
        {activity.likelyMisstep && (
          <p className="answer-key mt-2 text-[11px] leading-snug">
            <span className="font-black uppercase tracking-widest">Expect:</span>{" "}
            {activity.likelyMisstep}
          </p>
        )}
      </div>
    );

  // What the judge is actually deciding on this page. Sits just before the key
  // idea: the key idea is what to remember, this is why it wins the round.
  if (activity.hiddenJudgeMove)
    push(
      "judge-move",
      88,
      <div className="pk-judge avoid-break mb-3 rounded-2xl p-3.5">
        <p className="pk-judge-label text-[11px] font-black uppercase tracking-widest opacity-70">
          Hidden judge move
        </p>
        <p className="pk-judge-text font-semibold leading-snug">
          {activity.hiddenJudgeMove}
        </p>
      </div>
    );

  if (activity.keyIdea)
    push(
      "key-idea",
      92,
      <div
        className="pk-key avoid-break mb-3 flex items-start gap-3 rounded-2xl p-3.5"
      >
        <div>
          <p className="pk-key-label text-[11px] font-black uppercase tracking-widest opacity-70">Remember this</p>
          <p className="pk-key-text font-bold leading-snug">{activity.keyIdea}</p>
        </div>
      </div>
    );

  /* ── THE RIGOR MECHANICS ──────────────────────────────────────────────────
     Ordered the way the room moves: capture what you heard (flow), state what
     decides it (ballot line), check your own work (echo), then take questions
     (crossfire). See lib/rigor.ts for which pages must carry which. */

  // MICRO-FLOW — the listener transcribes rather than ticks. Deliberately a
  // grid of empty cells: what a student writes here is the artifact, and the
  // WARRANT column is the one that matters, because a blank one is the finding.
  if (activity.microFlow?.target?.trim()) {
    const mf = activity.microFlow;
    const rows = Math.max(1, Math.min(6, mf.captures || 3));
    push(
      "micro-flow",
      74 + rows * 52,
      <div className="pk-flow avoid-break mb-3 pk-box overflow-hidden">
        <div className="pk-section-label pk-bar px-3 py-1 text-[11px] font-bold tracking-widest">
          Micro-flow — write their words, not your opinion of them
        </div>
        <div className="bg-white p-2.5">
          <p className="pk-flow-target mb-2 text-[11px] font-bold">
            Flowing: {mf.target}
          </p>
          <table className="pk-flow-table w-full table-fixed border-collapse text-[10px]">
            <thead>
              <tr>
                {["Their CLAIM", "Their WARRANT (the “because”)", "Their DATA"].map((h) => (
                  <th
                    key={h}
                    className="pk-flow-head border px-1.5 py-1 text-left font-black uppercase tracking-wider"
                    style={monoFont}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }).map((_, i) => (
                <tr key={i}>
                  {(["claim", "warrant", "data"] as const).map((col) => (
                    <td key={col} className="pk-flow-cell border p-0 align-top">
                      <textarea
                        className="pk-input h-11 w-full rounded-none border-0 bg-transparent p-1 text-[10px]"
                        // The exemplar fills row 1 under the answer key, so the
                        // coach can show the room one real capture.
                        data-answer={i === 0 ? (mf.exemplar?.[col] ?? "") : undefined}
                        defaultValue=""
                        spellCheck={false}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pk-flow-note mt-1.5 text-[10px] italic opacity-80">
            An empty WARRANT column is a finding, not a mistake — it means they never said why.
          </p>
        </div>
      </div>
    );
  }

  // BALLOT LINE — the Link layer as impact calculus. The two impacts sit side
  // by side because the comparison IS the teaching: a student who can only
  // fill their own column has not understood that weighing is comparative.
  if (activity.ballotLine?.line?.trim()) {
    const bl = activity.ballotLine;
    push(
      "ballot-line",
      150,
      <div className="pk-ballot avoid-break mb-3 pk-box overflow-hidden">
        <div className="pk-section-label pk-bar px-3 py-1 text-[11px] font-bold tracking-widest">
          Ballot line — the Link is a comparison, not a full stop
        </div>
        <div className="bg-white p-2.5">
          <div className="mb-2 grid grid-cols-2 gap-2">
            <div className="pk-ballot-ours rounded-lg p-2">
              <div className="text-[9px] font-black uppercase tracking-widest opacity-70" style={monoFont}>
                Our impact
              </div>
              <p className="text-[11px] font-semibold leading-snug">{bl.ourImpact}</p>
            </div>
            <div className="pk-ballot-theirs rounded-lg p-2">
              <div className="text-[9px] font-black uppercase tracking-widest opacity-70" style={monoFont}>
                Their impact
              </div>
              <p className="text-[11px] font-semibold leading-snug">{bl.theirImpact}</p>
            </div>
          </div>
          {bl.weighing && (
            <p className="pk-ballot-weigh mb-2 text-[11px] leading-snug">
              <span className="font-black uppercase tracking-wider" style={monoFont}>
                Why ours wins:
              </span>{" "}
              {bl.weighing}
            </p>
          )}
          <div className="pk-ballot-line rounded-lg px-2.5 py-2">
            <div className="text-[9px] font-black uppercase tracking-widest opacity-70" style={monoFont}>
              Say this to the judge
            </div>
            <p className="text-[12px] font-bold leading-snug">{bl.line}</p>
          </div>
        </div>
      </div>
    );
  }

  // ECHO CHECK — self-administered, at the point of writing, against the card
  // actually cited. Real checkboxes: this is the one place a tick is the right
  // mechanic, because the student is auditing their OWN sentence.
  if ((activity.echoCheck?.tests ?? []).length > 0) {
    const ec = activity.echoCheck!;
    push(
      "echo-check",
      48 + ec.tests.length * 30,
      <div className="pk-echo avoid-break mb-3 rounded-xl px-3 py-2">
        <p className="pk-echo-label text-[11px] font-black uppercase tracking-widest">
          Echo check{ec.cardId ? ` — Card ${ec.cardId}` : ""}
        </p>
        <p className="pk-echo-sub mb-1.5 text-[10px] italic opacity-85">
          Your EXPLAIN must say something your card does not. Tick all three before you hand in.
        </p>
        <div className="flex flex-col gap-1">
          {ec.tests.map((t, i) => (
            <label key={i} className="flex items-start gap-2 text-[11px] leading-snug">
              <input type="checkbox" className="pk-mcq-box mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-2" />
              <span>{t}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  // MICRO-CROSSFIRE — 30 seconds of live questioning after any one-way speech.
  // Printed last on the page because it is the last thing that happens, and
  // the questions are pre-written so a novice listener has something to fire.
  if ((activity.microCrossfire?.questions ?? []).length > 0) {
    const cf = activity.microCrossfire!;
    push(
      "micro-crossfire",
      58 + cf.questions.length * 38,
      <div className="pk-crossfire avoid-break mb-3 rounded-xl px-3 py-2">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <p className="pk-crossfire-label text-[11px] font-black uppercase tracking-widest">
            Micro-crossfire
          </p>
          <span className="pk-crossfire-clock text-[11px] font-black" style={monoFont}>
            {cf.seconds || 30}s
          </span>
        </div>
        {cf.listenerRole && (
          <p className="pk-crossfire-role mb-1.5 text-[10px] italic opacity-85">
            {cf.listenerRole}
          </p>
        )}
        <div className="flex flex-col gap-1">
          {cf.questions.map((q, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] leading-snug">
              <span
                className={`pk-crossfire-tag shrink-0 rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                  q.targets === "limit" ? "pk-crossfire-tag--limit" : "pk-crossfire-tag--warrant"
                }`}
                style={monoFont}
              >
                {q.targets}
              </span>
              <span>“{q.stem}”</span>
            </div>
          ))}
        </div>
        <p className="pk-crossfire-note mt-1.5 text-[10px] italic opacity-80">
          Pick ONE. Attack the reasoning, never the person.
        </p>
      </div>
    );
  }

  /* FIGURES — see figureSchema.
     Drawn in HTML and CSS rather than SVG, deliberately. A figure built from
     divs inherits the register's own tokens, so the same pictogram is ink on
     the JV sheet and the accent triad on the novice one without a second
     drawing; it reflows when the fit pass scales a page; and it degrades to
     outlined boxes on a photocopier, where a flat SVG fill turns to mud.

     `exact` prints under every drawing that carries one. He rounds for the
     picture and states the truth beneath it, and a pack that rounds silently
     teaches the habit the lesson is trying to break. */
  activity.figures.forEach((f, i) => {
    const est =
      f.kind === "unit-chart"
        ? 96 + (f.thenFilled != null ? 62 : 0)
        : f.kind === "process-flow"
          ? 60 + Math.ceil(f.stages.length / 3) * 30
          : f.kind === "ratio"
            ? 96
            : 74 + Math.max(f.brings.length, f.costs.length) * 30;
    push(
      `figure-${i}`,
      est + (f.exact ? 16 : 0) + (f.caption ? 16 : 0) + (f.source ? 14 : 0),
      <div className="pk-figure avoid-break mb-3 overflow-hidden pk-box">
        {f.title && (
          <div className="pk-section-label pk-bar px-3 py-1 text-[11px] font-bold tracking-widest">
            {f.title}
          </div>
        )}
        <div className="bg-white px-3 py-2.5">
          {f.kind === "unit-chart" && <UnitChart f={f} />}
          {f.kind === "process-flow" && <ProcessFlow f={f} />}
          {f.kind === "ratio" && <RatioFigure f={f} />}
          {f.kind === "balance" && <BalanceFigure f={f} />}

          {f.caption && <p className="pk-fig-caption mt-2 text-[11px] leading-snug">{f.caption}</p>}
          {f.exact && (
            <p className="pk-fig-exact mt-1 text-[10px] leading-snug">
              <span className="font-black uppercase tracking-widest" style={monoFont}>
                Exact
              </span>{" "}
              {f.exact}
            </p>
          )}
          {f.source && (
            <p className="pk-fig-source mt-1 text-[9px]" style={monoFont}>
              {f.source}
            </p>
          )}
        </div>
      </div>
    );
  });

  /* CARDS WITH JOBS — see cardJobSchema.
     The card itself lives on the evidence sheet; this is the assignment, on the
     page where the work happens. Rendering the whole card again here would put
     the same paraphrase on two sheets and spend the reading budget twice, and
     the student has the deck in front of them.
     The write area is sized `sm` deliberately: a speech line, a limit and a
     weigh are each one sentence, and a box that invites a paragraph miscoaches
     exactly the way an oversized box does anywhere else. */
  if (activity.cardJobs.length > 0)
    push(
      "card-jobs",
      40 + activity.cardJobs.length * 78,
      <div className="pk-cardjobs avoid-break mb-3 overflow-hidden pk-box">
        <div className="pk-section-label pk-bar px-3 py-1 text-[11px] font-bold tracking-widest">
          ONE JOB PER CARD — IN THIS ORDER
        </div>
        <div className="flex flex-col bg-white">
          {activity.cardJobs.map((j, i) => (
            <div key={i} className="pk-cardjob px-3 py-2">
              <div className="mb-1 flex items-baseline gap-2">
                <span className="pk-cardjob-id shrink-0 rounded px-1.5 py-0.5 text-[11px] font-black" style={monoFont}>
                  Card {j.cardId}
                </span>
                <span className="pk-cardjob-name text-[11px] font-black uppercase tracking-widest">
                  {j.job}
                </span>
              </div>
              {j.instruction && (
                <p className="pk-cardjob-instruction mb-1 text-[11px] leading-snug">{j.instruction}</p>
              )}
              <WriteArea expectedAnswer="" size="sm" />
            </div>
          ))}
        </div>
      </div>
    );

  /* THE EXIT BALLOT — see exitBallotSchema.
     Printed in the order the room moves through it: a partner marks the rows,
     the speaker names the error, picks the repair, and rewrites. The rewrite
     box is deliberately the largest thing on the block, because it is the only
     part the student takes away. */
  {
    const bal = activity.exitBallot;
    const hasBallot = (bal?.rows?.length ?? 0) > 0;
    if (hasBallot) {
      const scale = bal!.scale?.length ? bal!.scale : ["Yes", "Almost", "Not yet"];
      push(
        "exit-ballot",
        64 +
          bal!.rows.length * 34 +
          (bal!.errors.length || bal!.repairs.length ? 30 + Math.max(bal!.errors.length, bal!.repairs.length) * 13 : 0) +
          64,
        <div className="pk-ballot avoid-break mb-3 overflow-hidden pk-box">
          <div className="pk-section-label pk-bar px-3 py-1 text-[11px] font-bold tracking-widest">
            PARTNER BALLOT — MARK EVERY ROW
          </div>
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr>
                <th className="pk-ballot-h px-2 py-1 text-left text-[10px] font-black uppercase tracking-widest">
                  The test
                </th>
                {scale.map((s) => (
                  <th
                    key={s}
                    className="pk-ballot-h w-[14%] px-1 py-1 text-center text-[10px] font-black uppercase tracking-widest"
                  >
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bal!.rows.map((r, i) => (
                <tr key={i} className="pk-ballot-row">
                  <td className="px-2 py-1.5 align-top">
                    <span className="text-[11px] font-bold">{r.criterion}</span>
                    {r.test && (
                      <span className="pk-ballot-test block text-[10px] leading-snug">{r.test}</span>
                    )}
                  </td>
                  {scale.map((s) => (
                    <td key={s} className="px-1 py-1.5 text-center align-middle">
                      <span className="pk-ballot-box inline-block h-3 w-3 rounded-[2px]" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {(bal!.errors.length > 0 || bal!.repairs.length > 0) && (
            <div className="grid grid-cols-2 gap-3 bg-white px-3 py-2">
              <div>
                <p className="pk-ballot-h mb-1 text-[10px] font-black uppercase tracking-widest">
                  What went wrong — mark one
                </p>
                {bal!.errors.map((e, i) => (
                  <p key={i} className="mb-0.5 flex items-start gap-1.5 text-[10.5px] leading-snug">
                    <span className="pk-ballot-box mt-[2px] inline-block h-3 w-3 shrink-0 rounded-[2px]" />
                    {e}
                  </p>
                ))}
              </div>
              <div>
                <p className="pk-ballot-h mb-1 text-[10px] font-black uppercase tracking-widest">
                  How I will fix it — circle one
                </p>
                <div className="flex flex-wrap gap-1">
                  {bal!.repairs.map((r, i) => (
                    <span key={i} className="pk-ballot-move rounded-[2px] px-1.5 py-0.5 text-[10px] font-semibold">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="bg-white px-3 pb-2">
            <p className="pk-ballot-h mb-1 text-[10px] font-black uppercase tracking-widest">
              The rewrite{bal!.product ? ` — ${bal!.product}` : ""}
            </p>
            <WriteArea expectedAnswer="" size="lg" />
          </div>
        </div>
      );
    }
  }

  // What the first student to finish does next. Printed before the oral task so
  // the page reads in the order the room actually moves through it.
  if (activity.fastFinisher)
    push(
      "fast-finisher",
      54,
      <div className="pk-fast avoid-break mb-3 rounded-xl border-l-4 px-3 py-2" style={{ borderColor: accent }}>
        <p className="pk-fast-text text-xs">
          <span className="pk-fast-label font-black uppercase tracking-widest" style={monoFont}>
            Fast finisher:
          </span>{" "}
          {activity.fastFinisher}
        </p>
      </div>
    );

  if (activity.standAndDeliver)
    push(
      "stand-deliver",
      76,
      <div
        className="pk-say mt-auto flex items-center gap-3 rounded-2xl px-4 py-3"
      >
        <p className="pk-say-text font-bold">
          <span className="pk-say-label uppercase tracking-wide">Say it out loud:</span> {activity.standAndDeliver}
        </p>
      </div>
    );

  const title = activity.title || activity.kind.toUpperCase();
  const pages = packIntoPages(blocks);
  /* THE PAGE CODE — a stable address other pages can cite ("see L1-04").
     Derived, never authored: an authored code drifts the moment a page is
     inserted, and the founder's packs use the code far more than the title
     when they cross-reference ("You will check this again on page 13"). */
  const pageCode = `${(pack.lessonCode || "L").toUpperCase()}-${String(
    pack.activities.indexOf(activity) + 1
  ).padStart(2, "0")}`;

  return (
    <>
      {pages.map((pageBlocks, pi) => (
        <Sheet
          /* `pk-page--jv` is what turns the flat block list into the two-column
             sheet the JV register wants; every other register ignores it. */
          className={`pk-page ${pageFamily(activity.kind)}${
            usesJvHouse(design.id) ? " pk-page--jv" : ""
          }`}
          key={pi}
        >
          <HeaderRow
            code={pageCode}
            title={pi === 0 ? title : `${title} (cont.)`}
            /* An optional page says so in its own badge. A cut path has to be
               readable at the moment it is needed, and at minute sixty a coach
               is fanning through paper — not consulting the teacher guide. */
            badge={
              pi === 0
                ? [
                    activity.optional ? "IF TIME" : "",
                    activity.badge || (activity.durationMin ? `${activity.durationMin} MIN` : ""),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : `${pi + 1} / ${pages.length}`
            }
          />
          {pageBlocks.map((b) => (
            <Fragment key={b.key}>{b.node}</Fragment>
          ))}
          <Footer
            text={`${kit.brand} · ${pack.series || kit.seriesLabel} ${pack.lessonCode} · ${title}`}
          />
        </Sheet>
      ))}
    </>
  );
}

// ── Evidence deck page ───────────────────────────────────────────────────────

/* ── THE FOUR FIGURES ────────────────────────────────────────────────────────
   Each is a plain composition of divs so the register's tokens reach it. None
   takes a colour of its own: a figure on a JV sheet is ink, and on a novice
   sheet it is the accent, because both read `--pk-fig-*` from the stylesheet
   rather than deciding for themselves. */

/** N of M as a grid of small boxes, optionally over two series. */
function UnitChart({ f }: { f: Figure }) {
  const total = Math.max(1, Math.min(f.total, 400));
  const row = (n: number, label: string, tone: "then" | "now") => (
    <div className="pk-unitrow">
      <div className="pk-unitgrid" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`pk-unit ${i < n ? `pk-unit--on pk-unit--${tone}` : "pk-unit--off"}`}
          />
        ))}
      </div>
      <div className="pk-unitmeta">
        <span className="pk-unitnum" style={monoFont}>
          {n}
          <span className="pk-unitof">/{total}</span>
        </span>
        {label && <span className="pk-unitlabel">{label}</span>}
      </div>
    </div>
  );
  return (
    <div className="pk-unitchart">
      {f.thenFilled != null && row(f.thenFilled, f.thenLabel, "then")}
      {row(f.filled, f.nowLabel, "now")}
    </div>
  );
}

/** Ordered stages along a line — his "follow the thick line from left to right". */
function ProcessFlow({ f }: { f: Figure }) {
  return (
    <ol className="pk-flowline">
      {f.stages.map((s, i) => (
        <li key={i} className="pk-flowstage">
          <span className="pk-flownum" style={monoFont}>
            {i + 1}
          </span>
          <span className="pk-flowtext">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** Two magnitudes, and how many of one make the other. */
function RatioFigure({ f }: { f: Figure }) {
  const n = Math.max(1, Math.min(f.ratioCount ?? 1, 20));
  return (
    <div className="pk-ratio">
      <div className="pk-ratio-side">
        <div className="pk-ratio-marks" aria-hidden>
          {Array.from({ length: n }, (_, i) => (
            <span key={i} className="pk-ratio-mark pk-ratio-mark--small" />
          ))}
        </div>
        <p className="pk-ratio-label">{f.ratioLeft}</p>
      </div>
      <span className="pk-ratio-eq" style={monoFont} aria-hidden>
        =
      </span>
      <div className="pk-ratio-side">
        <div className="pk-ratio-marks" aria-hidden>
          <span className="pk-ratio-mark pk-ratio-mark--big" />
        </div>
        <p className="pk-ratio-label">{f.ratioRight}</p>
      </div>
    </div>
  );
}

/** One subject, what it brings on one side and what it costs on the other. */
function BalanceFigure({ f }: { f: Figure }) {
  const col = (label: string, items: Figure["brings"], tone: "brings" | "costs") => (
    <div className={`pk-balance-col pk-balance-col--${tone}`}>
      <p className="pk-balance-head text-[10px] font-black uppercase tracking-widest" style={monoFont}>
        {label}
      </p>
      {items.map((it, i) => (
        <div key={i} className="pk-balance-item">
          <span className="pk-balance-item-head">{it.head}</span>
          {it.detail && <span className="pk-balance-item-detail">{it.detail}</span>}
        </div>
      ))}
    </div>
  );
  return (
    <div className="pk-balance">
      {col(f.bringsLabel, f.brings, "brings")}
      {f.subject && (
        <div className="pk-balance-subject">
          <span>{f.subject}</span>
        </div>
      )}
      {col(f.costsLabel, f.costs, "costs")}
    </div>
  );
}

function EvidencePage({
  pack,
  kit,
  cards,
  pageNo,
  evidenceLabel,
  design,
}: {
  pack: LessonPack;
  kit: StyleKitConfig;
  cards: EvidenceCard[];
  pageNo: number;
  evidenceLabel: string;
  design: LessonDesign;
}) {
  return (
    /* The deck is a student sheet like any other, so it wears the register.
       It was the one page that did not, which on the JV look printed an
       un-railed sheet in the middle of railed ones. */
    <Sheet className={`pk-page${usesJvHouse(design.id) ? " pk-page--jv" : ""}`}>
      <HeaderRow
        title={evidenceLabel.toUpperCase()}
        badge={`CARDS ${cards.map((c) => c.id).join(" & ")}`}
        badgeColor={kit.palette.grassGreen}
      />
      {/* No longer advertises the LIMIT: that moved to the coach's page, and a
          student card that promises a block which isn't there reads as a
          printing fault. */}
      <p className="mb-3 text-xs text-gray-700" style={monoFont}>
        These cards contain <strong>real, verified evidence</strong>. Each card
        has a plain-English translation, the line to say in the round, and how to
        use it. Study these before you write — and be ready to say what each card
        does NOT prove.
      </p>

      {cards.map((c) => (
        <div
          key={c.id}
          className="pk-card avoid-break mb-4 rounded-xl border-2 border-slate-400 bg-white p-3"
        >
          <div className="mb-2 flex flex-wrap gap-2">
            <span
              className={`pk-card-id pk-card-id--${c.side} rounded px-2 py-0.5 text-xs font-black text-white`}
              style={{
                background: c.side === "con" ? kit.palette.brickRed : kit.palette.grassGreen,
                ...monoFont,
              }}
            >
              CARD {c.id} — {c.side.toUpperCase()}
            </span>
            <span className="pk-card-src pk-card-src--inst rounded border border-blue-300 bg-blue-100 px-2 text-xs text-blue-800">
              {c.institution} · {c.year}
            </span>
            <span className="pk-card-src pk-card-src--pub rounded border border-green-300 bg-green-100 px-2 text-xs text-green-800">
              {c.publication}
            </span>
          </div>
          <p className="pk-card-meta mb-1 text-xs font-bold text-gray-800">
            Author / Institution: <span className="font-normal">{c.author || c.institution}</span>{" "}
            | Year: <span className="font-normal">{c.year}</span> | Publication:{" "}
            <span className="font-normal">{c.publication}</span>
          </p>
          {/* The named case, then the words a student actually reads out. A
              paraphrase tells them what a source said; the quotation is the
              thing they stand up and deliver, so it gets the visual weight. */}
          {c.event && (
            <p className="pk-card-event mb-1 text-xs font-black uppercase tracking-wide text-gray-900">
              {c.event}
            </p>
          )}
          {c.quote && (
            <blockquote className="pk-card-quote mb-1 border-l-4 p-2 text-xs">
              <span className="pk-card-quote-text font-semibold">“{c.quote}”</span>
              {c.quoteAttribution && (
                <span className="pk-card-quote-cite block pt-0.5 text-[10px] font-bold uppercase tracking-wide opacity-80">
                  — {c.quoteAttribution}
                </span>
              )}
            </blockquote>
          )}
          <div className="pk-card-para mb-1 rounded border border-slate-300 bg-slate-50 p-2 text-xs italic">
            <strong>PARAPHRASE (under {kit.rules.paraphraseMaxWords} words):</strong>{" "}
            {c.paraphrase}
          </div>
          <div className="pk-card-trans mb-1 rounded border-l-4 border-yellow-400 bg-yellow-50 p-2 text-xs">
            <strong>TRANSLATION — Plain English:</strong> {c.translation}
          </div>
          {c.tacticalNote && (
            <div className="pk-card-use mb-1 rounded border-l-4 p-2 text-xs">
              <strong>HOW TO USE IN ROUND:</strong> {c.tacticalNote}
            </div>
          )}
          {/* The deployment line, printed as the sentence it is meant to be
              spoken as — this is what a debater says to the judge. */}
          {c.roundApplication && (
            <div className="pk-card-say mb-1 rounded border-l-4 p-2 text-xs">
              <strong>SAY IT TO THE JUDGE:</strong>{" "}
              <span className="italic">“{c.roundApplication}”</span>
            </div>
          )}
          {/* THE LIMIT IS NOT PRINTED HERE. It stays in the schema, it is still
              required by the review gates, and it is still the integrity feature
              the deck rests on — but it belongs to the COACH. Printed on the
              student's card it hands over the answer to the question the coach
              wants to ask them ("what can this card NOT prove?"). It prints on
              the teacher's limits page instead. */}
        </div>
      ))}

      <Footer text={`${kit.brand} · ${pack.series || kit.seriesLabel} ${pack.lessonCode} · EVIDENCE ${pageNo}`} />
    </Sheet>
  );
}

// ── Teacher pages ────────────────────────────────────────────────────────────

function TeacherGuidePage({ pack, kit }: { pack: LessonPack; kit: StyleKitConfig }) {
  const g = pack.teacherGuide;
  // The guide is a reference document, not a one-sheet page — a 15-phase timing
  // plan alone measured 905px. Flow it across sheets (chunking the timing table)
  // rather than crushing the whole guide to half size.
  const blocks: PBlock[] = [];
  const push = (key: string, est: number, node: React.ReactNode) =>
    blocks.push({ key, est, node });

  // The five facts a coach checks before the bell, and they are NOT the same
  // size: cohort/skill/duration are labels, assessment and next-lesson are
  // paragraphs. As five equal centred columns the paragraphs shredded into
  // one-word lines while "90 minutes" sat in an empty box — 480px of sheet for
  // five facts. Short facts run as a chip strip; the prose sits underneath as
  // prose, which is also how his own teacher pages are laid out.
  push(
    "info",
    150,
    <div className="mb-3 flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap gap-2">
        {[
          ["COHORT", g.cohort],
          ["SKILL", pack.skillFocus],
          ["DURATION", `${pack.durationMin} min`],
        ].map(([label, value]) => (
          <div
            key={label}
            className="pk-metachip flex min-w-0 flex-1 basis-56 items-baseline gap-2 rounded-lg border-2 border-slate-400 bg-slate-50 px-2.5 py-1.5"
          >
            <span className="shrink-0 font-black tracking-wide text-slate-700" style={monoFont}>
              {label}
            </span>
            <span className="min-w-0 text-slate-700">{value || "—"}</span>
          </div>
        ))}
      </div>
      {[
        ["ASSESSMENT", g.assessment],
        ["NEXT LESSON", g.nextLesson],
      ]
        .filter(([, v]) => v?.trim())
        .map(([label, value]) => (
          <p key={label} className="pk-metaline leading-snug text-slate-700">
            <span className="mr-1.5 font-black tracking-wide text-slate-800" style={monoFont}>
              {label}:
            </span>
            {value}
          </p>
        ))}
    </div>
  );

  /* THE SUCCESS CRITERIA, IN FULL AND UNCAPPED.
     They used to print in exactly one place — the cover — where they were the
     largest block on the sheet (341 characters, 200px on a real pack) and were
     truncated to four items of twelve words to make them fit. A comment above
     `coverFields` claimed they "print in full in the teacher guide"; they did
     not, so the cap was quietly losing them.
     Here they are complete, on the page a coach actually reads before the bell,
     which is what frees the cover to be a title page. */
  if (pack.successCriteria.length > 0)
    push(
      "criteria",
      70 + pack.successCriteria.length * 26,
      <div className="mb-3 rounded-lg border-2 border-slate-400 bg-slate-50 p-2.5 text-xs">
        <div className="mb-1.5 font-black tracking-wide text-slate-800" style={monoFont}>
          BY THE END OF THIS LESSON, STUDENTS CAN
        </div>
        <ol className="flex flex-col gap-1">
          {pack.successCriteria.map((c, i) => (
            <li key={i} className="flex items-start gap-2 leading-snug text-slate-700">
              <span className="shrink-0 font-black text-slate-500" style={monoFont}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">{c}</span>
            </li>
          ))}
        </ol>
      </div>
    );

  if (g.materialsChecklist)
    push(
      "materials",
      83,
      <div className="mb-3 rounded-lg border-2 border-gray-400 bg-gray-50 p-2 text-xs">
        <strong>MATERIALS CHECKLIST:</strong> {g.materialsChecklist}
      </div>
    );

  // WHAT EACH CARD CANNOT PROVE — the coach's copy.
  // These used to print on the student's own evidence card, which handed over
  // the answer to the best question in the lesson. Here they are ammunition:
  // the coach asks "what can this card NOT prove?" and already knows.
  if (pack.evidenceCards.length > 0)
    push(
      "limits",
      44 + pack.evidenceCards.length * 34,
      <div className="pk-limits avoid-break mb-3 overflow-hidden pk-box">
        <div className="pk-bar px-3 py-1 text-xs font-bold tracking-widest">
          ASK THEM: WHAT CAN THIS CARD NOT PROVE?
        </div>
        <div className="bg-white p-2">
          <p className="mb-1.5 text-[10px] italic text-gray-600">
            Not printed on the student cards. Use it to catch the overreach the
            moment you hear it.
          </p>
          {pack.evidenceCards.map((c) => (
            <div
              key={c.id}
              className="flex items-start gap-2 border-b border-dashed border-gray-200 py-1 text-[11px] last:border-b-0"
            >
              <span className="pk-card-id shrink-0 font-black" style={monoFont}>
                {c.id}
              </span>
              <span className="text-gray-800">{c.limit}</span>
            </div>
          ))}
        </div>
      </div>
    );

  // ~58px per row measured — chunk so the table can span sheets, repeating its
  // header each time so a continued plan is still readable on its own.
  chunk(g.timingPlan, 6).forEach((rows, ci) =>
    push(
      `timing-${ci}`,
      34 + rows.length * 58,
      <div className="mb-3 overflow-hidden pk-box">
        <div className="pk-bar px-3 py-1 text-xs font-bold tracking-widest">
          ⏱ MINUTE-BY-MINUTE PLAN — {pack.durationMin} MINUTES
          {ci > 0 ? " (CONT.)" : ""}
        </div>
        <table className="pk-timing w-full border-collapse bg-white text-[10px]">
          <thead>
            <tr className="pk-timing-head border-b border-gray-300 bg-gray-100 text-left">
              <th className="w-14 border-r border-gray-300 p-1">TIME</th>
              <th className="w-32 border-r border-gray-300 p-1">PHASE</th>
              <th className="w-12 border-r border-gray-300 p-1">WHO</th>
              <th className="p-1">WHAT HAPPENS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={`border-b border-gray-200 ${i % 2 === 1 ? "bg-gray-50" : ""}`}>
                <td className="border-r border-gray-200 p-1 font-bold text-blue-700" style={monoFont}>
                  {row.startMin}–{row.endMin}
                </td>
                <td className="border-r border-gray-200 p-1 font-bold">{row.phase}</td>
                <td className="border-r border-gray-200 p-1">{row.who}</td>
                <td className="p-1">{row.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  // Distinct from a page's own fastFinisher (one student, while the room
  // catches up): this is the whole-class call when the lesson runs faster
  // than planned. Sits beside the timing plan for the same reason pitfalls
  // sits beside it — both are read in the seconds before the bell.
  if (g.ifAheadOfSchedule)
    push(
      "ahead-of-schedule",
      90,
      <div className="pk-pitfalls mb-3 rounded-lg border-2 border-emerald-500 bg-emerald-50 p-2 text-xs">
        <strong>IF YOU&apos;RE AHEAD OF SCHEDULE:</strong> {g.ifAheadOfSchedule}
      </div>
    );

  // The run-sheet for the two adults in the room. Printed as a row per page so
  // a lead and an assistant can each find their own column mid-lesson.
  (g.pageCoaching ?? []).forEach((c, i) =>
    push(
      `coaching-${i}`,
      // Header + the four always-present rows, plus the tier rows when present.
      // MEASURED, not reasoned: these render 121px typical and 149px worst on a
      // real guide, against the 96/142 this used to claim — so eight of them
      // packed onto one sheet at 1392px into a 1066px column and overflowed.
      // An estimate that is under the truth doesn't shrink a page, it breaks it.
      126 + (c.juniorTier || c.varsityTier ? 28 : 0),
      <div className="pk-coach mb-3 rounded-lg border-2 p-2 text-xs">
        <p className="pk-coach-page mb-1 font-black uppercase tracking-wide">
          {c.page}
        </p>
        <div className="grid gap-x-3 gap-y-0.5 sm:grid-cols-2">
          {(
            [
              ["Head teacher", c.headTeacher],
              ["Assistant", c.assistant],
              ["Look for — good", c.lookForGood],
              ["Look for — weak", c.lookForWeak],
              ["Junior tier", c.juniorTier],
              ["Varsity tier", c.varsityTier],
            ] as [string, string][]
          )
            .filter(([, v]) => v?.trim())
            .map(([label, v]) => (
              <p key={label} className="leading-snug">
                <span className="pk-coach-label font-bold uppercase tracking-wide">
                  {label}:
                </span>{" "}
                {v}
              </p>
            ))}
        </div>
      </div>
    )
  );

  if (g.pitfalls)
    push(
      "pitfalls",
      227,
      <div className="pk-pitfalls mb-3 rounded-lg border-2 border-amber-500 bg-amber-50 p-2 text-xs">
        <strong>PREP &amp; PITFALLS:</strong> {g.pitfalls}
      </div>
    );

  if (g.rubric.length > 0)
    push(
      "rubric",
      34 + g.rubric.length * 52,
      <div className="pk-rubric mb-3 overflow-hidden rounded-xl border-2 border-slate-400">
        <div className="pk-bar px-3 py-1 text-xs font-bold tracking-widest">
          GRADING RUBRIC
        </div>
        <table className="pk-timing w-full border-collapse bg-white text-[10px]">
          <tbody>
            {g.rubric.map((band, i) => (
              <tr key={i} className="border-b border-gray-200">
                <td className="w-32 border-r border-gray-200 p-1 font-bold">{band.score}</td>
                <td className="p-1">{band.descriptor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const pages = packIntoPages(blocks);

  return (
    <>
      {pages.map((pageBlocks, pi) => (
        <Sheet key={pi} className="pk-page pk-page--teacher">
          <HeaderRow
            title={`TEACHER GUIDE — ${pack.lessonCode || "LESSON"}${pi > 0 ? " (CONT.)" : ""}`}
            badge="TEACHER COPY"
          />
          {pageBlocks.map((b) => (
            <Fragment key={b.key}>{b.node}</Fragment>
          ))}
          <Footer text={`${kit.brand} · TEACHER GUIDE ${pack.lessonCode}`} />
        </Sheet>
      ))}
    </>
  );
}

/**
 * Verbatim 30-second teacher scripts for the lesson's key transitions. The
 * schema has carried these all along but the printed pack was dropping them.
 */
function LaunchScriptsPage({ pack, kit }: { pack: LessonPack; kit: StyleKitConfig }) {
  return (
    <Sheet className="pk-page pk-page--teacher">
      <HeaderRow title="LAUNCH SCRIPTS" badge="SAY IT LIKE THIS" />
      <p className="mb-3 text-xs text-gray-700" style={monoFont}>
        30-second scripts for the moments that set up each phase. Say them close
        to verbatim the first time you teach this lesson.
      </p>
      <div className="flex flex-col gap-2.5">
        {pack.teacherGuide.launchScripts.map((s, i) => (
          <div
            key={i}
            className="avoid-break overflow-hidden rounded-xl border-2 border-slate-400 bg-white"
          >
            <div
              className="pk-script-head pk-section-label pk-bar flex items-center gap-2 px-3 py-1 text-[11px] font-bold uppercase tracking-widest"
              style={monoFont}
            >
              <span>#{i + 1}</span>
              <span className="truncate">{s.title}</span>
            </div>
            <p className="px-3 py-2 text-xs italic leading-snug text-gray-800">
              “{s.script}”
            </p>
          </div>
        ))}
      </div>
      <Footer text={`${kit.brand} · LAUNCH SCRIPTS ${pack.lessonCode}`} />
    </Sheet>
  );
}

function AnswerKeyPage({ pack, kit }: { pack: LessonPack; kit: StyleKitConfig }) {
  const keyed = pack.activities.filter((a) => a.prompts.length > 0);
  // Flatten to one entry per prompt (carrying its activity heading on the first
  // of each group), then paginate — a long key must span sheets, never overflow.
  type KeyEntry = { head: string; label: string; ans: string };
  const entries: KeyEntry[] = [];
  keyed.forEach((a) =>
    a.prompts.forEach((p, j) =>
      entries.push({
        head: j === 0 ? a.title || a.kind.toUpperCase() : "",
        label: p.label,
        ans: p.expectedAnswer || "—",
      })
    )
  );
  // Paginate by ESTIMATED HEIGHT, not a fixed count: eight one-line answers fit
  // easily, eight four-line ones do not — and a long key sheet was overflowing
  // past the readability floor once answers grew (a QA fix is often a longer
  // model answer). ~5.5 chars/px at this size, 15px a line, plus the box chrome.
  const HEIGHT_BUDGET = 980;
  const estimate = (e: KeyEntry) =>
    (e.head ? 26 : 0) +
    28 +
    Math.ceil((e.label.length + e.ans.length) / 78) * 15;
  // Shares the student pages' balanced packer, so the answer key can't produce
  // the lopsided split either: a key that runs 10% over used to print as one
  // dense sheet plus a sheet holding a single answer.
  const groups = packIntoPages(
    entries.map((e) => ({ est: estimate(e), entry: e })),
    HEIGHT_BUDGET
  ).map((page) => page.map((b) => b.entry));
  return (
    <>
      {groups.map((group, gi) => (
        <Sheet key={gi} className="pk-page pk-page--teacher">
          <HeaderRow
            title={`FULL ANSWER KEY${groups.length > 1 ? ` · ${gi + 1}/${groups.length}` : ""}`}
            badge="TEACHER ONLY"
          />
          {entries.length === 0 && (
            <p className="text-xs text-gray-600">No keyed prompts in this pack yet.</p>
          )}
          <div className="flex flex-col gap-1.5">
            {group.map((e, i) => (
              <div key={i}>
                {e.head && (
                  <div className="pk-key-head mb-1 mt-1 text-sm font-black text-slate-800">
                    {e.head}
                  </div>
                )}
                <div className="pk-answer rounded border border-slate-300 bg-slate-50 p-2 text-xs">
                  <div className="pk-answer-q font-bold text-gray-800">{e.label}</div>
                  <div className="pk-answer-a mt-0.5 italic text-amber-800">{e.ans}</div>
                </div>
              </div>
            ))}
          </div>
          <Footer text={`${kit.brand} · ANSWER KEY ${pack.lessonCode}`} />
        </Sheet>
      ))}
    </>
  );
}
