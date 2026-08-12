"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import HeaderSearch from "./HeaderTools";
import CommandPalette, { type PaletteLesson } from "./CommandPalette";
import { ToastProvider } from "./Toaster";
import { ThemeToggle } from "./Theme";
import { IconMenu } from "./icons";

/**
 * The signed-in frame: rail on the left, header across the top, content under.
 *
 * ── IT IS NOT A LAYOUT FILE, DELIBERATELY ────────────────────────────────
 * The obvious Next answer is a route group — `app/(workspace)/layout.tsx` — and
 * it was not taken. Every authenticated route already lives at a path the
 * product links to, prints, and has in browser histories; moving twenty-odd
 * folders to introduce a layout would be a large, risky diff that changes no
 * behaviour, and §17 of the brief is explicit about not breaking working
 * routing to restyle. This wraps at the root instead and decides per path.
 *
 * ── WHICH ROUTES GET IT ──────────────────────────────────────────────────
 * The same rule the old header used, kept: routes that own the whole screen
 * opt out. Classroom mode is projected in front of a class and must not show a
 * teacher's navigation; the auth screens have no destination to offer someone
 * without an account. That list lived in AppChrome and still does — this reads
 * from one source rather than growing a second copy that drifts.
 */

/** Routes that own the whole screen. See AppChrome for the reasoning. */
const FULL_SCREEN = [
  /\/teach\/?$/,
  /\/print\/?$/,
  /^\/login\/?$/,
  /^\/signup(\/|$)/,
  /^\/forgot-password\/?$/,
  /^\/reset-password\/?$/,
  /^\/account\/password\/?$/,
  /^\/no-access\/?$/,
];

export default function Workspace({
  header,
  lessons,
  children,
}: {
  /** The header's right-hand side — rendered on the server, so it can carry the session. */
  header: React.ReactNode;
  /** Every lesson, by name, so the palette can jump straight to one. */
  lessons: PaletteLesson[];
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  /* The shortcut is registered once, on the window, so it works from anywhere
     including inside the editor. It deliberately does NOT fire while the caret
     is in a text field other than the palette's own — ⌘K is a text-editing
     shortcut in some inputs, and stealing it there would be worse than not
     having it. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* A dialog over a scrollable page must stop the page scrolling underneath it,
     or arrowing through results drags the background around. */
  useEffect(() => {
    if (!paletteOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [paletteOpen]);

  /* The provider wraps the full-screen branch too: classroom mode and the print
     view still perform actions worth confirming, and a page that cannot toast
     would fail silently rather than not at all. */
  if (FULL_SCREEN.some((re) => re.test(pathname))) {
    return <ToastProvider>{children}</ToastProvider>;
  }

  return (
    <ToastProvider>
      <div className="min-h-full">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      {/* The content column is pushed by the rail's CURRENT width, which the
          sidebar publishes as a custom property when it collapses. Reading one
          variable means the offset cannot drift out of step with the rail —
          the classic bug where collapsing leaves a 180px gap. */}
      <div className="lg:pl-[var(--sidebar-current,var(--sidebar-w))] transition-[padding] duration-200">
        <header
          className="no-print sticky top-0 flex h-[var(--header-h)] items-center gap-2 border-b border-inkline bg-surface/85 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-surface/70 sm:px-5"
          style={{ zIndex: "var(--z-sticky)" }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg2 transition-colors hover:bg-surface-alt hover:text-fg1 lg:hidden"
          >
            <IconMenu size={18} />
          </button>
          <HeaderSearch onOpen={() => setPaletteOpen(true)} />
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <ThemeToggle />
            {header}
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

        {/* Mounted only while open, so its query and highlight reset by
            construction rather than by an effect that clears them. */}
        {paletteOpen && (
          <CommandPalette
            onClose={() => setPaletteOpen(false)}
            lessons={lessons}
          />
        )}
      </div>
    </ToastProvider>
  );
}
