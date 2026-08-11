/**
 * Default values for the AI-themeable variables, as a stylesheet rule (NOT
 * inline) so the pack's generated `designCss` — injected right after — can
 * override them by source order. Inline styles would out-specify the AI CSS.
 * These defaults reference the dynamic --kit-* vars set inline on .pk-root.
 */
export const BASE_THEME_CSS = `.pk-root{
  --pk-accent: var(--kit-accent);
  --pk-accent-2: var(--kit-green);
  --pk-pro: var(--kit-green);
  --pk-con: var(--kit-red);
  --pk-scene-header-bg: var(--pk-ink);
  --pk-scene-header-fg: #ffffff;
  --pk-highlight: var(--kit-yellow);
  --pk-highlight-ink: var(--pk-ink);
  --pk-callout-color: var(--kit-accent);

  /* per-side palette, so a component asks for "this side's colour" rather than
     branching on pro/con in JSX — a design system can retint every side at once */
  --pk-side: var(--pk-accent);
  --pk-side-soft: #eef1f6;
  --pk-side-tint: #f7f8fa;

  /* Who a page belongs to. Both of the academy's own systems colour the whole
     page by role — green for teacher material in the elite pack, orange in the
     federal textbook — and never in red, because red already means Con. */
  /* A literal, not a kit reference: this has to be a colour dark enough to
     carry white type on a band AND to print as a distinct grey. The kit's green
     resolved pale here, which made the role signal disappear. */
  --pk-teacher: #047857;

  /* The left rail every card carries. Width is a token so a design can run a
     4px hairline rail (his elite pack) or a 10px slab (his federal textbook).
     NB --pk-rail is deliberately NOT bound to --pk-side here: a custom property
     is substituted where it is DECLARED, so binding it on the root froze every
     rail to the root's side colour and the per-side blocks all came out teal.
     The fallback chain lives at the point of use instead. */
  --pk-rail-w: 8px;

  --pk-say-border: var(--kit-green);
  --pk-say-bg: #f0fdf4;
  --pk-say-ink: #14532d;
  --pk-use-bg: #f0fdfa;
  --pk-use-border: var(--kit-accent);
  --pk-limit-bg: #b91c1c;
  --pk-limit-ink: #ffffff;
}

/* ── Component base styles ────────────────────────────────────────────────────
   These used to live as inline style props on the elements themselves, which
   meant the pack's AI-authored design system could only beat them with
   !important on every single declaration — and could never restructure a block,
   only retint it. As ordinary rules in this layer they are simply the DEFAULTS:
   the design system's stylesheet is injected after this one, so it wins on
   cascade order alone. Everything here reads from --pk-* tokens, so retinting
   still works by setting a token, and restyling works by writing a rule. */
.pk-root .pk-turn--pro,
.pk-root .pk-prompt--pro {
  --pk-side: var(--pk-pro);
  --pk-side-soft: #e7f7ee;
  --pk-side-tint: #f0faf3;
}
.pk-root .pk-turn--con,
.pk-root .pk-prompt--con {
  --pk-side: var(--pk-con);
  --pk-side-soft: #fde9e7;
  --pk-side-tint: #fff2f1;
}
.pk-root .pk-prompt--pro { --pk-side-tint: #f0f7ff; }
.pk-root .pk-prompt--neutral { --pk-side-tint: #fbfbfa; }

.pk-root .pk-scene {
  border: 3px solid var(--pk-ink);
  box-shadow: 4px 5px 0 rgba(28, 36, 49, 0.14);
}
.pk-root .pk-scene-setup {
  background: var(--pk-scene-header-bg);
  color: var(--pk-scene-header-fg);
  /* Ink follows the fill. A generated design replaced this bar's solid dark
     background with a pale gradient grid but left the light band ink behind,
     printing the situation line as grey-on-cream. Deriving the ink means a
     design can retint the bar however it likes and the text still reads. */
  --pk-fill: var(--pk-scene-header-bg);
  font-size: var(--pk-label, 11px);
}
.pk-root .pk-avatar {
  width: 44px;
  height: 44px;
  font-size: 18px;
  color: var(--pk-ink);
  border: 3px solid var(--pk-ink);
  background: var(--pk-side-soft);
  font-family: var(--pk-display), sans-serif;
  letter-spacing: 1px;
}
.pk-root .pk-turn-label {
  background: var(--pk-side);
  --pk-fill: var(--pk-side);
}
/* the plain (older-grade) scene tints the label instead of filling it — so the
   side colour becomes TEXT and has to be clamped dark enough to read on paper */
.pk-root .pk-turn--plain > .pk-turn-label {
  background: transparent;
  --pk-tone: var(--pk-side);
  color: var(--pk-side);
  color: oklch(from var(--pk-side) min(l, 0.45) c h);
}
.pk-root .pk-turn--plain {
  border: 1px solid var(--pk-rule, #e7e9ee);
  border-left: 3px solid var(--pk-side);
}
.pk-root .pk-bubble {
  border: 2.5px solid var(--pk-ink);
  background: var(--pk-side-tint);
  font-size: var(--pk-text, 12px);
}
.pk-root .pk-twist {
  background: var(--pk-highlight);
  color: var(--pk-highlight-ink);
  border: 3px solid var(--pk-ink);
}
.pk-root .pk-twist-text { font-size: var(--pk-lead, 13px); }

.pk-root .pk-prompt {
  border: 3px solid var(--pk-side);
  background: var(--pk-side-tint);
}
.pk-root .pk-prompt-side {
  background: var(--pk-side);
  --pk-fill: var(--pk-side);
}
.pk-root .pk-prompt-label { font-size: var(--pk-text, 12px); }

.pk-root .pk-key {
  background: var(--pk-highlight);
  color: var(--pk-highlight-ink);
  border: 3px solid var(--pk-ink);
}
.pk-root .pk-key-text { font-size: var(--pk-lead, 13px); }

/* Hidden judge move — the coach's aside about what actually wins the round.
   Deliberately quieter than the key idea (an outline, not a fill) so the two
   never compete for the same attention on a page that carries both. */
.pk-root .pk-judge {
  border: 2px solid var(--pk-ink);
  background: transparent;
}
.pk-root .pk-judge-label { color: var(--pk-accent); }
.pk-root .pk-judge-text { font-size: var(--pk-lead, 13px); }

/* Evidence card: the named case and the verbatim quotation students read out. */
.pk-root .pk-card-quote {
  border-color: var(--pk-accent);
  background: var(--pk-paper-alt, transparent);
}
.pk-root .pk-card-say {
  border-color: var(--pk-accent);
  --pk-fill: var(--pk-paper);
}

.pk-root .pk-say {
  border: 3px solid var(--pk-say-border);
  background: var(--pk-say-bg);
}
.pk-root .pk-say-text {
  color: var(--pk-say-ink);
  font-size: var(--pk-text, 12px);
}

.pk-root .pk-box--pad { padding: var(--pk-pad, 12px); }
.pk-root .pk-box--pad.leading-relaxed { font-size: var(--pk-text, 12px); }
.pk-root .pk-vocab-term {
  color: var(--pk-accent);
  font-family: var(--pk-display), sans-serif;
  letter-spacing: 1px;
}
.pk-root .pk-vocab-def,
.pk-root .pk-analogy { font-size: var(--pk-text, 12px); }

.pk-root .pk-card-use {
  border-color: var(--pk-use-border);
  background: var(--pk-use-bg);
}
.pk-root .pk-card-limit {
  background: var(--pk-limit-bg);
  --pk-fill: var(--pk-limit-bg);
  color: var(--pk-limit-ink);
}
.pk-root .pk-card-src,
.pk-root .pk-section-label,
.pk-root .pk-bar,
.pk-root .pk-teacheronly {
  font-family: var(--pk-mono), monospace;
}
/* .pk-bar is the filled-bar primitive (globals.css paints it --pk-bar-bg), so
   its ink derives from that fill wherever it carries .pk-ink-auto. */
.pk-root .pk-bar { --pk-fill: var(--pk-bar-bg, #000000); }

/* Cover text hooks. The six Lesson Pack cover skins set these inline, so these
   rules cannot disturb them — they exist for renderers that use the same hook
   vocabulary WITHOUT inline styles (the class plan, the word bank, the ballot),
   so an inherited unit design system reaches those pages too. */
.pk-root .pk-cover-title {
  font-family: var(--pk-display), sans-serif;
  color: var(--pk-ink);
  letter-spacing: 1px;
}
.pk-root .pk-cover-kicker,
.pk-root .pk-cover-subtitle {
  font-family: var(--pk-mono), monospace;
  color: color-mix(in oklab, var(--pk-ink) 70%, var(--pk-paper, #ffffff));
}
.pk-root .pk-bigq-label {
  color: var(--pk-accent);
  font-family: var(--pk-mono), monospace;
}
.pk-root .pk-key-head {
  font-family: var(--pk-display), sans-serif;
  letter-spacing: 1px;
}

/* Steps, compare columns and callouts had no hooks at all — the design system
   could not reach them, which is why those blocks stayed template-looking while
   the rest of a pack changed identity. */
.pk-root .pk-step { border: 1px solid var(--pk-rule, #e7e9ee); }
.pk-root .pk-step-num {
  width: 26px;
  height: 26px;
  font-size: 13px;
  background: var(--pk-accent);
  --pk-fill: var(--pk-accent);
}
.pk-root .pk-step-text { font-size: var(--pk-text, 12px); }

.pk-root .pk-compare { border: 1px solid var(--pk-rule, #e7e9ee); }
.pk-root .pk-compare-head {
  background: var(--pk-accent);
  --pk-fill: var(--pk-accent);
  font-size: var(--pk-label, 11px);
}
.pk-root .pk-compare--right .pk-compare-head {
  background: var(--pk-pro);
  --pk-fill: var(--pk-pro);
}
.pk-root .pk-compare-row { font-size: var(--pk-text, 12px); }

/* Cover hooks. The six cover skins still carry inline styles (documented scope
   limit), but the two surfaces a design system actually retints — the masthead
   band and the anchor quote — now read tokens so their ink can follow. */
.pk-root .pk-cover-band {
  background: var(--pk-accent);
  --pk-fill: var(--pk-accent);
}
/* the anchor box is usually unfilled, so its ink derives from the paper unless
   a design system paints it — at which point --pk-fill follows and inherits */
.pk-root .pk-cover-anchor { --pk-fill: var(--pk-paper, #ffffff); }

.pk-root .pk-callout { border: 1px solid var(--pk-rule, #e7e9ee); }
.pk-root .pk-callout-value {
  color: var(--pk-callout-color);
  font-size: 2rem;
  font-family: var(--pk-display), sans-serif;
  letter-spacing: 1px;
}
.pk-root .pk-callout-label { font-size: var(--pk-label, 11px); }

/* The playful skin is bolder across the board; it used to branch in JSX. */
.pk-root[data-design="playground"] .pk-step { border: 2.5px solid var(--pk-ink); }
.pk-root[data-design="playground"] .pk-step-num {
  width: 32px;
  height: 32px;
  font-size: 16px;
}
.pk-root[data-design="playground"] .pk-compare,
.pk-root[data-design="playground"] .pk-callout {
  border: 3px solid var(--pk-ink);
}
.pk-root[data-design="playground"] .pk-callout {
  box-shadow: 4px 5px 0 rgba(28, 36, 49, 0.12);
}
.pk-root[data-design="playground"] .pk-callout-value { font-size: 2.4rem; }

/* Masthead. The title's colour is a rule rather than an inline prop, so a design
   system that gives the masthead a filled band can actually lighten the title
   on it. The badge's ink derives from its own fill token below. */
.pk-root .pk-title {
  color: var(--pk-head-fg);
  font-family: var(--pk-head-font, var(--pk-display)), sans-serif;
  letter-spacing: 1px;
}
.pk-root .pk-badge { --pk-fill: var(--pk-badge-bg, #000000); }

/* ── Ink that cannot drift away from its fill ─────────────────────────────────
   The backgrounds of these components are design-system variables, but their
   text colour used to be a hardcoded Tailwind utility. So when a pack's design
   system picked a pale fill, the white text stayed white: measured on pack #27,
   the PRO/CON chips printed at 1:1 contrast — literally invisible — and the
   runtime mono-safe pass had to repair 36 elements on every render.

   Relative colour syntax derives the ink from the fill's own lightness, so the
   two can never disagree again — on existing packs as much as new ones. The
   plain declaration first is the fallback for engines without relative colour
   support; the mono-safe pass remains the final net.

   These rules sit LAST on purpose. They share specificity with the component
   defaults above, so being last is what lets them beat a component's own colour
   (pk-card-limit set one, and silently won until this moved). A deliberate
   colour still wins by carrying higher specificity — the plain scene label
   does exactly that.

   Thresholds calibrated by measurement, not guessed:
   - pk-ink-auto flips to black above lightness 0.58. Swept 0.44–0.75 over 54
     realistic palette colours (54/54 at WCAG AA, worst 4.76:1) and again over
     254 including 200 random across the gamut (97.6%, worst 4.03:1). Black
     beats white on far more mid-tones than intuition suggests, so the flip sits
     low. No pure-lightness threshold reaches 100% on arbitrary colours —
     oklch lightness is not perfectly monotonic with WCAG luminance for
     saturated greens and purples — which is precisely why the runtime
     mono-safe pass stays: this removes the systematic failures, that one
     catches the residue.
   - pk-muted mixes ink 70% toward paper: 20/20 at AA, worst 5.52:1, where the
     text-gray-500 it replaces bottomed out at 4.05:1 on tinted paper.
   - A palette colour used AS TEXT (the plain scene label) is clamped to
     lightness 0.45 in its own rule: 50/50 colour x paper pairs at AA, worst
     5.74:1. Unclamped, that label was the 1.2:1 one. */
.pk-root .pk-ink-auto {
  color: #ffffff;
  color: oklch(from var(--pk-fill, #000000) clamp(0, (l - 0.58) * -1000, 1) 0 0);
}
.pk-root .pk-muted {
  color: color-mix(in oklab, var(--pk-ink) 70%, var(--pk-paper, #ffffff));
}
/* Matched Pro/Con argument architectures. The side tint is the SAME semantic
   code the rest of the pack uses, so a student reads the colour before the
   words — which is the whole point of the house palette. */
.pk-root .pk-chain { border: 2px solid var(--pk-rule); background: var(--pk-paper); }
.pk-root .pk-chain--pro { border-color: var(--pk-pro); --pk-fill: var(--pk-pro); }
.pk-root .pk-chain--con { border-color: var(--pk-con); --pk-fill: var(--pk-con); }
.pk-root .pk-chain-side { background: var(--pk-fill, var(--pk-ink)); }
.pk-root .pk-chain-label { color: var(--pk-accent); }
/* The crossfire dilemma sits under its own chain, tinted by that side. */
.pk-root .pk-chain-trap { background: color-mix(in srgb, var(--pk-fill, var(--pk-ink)) 12%, transparent); }

/* Multiple choice. The tick box is the one place a student marks the page, so
   it is drawn in the accent and stays legible in greyscale. */
.pk-root .pk-quiz { border: 2px solid var(--pk-rule); }
.pk-root .pk-mcq-box { border-color: var(--pk-accent); }
.pk-root .pk-mcq-box--right { background: transparent; }

/* Word bank — a bench of words, deliberately plain so the two dummies in it
   look exactly like the six real ones. */
.pk-root .pk-wordbank { background: var(--pk-box, var(--pk-paper)); }
.pk-root .pk-wordbank-label { color: var(--pk-accent); }

/* Fast finisher. Quiet by design: it must not compete with the task itself. */
.pk-root .pk-fast { background: var(--pk-box, var(--pk-paper)); border-color: var(--pk-accent-2, var(--pk-accent)); }
.pk-root .pk-fast-label { color: var(--pk-accent-2, var(--pk-accent)); }

/* Teacher sheets. The role token drives the masthead, the rules and the rails,
   so a coach can find their pages in a printed stack from the edge of the paper
   — and a pack's own design system can restyle them, which the old hard-coded
   inline red made impossible. */
   The role reads through FILLS and RULES, never by tinting text on paper. A
   role token is picked to sit under white type on a band; used as ink on the
   pack's own paper it can land at 1.08:1, which is exactly what the first
   version of this block did to the teacher footer. Where the role must become
   text, the lightness is clamped dark first — the same guard the scene labels
   use. */
.pk-root .pk-page--teacher .pk-masthead { border-bottom-color: var(--pk-teacher); }
.pk-root .pk-page--teacher .pk-badge,
.pk-root .pk-page--teacher .pk-bar { background: var(--pk-teacher); --pk-fill: var(--pk-teacher); }
.pk-root .pk-page--teacher .print-footer {
  border-top-color: var(--pk-teacher);
  color: var(--pk-rule);
  color: oklch(from var(--pk-teacher) min(l, 0.42) c h);
}

/* Two-teacher run sheet. Teacher material gets its own hue in the house code,
   so a coaching block can never be mistaken for a student handout. */
.pk-root .pk-coach { border-color: var(--pk-accent-2, var(--pk-rule)); background: var(--pk-paper); }
.pk-root .pk-coach-page { color: var(--pk-accent); font-family: var(--pk-display), sans-serif; }
.pk-root .pk-coach-label { color: var(--pk-accent-2, var(--pk-accent)); }
`;

