"use client";

import { useState, type ReactNode } from "react";

/**
 * THE EDITOR'S RIGHT RAIL, ONE PANEL AT A TIME.
 *
 * ── THE MEASUREMENT ──────────────────────────────────────────────────────
 * The rail stacked five panels — outline, quality checklist, coherence,
 * sources, AI assistant — for 4,557px of content inside a 656px sticky window
 * on a 1280×800 laptop. Nearly seven screens of rail beside a document that is
 * itself scrolling.
 *
 * The specific damage is worse than the number suggests. The outline is the
 * editor's navigation: it is how you reach page nine of thirteen. Putting it
 * first in a scrolling column means that the moment you scroll down to read a
 * failing check, the navigation is gone — so the one control whose whole job is
 * "get me somewhere else quickly" was the one you had to go looking for.
 *
 * Tabs, therefore, and the outline is the default because navigating is the
 * commonest thing anyone does here. Quality carries the failing count on its
 * tab, so hiding the panel does not hide the problem — the badge is visible
 * from whichever tab you are on, which the stacked version could not manage
 * either.
 */

export interface RailTab {
  id: string;
  label: string;
  /** Small count beside the label — a number worth seeing from another tab. */
  badge?: string;
  tone?: "neutral" | "warn" | "bad" | "good";
  content: ReactNode;
}

export default function RailTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: RailTab[];
  /** Controlled, so jumping to a failing check can open the Quality tab. */
  active: string;
  onChange: (id: string) => void;
}) {
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="card flex min-h-0 flex-col overflow-hidden">
      <div
        role="tablist"
        aria-label="Editor panels"
        className="flex shrink-0 border-b border-inkline"
      >
        {tabs.map((t) => {
          const on = t.id === current?.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(t.id)}
              className={`-mb-px flex min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2 text-[11.5px] font-semibold transition-colors ${
                on
                  ? "border-brand text-fg1"
                  : "border-transparent text-fg3 hover:text-fg2"
              }`}
            >
              <span className="truncate">{t.label}</span>
              {t.badge && (
                <span
                  className={`shrink-0 rounded-full px-1.5 py-px text-[10px] tabular-nums ${
                    t.tone === "bad"
                      ? "bg-danger/12 text-danger"
                      : t.tone === "warn"
                        ? "bg-warn/12 text-warn"
                        : t.tone === "good"
                          ? "bg-ok/12 text-ok"
                          : "bg-surface-alt text-fg3"
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Only this scrolls, so the tab strip stays reachable however long the
          panel inside it gets. */}
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
        {current?.content}
      </div>
    </div>
  );
}

/** A hook for the controlled tab state, so the editor can force a tab open. */
export function useRailTab(initial: string) {
  return useState(initial);
}
