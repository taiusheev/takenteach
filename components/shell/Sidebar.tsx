"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useStored, writeStored } from "./client-value";
import Logo, { LogoMark } from "@/components/Logo";
import {
  IconChevron,
  IconClose,
  IconFormats,
  IconInsights,
  IconLibrary,
  IconMotions,
  IconPalette,
  IconPlus,
  IconReview,
  IconRounds,
  IconSettings,
  IconStack,
  IconStudents,
  type IconProps,
} from "./icons";

/**
 * THE WORKSPACE RAIL.
 *
 * ── WHY THE INFORMATION ARCHITECTURE IS NOT THE ONE IN THE BRIEF ──────────
 * The redesign brief proposed: Dashboard · My Lessons · Create · Templates ·
 * Resources · Favorites · Recently Viewed · Settings. Adopted literally that
 * would have deleted most of the product — Review, Rounds, Judging, Students,
 * Insights, Formats, Motions and Style Kits are all real, built, and reachable
 * today. A navigation column is a claim about what a product does, and dropping
 * eight working surfaces to add three that do not exist yet is a downgrade
 * wearing a redesign's clothes.
 *
 * So the two are merged. Every existing destination survives; what changes is
 * that they are GROUPED BY WHEN A TEACHER NEEDS THEM rather than listed flat.
 * The old header put eight equal links in a row, which is a list, not
 * navigation — you had to read all eight every time because none of them
 * claimed to matter more.
 *
 *   BUILD    the loop that runs weekly — library, review queue
 *   TEACH    what happens in the room — rounds, students
 *   TUNE     the settings behind the work — formats, motions, style kits
 *
 * Insights sits alone above the groups because it answers "how is this going",
 * which is a different question from "what do I do next".
 *
 * ── COLLAPSING ───────────────────────────────────────────────────────────
 * Collapsed to icons, the rail keeps its labels as `title` and as screen-reader
 * text, so nothing becomes unreachable — an icon-only nav that drops its
 * accessible names is a common and severe regression. The choice is remembered
 * in localStorage because it is a preference about how someone works, not
 * something to re-decide on every page load.
 */

type Item = {
  href: string;
  label: string;
  icon: (p: IconProps) => React.ReactElement;
  /** Match only this exact path — for `/`, which otherwise prefixes everything. */
  exact?: boolean;
};

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Build",
    items: [
      { href: "/", label: "Library", icon: IconLibrary, exact: true },
      { href: "/review", label: "Review", icon: IconReview },
      { href: "/templates", label: "Templates", icon: IconStack },
    ],
  },
  {
    title: "Teach",
    items: [
      { href: "/rounds", label: "Rounds", icon: IconRounds },
      { href: "/students", label: "Students", icon: IconStudents },
    ],
  },
  {
    title: "Tune",
    items: [
      { href: "/formats", label: "Formats", icon: IconFormats },
      { href: "/motions", label: "Motions", icon: IconMotions },
      { href: "/style-kits", label: "Style Kits", icon: IconPalette },
      { href: "/settings", label: "Settings", icon: IconSettings },
    ],
  },
];

const INSIGHTS: Item = {
  href: "/analytics",
  label: "Insights",
  icon: IconInsights,
};

const STORAGE_KEY = "tt.sidebar.collapsed";

export default function Sidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname() || "/";
  /* The server snapshot is "not collapsed" and the real value is read
     synchronously on the client, so this renders once and hydrates cleanly.
     See ./client-value.ts. */
  const collapsed = useStored(STORAGE_KEY) === "1";

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-current",
      collapsed ? "var(--sidebar-w-collapsed)" : "var(--sidebar-w)"
    );
  }, [collapsed]);

  function toggle() {
    writeStored(STORAGE_KEY, collapsed ? "0" : "1");
  }

  const isActive = (item: Item) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const link = (item: Item) => {
    const active = isActive(item);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        onClick={onCloseMobile}
        className={`nav-item ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
      >
        <Icon className="nav-icon" size={17} />
        <span className={collapsed ? "lg:sr-only" : ""}>{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* The scrim. Mobile only — it exists to make "tap anywhere to dismiss"
          work, which is the gesture people try before they look for an X. */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onCloseMobile}
          className="fixed inset-0 bg-navy/40 backdrop-blur-[2px] lg:hidden"
          style={{ zIndex: "var(--z-drawer)" }}
        />
      )}

      <aside
        data-collapsed={collapsed ? "true" : "false"}
        className={`no-print fixed inset-y-0 left-0 flex w-[var(--sidebar-w)] flex-col border-r border-inkline bg-surface transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:w-[var(--sidebar-w-collapsed)]" : ""}`}
        style={{ zIndex: "var(--z-drawer)" }}
      >
        <div
          className={`flex h-[var(--header-h)] items-center border-b border-inkline px-3 ${
            collapsed ? "lg:justify-center lg:px-0" : ""
          }`}
        >
          <Link
            href="/"
            onClick={onCloseMobile}
            className="flex items-center rounded-lg transition-opacity hover:opacity-85"
          >
            <Logo size={24} className={collapsed ? "lg:hidden" : ""} />
            <LogoMark
              size={26}
              className={collapsed ? "hidden lg:inline-flex" : "hidden"}
            />
            <span className="sr-only">TakenTeach — home</span>
          </Link>
        </div>

        {/* Create is the product's primary verb, so it sits above the
            navigation rather than inside it — this is the thing a teacher
            opened the app to do, and it should never be one of eight equals. */}
        <div className={`p-3 ${collapsed ? "lg:px-2" : ""}`}>
          <Link
            href="/materials/new"
            onClick={onCloseMobile}
            title={collapsed ? "New lesson" : undefined}
            className={`btn btn-primary w-full ${collapsed ? "lg:px-0" : ""}`}
          >
            <IconPlus size={16} />
            <span className={collapsed ? "lg:sr-only" : ""}>New lesson</span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          <div className="mb-1">{link(INSIGHTS)}</div>
          {SECTIONS.map((section) => (
            <div key={section.title} className="mt-4">
              {/* The group label goes away when collapsed — three-letter
                  headings over icon-only buttons is noise, and the icons carry
                  their own tooltips. */}
              <p className={`nav-section ${collapsed ? "lg:hidden" : ""}`}>
                {section.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.map(link)}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-inkline p-2">
          <button
            type="button"
            onClick={toggle}
            aria-pressed={collapsed}
            className="nav-item hidden w-full lg:flex"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <IconChevron
              size={16}
              className={`nav-icon transition-transform duration-200 ${
                collapsed ? "" : "rotate-180"
              }`}
            />
            <span className={collapsed ? "lg:sr-only" : ""}>Collapse</span>
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            className="nav-item w-full lg:hidden"
          >
            <IconClose size={16} className="nav-icon" />
            <span>Close menu</span>
          </button>
        </div>
      </aside>
    </>
  );
}
