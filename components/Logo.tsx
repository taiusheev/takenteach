/**
 * THE MARK.
 *
 * Drawn, not an image file. Three reasons, in order of how much they cost when
 * ignored: an <img> logo is a network request in front of the first paint on
 * every page; a raster one is soft on the displays most teachers open this on;
 * and neither can pick up the surrounding theme, which is the whole trick that
 * lets one component sit on a white header and a navy hero without a second
 * file to keep in sync.
 *
 * The mark is the identity's: two stacked rounded cards — a lesson being handed
 * on — lit with the blue→violet gradient, a knocked-out T, and a sparkle for
 * the part the machine does. Built at a 40×40 viewBox and scaled, so it is
 * exact at 26px in the header and at 96px in the hero.
 *
 * The sparkle sits clear of the card's rounded corner rather than overlapping
 * it, and that is a constraint, not a coincidence: it means the sparkle is
 * always drawn against the PAGE, never against the gradient, so it needs one
 * colour per surface instead of one that has to survive both. Blue on light,
 * white on dark. Moving it inward breaks that.
 *
 * A NOTE ON THE GRADIENT ID. It is a fixed string, not generated per instance.
 * Two marks on one page emit the same id twice and the browser resolves both to
 * the first — correct here only because the definitions are byte-identical. A
 * future variant with a *different* gradient needs a different id, not a second
 * copy of this one.
 */

type Tone = "light" | "dark";

/** The mark on its own — a collapsed header, an avatar, an empty state. */
export function LogoMark({
  size = 32,
  tone = "light",
  className = "",
}: {
  size?: number;
  tone?: Tone;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <defs>
        <linearGradient
          id="tt-mark"
          x1="9"
          y1="6"
          x2="33"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2563EB" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>

      {/* The card underneath. Violet, held to 55% so it reads as the same object
          in shadow rather than as a second coloured shape. */}
      <rect x="3" y="11" width="21" height="24" rx="7" fill="#7C3AED" opacity="0.55" />

      {/* The card on top, carrying the gradient. */}
      <rect x="9" y="6" width="24" height="26" rx="8" fill="url(#tt-mark)" />

      {/* The T, knocked out. One path with round caps, so the crossbar and stem
          are a single letter rather than two rectangles that happen to touch —
          at 26px that difference is visible. */}
      <path
        d="M14.5 13.5h13M21 13.5v12"
        stroke="#FFFFFF"
        strokeWidth="4.2"
        strokeLinecap="round"
      />

      {/* The sparkle. Clear of the card (see the note above), so it takes the
          one colour that works on the surface behind it. */}
      <path
        d="M35.5 0.5c.6 2.9 1.1 3.4 4 4-2.9.6-3.4 1.1-4 4-.6-2.9-1.1-3.4-4-4 2.9-.6 3.4-1.1 4-4Z"
        fill={tone === "dark" ? "#FFFFFF" : "var(--brand)"}
      />
    </svg>
  );
}

/**
 * Mark + wordmark, the lockup used in the header and the hero.
 *
 * `tone="dark"` is for the navy band. "Taken" goes white — navy on navy is not
 * a wordmark — and "Teach" steps up to --brand-lift, because the brand blue
 * itself only manages 3.1:1 on the navy and a wordmark that has to be squinted
 * at is a broken wordmark.
 */
export default function Logo({
  size = 32,
  tone = "light",
  tagline = false,
  className = "",
}: {
  size?: number;
  tone?: Tone;
  tagline?: boolean;
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} tone={tone} />
      <span className="inline-flex flex-col justify-center">
        <span
          className="font-display leading-none"
          style={{ fontSize: size * 0.6, letterSpacing: "-0.025em" }}
        >
          <span style={{ color: dark ? "#FFFFFF" : "var(--navy)" }}>Taken</span>
          <span style={{ color: dark ? "var(--brand-lift)" : "var(--brand)" }}>
            Teach
          </span>
        </span>
        {tagline && (
          /* The identity sets the line in wide-tracked caps under the wordmark.
             It is a signature, not a sentence — sized to be read once and then
             ignored. It stays in the accessibility tree: a screen reader should
             get the positioning line the same as anyone else. */
          <span
            className="mt-1.5 font-semibold uppercase"
            style={{
              fontSize: Math.max(9, size * 0.22),
              letterSpacing: "0.16em",
              color: dark ? "rgba(255,255,255,0.66)" : "var(--text-3)",
            }}
          >
            Lessons, faster. Teaching, better.
          </span>
        )}
      </span>
    </span>
  );
}
