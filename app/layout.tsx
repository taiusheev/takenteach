import type { Metadata, Viewport } from "next";
import Link from "next/link";
import {
  Abril_Fatface,
  Anton,
  Archivo_Black,
  Bebas_Neue,
  Bungee,
  Comic_Neue,
  Fraunces,
  IBM_Plex_Sans,
  JetBrains_Mono,
  Lexend,
  Newsreader,
  Oswald,
  Permanent_Marker,
  Playfair_Display,
  Righteous,
  Share_Tech_Mono,
  Source_Serif_4,
  Space_Mono,
  Syne,
  Work_Sans,
} from "next/font/google";
import "./globals.css";
import NavLinks from "@/components/NavLinks";
import AppChrome from "@/components/AppChrome";
import Logo, { LogoMark } from "@/components/Logo";
import AccountMenu from "@/components/AccountMenu";
import { getSession } from "@/lib/auth/dal";

const bebas = Bebas_Neue({
  weight: "400",
  variable: "--font-bebas",
  subsets: ["latin"],
});
const lexend = Lexend({ variable: "--font-lexend", subsets: ["latin"] });
const techMono = Share_Tech_Mono({
  weight: "400",
  variable: "--font-techmono",
  subsets: ["latin"],
});
// alternates a Style Kit can select for print typography
const righteous = Righteous({
  weight: "400",
  variable: "--font-righteous",
  subsets: ["latin"],
});
const comicNeue = Comic_Neue({
  weight: ["400", "700"],
  variable: "--font-comic",
  subsets: ["latin"],
});
const marker = Permanent_Marker({
  weight: "400",
  variable: "--font-marker",
  subsets: ["latin"],
});

/**
 * The print type library (lib/design-fonts.ts). A pack's AI-authored design
 * system picks a display/text/mono pairing from these by CSS variable, so two
 * packs can look genuinely unrelated instead of differently-coloured.
 */
const anton = Anton({ weight: "400", variable: "--font-anton", subsets: ["latin"] });
const archivoBlack = Archivo_Black({ weight: "400", variable: "--font-archivo-black", subsets: ["latin"] });
const abril = Abril_Fatface({ weight: "400", variable: "--font-abril", subsets: ["latin"] });
const playfair = Playfair_Display({ weight: ["700", "900"], style: ["normal", "italic"], variable: "--font-playfair", subsets: ["latin"] });
const fraunces = Fraunces({ weight: ["700", "900"], variable: "--font-fraunces", subsets: ["latin"] });
const syne = Syne({ weight: ["700", "800"], variable: "--font-syne", subsets: ["latin"] });
const bungee = Bungee({ weight: "400", variable: "--font-bungee", subsets: ["latin"] });
const oswald = Oswald({ weight: ["500", "700"], variable: "--font-oswald", subsets: ["latin"] });
const workSans = Work_Sans({ weight: ["400", "600", "700"], variable: "--font-work-sans", subsets: ["latin"] });
const plexSans = IBM_Plex_Sans({ weight: ["400", "600", "700"], variable: "--font-plex-sans", subsets: ["latin"] });
const sourceSerif = Source_Serif_4({ weight: ["400", "600", "700"], variable: "--font-source-serif", subsets: ["latin"] });
const newsreader = Newsreader({ weight: ["400", "600", "700"], variable: "--font-newsreader", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ weight: ["400", "700"], variable: "--font-jetbrains", subsets: ["latin"] });
const spaceMono = Space_Mono({ weight: ["400", "700"], variable: "--font-space-mono", subsets: ["latin"] });

const PRINT_FONTS = [
  anton, archivoBlack, abril, playfair, fraunces, syne, bungee, oswald,
  workSans, plexSans, sourceSerif, newsreader, jetbrains, spaceMono,
]
  .map((f) => f.variable)
  .join(" ");

export const metadata: Metadata = {
  /* The identity's own line, not a category label. "Lesson Builder" described
     the file type; this describes the trade. */
  title: {
    default: "TakenTeach — Lessons, faster. Teaching, better.",
    template: "%s · TakenTeach",
  },
  description:
    "Build print-ready debate, critical-thinking and writing lessons in one house style — with the evidence rules and quality checks built in.",
  applicationName: "TakenTeach",
};

/* The mobile address bar is the one piece of chrome the browser paints in a
   colour of its own choosing unless told otherwise. Told otherwise.
   This lives in `viewport`, not `metadata` — `metadata.themeColor` has been
   deprecated since Next 14. */
export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  return (
    <html
      lang="en"
      className={`${bebas.variable} ${lexend.variable} ${techMono.variable} ${righteous.variable} ${comicNeue.variable} ${marker.variable} ${PRINT_FONTS} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppChrome>
        {/* Gap and padding tighten on small screens: at 375px this row wanted
            807px, and 96px of that was spacing alone. */}
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 sm:gap-6 border-b border-inkline bg-surface/85 px-3 sm:px-6 h-16 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75">
          {/* The one hairline of brand in the chrome: a 2px gradient seam along
              the bottom of the header, sitting ON the border rather than adding
              height. It is the cheapest possible signature — the whole product
              reads as branded from any page without a single coloured panel. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5"
            style={{ backgroundImage: "var(--grad-brand)", opacity: 0.9 }}
          />
          <Link
            href="/"
            className="group flex shrink-0 items-center rounded-lg transition-opacity hover:opacity-85"
          >
            {/* Below `sm` the wordmark drops and the mark carries the brand
                alone — it is the one part of the header that can go without
                costing a destination. The link keeps an accessible name either
                way. */}
            <Logo size={26} className="hidden sm:inline-flex" />
            <LogoMark size={28} className="sm:hidden" />
            <span className="sr-only sm:hidden">TakenTeach — home</span>
          </Link>
          <NavLinks />
          {/* Who you are and the way out.
              This slot held a ROLE SWITCHER — a select box that let anyone
              choose whether they were a founder or a teacher. That was honest
              while there was no authentication and every permission in the
              product was decorative; it is indefensible now, because a control
              that changes what you are allowed to do is not a preference. It is
              gone, along with the `ascent-role` cookie it wrote and the route
              that set it. Your role comes from your membership in the
              organization you are acting in, and nothing in the browser can
              change it. */}
          {session && (
            <AccountMenu
              account={{
                name: session.name,
                email: session.email,
                orgName: session.orgName,
                orgRole: session.orgRole,
                orgKind: session.orgKind,
                membershipStatus: session.membershipStatus,
                otherOrgs: session.memberships
                  .filter((m) => m.orgId !== session.orgId)
                  .map((m) => ({ orgName: m.orgName, status: m.status })),
              }}
            />
          )}
        </header>
        </AppChrome>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
