"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Primary nav with an active-state cue. Highlighting the section you're in is a
 * small thing that makes a multi-page tool feel navigable rather than flat.
 */
/**
 * Four primary destinations, and a "More" menu for the rest.
 *
 * There were eight flat links across the header, all shouting in uppercase at
 * the same weight. Eight equal choices is not navigation — it is a list, and it
 * is the clearest tell that something is an internal script rather than a
 * product. These four are what a coach actually opens in a normal week; the
 * others are real but occasional, and occasional things belong behind a menu.
 */
const PRIMARY = [
  { href: "/", label: "Library" },
  { href: "/review", label: "Review" },
  { href: "/rounds", label: "Rounds" },
  { href: "/analytics", label: "Insights" },
];

const MORE = [
  { href: "/motions", label: "Motions" },
  { href: "/formats", label: "Formats" },
  { href: "/students", label: "Students" },
  { href: "/style-kits", label: "Style Kits" },
];

export default function NavLinks() {
  const pathname = usePathname() || "/";
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const moreActive = MORE.some((l) => isActive(l.href));

  const linkClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
      active
        ? "bg-brandsoft text-brandink"
        : "text-fg2 hover:text-fg1 hover:bg-surface-alt"
    }`;

  return (
    <nav className="flex flex-1 items-center gap-1">
      {/* Below `md` the four primary links are folded into the same disclosure
          as the rest. The header is one fixed-height row, and at 375px it wanted
          807px — the four links alone are 292px of that, so on a phone the whole
          page scrolled sideways. Hiding them here rather than adding a second
          nav keeps ONE menu to maintain and one set of active states. */}
      {PRIMARY.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={isActive(l.href) ? "page" : undefined}
          className={`hidden md:block ${linkClass(isActive(l.href))}`}
        >
          {l.label}
        </Link>
      ))}

      {/* <details> rather than state: it closes on Escape and on outside click
          for free, and keyboard-opens like a real menu with no focus trap of
          our own to get wrong. */}
      <details className="group relative">
        <summary
          className={`${linkClass(moreActive)} flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden`}
        >
          {/* "More" is only truthful when the primary four are visible beside
              it; below `md` this disclosure IS the navigation. */}
          <span className="md:hidden">Menu</span>
          <span className="hidden md:inline">More</span>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="opacity-60 transition-transform group-open:rotate-180">
            <path d="M1 3.5 5 7l4-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </summary>
        <div className="absolute left-0 top-full z-30 mt-1.5 w-44 rounded-xl border border-inkline bg-surface p-1.5 shadow-[var(--elev-lg)]">
          {/* On small screens this menu carries the primary destinations too,
              with a rule under them so the four weekly ones still read as a
              group rather than as eight equal choices. */}
          {PRIMARY.map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={`block md:hidden rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                i === PRIMARY.length - 1 ? "mb-1.5 border-b border-inkline pb-2.5" : ""
              } ${
                isActive(l.href)
                  ? "bg-brandsoft text-brandink"
                  : "text-fg2 hover:bg-surface-alt hover:text-fg1"
              }`}
            >
              {l.label}
            </Link>
          ))}
          {MORE.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={`block rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                isActive(l.href)
                  ? "bg-brandsoft text-brandink"
                  : "text-fg2 hover:bg-surface-alt hover:text-fg1"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}
