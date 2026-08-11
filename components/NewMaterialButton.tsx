"use client";

import Link from "next/link";

/**
 * The product's primary action, so it wears the primary button — the one place
 * in the interface where the brand gradient fills something clickable.
 *
 * It used to end in `hover:bg-yellow-300`, a hover left over from the
 * yellow-on-navy theme two rebrands ago: the button was brand-coloured at rest
 * and turned school-bus yellow under the cursor. Hover is a state, not a
 * costume change.
 */
export default function NewMaterialButton({
  disabled,
  tone = "light",
}: {
  disabled: boolean;
  /** `dark` when the button sits on the navy band, where a white disabled chip
   *  would be brighter than the live button beside it. */
  tone?: "light" | "dark";
}) {
  if (disabled) {
    return (
      <span
        title="TAs and judges give feedback; they don't build."
        aria-disabled="true"
        className={`btn cursor-not-allowed ${
          tone === "dark"
            ? "border border-white/20 bg-white/10 text-white/55"
            : "border border-inkline bg-surface-alt text-fg3"
        }`}
      >
        New lesson pack
      </span>
    );
  }
  return (
    <Link href="/materials/new" className="btn btn-primary">
      {/* A plus sign, drawn rather than typed: the "+" glyph sits on the text
          baseline and reads a pixel low next to a cap-height label. */}
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <path
          d="M7 2v10M2 7h10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      New lesson pack
    </Link>
  );
}
