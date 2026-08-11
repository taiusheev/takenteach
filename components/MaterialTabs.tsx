"use client";

import { useState, type ReactNode } from "react";

export interface MaterialTab {
  id: string;
  label: string;
  /** Small count or status shown beside the label, e.g. "3 failing". */
  badge?: string;
  /** amber/red badges pull attention; omit for neutral counts. */
  tone?: "neutral" | "warn" | "bad";
  content: ReactNode;
}

/**
 * Progressive disclosure for the material page.
 *
 * The page used to stack ten panels — uniqueness, round evidence, coherence, two
 * separate fix boxes, content QA, build preflight, checklist, version history and
 * the activity log — at 6.3 screens tall with 42 controls, every one of them
 * competing for the same attention. Almost all of it is diagnostic: worth having,
 * worth *finding*, not worth reading every visit.
 *
 * Panels are server-rendered and passed in as `content`; this component only
 * decides what is on screen. Tab state is client-side and survives the
 * `router.refresh()` that an AI edit triggers, so applying a fix doesn't throw
 * the teacher back to the first tab.
 */
export default function MaterialTabs({
  tabs,
  initial,
}: {
  tabs: MaterialTab[];
  initial?: string;
}) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Material sections"
        className="mb-5 flex flex-wrap gap-1 border-b border-inkline"
      >
        {tabs.map((t) => {
          const on = t.id === current?.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.id)}
              className={`-mb-px rounded-t-md border-b-2 px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                on
                  ? "border-accent text-fg1"
                  : "border-transparent text-fg3 hover:text-fg2"
              }`}
            >
              {t.label}
              {t.badge && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] tracking-normal ${
                    t.tone === "bad"
                      ? "bg-danger/12 text-danger"
                      : t.tone === "warn"
                        ? "bg-warn/12 text-warn"
                        : "bg-inkmid text-fg3"
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}
