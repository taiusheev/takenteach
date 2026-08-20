"use client";

import Link from "next/link";
import type { Autosave } from "./useAutosave";
import SaveStatus from "./SaveStatus";
import { IconPrinter } from "@/components/shell/icons";

/**
 * The editor's own toolbar, pinned under the app header.
 *
 * In a document fifteen screens long, a header that scrolls away takes the save
 * state, the quality count and every exit with it — so from page four onward the
 * teacher is editing with no idea whether their work is saved and no way out
 * except the browser's back button. Everything on this bar is something you
 * need to see or reach from anywhere in the document, and nothing else is on it.
 */
export default function EditorBar({
  materialId,
  title,
  onTitleChange,
  save,
  failingChecks,
  onJumpToQuality,
}: {
  materialId: number;
  title: string;
  onTitleChange: (v: string) => void;
  save: Autosave;
  failingChecks: number | null;
  onJumpToQuality: () => void;
}) {
  return (
    <div
      // The negative margins mirror <main>'s padding at each breakpoint, so the
      // bar bleeds to the full width of the content column instead of leaving a
      // strip of page showing through beside it as it sticks.
      className="sticky top-[var(--header-h)] -mx-4 mb-5 border-b border-inkline bg-surface/90 px-4 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      style={{ zIndex: "var(--z-sticky)" }}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          href={`/materials/${materialId}`}
          className="shrink-0 text-[13px] font-semibold text-fg3 transition-colors hover:text-fg1"
        >
          ← Lesson
        </Link>

        {/* The title is an input that does not look like one until you reach
            for it: a boxed field here would make the document's own name read
            as the first row of a form. */}
        <input
          aria-label="Lesson title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled lesson"
          className="min-w-40 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-[15px] font-semibold text-fg1 outline-none transition-colors placeholder:text-fg3 hover:border-inkline focus:border-brand/60"
        />

        <SaveStatus save={save} className="shrink-0" />

        {failingChecks !== null && (
          <button
            type="button"
            onClick={onJumpToQuality}
            className={`shrink-0 rounded-md border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
              failingChecks > 0
                ? "border-warn/40 bg-warn/10 text-warn hover:bg-warn/12"
                : "border-ok/40 bg-ok/10 text-ok"
            }`}
          >
            {failingChecks > 0
              ? `${failingChecks} to fix`
              : "All checks pass"}
          </button>
        )}

        <Link
          href={`/materials/${materialId}/print`}
          className="btn btn-secondary btn-sm shrink-0"
        >
          <IconPrinter size={13} />
          Preview &amp; print
        </Link>
      </div>
    </div>
  );
}
