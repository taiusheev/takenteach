/**
 * THE ASCENT HOUSE STANDARD — the founder's own lesson design, as code.
 *
 * Every pack we generate has to print at least as well as the packs he already
 * teaches from. A prompt cannot promise that: a model asked to "be bold" can
 * come back with a 46px page title, a masthead that eats a sixth of the sheet,
 * or two side tints that photocopy to the same grey. So the floor lives here
 * instead, as a real stylesheet that ships whether or not a pack has ever been
 * near the design stage.
 *
 * Two things use it:
 *   1. It is injected on EVERY pack, underneath the pack's own designCss. An
 *      undesigned pack prints as his house style rather than as a default; a
 *      designed one overrides what it wants and inherits the rest.
 *   2. `houseFloor()` measures a rendered design against the same numbers. A
 *      design that comes out worse than the house standard is not shipped —
 *      the pack falls back to this stylesheet.
 *
 * ── WHERE THE NUMBERS COME FROM ──
 * Measured from his two systems, not invented:
 *   `war_powers_lesson4_masterclass_v10.html` (elite) — cover 52px / h1 25px /
 *   section 13.2px / body 12–13px / labels 11px; cards white, 1px slate-300,
 *   radius 10px, shadow `0 2px 6px rgba(15,23,42,.05)`, padding 8–9px, a 4px
 *   left rail in the side colour; header band `linear-gradient(135deg, navy,
 *   blue)` with a 4px gold underrule; page-content padding `8mm 12mm 5mm`, gap
 *   3.1mm; footer hairline + `counter(pagenum, decimal-leading-zero)`.
 *   `PF War_Powers_Textbook_Master_v7_0_ModernFederal_A4.html` (federal) — the
 *   same skeleton with a heavier hand: 10px rail, hard offset shadows, and an
 *   accent that switches by cohort (novice blue / JV violet / teacher orange).
 *
 * Written against OUR component hooks, so it is his system on our markup.
 */

/** One line describing the house look, for a pack that has no design note. */
export const HOUSE_NOTE =
  "Ascent house standard — the academy's own lesson design: navy-to-accent masthead band under a gold underrule, hairline cards on a left side-rail, semantic Pro/Con/teacher colour, 25px page titles on 13px body, numbered page pill.";

/**
 * The NOVICE house standard, for the young/novice bands.
 *
 * The elite stylesheet below is one of his two systems, not the only one. The
 * novice UBI series — the packs he actually teaches the beginner cohorts from —
 * is built the opposite way round, and the difference is not decoration: a
 * twelve-year-old finds the next thing to do by looking for a heavy black box,
 * not a hairline. Measured from `ascent_novice_L1_v4_final.html` and confirmed
 * against L2/L4/L5 of the same series, which share the stylesheet verbatim.
 */
export const HOUSE_NOVICE_NOTE =
  "Ascent novice standard — the academy's UBI beginner series: dark space cover in a gold frame, blueprint-grid student pages in a teal frame, red-framed teacher pages; 3px black cards on hard 4px offset shadows, 32px Bebas page titles over a 3px black rule, fillable fields with a red handwritten key.";

/**
 * THE ELITE OVERLAY — the senior register, measured from
 * `war_powers_lesson4_masterclass_v10.html`.
 *
 * The base sheet below already carries his elite skeleton: navy-to-accent
 * masthead under a gold underrule, hairline cards, the semantic palette. What it
 * did NOT carry is the thing that actually makes that pack read as serious, and
 * it is not any single component — it is INK DISCIPLINE.
 *
 * In his masterclass, `.body-copy` is `--slate-700`. Not near-black: grey. The
 * near-black is reserved for headings, and small labels drop further to
 * `--slate-500`. A page built that way has a visible hierarchy before you read a
 * word of it, and it stops feeling like a worksheet where everything shouts at
 * the same volume. Ours printed body copy at near-black, which is exactly the
 * register a fourteen-year-old varsity debater reads as "school".
 *
 * The other half is what is ABSENT. There is no handwriting face anywhere in the
 * elite pack, no Comic Neue, no rounded display type, no emoji, and no hard
 * offset shadows. The type is Oswald over Lexend over Space Mono; the cards are
 * flat with a hairline. Seriousness here is subtraction, not addition.
 *
 * Measured values:
 *   .body-copy      12px / 1.34 / --slate-700
 *   .section-title  13.2px / 800 / --slate-900
 *   .prompt-title   11.3px / 800
 *   .small-label    11px / 700 / --slate-500
 *   .resolution-text 22px / 1.28 / 700
 *   .quote-box      #fff, 1px --slate-200, radius 8, padding 6px 7px, 12px
 *   .judge-move     #fff7ed, 1px #fdba74, border-left 4px #f97316, ink #9a3412
 *   .page-content   padding 8mm 12mm 5mm, gap 3.1mm
 */
export const HOUSE_ELITE_NOTE =
  "Ascent elite standard — the War Powers masterclass register: Oswald over Lexend over Space Mono, grey body copy on near-black headings, flat hairline cards, navy-to-accent masthead under a gold underrule, no handwriting and no hard shadows anywhere.";

export const HOUSE_ELITE_CSS = `
/* ── Ascent ELITE standard (lib/house-design.ts) ───────────────────────────── */
.pk-root{
  /* His full slate ramp. A serious document is built on greys and spends colour
     only where it carries meaning, so the ramp has to exist as tokens or every
     rule reaches for an accent it does not need. */
  --s-50: #f8fafc;  --s-100: #f1f5f9; --s-200: #e2e8f0; --s-300: #cbd5e1;
  --s-500: #64748b; --s-700: #334155; --s-900: #0f172a;

  /* His measured scale — finer than the novice one across the board. */
  --pk-title: 25px;
  --pk-lead: 13.2px;
  --pk-text: 12px;
  --pk-label: 11px;

  /* Flat. The only shadow in his pack is the soft drop under the SHEET, which
     is screen furniture; nothing on the page itself is raised. */
  --pk-box-border: 1px solid var(--s-200);
  --pk-box-radius: 9px;
  --pk-box-shadow: none;
  --pk-rail-w: 4px;
}

/* ── INK DISCIPLINE — the whole register in four rules ── */
.pk-root .pk-page{ color: var(--s-700); }
.pk-root .pk-layer-text,
.pk-root .pk-bubble,
.pk-root .pk-twist-text,
.pk-root .pk-step-text,
.pk-root .pk-prompt-label,
.pk-root .pk-card-para,
.pk-root .pk-chain-row,
.pk-root .pk-cvr-objective-text{
  color: var(--s-700);
  font-size: var(--pk-text);
  line-height: 1.34;
}
/* Headings keep the near-black; small labels drop to grey.
   NOT the side chips or the section bar: those sit on FILLED backgrounds — a
   green Pro chip, a coloured caption bar — and the base sheet already puts white
   on them. Painting them near-black here put 17 labels under 4.5:1 on a single
   pack, which is exactly the failure the ink discipline is supposed to prevent.
   The rule is "text on PAPER goes grey", never "all small text goes grey". */
.pk-root .pk-layer-name{ color: var(--s-900); }
.pk-root .pk-cover-name-label,
.pk-root .pk-criteria-label,
.pk-root .pk-flow-note,
.pk-root .pk-echo-sub,
.pk-root .pk-crossfire-note{ color: var(--s-500); }
/* The layer note sits on the layer's own tint, not on white, so it takes the
   darker grey — --s-500 on a tint measured under AA. */
.pk-root .pk-layer-note{ color: var(--s-700); }

/* Cards are FLAT hairlines — his .quote-box exactly. */
.pk-root .pk-box,
.pk-root .pk-prompt,
.pk-root .pk-chain,
.pk-root .pk-card,
.pk-root .pk-scene,
.pk-root .pk-quiz,
.pk-root .pk-flow,
.pk-root .pk-ballot,
.pk-root .pk-key{
  box-shadow: none;
  border-radius: 9px;
}
.pk-root .pk-box,
.pk-root .pk-card,
.pk-root .pk-scene,
.pk-root .pk-quiz{ border: 1px solid var(--s-200); }
/* The layer strip and its rows keep the argument-layer COLOUR — that code is
   shared by both registers and a senior debater needs it as much as a novice —
   but not the novice's black frame and hard offset. Hairline and flat. */
.pk-root .pk-layer-cell{
  border: 1px solid var(--s-300); box-shadow: none; border-radius: 8px;
}
.pk-root .pk-layer-card{ border-width: 1px; }
.pk-root .pk-layer-initial{ font-weight: 500; }

/* NO HANDWRITING, NO COMIC, NO ROTATION. The novice sheet reveals the answer key
   in red marker; at this level that reads as a children's book, so the key is
   the same face at weight 700 in a restrained red. */
.pk-root .pk-input[data-answer],
.pk-root:not(.answers-hidden) .pk-input[data-answer],
.pk-root .answer-key{
  font-family: var(--pk-body), sans-serif !important;
  font-weight: 700 !important;
  font-style: normal !important;
  color: #b91c1c !important;
  background: transparent !important;
}
.pk-root .pk-cvr-nameline{ font-family: var(--pk-body), sans-serif; }
.pk-root .pk-cvr-skill{ transform: none; box-shadow: none; }

/* His judge-move panel, to the value — the one warm colour on a grey page, and
   it is spent on what the judge is actually deciding. */
.pk-root .pk-judge{
  background: #fff7ed;
  border: 1px solid #fdba74;
  border-left: 4px solid #f97316;
  border-radius: 10px;
  color: #9a3412;
  font-size: 11px;
  line-height: 1.2;
}

/* The sheet carries the only shadow, and only on screen. */
.pk-root .print-page{ box-shadow: 0 12px 28px rgba(15,23,42,.16); }
@media print{ .pk-root .print-page{ box-shadow: none; } }

/* ── THE ELITE COVER ──
   His .focus-box: the same card as the hero box, railed in the accent rather
   than gold, so the two read as a pair with a stated priority. */
.pk-root .pk-cover-focus{
  width: 100%; max-width: 30rem;
  background: #fff; border: 1px solid var(--s-300);
  border-left: 5px solid var(--pk-accent);
  border-radius: 12px; box-shadow: 0 4px 10px rgba(15,23,42,.06);
  padding: 11px 14px; margin-bottom: 12px; text-align: left;
}
.pk-root .pk-cover-focus-label{
  display: block; margin-bottom: 4px;
  font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
  color: var(--s-500);
}
.pk-root .pk-cover-focus-text{ font-size: 12.5px; line-height: 1.4; color: var(--s-700); }
/* His resolution is 22px/1.28/700 — the largest body text in the pack, and the
   only thing on the cover allowed to compete with the title. */
.pk-root .pk-cover .pk-cover-anchor-text{
  font-size: 22px !important; line-height: 1.28 !important; font-weight: 700 !important;
  color: var(--s-900) !important;
}
/* Ruled fields, not a handwriting line. */
.pk-root .pk-cover-rule{
  height: 26px; border-bottom: 1px solid var(--s-300);
}
.pk-root .pk-cover .pk-cover-check{
  color: var(--s-500) !important; background: transparent !important;
  border-radius: 0 !important; width: auto !important; height: auto !important;
  font-size: 10px; font-weight: 700; letter-spacing: 1px;
}
`;

export const HOUSE_DESIGN_CSS = `
/* ── Ascent house standard (lib/house-design.ts) ───────────────────────────── */
.pk-root{
  /* His measured type scale. A 2x title-to-body ratio, not 3x: the page title
     is a label for the work, not a poster. */
  --pk-title: 25px;
  --pk-lead: 15px;
  --pk-text: 13px;
  --pk-label: 11px;

  /* Cards are quiet: a hairline, a small radius, and a shadow you can barely
     see. All of the visual weight is spent on the rail and the masthead. */
  --pk-box-border: 1px solid var(--pk-rule, #cbd5e1);
  --pk-box-radius: 10px;
  --pk-box-shadow: 0 2px 6px rgba(15,23,42,.06);
  --pk-rail-w: 4px;

  --pk-headrule: 3px solid var(--pk-accent);
}

/* THE MASTHEAD IS A BAND, not a heading with a line under it. His pages open
   with a filled bar and a hard accent underrule; it is the single strongest
   piece of identity on the sheet and it costs about 60px. */
.pk-root .pk-masthead{
  /* background-COLOR under the gradient, not the background shorthand. The runtime
     contrast pass reads getComputedStyle().backgroundColor, and a gradient
     leaves that transparent — so a white title on a navy band measured as
     white-on-cream and got "rescued" to black on 26 mastheads. A solid colour
     underneath states the truth for both the checker and a printer that drops
     background images. */
  background-color: var(--pk-ink, #16233d);
  background-image: linear-gradient(135deg, var(--pk-ink, #16233d), color-mix(in srgb, var(--pk-accent) 65%, var(--pk-ink, #16233d)));
  border-bottom: 4px solid var(--pk-highlight, #facc15);
  border-radius: 8px 8px 0 0;
  padding: 10px 14px 8px;
  margin-bottom: 12px;
  align-items: center;
}
.pk-root .pk-title{
  font-size: var(--pk-title);
  line-height: 1.08;
  font-weight: 800;
  color: var(--pk-paper, #fff);
  letter-spacing: 0.2px;
}
.pk-root .pk-masthead .pk-badge,
.pk-root .pk-masthead > span{
  background: var(--pk-paper, #fff);
  color: var(--pk-ink, #16233d);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: var(--pk-label);
  font-weight: 800;
  letter-spacing: 1px;
}

/* Section labels: small, tracked, uppercase — a caption bar, never a headline. */
.pk-root .pk-section-label{
  font-size: var(--pk-label);
  font-weight: 800;
  letter-spacing: 1.4px;
  text-transform: uppercase;
}

/* THE RAIL. Side and role read from the left edge of every card, which is what
   still works after the pack has been through a mono photocopier. */
.pk-root .pk-box,
.pk-root .pk-prompt,
.pk-root .pk-chain,
.pk-root .pk-card{
  border: 1px solid var(--pk-rule, #cbd5e1);
  border-left: var(--pk-rail-w) solid var(--pk-rail, var(--pk-side, var(--pk-accent)));
  border-radius: 10px;
  box-shadow: 0 2px 6px rgba(15,23,42,.06);
  background: var(--pk-paper, #fff);
}
.pk-root .pk-prompt{ background: var(--pk-side-tint, #fbfbfa); padding: 10px 12px; }
.pk-root .pk-chain{ padding: 10px 11px; }
.pk-root .pk-prompt-side,
.pk-root .pk-chain-side{
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 10px;
  letter-spacing: 1px;
}

/* The scene reads as a transcript, not a comic: a tinted situation bar and
   quiet bubbles carrying the side colour on their own rail. */
.pk-root .pk-scene{
  border: 1px solid var(--pk-rule, #cbd5e1);
  border-radius: 10px;
  box-shadow: 0 2px 6px rgba(15,23,42,.06);
}
.pk-root .pk-bubble{
  border: 1px solid var(--pk-rule, #cbd5e1);
  border-left: 4px solid var(--pk-side, var(--pk-accent));
  border-radius: 8px;
  background: var(--pk-side-tint, #fff);
}
.pk-root .pk-avatar{
  border: 2px solid var(--pk-side, var(--pk-ink));
  width: 34px; height: 34px; font-size: 14px;
}

/* The two blocks that must not be missed: what to remember, and what the judge
   is deciding. One is filled, one is outlined, so they never compete. */
.pk-root .pk-key{
  border: 1px solid var(--pk-rule, #cbd5e1);
  border-left: 5px solid var(--pk-highlight, #facc15);
  border-radius: 10px;
  background: color-mix(in srgb, var(--pk-highlight, #facc15) 14%, var(--pk-paper, #fff));
  color: var(--pk-ink, #0f172a);
}
.pk-root .pk-judge{
  border: 1px dashed var(--pk-accent);
  border-left: 5px solid var(--pk-accent);
  border-radius: 10px;
  background: var(--pk-paper, #fff);
}

/* Evidence: the LIMIT panel is the loudest thing on the card, on purpose —
   it is the integrity feature the whole deck rests on. */
.pk-root .pk-card-limit{
  border-radius: 8px;
  font-weight: 700;
}
.pk-root .pk-card-id{
  border-radius: 999px;
  padding: 2px 9px;
  font-weight: 800;
  letter-spacing: 1px;
}

/* Tables are his run-sheet workhorse: hairline grid, filled header row. */
.pk-root .pk-timing th,
.pk-root .pk-timing-head{
  background: color-mix(in srgb, var(--pk-ink, #0f172a) 8%, var(--pk-paper, #fff));
  font-weight: 800;
  letter-spacing: 0.6px;
}
.pk-root .pk-timing td,
.pk-root .pk-timing th{ border-color: var(--pk-rule, #cbd5e1); }

/* Teacher sheets carry the role hue on the band, the rules and the rails. */
.pk-root .pk-page--teacher{ --pk-accent: var(--pk-teacher); --pk-rail: var(--pk-teacher); }
.pk-root .pk-teacheronly{
  border-radius: 999px;
  padding: 3px 10px;
  font-weight: 800;
  letter-spacing: 1.2px;
}

/* ── THE COVER ─────────────────────────────────────────────────────────────
   His lesson cover is its own object, and it is NOT the night-mode treatment
   his textbook uses for quizzes — it is light, centred and calm, measured from
   '.cover-page' in the elite pack:
     .cover-page .page-content { padding:14mm 16mm 10mm }
     .cover-content { flex column; center; gap:6mm; height:100% }
     .logo-frame { 48mm square; 1.5px slate-300; radius 14px; white;
                   box-shadow: 0 6px 16px rgba(15,23,42,.08); padding:5mm }
     .cover-title { 52px / .94 / 800 }   .cover-subtitle { 17px / 1.2 / 600 }
     .hero-box  { white; 1px slate-300; radius 12; 0 4px 10px shadow;
                  border-left: 5px solid var(--gold); text-align:left }
     .focus-box { same, border-left: 5px solid var(--blue) }
     .name-card { same card }
     .blueprint-bg { 20px grid of 1px accent lines at 5% }
   The cover elements still carry inline styles, so these rules need
   !important — same rule the design prompt gives the model. */
.pk-root .pk-cover{
  /* His 14mm/16mm/10mm, trimmed at head and foot. The cover is the one page
     the runtime fit pass does NOT wrap, so it cannot shrink to cope — it
     clips. At his exact padding this cover measured 1118px into a 1123px
     sheet, five pixels from losing the name card, and one more success
     criterion would have taken it. The side margin — the part you actually
     read as generosity — is his. */
  padding: 11mm 16mm 8mm !important;
  background-image:
    linear-gradient(color-mix(in srgb, var(--pk-accent) 6%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--pk-accent) 6%, transparent) 1px, transparent 1px) !important;
  background-size: 20px 20px !important;
}

/* ── THE COVER ART LAYER ────────────────────────────────────────────────────
   Absolutely positioned, out of flow, behind everything, and — the reason it
   is built this way — invisible to the runtime fit pass, which measures
   .pk-fit — a title page has no continuation sheet, so anything that can add
   height to one can silently delete its own bottom edge. This cannot.

   The layer sits at z-index 0 with the content column lifted to 1, rather than
   at -1: a negative index would drop the art behind the page's own background
   and the whole thing would simply never appear. */
.pk-root .pk-cover .pk-cvr-art{
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  z-index: 0; pointer-events: none;
}
.pk-root .pk-cover > .pk-fit{ position: relative; z-index: 1; }

/* ── THE SLACK SPACERS ──────────────────────────────────────────────────────
   Zero-height boxes that grow into space the sheet already had spare, at a
   1:2 ratio: the composition drops by a third of the surplus, and the lower
   two thirds stay open as the void the seal fills. flex-grow can only ever
   distribute FREE space, so on a cover with none they collapse and the layout
   is untouched — which is why moving the composition down cannot be the cause
   of an overflowing title page. */
.pk-root .pk-cover .pk-cvr-space{ flex: 1 1 0; min-height: 0; width: 100%; }
.pk-root .pk-cover .pk-cvr-space--seal{ flex-grow: 2; position: relative; }

/* The seal is centred on ITS OWN box — the void — not on the page, so it
   follows the composition instead of being pinned to a guessed coordinate.
   It is wider than the text column on purpose: the rings run out past the
   trim, and the arcs surviving in the side gutters are what stop a centred
   motif reading as a logo stamped in the middle of the sheet.

   z-index -1, not 0: .pk-fit above carries z-index 1 and so opens a stacking
   context, and a positioned child at 0 would paint OVER the cards in it. At
   -1 it drops behind the content but still above the page's own background,
   which is exactly the one layer it wants. */
.pk-root .pk-cover .pk-cvr-seal{
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  width: 794px; height: 620px;
  z-index: -1; pointer-events: none;
}
/* The size is set per register on the element itself; this carries the face.
   The negative tracking is what stops two digits reading as two objects. */
.pk-root .pk-cvr-art-num{
  font-family: var(--pk-display), Georgia, serif;
  font-weight: 900; letter-spacing: -10px;
}

/* The lesson code sits in a square frame, not a badge disc: it reads as the
   spine label of a document rather than as a sticker. */
.pk-root .pk-cover .pk-cover-glyph{
  /* His frame is 48mm because it holds a logo. Ours holds a two-character
     lesson code, and at that size the box read as empty — so it is sized to
     its contents instead: a smaller frame with the code filling it, which is
     the same object, not a box with something lost in the middle. */
  width: 30mm !important;
  height: 30mm !important;
  border-radius: 14px !important;
  border: 2px solid var(--pk-ink, #0f172a) !important;
  background: var(--pk-paper, #fff) !important;
  color: var(--pk-ink, #0f172a) !important;
  box-shadow: 0 6px 16px rgba(15,23,42,.10) !important;
  font-size: 2.9rem !important;
  line-height: 1 !important;
  display: grid !important;
  place-items: center !important;
}
/* A logo needs room to breathe inside the frame; a two-character code fills it. */
.pk-root .pk-cover .pk-cover-glyph:has(.pk-cover-logo){
  width: 34mm !important;
  height: 34mm !important;
  padding: 4mm !important;
}
.pk-root .pk-cover .pk-cover-tag{
  font-size: 14px !important;
  font-weight: 700 !important;
  letter-spacing: .05em !important;
}
.pk-root .pk-cover .pk-cover-title{
  font-size: 52px !important;
  line-height: .94 !important;
  font-weight: 800 !important;
}
.pk-root .pk-cover .pk-cover-subtitle{
  font-size: 17px !important;
  line-height: 1.2 !important;
  font-weight: 600 !important;
}
/* The anchor is the hero box — gold rail, because on his covers the gold rail
   is reserved for the one thing that matters most on the page. */
.pk-root .pk-cover .pk-cover-anchor,
.pk-root .pk-cover .pk-cover-criteria,
.pk-root .pk-cover .pk-cover-name{
  background: var(--pk-paper, #fff) !important;
  border: 1px solid var(--pk-rule, #cbd5e1) !important;
  border-radius: 12px !important;
  box-shadow: 0 4px 10px rgba(15,23,42,.06) !important;
  text-align: left !important;
  padding: 12px 14px !important;
}
.pk-root .pk-cover .pk-cover-anchor{ border-left: 5px solid var(--pk-highlight, #facc15) !important; }
.pk-root .pk-cover .pk-cover-criteria{ border-left: 5px solid var(--pk-accent) !important; }
.pk-root .pk-cover .pk-cover-name{ border-left: 5px solid var(--pk-ink, #0f172a) !important; padding: 10px 12px !important; }
.pk-root .pk-cover .pk-bigq-label{ color: var(--pk-accent) !important; }

/* ── MARKS ──
   His component library gives each recurring box its own icon — a lightbulb on
   the analogy, a microphone on Stand & Deliver, a rocket on the Fast Finisher —
   and they do a real job for a twelve-year-old scanning a page for the thing
   they are supposed to do next. They go on the LABEL, never inside a sentence,
   and the label still says the word: the mark is a signpost, not the meaning.
   Set as ::before so no content field has to carry one. */
.pk-root .pk-analogy::before{ content: "💡 "; }
.pk-root .pk-say-label::before{ content: "🎤 "; }
.pk-root .pk-fast-label::before{ content: "🚀 "; }
.pk-root .pk-key-label::before{ content: "★ "; }
.pk-root .pk-judge-label::before{ content: "⚖ "; }
.pk-root .pk-wordbank-label::before{ content: "▤ "; }
.pk-root .pk-card-limit-label::before{ content: "⛔ "; }
/* The four rigor mechanics get their own marks, on the same terms: on the
   LABEL, never inside a sentence, and the label still says the word. */
.pk-root .pk-flow .pk-section-label::before{ content: "✍ "; }
.pk-root .pk-ballot .pk-section-label::before{ content: "⚖ "; }
.pk-root .pk-echo-label::before{ content: "🔁 "; }
.pk-root .pk-crossfire-label::before{ content: "⚔ "; }
/* Emoji ignore colour, so anything that must take the palette stays a drawn
   mark: these are the ones that sit in tinted or dark furniture. */
.pk-root .pk-section-label::before{ content: "◆ "; opacity: .55; }
.pk-root .pk-chain-side::before{ content: "▸ "; }

/* Footer: a hairline, the pack's name at one end, a numbered pill at the other.
   The RULE colour and the TEXT colour are separate jobs — a hairline is chosen
   to be nearly invisible, and the footer inherited it as ink, so every footer
   line came out pale-on-paper and had to be rescued to black at print time.
   Muted ink instead: quiet, and readable without help. */
.pk-root .print-footer{
  border-top: 1px solid var(--pk-rule, #cbd5e1);
  color: color-mix(in srgb, var(--pk-ink, #0f172a) 72%, var(--pk-paper, #fff));
  font-size: var(--pk-label);
  letter-spacing: 1.4px;
  padding-top: 6px;
}
.pk-root .pk-cover-kicker{
  color: color-mix(in srgb, var(--pk-ink, #0f172a) 72%, var(--pk-paper, #fff));
}
/* ── HIS PALETTE, AS A SEMANTIC CODE ───────────────────────────────────────
   Straight from the elite pack's stylesheet. The rule that makes his pages
   look designed and mine look repetitive is not the card shape — it is that
   EVERY BLOCK TYPE CARRIES ITS OWN HUE, as a soft tint with a matching 4px
   rail. .pro-card is #eff6ff on #2563eb, .con-card #fef2f2 on #dc2626,
   .gold-card #fffdf0 on #facc15, .teacher-card #f7fffb on #047857, the note
   strip #fffbeb, junior tier #ecfeff on #06b6d4, varsity tier #f5f3ff on
   #8b5cf6. One accent everywhere is what turns 27 sheets into one page
   printed 27 times. */
/* ── THE ARGUMENT-LAYER CODE ───────────────────────────────────────────────
   Measured from the L10 lesson in ascent_UBI_hub_4_10.html (.step-claim,
   .step-context, .step-evidence, .step-warrant, .step-impact). Every layer of
   an argument has ONE hue, held across every page and every lesson, so a
   student learns "the warrant is the violet one" and then recognises it in a
   model, in a flow grid and in their own writing without reading the label.
   Absolute by design — see lib/argument-layers.ts for why this is a lookup
   table and not something a design system gets to reinterpret. */
.pk-root{
  --layer-claim: #2563eb;    --layer-claim-soft: #dbeafe;
  --layer-context: #ea580c;  --layer-context-soft: #ffedd5;
  --layer-evidence: #059669; --layer-evidence-soft: #d1fae5;
  --layer-warrant: #7c3aed;  --layer-warrant-soft: #ede9fe;
  --layer-impact: #d97706;   --layer-impact-soft: #fef3c7;
}
/* HIS .peel-row / .peel-letter: a big initial in the layer colour beside a
   tinted card. Four rows of this and a student reads P E E L down the left edge
   in four colours — the argument's structure, drawn. */
.pk-root .pk-layer-initial{
  min-width: 26px; text-align: center;
  font-size: 1.55rem; line-height: 1.05; font-weight: 400;
}
.pk-root .pk-layer-card{
  border: 2px solid var(--layer-line, #cbd5e1);
  background: var(--layer-fill, #f8fafc);
  border-radius: 8px; padding: 6px 9px;
}
.pk-root .pk-layer-name{
  display: block; font-size: 11px; font-weight: 800;
  letter-spacing: .6px; text-transform: uppercase; margin-bottom: 2px;
}
.pk-root .pk-layer-text{ font-size: 12px; line-height: 1.45; color: #1f2937; }
.pk-root .pk-layer-note{
  margin-top: 3px; font-size: 10px; font-style: italic; color: #64748b;
}
/* WHICH TOPIC A PAGE RUNS ON. Two states of one band, and they must not look
   alike: the practice band is quiet (this is a rehearsal, on purpose), the
   handover band is the loudest non-title thing on its page (the topic just
   changed, and a student who misses that writes about the wrong thing). */
.pk-root .pk-topicband--practice{
  border: 1px dashed color-mix(in srgb, var(--pk-ink, #0f172a) 30%, transparent);
  color: color-mix(in srgb, var(--pk-ink, #0f172a) 74%, var(--pk-paper, #fff));
}
.pk-root .pk-topicband--handover{
  background: var(--pk-ink, #0f172a);
  color: var(--pk-paper, #fff);
}

/* A CARD WITH A JOB. Ruled rows, not cards: this block sits on a page that
   already carries the evidence deck's own cards, and a second card treatment
   here would compete with them for the same eye. */
.pk-root .pk-cardjob{ border-top: 1px solid var(--pk-rule, #cbd5e1); }
.pk-root .pk-cardjob:first-child{ border-top: 0; }
.pk-root .pk-cardjob-id{
  background: color-mix(in srgb, var(--pk-ink, #0f172a) 8%, var(--pk-paper, #fff));
  color: color-mix(in srgb, var(--pk-ink, #0f172a) 82%, var(--pk-paper, #fff));
  letter-spacing: .5px;
}
.pk-root .pk-cardjob-name{ color: color-mix(in srgb, var(--pk-ink, #0f172a) 62%, var(--pk-paper, #fff)); }
.pk-root .pk-cardjob-instruction{ color: color-mix(in srgb, var(--pk-ink, #0f172a) 78%, var(--pk-paper, #fff)); }

/* THE PASS CONDITION. Upright, not italic, and rule-separated from the note
   above it — the note is an aside about the model, this is a test the student
   runs on their own sentence, and the two must not read as one voice. */
.pk-root .pk-layer-passes{
  margin-top: 4px; padding-top: 3px; font-size: 10px; line-height: 1.35;
  border-top: 1px dotted color-mix(in srgb, var(--pk-ink, #0f172a) 22%, transparent);
  color: color-mix(in srgb, var(--pk-ink, #0f172a) 76%, var(--pk-paper, #fff));
}
.pk-root .pk-layer-passes-label{
  font-size: 8.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
  color: color-mix(in srgb, var(--pk-ink, #0f172a) 52%, var(--pk-paper, #fff));
}
.pk-root .pk-layer--claim{ --layer-line: var(--layer-claim); --layer-fill: var(--layer-claim-soft); }
.pk-root .pk-layer--claim .pk-layer-initial,
.pk-root .pk-layer--claim .pk-layer-name{ color: #1e3a8a; }
.pk-root .pk-layer--context{ --layer-line: var(--layer-context); --layer-fill: var(--layer-context-soft); }
.pk-root .pk-layer--context .pk-layer-initial,
.pk-root .pk-layer--context .pk-layer-name{ color: #7c2d12; }
.pk-root .pk-layer--evidence{ --layer-line: var(--layer-evidence); --layer-fill: var(--layer-evidence-soft); }
.pk-root .pk-layer--evidence .pk-layer-initial,
.pk-root .pk-layer--evidence .pk-layer-name{ color: #065f46; }
.pk-root .pk-layer--warrant{ --layer-line: var(--layer-warrant); --layer-fill: var(--layer-warrant-soft); }
.pk-root .pk-layer--warrant .pk-layer-initial,
.pk-root .pk-layer--warrant .pk-layer-name{ color: #5b21b6; }
.pk-root .pk-layer--impact{ --layer-line: var(--layer-impact); --layer-fill: var(--layer-impact-soft); }
.pk-root .pk-layer--impact .pk-layer-initial,
.pk-root .pk-layer--impact .pk-layer-name{ color: #92400e; }
/* THE LAYER STRIP — his .matrix-card step-* band, five cards across a grid.
   The worked example teaches the layers in a column; this teaches them as a
   SHAPE, one card per layer, so a student sees the whole argument at once
   before they try to build one. Each card is the layer's own hue on a 3px black
   frame, which is the novice card treatment — so the strip reads as five
   objects of equal weight, differing only in colour. */
.pk-root .pk-layer-strip{
  display: grid;
  grid-template-columns: repeat(var(--layer-cols, 5), minmax(0, 1fr));
  gap: 6px;
}
.pk-root .pk-layer-cell{
  border: 3px solid #000; border-radius: 8px; box-shadow: 3px 3px 0 #000;
  padding: 7px 5px; text-align: center; background: #fff;
}
.pk-root .pk-layer-cell-name{
  font-family: var(--pk-display), sans-serif;
  font-size: 1.15rem; line-height: 1; letter-spacing: .5px; text-transform: uppercase;
}
.pk-root .pk-layer-cell-hint{ font-size: 10px; font-weight: 700; line-height: 1.3; margin-top: 2px; }
.pk-root .pk-layer-cell--claim{ background: var(--layer-claim-soft); }
.pk-root .pk-layer-cell--claim .pk-layer-cell-name{ color: #1e3a8a; }
.pk-root .pk-layer-cell--context{ background: var(--layer-context-soft); }
.pk-root .pk-layer-cell--context .pk-layer-cell-name{ color: #7c2d12; }
.pk-root .pk-layer-cell--evidence{ background: var(--layer-evidence-soft); }
.pk-root .pk-layer-cell--evidence .pk-layer-cell-name{ color: #065f46; }
.pk-root .pk-layer-cell--warrant{ background: var(--layer-warrant-soft); }
.pk-root .pk-layer-cell--warrant .pk-layer-cell-name{ color: #5b21b6; }
.pk-root .pk-layer-cell--impact{ background: var(--layer-impact-soft); }
.pk-root .pk-layer-cell--impact .pk-layer-cell-name{ color: #92400e; }

/* The flow grid's three columns ARE three argument layers, so they take the
   same code — the whole point is that it is the same colour everywhere. */
.pk-root .pk-flow-head:nth-child(1){ background: var(--layer-claim-soft); color: #1e3a8a; }
.pk-root .pk-flow-head:nth-child(2){ background: var(--layer-warrant-soft); color: #5b21b6; }
.pk-root .pk-flow-head:nth-child(3){ background: var(--layer-evidence-soft); color: #065f46; }

.pk-root{
  --h-blue: #2563eb;   --h-blue-soft: #eff6ff;   --h-blue-ink: #1d4ed8;
  --h-red: #dc2626;    --h-red-soft: #fef2f2;    --h-red-ink: #b91c1c;
  --h-green: #047857;  --h-green-soft: #f7fffb;  --h-green-ink: #065f46;
  --h-gold: #facc15;   --h-gold-soft: #fffdf0;   --h-gold-ink: #92400e;
  --h-violet: #8b5cf6; --h-violet-soft: #f5f3ff; --h-violet-ink: #5b21b6;
  --h-cyan: #06b6d4;   --h-cyan-soft: #ecfeff;   --h-cyan-ink: #155e75;
  --h-indigo: #6366f1; --h-indigo-soft: #eef2ff; --h-indigo-ink: #3730a3;
  --h-amber-soft: #fffbeb; --h-amber-line: #fde68a;
  --h-slate: #64748b;  --h-slate-soft: #f8fafc;  --h-line: #cbd5e1;
}

/* Sides keep the semantic code they always had, now with his exact values. */
.pk-root .pk-prompt--pro, .pk-root .pk-chain--pro{
  background: var(--h-blue-soft); border-color: var(--h-line);
  border-left-color: var(--h-blue);
}
.pk-root .pk-prompt--con, .pk-root .pk-chain--con{
  background: var(--h-red-soft); border-color: var(--h-line);
  border-left-color: var(--h-red);
}
.pk-root .pk-prompt--neutral{
  background: var(--h-slate-soft); border-left-color: var(--h-slate);
}
.pk-root .pk-prompt--pro .pk-prompt-side, .pk-root .pk-chain--pro .pk-chain-side{
  background: var(--h-blue); --pk-fill: var(--h-blue);
}
.pk-root .pk-prompt--con .pk-prompt-side, .pk-root .pk-chain--con .pk-chain-side{
  background: var(--h-red); --pk-fill: var(--h-red);
}

/* THE COACHING LINES — what to put in the box, and the wrong move made here.
   Student-facing (see promptSchema), so they must NOT read as answer-key ink:
   the key is red marker on a filled field, and these are quiet notes on paper
   just above it.

   Ink only, no fills. A tinted row would sit on top of the prompt's own side
   tint — two washes stacked — and every filled chip is another element the
   contrast pass has to rescue. Instead the pair is separated by a hairline
   rail and by the tag colour alone, and both tags stay legible in greyscale
   because they differ from the paper by LIGHTNESS, not only by hue. */
.pk-root .pk-coach{
  border-left: 2px solid color-mix(in srgb, var(--pk-ink, #0f172a) 18%, transparent);
  padding-left: 8px;
}
.pk-root .pk-coach-row{
  color: color-mix(in srgb, var(--pk-ink, #0f172a) 78%, var(--pk-paper, #fff));
}
.pk-root .pk-coach-tag{
  font-size: 9px;
  letter-spacing: 1.1px;
  margin-right: 2px;
}
.pk-root .pk-coach-row--do .pk-coach-tag{ color: var(--h-green-ink); }
.pk-root .pk-coach-row--dont .pk-coach-tag{ color: var(--h-red-ink); }

/* The thing that matters most is the gold card; the elite read is violet —
   his own tier colour for the harder register. They must not look alike. */
.pk-root .pk-key{
  background: var(--h-gold-soft); border-color: var(--h-amber-line);
  border-left: 5px solid var(--h-gold); color: var(--pk-ink);
}
.pk-root .pk-key-label{ color: var(--h-gold-ink); }
.pk-root .pk-judge{
  background: var(--h-violet-soft); border: 1px solid #ddd6fe;
  border-left: 5px solid var(--h-violet); color: var(--h-violet-ink);
}
.pk-root .pk-judge-label{ color: var(--h-violet-ink); }
.pk-root .pk-judge-text{ color: var(--pk-ink); }

/* Stand & Deliver is red and Fast Finisher indigo in his own component
   library — an oral task and a stretch task should never read as the same box. */
.pk-root .pk-say{
  background: var(--h-red-soft); border: 1px solid #fecaca;
  border-left: 5px solid var(--h-red); color: #7f1d1d;
}
.pk-root .pk-say-label{ color: var(--h-red-ink); }
.pk-root .pk-fast{
  background: var(--h-indigo-soft); border: 1px solid #c7d2fe;
  border-left: 5px solid var(--h-indigo);
}

/* ── FIGURES ────────────────────────────────────────────────────────────────
   Every figure reads --pk-fig-on / --pk-fig-off / --pk-fig-line and nothing
   else, so a register redefines three tokens and the whole set redraws in its
   own ink. Filled marks also carry a BORDER, not just a fill: on a photocopier
   a mid-tone fill and its background converge, and the outline is what keeps a
   filled box distinguishable from an empty one. */
.pk-root{
  --pk-fig-on: var(--pk-accent, #2563eb);
  --pk-fig-off: color-mix(in srgb, var(--pk-ink, #0f172a) 12%, var(--pk-paper, #fff));
  --pk-fig-line: color-mix(in srgb, var(--pk-ink, #0f172a) 34%, var(--pk-paper, #fff));
}
.pk-root .pk-fig-caption{ color: color-mix(in srgb, var(--pk-ink, #0f172a) 80%, var(--pk-paper, #fff)); }
.pk-root .pk-fig-exact{ color: color-mix(in srgb, var(--pk-ink, #0f172a) 66%, var(--pk-paper, #fff)); }
.pk-root .pk-fig-source{ color: color-mix(in srgb, var(--pk-ink, #0f172a) 55%, var(--pk-paper, #fff)); letter-spacing: .03em; }

/* unit chart */
.pk-root .pk-unitchart{ display: flex; flex-direction: column; gap: 7px; }
.pk-root .pk-unitrow{ display: flex; align-items: center; gap: 10px; }
.pk-root .pk-unitgrid{
  display: grid; grid-template-columns: repeat(25, 1fr); gap: 1.5px; flex: 1 1 auto; min-width: 0;
}
.pk-root .pk-unit{ aspect-ratio: 1; border-radius: 1px; }
.pk-root .pk-unit--off{ background: var(--pk-fig-off); }
.pk-root .pk-unit--on{ background: var(--pk-fig-on); border: .5px solid var(--pk-fig-line); }
/* The earlier series is hollow rather than a second hue — one colour, two
   states, so the pair still reads when the page is photocopied. */
.pk-root .pk-unit--then{ background: transparent; border: 1px solid var(--pk-fig-on); }
.pk-root .pk-unitmeta{ display: flex; flex-direction: column; align-items: flex-end; flex: none; min-width: 62px; }
.pk-root .pk-unitnum{ font-size: 15px; font-weight: 800; line-height: 1; letter-spacing: -.03em; }
.pk-root .pk-unitof{ font-size: 9px; font-weight: 600; opacity: .55; }
.pk-root .pk-unitlabel{ font-size: 9px; text-align: right; line-height: 1.25; color: color-mix(in srgb, var(--pk-ink, #0f172a) 62%, var(--pk-paper, #fff)); }

/* process flow — the numbered stages along one line */
.pk-root .pk-flowline{
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-wrap: wrap; align-items: stretch; gap: 0;
  border-top: 3px solid var(--pk-fig-on);
}
.pk-root .pk-flowstage{
  flex: 1 1 26%; min-width: 26%;
  display: flex; align-items: baseline; gap: 5px;
  padding: 6px 8px 4px 0;
}
.pk-root .pk-flownum{
  flex: none; font-size: 12px; font-weight: 800; line-height: 1;
  color: var(--pk-fig-on);
}
.pk-root .pk-flowtext{ font-size: 10.5px; line-height: 1.3; }

/* ratio — N small marks, an equals, one big one */
.pk-root .pk-ratio{ display: flex; align-items: center; gap: 12px; }
.pk-root .pk-ratio-side{ flex: 1 1 0; display: flex; flex-direction: column; gap: 5px; align-items: center; }
.pk-root .pk-ratio-marks{ display: flex; flex-wrap: wrap; gap: 3px; justify-content: center; align-items: flex-end; min-height: 26px; }
.pk-root .pk-ratio-mark{ background: var(--pk-fig-on); border: .5px solid var(--pk-fig-line); border-radius: 1px; }
.pk-root .pk-ratio-mark--small{ width: 8px; height: 12px; }
.pk-root .pk-ratio-mark--big{ width: 30px; height: 26px; }
.pk-root .pk-ratio-eq{ font-size: 17px; font-weight: 800; opacity: .5; flex: none; }
.pk-root .pk-ratio-label{ font-size: 10px; text-align: center; line-height: 1.3; margin: 0; }

/* balance — brings, the subject, costs */
.pk-root .pk-balance{ display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center; }
.pk-root .pk-balance-col{ display: flex; flex-direction: column; gap: 4px; }
.pk-root .pk-balance-head{ padding-top: 3px; border-top: 2px solid var(--pk-fig-line); }
.pk-root .pk-balance-col--brings .pk-balance-head{ border-top-color: var(--pk-fig-on); }
.pk-root .pk-balance-item{ display: flex; flex-direction: column; }
.pk-root .pk-balance-item-head{ font-size: 10px; font-weight: 700; line-height: 1.25; }
.pk-root .pk-balance-item-detail{ font-size: 9px; line-height: 1.25; color: color-mix(in srgb, var(--pk-ink, #0f172a) 62%, var(--pk-paper, #fff)); }
.pk-root .pk-balance-subject{
  flex: none; max-width: 84px; text-align: center; font-size: 10px; font-weight: 800; line-height: 1.2;
  border: 1.5px solid var(--pk-ink, #0f172a); border-radius: 4px; padding: 7px 6px;
}

/* THE EXIT BALLOT. A ruled form, not a card: it is the one block on the pack a
   student fills in while someone else watches, and a form is the shape people
   already know how to complete. Boxes are square and open — a filled tick-box
   invites ticking without reading. */
.pk-root .pk-ballot table{ font-size: 11px; }
.pk-root .pk-ballot-h{
  background: color-mix(in srgb, var(--pk-ink, #0f172a) 6%, var(--pk-paper, #fff));
  color: color-mix(in srgb, var(--pk-ink, #0f172a) 62%, var(--pk-paper, #fff));
  border-bottom: 1px solid var(--pk-rule, #cbd5e1);
}
.pk-root .pk-ballot-row{ border-bottom: 1px solid var(--pk-rule, #cbd5e1); }
.pk-root .pk-ballot-row:last-child{ border-bottom: 0; }
.pk-root .pk-ballot-test{ color: color-mix(in srgb, var(--pk-ink, #0f172a) 62%, var(--pk-paper, #fff)); }
.pk-root .pk-ballot-box{ border: 1.5px solid color-mix(in srgb, var(--pk-ink, #0f172a) 55%, var(--pk-paper, #fff)); background: var(--pk-paper, #fff); }
.pk-root .pk-ballot-move{ border: 1px solid var(--pk-rule, #cbd5e1); }

/* WHY THIS PAGE — the student's reason to care. Ink on paper with a rail, not
   a filled card: it sits directly under the instruction banner, and two tinted
   blocks stacked is how a page stops having a first thing to read. */
.pk-root .pk-why{ border-left-color: var(--pk-rule, #cbd5e1); }
.pk-root .pk-why-label{ color: color-mix(in srgb, var(--pk-ink, #0f172a) 55%, var(--pk-paper, #fff)); }
.pk-root .pk-why-text{ color: color-mix(in srgb, var(--pk-ink, #0f172a) 78%, var(--pk-paper, #fff)); }
.pk-root .pk-fast-label{ color: var(--h-indigo-ink); }

/* Reference furniture: the amber note strip, the cyan check, the slate card. */
.pk-root .pk-wordbank{
  background: var(--h-amber-soft); border: 1px solid var(--h-amber-line);
  border-left: 5px solid #f59e0b;
}
.pk-root .pk-wordbank-label{ color: var(--h-gold-ink); }
.pk-root .pk-analogy{
  background: var(--h-amber-soft); border-left: 4px solid #f59e0b;
  color: var(--h-gold-ink);
}
.pk-root .pk-quiz{
  border: 1px solid var(--h-line); border-left: 5px solid var(--h-cyan);
}
.pk-root .pk-quiz .pk-section-label{ background: var(--h-cyan-soft); color: var(--h-cyan-ink); }
.pk-root .pk-mcq-box{ border-color: var(--h-cyan); }
.pk-root .pk-card{
  background: #fff; border: 1px solid var(--h-line); border-left: 5px solid var(--h-slate);
}
.pk-root .pk-card-id--pro{ background: var(--h-blue-soft); color: var(--h-blue-ink); border: 1px solid #93c5fd; }
.pk-root .pk-card-id--con{ background: var(--h-red-soft); color: var(--h-red-ink); border: 1px solid #fca5a5; }
.pk-root .pk-card-id--neutral{ background: var(--h-slate-soft); color: #334155; border: 1px solid var(--h-line); }
.pk-root .pk-card-trans{ background: var(--h-amber-soft); border-left: 4px solid #f59e0b; }
.pk-root .pk-card-use{ background: var(--h-cyan-soft); border-left: 4px solid var(--h-cyan); }
.pk-root .pk-card-say{ background: var(--h-blue-soft); border-left: 4px solid var(--h-blue); }

/* ── THE RIGOR MECHANICS ───────────────────────────────────────────────────
   Each takes an existing hue from the code above rather than introducing a new
   one — the palette is already carrying side, role and importance, and a
   seventh colour would make the page a swatch book. Flow is cyan (a capture,
   like the quiz check), the ballot line is gold (it decides the round, and gold
   is reserved for what matters most), echo is amber (a warning you give
   yourself), crossfire is red (incoming fire). */
.pk-root .pk-flow{ border-left: 5px solid var(--h-cyan); }
/* The BAR carries white label text, so it takes the INK end of the hue, not the
   bright one: white on #06b6d4 measures 2.4:1 and the contrast pass rescues the
   label to black, which loses the bar. The rail above keeps the bright cyan. */
.pk-root .pk-flow .pk-bar{ background: var(--h-cyan-ink); --pk-fill: var(--h-cyan-ink); }
/* The three column heads are coloured by the ARGUMENT-LAYER code further down,
   not by the flow block's own hue — claim/warrant/data is exactly the code, and
   the mechanic only teaches if the colours match the ones on the worked example.
   This rule carries the shape; the colour arrives with the layer palette. */
.pk-root .pk-flow-head{ border-color: var(--h-line); }
.pk-root .pk-flow-cell{ border-color: var(--h-line); }

.pk-root .pk-ballot{ border-left: 5px solid var(--h-gold); }
.pk-root .pk-ballot .pk-bar{ background: var(--h-gold-ink); --pk-fill: var(--h-gold-ink); }
.pk-root .pk-ballot-ours{ background: var(--h-blue-soft); border-left: 4px solid var(--h-blue); }
.pk-root .pk-ballot-theirs{ background: var(--h-red-soft); border-left: 4px solid var(--h-red); }
.pk-root .pk-ballot-line{
  background: var(--h-gold-soft); border: 1px solid var(--h-amber-line);
  border-left: 5px solid var(--h-gold);
}

.pk-root .pk-echo{
  background: var(--h-amber-soft); border: 1px solid var(--h-amber-line);
  border-left: 5px solid #f59e0b;
}
.pk-root .pk-echo-label{ color: var(--h-gold-ink); }

.pk-root .pk-crossfire{
  background: var(--h-red-soft); border: 1px solid #fecaca;
  border-left: 5px solid var(--h-red);
}
.pk-root .pk-crossfire-label,
.pk-root .pk-crossfire-clock{ color: var(--h-red-ink); }
/* 8px white-on-colour is the tightest type on the page, so both tags take the
   ink end of their hue — white on #8b5cf6 is 4.2:1, which fails AA at this size
   and got rescued to black on every warrant tag in the pack. */
.pk-root .pk-crossfire-tag--warrant{ background: var(--h-violet-ink); color: #fff; }
.pk-root .pk-crossfire-tag--limit{ background: var(--h-red-ink); color: #fff; }

/* Teacher material is green everywhere, his rule — and the limits page is his
   "teacher plus" panel, a shade brighter so the coach finds it fast. */
.pk-root .pk-coach{
  background: var(--h-green-soft); border: 1px solid #a7f3d0;
  border-left: 4px solid var(--h-green);
}
.pk-root .pk-coach-page{ color: var(--h-green-ink); }
.pk-root .pk-limits{ border-left: 5px solid #10b981; }
.pk-root .pk-limits .pk-bar{ background: #10b981; --pk-fill: #10b981; }

/* ── PAGE FAMILIES ─────────────────────────────────────────────────────────
   His headers change colour by what the page IS — student navy-to-blue,
   teacher green, extension violet. Ours ran one band on all fourteen. Five
   families, all from the same palette, so a coach flicking through a printed
   pack can see the lesson change gear. The in-page semantic code is untouched. */
.pk-root .pk-page--learn    { --pk-band: #1e3a8a; --pk-band-2: var(--h-blue); }
.pk-root .pk-page--practise { --pk-band: #0f766e; --pk-band-2: var(--h-cyan); }
.pk-root .pk-page--produce  { --pk-band: #5b21b6; --pk-band-2: #7c3aed; }
.pk-root .pk-page--assess   { --pk-band: #b45309; --pk-band-2: #d97706; }
.pk-root .pk-page--teacher  { --pk-band: var(--h-green-ink); --pk-band-2: var(--h-green); }
.pk-root .pk-masthead{
  background-color: var(--pk-band, var(--pk-ink));
  background-image: linear-gradient(135deg, var(--pk-band, var(--pk-ink)), var(--pk-band-2, var(--pk-accent)));
}

`;

/* ══════════════════════════════════════════════════════════════════════════
   THE NOVICE HOUSE STANDARD — his UBI beginner series, as an overlay.
   ══════════════════════════════════════════════════════════════════════════
   Layered ON TOP of the elite sheet above, so everything the two systems agree
   on (the semantic Pro/Con/teacher code, the marks, the tables, the footer)
   is inherited and only the decisions that genuinely differ are restated.

   The four that differ, and why each matters:

   1. THE PAGE IS FRAMED, NOT BANDED. His novice pages carry a 4px coloured
      border round the whole sheet — teal for student work, red for teacher
      copy, gold on the dark cover — and open with a black 3px rule under a
      Bebas title. The elite band is a premium magazine move; the frame is a
      workbook move, and it tells a child which pile a loose sheet came from
      from across a desk.
   2. CARDS ARE LOUD. `3px solid #000` on a `4px 4px 0 #000` hard shadow, not a
      hairline on a soft one. Everything a student has to act on is a box you
      could find with the lights off.
   3. STUDENT PAGES ARE GRID PAPER. `#f8fafc` under 20px blueprint ruling at 7%.
   4. THE FIELDS ARE REAL. Dashed inputs a student writes in, and a key that
      comes back as red Comic Neue marker over the same field — his
      `body.showing-answers` treatment.

   Values are lifted from the source stylesheet; the comments name the original
   class so the two can be diffed by hand later. */
export const HOUSE_NOVICE_CSS = `
/* ── Ascent NOVICE standard (lib/house-design.ts) ──────────────────────────── */

/* ── THE ACCENT TRIAD ──
   The structural idea behind the whole L1–L10 series, and the thing that lets
   ten lessons look like one publication without looking like the same sheet
   printed ten times: each lesson names ONE accent from its own motif and
   derives a three-stop ramp from it —

     L6  --detective-pink #db2777 / --detective-dark #831843
     L7  --summary-teal   #0f766e / --summary-bright #0d9488 / --summary-dark #134e4a
     L8  --weigh-purple   #7c3aed / --weigh-dark    #4c1d95
     L9  --focus-blue     #1e40af / --focus-dark    #1e3a8a / --focus-light #dbeafe
     L10 --matrix-gold    #d97706 / --matrix-dark   #92400e / --matrix-soft  #fffbeb

   — and then spends it on the page frame, the blueprint ruling, the input
   focus state, the word bank and the cover gradient, while the SEMANTIC palette
   (Pro green, Con red, teacher red, warning yellow) stays identical in all ten.
   Identity comes from the accent; meaning never does.

   Ours is derived from the pack's own accent with color-mix, so a pack that
   sets accentColor gets the whole ramp for free and two lessons in a series
   look related but not identical. */
.pk-root{
  /* --pk-lesson-accent first: it is the pack's own accent and it survives a
     locked palette, because the lock protects the semantic code (Pro/Con/
     teacher) rather than the lesson's identity. See the note where PrintView
     sets it. Falls back to the resolved kit accent for any pack that has none. */
  --n-accent: var(--pk-lesson-accent, var(--pk-accent, #0f766e));
  --n-accent-dark: color-mix(in srgb, var(--n-accent) 62%, #1c1917);
  --n-accent-soft: color-mix(in srgb, var(--n-accent) 8%, #ffffff);
}

.pk-root{
  /* His novice scale, at the L6–L10 numbers (all five agree): .header-label
     2.2rem, .header-badge .85rem, .footer 11px — a step up from the 2rem/.8rem
     of L1, and the direction of travel is toward MORE readable, not denser.
     Bigger than the elite 25px because the face is condensed caps: it measures
     narrower at the same optical size, so the number is larger and the block
     is not. */
  --pk-title: 35px;
  --pk-lead: 14px;
  --pk-text: 13px;
  --pk-label: 11px;

  --pk-box-border: 3px solid #000;
  --pk-box-radius: 8px;
  --pk-box-shadow: 4px 4px 0 #000;
  --pk-rail-w: 4px;

  /* His novice palette (:root in the source) */
  --n-teal: #0f766e;    --n-gold: #d97706;   --n-navy: #1e3a8a;
  --n-green: #22c55e;   --n-red: #ef4444;    --n-yellow: #facc15;
  --n-teacher: #dc2626;
}

/* ── 1 · THE FRAME ──
   .page-container is 4px solid with a themed colour; ours splits the same way
   by what the sheet IS. The frame is the page's identity, so it wins over the
   design's own --pk-frame. */
.pk-root .pk-page{
  /* The frame is the lesson's accent, not a fixed teal — this is what makes
     L6 pink, L8 purple and L10 gold while every page stays the same object. */
  border: 4px solid var(--n-accent) !important;
  background-color: #f8fafc !important;
  /* .theme-blueprint — his newest ruling is TWO colours crossed, the accent
     horizontally at 9% over the constant teal vertically at 7%. The cross is
     what stops the grid reading as graph paper and makes it read as a drawing
     board, and it carries the accent into the paper itself. */
  background-image:
    linear-gradient(color-mix(in srgb, var(--n-accent) 9%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15,118,110,.07) 1px, transparent 1px) !important;
  background-size: 20px 20px !important;
}
/* .theme-teacher — white, no ruling, red frame. Teacher copy must never be
   mistaken for a student sheet in a stack of photocopies. */
.pk-root .pk-page--teacher{
  border-color: var(--n-teacher) !important;
  background-color: #ffffff !important;
  background-image: none !important;
}

/* ── 2 · THE HEADER ROW ──
   .header-row: a black 3px underrule, a Bebas label, a mono badge. NOT a
   filled band — so the elite masthead has to be unpainted here, or its gradient
   would sit behind the black rule and the title would stay paper-white. */
.pk-root .pk-masthead{
  background-color: transparent !important;
  background-image: none !important;
  border-bottom: 3px solid #000 !important;
  border-radius: 0 !important;
  padding: 0 0 5px !important;
  margin-bottom: 12px !important;
}
.pk-root .pk-title{
  color: #000 !important;
  letter-spacing: 2px;
  text-transform: uppercase;
  font-weight: 400;   /* Bebas is a single weight; 800 fakes a bold and blurs it */
}
.pk-root .pk-page--teacher .pk-title{ color: var(--n-teacher) !important; }

/* .header-badge — mono, tight, square-ish, black. The page FAMILY rides here
   now that the band is gone, so a coach flicking a printed pack still sees the
   lesson change gear.

   NB: .pk-badge ONLY. The elite sheet above pairs this with a
   .pk-masthead > span catch-all, and repainting that black caught every
   incidental span a masthead happens to hold — the evidence-deck card ids among
   them, which then printed white on their own pale blue chip. */
.pk-root .pk-masthead .pk-badge{
  background: var(--pk-band, #000) !important;
  color: #fff !important;
  border-radius: 4px !important;
  padding: 4px 12px !important;
  font-family: var(--pk-mono), monospace;
  font-weight: 700;
  letter-spacing: 1px;
  font-size: .85rem !important;
}

/* ── 3 · CARDS ──
   .evidence-card — the treatment that gives the series its face. Applied to
   every block a student acts on. */
.pk-root .pk-box,
.pk-root .pk-prompt,
.pk-root .pk-chain,
.pk-root .pk-card,
.pk-root .pk-scene,
.pk-root .pk-quiz{
  border: 3px solid #000;
  border-radius: 8px;
  box-shadow: 4px 4px 0 #000;
}
/* The side rail survives as a THICKER left edge in the side colour — the
   greyscale carrier stays, on top of the black frame. */
.pk-root .pk-prompt--pro, .pk-root .pk-chain--pro{ border-left: 10px solid var(--h-blue); }
.pk-root .pk-prompt--con, .pk-root .pk-chain--con{ border-left: 10px solid var(--h-red); }
.pk-root .pk-bubble{
  border: 2px solid #000;
  border-left: 6px solid var(--pk-side, var(--pk-accent));
  border-radius: 8px;
}
.pk-root .pk-avatar{ border: 2px solid #000; }

/* .badge / .badge-pro / .badge-con — Bebas caps in a hard black outline. */
.pk-root .pk-prompt-side,
.pk-root .pk-chain-side,
.pk-root .pk-card-id{
  font-family: var(--pk-display), sans-serif !important;
  border: 2px solid #000 !important;
  border-radius: 4px !important;
  padding: 2px 10px !important;
  font-size: .9rem !important;
  letter-spacing: .5px;
  text-transform: uppercase;
}
/* The fills are the DARK ends of his green and red, not the --n- brights. His
   own .badge-pro puts white on #22c55e, which measures 2.3:1 — he gets away
   with it on a laser printer and we would not, because the runtime contrast
   pass rescues it to black and the chip loses its side colour entirely. Same
   hues, one step down, both clear of AA at this size. */
.pk-root .pk-prompt--pro .pk-prompt-side, .pk-root .pk-chain--pro .pk-chain-side{
  background: #15803d !important; color: #fff !important;
}
.pk-root .pk-prompt--con .pk-prompt-side, .pk-root .pk-chain--con .pk-chain-side{
  background: #b91c1c !important; color: #fff !important;
}

/* ── 4 · THE CALLOUT RAILS ──
   His component library, one class at a time. Each keeps its own hue, its own
   left rail and its own size — a stretch task and an oral task must never read
   as the same box. Square left edge, rounded right: the rail is a tab. */
.pk-root .pk-analogy{        /* .explainer-box */
  background: #fef9c3; border-left: 4px solid #ca8a04; border-radius: 0 4px 4px 0;
  padding: 6px 8px; font-size: .78rem; font-family: var(--pk-body), sans-serif;
}
.pk-root .pk-judge{          /* .tactical-note */
  background: #f0fdfa; border: 0; border-left: 4px solid var(--n-teal);
  border-radius: 0 4px 4px 0; padding: 6px 8px; font-size: .75rem; font-weight: 700;
  color: #134e4a;
}
.pk-root .pk-card-limit{     /* .limit-note */
  background: #fff1f2; border-left: 4px solid var(--n-red);
  border-radius: 0 4px 4px 0; padding: 5px 8px; font-size: .72rem;
}
.pk-root .pk-say{            /* .stand-deliver */
  background: #ecfdf5; border: 2px dashed #10b981; border-radius: 8px;
  padding: 7px 12px; color: #065f46;
}
.pk-root .pk-fast{           /* .fast-finisher */
  background: #eef2ff; border: 0; border-left: 4px solid #6366f1;
  border-radius: 0 6px 6px 0; padding: 6px 10px; font-size: .78rem;
  font-family: var(--pk-mono), monospace;
}
.pk-root .pk-wordbank{       /* .word-bank — accent-tinted in his newest packs */
  background: var(--n-accent-soft); border: 2px dashed var(--n-accent);
  border-radius: 8px;
  padding: 6px 10px; text-align: center;
  font-family: var(--pk-mono), monospace; font-size: .85rem; font-weight: 700;
}
.pk-root .pk-judge{          /* .tactical-note also takes the accent tint */
  background: var(--n-accent-soft); border-left-color: var(--n-accent);
}
.pk-root .pk-pitfalls{       /* .pitfall-box */
  background: #fff7ed; border: 0; border-left: 5px solid #ea580c;
  border-radius: 0 6px 6px 0; padding: 8px 10px; font-size: .8rem; box-shadow: none;
}
.pk-root .pk-coach{          /* .teacher-script-block */
  background: #fff1f2; border: 2px solid var(--n-teacher);
  border-left: 6px solid var(--n-teacher); border-radius: 4px;
  padding: 8px 12px; box-shadow: none;
}
.pk-root .pk-coach-label,    /* .t-label */
.pk-root .pk-coach-page{
  font-family: var(--pk-display), sans-serif; letter-spacing: 1px;
  /* NOT --n-teacher (#dc2626): on the #fff1f2 script block that lands at
     4.4:1, a hair under AA, and the mono pass then rescued it to black on 105
     labels — the whole teacher guide. The darker ink is the same red, reads the
     same on screen, and needs no rescuing. */
  color: var(--h-red-ink);
}
.pk-root .pk-key{            /* the one thing that matters most stays gold */
  border: 3px solid #000; border-left: 8px solid var(--n-yellow);
  border-radius: 8px; box-shadow: 4px 4px 0 #000;
}

/* The rigor mechanics in the novice hand: the two a student ACTS on get the
   full black frame and hard shadow, the two they read get a rail. Same hues as
   the elite sheet — only the weight changes. */
.pk-root .pk-flow,
.pk-root .pk-ballot{
  border: 3px solid #000; border-radius: 8px; box-shadow: 4px 4px 0 #000;
}
.pk-root .pk-flow{ border-left: 10px solid #06b6d4; }
.pk-root .pk-ballot{ border-left: 10px solid var(--n-yellow); }
.pk-root .pk-flow-head,
.pk-root .pk-flow-cell{ border: 2px solid #000; }
.pk-root .pk-echo,
.pk-root .pk-crossfire{
  border: 0; border-left: 5px solid #f59e0b; border-radius: 0 6px 6px 0;
  box-shadow: none;
}
.pk-root .pk-crossfire{ border-left-color: var(--n-red); }

/* ── 5 · THE FILLABLE FIELDS ──
   .full-textarea / .inline-input. A student types into these on screen and
   they print exactly as they look. */
.pk-root .pk-input{
  border: 2px dashed #94a3b8;
  border-radius: 8px;
  background: #f8fafc;
  font-family: var(--pk-body), sans-serif;
  color: #0f172a;
  padding: 8px;
  width: 100%;
  outline: none;
  resize: none;
  line-height: 1.5;
  font-size: .875rem;
  display: block;
}
/* His focus state tints toward the lesson accent rather than going plain white
   — the field lights up in the lesson's own colour. */
.pk-root .pk-input:focus{
  border-color: var(--n-accent); border-style: solid;
  background: var(--n-accent-soft);
}
.pk-root .pk-input--sm{ min-height: 52px; }
.pk-root .pk-input--md{ min-height: 78px; }
.pk-root .pk-input--lg{ min-height: 104px; }

/* body.showing-answers — the key comes back as marker ink over the same
   field, not as a separate line. Red Comic Neue is his; it reads instantly as
   "written on afterwards" rather than as part of the worksheet. */
.pk-root:not(.answers-hidden) .pk-input[data-answer]{
  color: #dc2626 !important;
  font-family: var(--pk-body), cursive, sans-serif !important;
  font-weight: 700 !important;
  background: rgba(220,38,38,.05) !important;
  border-color: #dc2626 !important;
}

/* .mc-box — a real 20px tick box that fills green when the key is on. */
.pk-root .pk-mcq-box{
  width: 20px !important; height: 20px !important;
  border: 2px solid #94a3b8 !important;
  border-radius: 4px !important;
  appearance: none; -webkit-appearance: none;
  background: #fff; flex-shrink: 0; position: relative; margin: 0;
}
.pk-root:not(.answers-hidden) .pk-mcq-box--right{
  background: var(--n-green) !important;
  border-color: #16a34a !important;
}
.pk-root:not(.answers-hidden) .pk-mcq-box--right::after{
  content: '✓'; color: #fff; font-weight: 700; font-size: 14px;
  position: absolute; inset: 0; display: grid; place-items: center;
}

/* ── 6 · THE COVER ──
   Measured from "warpower lesson10 v5.html", which is the template the founder
   asked for. Two earlier attempts were wrong in opposite directions: the first
   was dark (his are light), and the second stripped the weight out entirely and
   came out flat. This is the real thing.

   THE COVER IS LOUD, and its grammar is DEPTH. Every object sits on a hard
   offset shadow, and the size of the offset is its rank:
       2px  the lesson chip
       4px  the masthead slab, the skill badge
       6px  the name card
       8px  the resolution AND the objective — his cover gives both the same
            depth, because on a title page those two matter equally: what we
            argue about, and what you will be able to do by the end
   The skill badge takes its offset in the ACCENT rather than black, which is
   how this system marks one object as special without making it bigger.

   PER-LESSON IDENTITY comes from three authored fields — accentColor, coverIcon,
   coverTagline — so ten lessons in a series are ten different title pages. The
   frame, the paper ruling and the badge shadow all derive from the accent. */
.pk-root .pk-cover--novice{
  border: 4px solid var(--n-accent) !important;
  background-color: #f8fafc !important;
  /* His cover ruling is NEUTRAL ink at 5%, not the accent — the accent is
     already carrying the frame and the badge, and tinting the paper too made
     the whole sheet read as one wash. */
  background-image:
    linear-gradient(rgba(15,23,42,.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15,23,42,.05) 1px, transparent 1px) !important;
  background-size: 20px 20px !important;
  color: #0f172a !important;
  padding: 0.45in !important;
  display: flex !important;
  flex-direction: column !important;
}

/* THE MASTHEAD SLAB */
.pk-root .pk-cvr-bar{
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: #fff; border: 4px solid #000;
  box-shadow: 4px 4px 0 #000;
  padding: 10px 14px; margin-bottom: 26px; flex-shrink: 0;
}
.pk-root .pk-cvr-bar-icon{ font-size: 30px; line-height: 1; }
.pk-root .pk-cvr-brand{
  font-size: 1.5rem; line-height: 1; letter-spacing: 1.5px; text-transform: uppercase;
  color: #0f172a;
}
.pk-root .pk-cover--novice .pk-cvr-logo{
  width: auto !important; height: 42px !important; min-width: 78px;
  border: 0 !important; background: #e2e8f0 !important; box-shadow: none !important;
  padding: 0 6px !important; border-radius: 4px !important;
  display: grid !important; place-items: center;
  font-size: 9px; color: #475569;
}
.pk-root .pk-cvr-lesson{
  background: var(--n-yellow); color: #0f172a;
  border: 2px solid #000; border-radius: 0;
  box-shadow: 2px 2px 0 #000;
  padding: 3px 20px; font-weight: 900; font-size: 1.2rem; letter-spacing: 3px;
}

/* The editorial line, then the topical glyph. */
.pk-root .pk-cvr-tagline{
  background: #1f2937; color: #fff;
  border: 2px solid #000; border-radius: 999px;
  padding: 3px 16px; margin-bottom: 10px;
  font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase;
  font-family: var(--pk-mono), monospace;
}
/* THE GLYPH AND ITS HALO.
   The rings are PSEUDO-ELEMENTS, absolutely centred on the glyph's box. Three
   things follow from that, and all three are the reason it is built this way:
   they are out of flow, so they cost this page no height and cannot push a
   title page off the paper; they are centred on the glyph by construction, so
   they stay put however the blocks above them reflow; and they are sized in em
   units off the 70px glyph, so they scale with it if the fit pass shrinks the
   column.

   The drop shadow moved onto the inner span. Left on the parent it applied to
   the rings too, and the halo came back wearing the glyph's hard black offset,
   which is three heavy objects where the design calls for one. */
.pk-root .pk-cvr-hero{
  position: relative;
  font-size: 70px; line-height: 1; margin-bottom: 12px;
}
.pk-root .pk-cvr-hero > span{
  position: relative; z-index: 1;
  filter: drop-shadow(4px 4px 0 #000);
}
.pk-root .pk-cvr-hero::before,
.pk-root .pk-cvr-hero::after{
  content: ""; position: absolute; left: 50%; top: 50%;
  border-radius: 50%; pointer-events: none;
  transform: translate(-50%, -50%);
}
.pk-root .pk-cvr-hero::before{
  width: 1.44em; height: 1.44em;
  border: 3px solid color-mix(in srgb, var(--n-accent) 30%, transparent);
}
.pk-root .pk-cvr-hero::after{
  width: 1.94em; height: 1.94em;
  border: 2px dashed color-mix(in srgb, var(--n-accent) 22%, transparent);
}

.pk-root .pk-cover--novice .pk-cover-title{
  font-size: 3.9rem !important; line-height: .9 !important;
  letter-spacing: -0.5px !important; text-transform: uppercase;
  color: #0f172a !important; margin-bottom: 4px;
}
.pk-root .pk-cvr-title-accent{ color: var(--n-accent-dark); }
.pk-root .pk-cover--novice .pk-cover-subtitle{ display: none !important; }

/* THE SKILL BADGE — black, rotated, accent-coloured offset. */
.pk-root .pk-cvr-skill{
  background: #0f172a; color: #fff;
  border: 2px solid #fff; border-radius: 8px;
  box-shadow: 4px 4px 0 var(--n-accent);
  transform: rotate(-2deg);
  padding: 5px 18px; margin: 10px 0 22px;
  font-size: 1.05rem; letter-spacing: 2px; text-transform: uppercase;
}

/* THE TWO DEEP CARDS — same 8px offset, both serif. */
.pk-root .pk-cover--novice .pk-cover-anchor,
.pk-root .pk-cover--novice .pk-cvr-objective{
  width: 100%; max-width: 32rem;
  background: #fff !important;
  border: 4px solid #000 !important;
  border-radius: 12px !important;
  box-shadow: 8px 8px 0 #000 !important;
  padding: 12px 16px !important;
  margin-bottom: 14px;
  text-align: left !important;
}
.pk-root .pk-cover--novice .pk-bigq-label,
.pk-root .pk-cvr-objective-label{
  display: block;
  color: #64748b !important;
  border-bottom: 4px solid #000;
  padding: 0 0 3px !important; margin-bottom: 7px;
  font-size: 1.15rem; letter-spacing: 1.5px; text-transform: uppercase;
}
.pk-root .pk-cvr-res,
.pk-root .pk-cvr-objective-text{
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 700; line-height: 1.5;
}
.pk-root .pk-cvr-res{ font-size: 1rem; color: var(--n-accent-dark); }
.pk-root .pk-cvr-res::before{ content: "“"; }
.pk-root .pk-cvr-res::after{ content: "”"; }
.pk-root .pk-cvr-objective-text{ font-size: 13px; color: #334155; }

.pk-root .pk-cover--novice .pk-cover-criteria{
  width: 100%; max-width: 32rem;
  background: var(--n-accent-soft) !important;
  border: 3px solid var(--n-accent) !important;
  border-radius: 12px !important;
  box-shadow: 3px 3px 0 var(--n-accent-dark) !important;
  padding: 10px 14px !important; margin-bottom: 14px;
  font-size: 10.5px; color: #0f172a !important; text-align: left !important;
}
.pk-root .pk-cover--novice .pk-criteria-label{
  display: block; margin-bottom: 6px;
  font-size: 10px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;
  color: var(--n-accent-dark) !important;
}
.pk-root .pk-cover--novice .pk-cover-check{
  color: var(--n-accent-dark) !important; font-weight: 900;
}

/* THE CLASSIFIED FILE — a black tab over a card on a 6px offset. */
.pk-root .pk-cover--novice .pk-cover-name{
  background: transparent !important; border: 0 !important;
  box-shadow: none !important; padding: 0 !important;
}
.pk-root .pk-cvr-tab{
  background: #0f172a; color: #fff;
  border: 4px solid #000; border-bottom: 0;
  border-radius: 6px 6px 0 0;
  padding: 4px 0; text-align: center;
  font-size: 1rem; letter-spacing: 2.5px; text-transform: uppercase;
}
.pk-root .pk-cvr-namecard{
  background: #fff; border: 4px solid #000; border-radius: 0 0 8px 8px;
  box-shadow: 6px 6px 0 #000;
  padding: 12px 20px 10px;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.pk-root .pk-cover--novice .pk-cover-name-label{
  color: #64748b !important;
  font-size: 10px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;
}
.pk-root .pk-cvr-nameline{
  width: 100%; height: 34px; background: transparent;
  border: 0; border-bottom: 4px solid #000; outline: none;
  font-family: var(--pk-hand), cursive;
  font-size: 1.5rem; text-align: center; text-transform: uppercase;
  color: var(--n-accent-dark);
}
.pk-root .pk-cvr-fields{
  display: flex; justify-content: center; gap: 26px; margin-top: 6px;
  font-size: 10px; font-weight: 800; letter-spacing: 1px;
  text-transform: uppercase; color: #64748b;
}

/* ── 7 · THE FOOTER ──
   .footer — a 3px black rule and Bebas caps, matching the header row so the
   sheet is bracketed top and bottom. */
.pk-root .print-footer{
  border-top: 3px solid #000;
  color: #000;
  font-family: var(--pk-display), sans-serif;
  letter-spacing: 1px;
}
.pk-root .pk-page--teacher .print-footer{ border-top-color: var(--n-teacher); }
/* The cover footer was gold-on-dark when the cover was a dark sheet. The cover
   is light now (his L6–L10 covers are), so gold measured 1.5:1 on it — the same
   black rule the content pages use is what this wants. */
.pk-root .pk-cover--novice .print-footer{
  border-top-color: #000; color: #000;
}
`;

/**
 * What a rendered design must achieve to count as house standard.
 *
 * Every bound is one of his measurements with a tolerance, or a hard print
 * fact. Deliberately numeric: overflow, type size and contrast are all things
 * a number can settle, and a number does not argue back the way a critique
 * does.
 */
export interface HouseMetrics {
  overfull: number;
  minZoom: number;
  pageTitlePx: number;
  bodyTextPx: number;
  coverTitlePx: number;
  mastheadPx: number;
  proFill: string;
  conFill: string;
  /** the side rail on each — "" when the block has no rail */
  proRail?: string;
  conRail?: string;
  contrastRepairs: number;
}

export interface HouseFailure {
  id: string;
  /** what is wrong, in the terms the design prompt uses */
  detail: string;
}

/** sRGB relative luminance of a `rgb()`/`#hex` colour, or null if unreadable. */
function luminance(raw: string): number | null {
  const v = (raw || "").trim().toLowerCase();
  let rgb: number[] | null = null;
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1];
    const parts = h.length === 3 ? h.split("").map((c) => c + c) : h.match(/../g)!;
    rgb = parts.map((x) => parseInt(x, 16));
  }
  const m = v.match(/^rgba?\(([^)]+)\)/);
  if (m) {
    const nums = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (nums.length >= 3 && nums.slice(0, 3).every(Number.isFinite)) rgb = nums.slice(0, 3);
  }
  if (!rgb) return null;
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

export function houseFloor(m: HouseMetrics): HouseFailure[] {
  const fails: HouseFailure[] = [];

  if (m.overfull > 0)
    fails.push({
      id: "fits",
      detail: `${m.overfull} sheet(s) still run past the bottom of the paper after the fit pass. His packs never do; content that does not fit is a design that spent the page on chrome.`,
    });

  if (m.minZoom < 0.85)
    fails.push({
      id: "readable",
      detail: `The printer had to shrink a page to ${m.minZoom} to cope. Below 0.85 the type stops being comfortable for the students this is written for.`,
    });

  // Two house standards, two title sizes, and both are his own measurement:
  // the elite pack sets 25px in a normal-width face, the novice series sets
  // 2.2rem (35px) in condensed caps, which measure narrower at the same
  // optical size. The ceiling has to clear the larger of the two or the
  // novice standard fails its own floor.
  if (m.pageTitlePx > 36)
    fails.push({
      id: "title-scale",
      detail: `Page title is ${m.pageTitlePx}px against a house standard of 24–36px (his elite pack is 25px, his novice series 35px in condensed caps). A poster-sized title pushes the work down the sheet.`,
    });
  if (m.bodyTextPx && (m.bodyTextPx < 11.5 || m.bodyTextPx > 14.5))
    fails.push({
      id: "body-scale",
      detail: `Body text is ${m.bodyTextPx}px; the house standard is 12–14px (his is 13px).`,
    });
  if (m.pageTitlePx && m.bodyTextPx && m.pageTitlePx / m.bodyTextPx > 3)
    fails.push({
      id: "type-ratio",
      detail: `Title:body ratio is ${(m.pageTitlePx / m.bodyTextPx).toFixed(1)}x; his house scale is about 2x. Get contrast from weight and tracking, not size.`,
    });
  if (m.coverTitlePx && (m.coverTitlePx < 40 || m.coverTitlePx > 64))
    fails.push({
      id: "cover-scale",
      detail: `Cover title is ${m.coverTitlePx}px; his is 52px, and the cover is the one page allowed to be dramatic (40–64px).`,
    });

  if (m.mastheadPx > 110)
    fails.push({
      id: "masthead",
      detail: `The masthead is ${m.mastheadPx}px tall including its margin. His band is about 60px and the ceiling is 110px — every pixel above that comes out of the student's work.`,
    });

  // Pro and Con must be a visible code — but NOT necessarily a greyscale one,
  // and this is where the founder's own design corrected the rule rather than
  // the other way round. An earlier version of this floor demanded the two
  // sides differ in LIGHTNESS. His do not: his cards are #eff6ff against
  // #fef2f2 (0.005 apart) on rails of #2563eb against #dc2626 — pure blue and
  // pure red, which are 0.014 apart in luminance and photocopy to nearly the
  // same grey. His packs are perfectly usable anyway, because every side block
  // also prints a PRO/CON chip, and our renderer always emits one too. Colour
  // is therefore the second carrier, not the only one, so the bar is that the
  // code EXISTS: fail only when the two sides render identically.
  const same = (a?: string, b?: string) => (a ?? "") === (b ?? "");
  const measurable = luminance(m.proFill) !== null || luminance(m.proRail ?? "") !== null;
  if (measurable && same(m.proFill, m.conFill) && same(m.proRail, m.conRail)) {
    fails.push({
      id: "sides-identical",
      detail: `Pro and Con render identically (fill ${m.proFill}, rail ${m.proRail || "none"}). The semantic colour code — Pro one hue, Con another — is the one thing every one of his designs keeps.`,
    });
  }

  // The runtime contrast pass repairs unreadable text. A handful is housekeeping;
  // a flood means the stylesheet is producing text nobody could read.
  if (m.contrastRepairs > 25)
    fails.push({
      id: "contrast",
      detail: `The renderer had to rescue ${m.contrastRepairs} text/background pairs at print time. Each one is a place the stylesheet produced unreadable text; his packs need none.`,
    });

  return fails;
}

/**
 * THE JV OVERLAY — the third register.
 *
 * Layered on HOUSE_DESIGN_CSS the way HOUSE_NOVICE_CSS and HOUSE_ELITE_CSS are,
 * and mutually exclusive with both: all three disagree about ink, so exactly one
 * loads (see `usesJvHouse`).
 *
 * THE ONE RULE, restated here because every selector below follows from it:
 * colour is reserved for argument structure. Everything that is not a layer of
 * an argument is ink, rule or paper. Two things fall out of that. Colour means
 * one thing, so a student learns "the violet one is the warrant" once and then
 * reads it everywhere. And there is almost nothing left for `useMonoSafeText`
 * to repair, because the register has no filled chips to put text on.
 *
 * ── WHAT WAS MEASURED, AND WHAT IT CHANGED ──────────────────────────────────
 * The first version of this register was stress-tested against six real pages
 * from the founder's own Public Forum Lesson 1, rendered at true A4 and Letter
 * geometry. It never overflowed. It failed the other way: the main column ran
 * 24–123mm short and all of it pooled as dead space under the last block, while
 * his own sheets put 67.8% of the column into gaps — and his build page 93.1% —
 * because that space is where the student writes. Three fixes followed, and all
 * three are below rather than in a page template, because a page-level fix
 * would have to be repeated on every page a generator ever writes.
 */
export const HOUSE_JV_CSS = `
/* ── Ascent JV standard (lib/house-design.ts) ──────────────────────────────── */
.pk-root{
  --jv-ink: #14171a;
  --jv-ink-2: #5a6169;
  /* Label grey. The audit measured the first value (#8a9099) at 3.13:1 on
     paper, which fails WCAG AA for normal text — and it was carrying 6.5pt
     labels on four different components. Darkened until it clears 4.5:1. */
  --jv-ink-3: #6a7175;
  --jv-rule: #d9dbd6;
  --jv-paper: #fcfcfa;

  --pk-title: 23px;
  --pk-lead: 12.5px;
  --pk-text: 12px;
  --pk-label: 10px;
}

/* Flat, like the elite register, and for the same reason: depth is a novice
   navigation aid and reads as a workbook to anyone older. */
.pk-root .pk-box,
.pk-root .pk-card,
.pk-root .pk-prompt,
.pk-root .pk-chain{
  box-shadow: none;
  border-radius: 3px;
  border: 1px solid var(--jv-rule);
  border-left-width: 1px;
}

/* Ink discipline, inherited from the elite register: body copy grey, headings
   near-black, small labels lighter still. The gotcha recorded in the house
   notes applies here too — this is text on PAPER. Anything sitting on a filled
   background keeps the fill's own foreground. */
.pk-root .pk-prompt-label,
.pk-root .pk-chain-row,
.pk-root .pk-coach-row{ color: var(--jv-ink-2); }
.pk-root .pk-section-label{ color: var(--jv-ink-3); }

/* Side tints are removed, not recoloured. A Pro/Con wash is a second colour
   system competing with the argument code for the same page, and the side is
   already carried by the chip and the rail. */
.pk-root .pk-prompt--pro,
.pk-root .pk-prompt--con,
.pk-root .pk-prompt--neutral{
  background: var(--jv-paper);
  border-left: 2px solid var(--jv-ink);
}
.pk-root .pk-prompt--pro .pk-prompt-side{ background: var(--jv-ink); --pk-fill: var(--jv-ink); }
.pk-root .pk-prompt--con .pk-prompt-side{ background: var(--jv-ink-2); --pk-fill: var(--jv-ink-2); }

/* ── FIX 1 · ELASTIC WRITING SURFACES ──────────────────────────────────────
   Slack goes to the student, not to the bottom of the sheet. Only surfaces the
   student writes on grow: the first version let any worked-example block
   absorb it, and on the clash page 108mm inflated the two PRINTED MODEL CASES
   while the student's own boxes stayed at two lines. The page filled and the
   space went to the wrong audience. */
   ── WHY THE ELASTIC HALF IS NOT WIRED YET ────────────────────────────────
   Growing writing areas into the leftover space needs .pk-fit to be a flex
   column. It cannot be, yet: .pk-fit is the element the fit pass MEASURES —
   it compares the column's natural height against the sheet and zooms it down
   when it overruns (see the fit effect in PrintView). A flex column stretched
   to its container is always exactly as tall as the container, so overflow
   would stop being detectable and the is-overfull report would go quiet for
   novice and elite as well as JV.
   So this register ships the half that is safe — the caps, the pitch, and the
   sizing below — and the elastic half waits on a fit pass that measures
   content rather than the box it sits in. That is a change to shared
   machinery, and it should not ride in on a new register.

   ── FIX 2 · A BOX SIZE IS AN INSTRUCTION ──────────────────────────────────
   Unbounded growth swung as far wrong as none: 18 ruled lines appeared under a
   task whose whole instruction is "one question", and a ten-line box told a
   student to write an essay into a sentence completion. So every writing
   surface is sized to the answer it wants.
   The renderer already picks a size from the expected answer's length
   (write-area-sm|md|lg in WriteArea) — which is exactly the right signal, so
   this maps caps onto the classes it already emits rather than inventing new
   ones. Slack that survives the caps is NOT absorbed: it is under-specified
   content, and inflating boxes to swallow it would hide that from the author
   and from the density floor in lib/checklist.ts. */
.pk-root .write-area{ min-height: 11mm; }
.pk-root .write-area-sm{ min-height: 9mm; max-height: 14mm; }
.pk-root .write-area-md{ min-height: 14mm; max-height: 24mm; }
.pk-root .write-area-lg{ min-height: 24mm; max-height: 46mm; }

/* ── FIX 3 · RULED PITCH ───────────────────────────────────────────────────
   The first version ruled at 5.6mm. College-ruled paper is 7.1mm and
   wide-ruled 8.7mm, so it was narrower than either — a fifteen-year-old cannot
   put a sentence between those lines. */
.pk-root .write-area{
  background-image: repeating-linear-gradient(
    transparent, transparent 6.8mm, var(--jv-rule) 6.8mm, var(--jv-rule) 7.05mm);
  border: 1px solid var(--jv-rule);
  border-left: 2px solid var(--jv-ink);
  border-radius: 0;
}

/* ── THE RAIL ──────────────────────────────────────────────────────────────
   The single biggest visual difference between our sheets and the founder's,
   and it is structural rather than decorative: his pages are TWO columns. A
   fixed right rail carries why the page exists and the coach's note; the main
   column carries the whole task sequence. Because the rail never moves, a
   student scanning for the task learns to ignore it, and a student who is
   stuck knows exactly where to look — which is the entire argument for a fixed
   position over a prettier flowing one.

   Done in CSS on the existing flat block list rather than by restructuring the
   renderer: the blocks are already siblings, so a grid can place them. Every
   other register ignores pk-page--jv and keeps its single column.

   align-content: start is load-bearing. The fit pass measures .pk-fit and
   scales it when it overruns; a grid that STRETCHED to its container would
   always report exactly the container's height and silence overflow detection
   for every register. Starting the content means the natural height is still
   the real one. (This is the same trap that stopped the writing areas becoming
   elastic — see FIX 1 above.) */
.pk-root .pk-page--jv .pk-fit{
  display: grid;
  grid-template-columns: 1fr 44mm;
  column-gap: 6mm;
  align-content: start;
}
/* Everything is main column by default; only the rail dwellers move across. */
.pk-root .pk-page--jv .pk-fit > *{ grid-column: 1; }
.pk-root .pk-page--jv .pk-fit > .pk-masthead,
.pk-root .pk-page--jv .pk-fit > .print-footer{ grid-column: 1 / -1; }
.pk-root .pk-page--jv .pk-fit > .pk-why{
  grid-column: 2;
  grid-row: span 6;
  border-left: 1px solid var(--jv-rule);
  border-top: 0; border-right: 0; border-bottom: 0;
  padding-left: 3mm;
  margin-bottom: 0;
}

/* Figures in the JV register are INK, like everything else that is not an
   argument layer. This is the rule the whole register rests on, and a figure is
   exactly where it would be easiest to break: a pictogram in the lesson accent
   would look better in isolation and would put a fifth colour on a page whose
   student is being taught that colour means which layer of an argument. */
.pk-root .pk-page--jv{
  --pk-fig-on: var(--jv-ink);
  --pk-fig-off: color-mix(in srgb, var(--jv-ink) 11%, var(--jv-paper));
  --pk-fig-line: color-mix(in srgb, var(--jv-ink) 40%, var(--jv-paper));
}

/* The page code. Mono, small, and in the spot colour — the only place on a JV
   sheet where the accent is allowed out, because a code is an index entry
   rather than content. */
.pk-root .pk-pagecode{
  font-size: 9px; font-weight: 700; letter-spacing: .06em;
  color: var(--pk-spot, #8a2b1f);
}
.pk-root .pk-page--jv .pk-title{
  /* Sentence case, not the shouty all-caps of the novice register: his titles
     are labels for the page, not slogans. */
  text-transform: none;
  letter-spacing: -.02em;
}

/* The masthead is ink, so the five-family band colour does not apply here. The
   page family is carried by the kind label instead, which is a word and
   survives a photocopier. */
.pk-root .pk-masthead{ background: var(--jv-ink) !important; color: var(--jv-paper); }
.pk-root .pk-badge{ background: transparent; border: 1px solid var(--jv-rule); color: var(--jv-ink-2); }

/* No handwriting face, no rotation, no emoji — same subtraction as the elite
   register, for the same audience reason. */
.pk-root .pk-hand{ font-family: var(--pk-body) !important; }
.pk-root [class*="rotate"]{ transform: none !important; }
`;
