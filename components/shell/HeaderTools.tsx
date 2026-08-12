"use client";

import { useIsMac } from "./client-value";
import { IconSearch } from "./icons";

/**
 * The header's search affordance.
 *
 * It is a BUTTON that opens the command palette, not an input. A real input
 * here would be a second, weaker way to do the same thing — you would type into
 * it, then need a results surface, then need keyboard handling, and end up
 * having built the palette anyway but only for search. One surface, reachable
 * two ways: click here, or press the shortcut from anywhere.
 *
 * The shortcut is drawn on the control rather than documented elsewhere, since
 * a shortcut nobody can see is a shortcut nobody uses.
 */
export default function HeaderSearch({ onOpen }: { onOpen: () => void }) {
  /* Server-snapshotted so the first paint matches on both sides — rendering
     "Ctrl" and then swapping to the Command glyph during hydration would show
     every shortcut hint changing under the reader's eye. */
  const mac = useIsMac();

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-inkline bg-surface-alt/60 px-2.5 text-left text-fg3 transition-colors hover:border-line-strong hover:bg-surface-alt sm:max-w-sm"
    >
      <IconSearch size={15} className="shrink-0" />
      <span className="truncate text-[13px]">Search or jump to…</span>
      <span className="ml-auto hidden shrink-0 items-center gap-0.5 sm:flex">
        <kbd>{mac ? "⌘" : "Ctrl"}</kbd>
        <kbd>K</kbd>
      </span>
    </button>
  );
}
