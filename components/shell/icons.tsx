/**
 * The interface icon set.
 *
 * Hand-drawn rather than installed. The product has six runtime dependencies
 * and none of them are UI; an icon library would be the largest thing in the
 * bundle and would ship two thousand glyphs to render the fourteen used here.
 *
 * They are one family on purpose: 24×24 box, 1.75 stroke, round caps and joins,
 * no fills. Mixing stroke and filled icons in one rail is the fastest way to
 * make a navigation column look assembled from clip art.
 *
 * Colour is never set here — every icon inherits `currentColor`, so a nav item
 * changing colour on hover or when active takes its icon with it.
 */

export type IconProps = {
  size?: number;
  className?: string;
};

function Svg({
  size = 18,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.2 12 3l9 7.2" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
  </Svg>
);

export const IconLibrary = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H9v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
    <path d="M9 4h5v16H9z" />
    <path d="m15.6 4.6 3 .8a1 1 0 0 1 .7 1.2l-3.4 12.6" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconReview = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H16l4 4v11.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19.5Z" />
    <path d="M15 4v5h5" />
    <path d="m8.5 14 2 2 4-4" />
  </Svg>
);

export const IconRounds = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4v7a5 5 0 0 0 10 0V4" />
    <path d="M5 4h4M15 4h4" />
    <path d="M12 16v4M8.5 20h7" />
  </Svg>
);

export const IconStudents = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" />
    <path d="M17.5 14.4A5.5 5.5 0 0 1 20.5 20" />
  </Svg>
);

export const IconInsights = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 20v-6M12.5 20V9M17 20v-9" />
  </Svg>
);

export const IconFormats = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M9 9.5V19.5" />
  </Svg>
);

export const IconMotions = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v6a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.2a.5.5 0 0 1-.8-.4V16a2.5 2.5 0 0 1-1-2Z" />
    <path d="M8.5 9.5h7M8.5 12.5h4" />
  </Svg>
);

export const IconPalette = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 0 0 18c.9 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.4 1.5-1.4H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8Z" />
    <circle cx="7.5" cy="11.5" r="1.1" />
    <circle cx="11" cy="7.5" r="1.1" />
    <circle cx="15.5" cy="9" r="1.1" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 4 4" />
  </Svg>
);

export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
  </Svg>
);

export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.2 8.2 0 1 0 20 14.2Z" />
  </Svg>
);

export const IconHelp = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.4" />
    <path d="M12 17h.01" />
  </Svg>
);

export const IconChevron = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);

/* ── Action icons ──────────────────────────────────────────────────────────
   Added to retire the emoji in the build flow's buttons. Emoji are the fastest
   way to make a professional tool look like a hobby project, and they are not
   merely a style problem: they render as a different glyph on every platform,
   they inherit no colour so a "printer" stays black on a brand-filled button,
   and a screen reader announces "high voltage" where the label says Build. */

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4.8v14.4a.6.6 0 0 0 .92.5l11.3-7.2a.6.6 0 0 0 0-1L7.92 4.3a.6.6 0 0 0-.92.5Z" />
  </Svg>
);

export const IconPencil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4.2l9.4-9.4a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4 15.8Z" />
    <path d="m14.5 6.5 3 3" />
  </Svg>
);

export const IconPrinter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 9V4h10v5" />
    <path d="M7 18H5.5A1.5 1.5 0 0 1 4 16.5v-5A2.5 2.5 0 0 1 6.5 9h11a2.5 2.5 0 0 1 2.5 2.5v5a1.5 1.5 0 0 1-1.5 1.5H17" />
    <rect x="7" y="14" width="10" height="6" rx="1" />
  </Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11.5A8 8 0 1 0 18.4 17" />
    <path d="M20 5.5V12h-6" />
  </Svg>
);

/** The "AI did this" cue. Used where a build or a rewrite is being started. */
export const IconSpark = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5c.9 4.6 1.8 5.5 6.4 6.4-4.6.9-5.5 1.8-6.4 6.4-.9-4.6-1.8-5.5-6.4-6.4 4.6-.9 5.5-1.8 6.4-6.4Z" />
    <path d="M18.5 16.2c.4 1.9.8 2.3 2.7 2.7-1.9.4-2.3.8-2.7 2.7-.4-1.9-.8-2.3-2.7-2.7 1.9-.4 2.3-.8 2.7-2.7Z" />
  </Svg>
);

export const IconDoc = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 4.5A1.5 1.5 0 0 1 7 3h7l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5Z" />
    <path d="M14 3v5h5" />
  </Svg>
);

export const IconStack = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z" />
    <path d="m3.5 12 8.5 4.5 8.5-4.5" />
    <path d="m3.5 16.5 8.5 4.5 8.5-4.5" />
  </Svg>
);

export const IconWrench = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.5 4.5a5 5 0 0 0-6.3 6.3L4 16l4 4 5.2-5.2a5 5 0 0 0 6.3-6.3l-3 3-2.3-2.3Z" />
  </Svg>
);
