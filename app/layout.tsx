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
import { LogoMark } from "@/components/Logo";
import AccountMenu from "@/components/AccountMenu";
import Workspace from "@/components/shell/Workspace";
import { ThemeScript } from "@/components/shell/Theme";
import { type PaletteLesson } from "@/components/shell/CommandPalette";
import { getSession } from "@/lib/auth/dal";
import { listMaterials } from "@/lib/db";

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

  /* The palette's jump-to-a-lesson list. One indexed query, and only for a
     signed-in visitor — an anonymous request must not pay for it and has
     nothing to jump to. Trimmed to what the palette displays rather than
     handing a client component every pack's full content, which is megabytes
     of JSON serialised into the page for a list of titles. */
  let lessons: PaletteLesson[] = [];
  if (session) {
    lessons = (await listMaterials(session.scope)).map((m) => ({
      id: m.id,
      title: m.title,
      subject: m.subject,
      status: m.status,
    }));
  }

  return (
    <html
      lang="en"
      className={`${bebas.variable} ${lexend.variable} ${techMono.variable} ${righteous.variable} ${comicNeue.variable} ${marker.variable} ${PRINT_FONTS} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">
        {/* THE SIGNED-OUT SURFACE keeps the old arrangement. Login, signup and
            the reset screens have no navigation to offer someone without an
            account, and they carry their own logo — a workspace rail there
            would be nine links that all bounce to /login. */}
        {!session ? (
          <main className="flex-1">{children}</main>
        ) : (
          <Workspace
            lessons={lessons}
            header={
              <>
                {/* The mark lives in the header only below `lg`, where the rail
                    is a drawer and the brand would otherwise be nowhere on the
                    page. Above that the sidebar carries it. */}
                <Link
                  href="/"
                  className="mr-1 flex shrink-0 items-center rounded-lg transition-opacity hover:opacity-85 lg:hidden"
                >
                  <LogoMark size={24} />
                  <span className="sr-only">TakenTeach — home</span>
                </Link>
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
              </>
            }
          >
            {children}
          </Workspace>
        )}
      </body>
    </html>
  );
}
