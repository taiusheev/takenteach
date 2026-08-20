"use client";

import { useSyncExternalStore } from "react";
import type { Autosave } from "./useAutosave";

/**
 * The one place the editor says whether the teacher's work is safe.
 *
 * It used to be a single uppercase word — "SAVED" — in muted grey, which is
 * both the least legible way to write it and a claim with no evidence attached.
 * Four states, each saying what it actually knows:
 *
 *   Unsaved changes   dirty, a save is coming
 *   Saving…           a request is open
 *   Saved · 2 min ago the server confirmed it, and when
 *   Couldn't save     with the reason and a Retry that is a real button
 *
 * The relative time matters more than it looks. "Saved" alone is unfalsifiable;
 * "Saved · 2 min ago" next to an edit made ten seconds ago is a teacher noticing
 * something is wrong before they close the laptop.
 */
export default function SaveStatus({
  save,
  className = "",
}: {
  save: Autosave;
  className?: string;
}) {
  const ago = useRelativeTime(save.savedAt);

  if (save.state === "error") {
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-[11.5px] font-semibold text-danger ${className}`}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-danger" />
        <span className="max-w-56 truncate" title={save.error}>
          {save.error || "Couldn't save"}
        </span>
        <button
          type="button"
          onClick={save.saveNow}
          className="rounded border border-danger/40 px-1.5 py-0.5 text-[10.5px] font-bold hover:bg-danger/10"
        >
          Retry
        </button>
      </span>
    );
  }

  const dot =
    save.state === "saving"
      ? "bg-warn"
      : save.state === "dirty"
        ? "bg-fg3"
        : "bg-ok";

  const label =
    save.state === "saving"
      ? "Saving…"
      : save.state === "dirty"
        ? "Unsaved changes"
        : save.savedAt
          ? `Saved${ago ? ` · ${ago}` : ""}`
          : "All changes save automatically";

  return (
    <span
      // `polite`, so a screen reader is told the work is safe without being
      // interrupted mid-sentence on every keystroke.
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium text-fg3 ${className}`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot} ${
          save.state === "saving" ? "build-pulse" : ""
        }`}
      />
      {label}
    </span>
  );
}

/**
 * "just now" · "3 min ago" · "14:05".
 *
 * ── THE CLOCK IS AN EXTERNAL STORE, NOT A RENDER-TIME READ ───────────────
 * `Date.now()` in a render body makes the component non-idempotent: two renders
 * of the same state disagree, and React is entitled to keep either. The clock is
 * genuinely external mutable state, so it is subscribed to as one — the same
 * shape as the time-of-day greeting on the dashboard.
 *
 * One interval for the whole page, shared by every mounted status pill, and
 * stopped when the last one unmounts.
 */
let clock = 0;
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;

function subscribeToClock(onChange: () => void): () => void {
  clock = Date.now(); // fresh at mount, not up to 30s stale
  listeners.add(onChange);
  ticker ??= setInterval(() => {
    clock = Date.now();
    for (const l of listeners) l();
  }, 30_000);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

function useRelativeTime(at: number | null): string {
  const now = useSyncExternalStore(
    subscribeToClock,
    () => clock,
    () => 0 // the server has no clock worth quoting
  );
  if (!at || !now) return "";
  const mins = Math.floor((now - at) / 60_000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
