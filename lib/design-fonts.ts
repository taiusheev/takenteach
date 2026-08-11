/**
 * The type library a pack's design system may draw on.
 *
 * Type is what makes a print identity feel authored rather than themed, and the
 * art director previously had only "a system stack" to reach for — so every pack
 * came out competent and interchangeable. These families are loaded once in the
 * root layout (self-hosted by next/font, no external requests at render time)
 * and exposed as CSS variables, so the AI picks a real pairing by name.
 *
 * Keep the descriptions honest and characterful: they are the only thing the
 * model knows about how a face actually looks.
 */
export interface FontChoice {
  /** the CSS variable the design system must reference */
  varName: string;
  label: string;
  /** what it feels like, and what it is for */
  character: string;
}

export const DISPLAY_FONTS: FontChoice[] = [
  { varName: "--font-anton", label: "Anton", character: "ultra-condensed grotesque, poster-loud; huge headlines, protest placards, sports" },
  { varName: "--font-archivo-black", label: "Archivo Black", character: "heavy neo-grotesque; brutal, modern, newspaper-front-page authority" },
  { varName: "--font-bebas", label: "Bebas Neue", character: "tall condensed caps, clean and punchy; the safe workhorse — avoid unless it truly fits" },
  { varName: "--font-abril", label: "Abril Fatface", character: "fat Didone with hairline serifs; glossy magazine, dramatic contrast" },
  { varName: "--font-playfair", label: "Playfair Display", character: "high-contrast transitional serif; literary, courtroom, elegant broadsheet" },
  { varName: "--font-fraunces", label: "Fraunces", character: "soft wonky serif with old-style warmth; craft, editorial, human" },
  { varName: "--font-syne", label: "Syne", character: "quirky wide geometric; art-gallery, contemporary, slightly strange" },
  { varName: "--font-bungee", label: "Bungee", character: "signage display, blocky and urban; loud, kinetic, street" },
  { varName: "--font-oswald", label: "Oswald", character: "condensed gothic; transit signage, dossier headers, functional and tight" },
  { varName: "--font-righteous", label: "Righteous", character: "rounded geometric deco; retro-friendly, arcade, upbeat" },
];

export const BODY_FONTS: FontChoice[] = [
  { varName: "--font-lexend", label: "Lexend", character: "high-legibility sans built for readers; the neutral default" },
  { varName: "--font-work-sans", label: "Work Sans", character: "friendly grotesque with a little warmth; modern and unfussy" },
  { varName: "--font-plex-sans", label: "IBM Plex Sans", character: "engineered neutral sans; technical, institutional, precise" },
  { varName: "--font-source-serif", label: "Source Serif 4", character: "sturdy screen-and-print serif; textbook, authoritative, readable at small sizes" },
  { varName: "--font-newsreader", label: "Newsreader", character: "news serif with real voice; long-read, editorial, humane" },
];

export const MONO_FONTS: FontChoice[] = [
  { varName: "--font-techmono", label: "Share Tech Mono", character: "terminal/telemetry mono; surveillance, dossier, sci-fi" },
  { varName: "--font-jetbrains", label: "JetBrains Mono", character: "crisp modern code mono; labels, data, engineering" },
  { varName: "--font-space-mono", label: "Space Mono", character: "quirky retro-future mono; zines, tickets, evidence stamps" },
];

/** The type menu, rendered for the art-direction prompt. */
export function fontMenu(): string {
  const fmt = (f: FontChoice) => `  ${f.varName} — ${f.label}: ${f.character}`;
  return `DISPLAY (headlines, mastheads, cover):
${DISPLAY_FONTS.map(fmt).join("\n")}

TEXT (body copy, prompts, student-facing sentences):
${BODY_FONTS.map(fmt).join("\n")}

MONO (labels, badges, codes, data):
${MONO_FONTS.map(fmt).join("\n")}`;
}
