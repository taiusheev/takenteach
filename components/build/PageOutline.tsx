"use client";

/**
 * THE DOCUMENT OUTLINE.
 *
 * A lesson editor is a long document, and the one thing every long-document
 * editor has is a map of itself. This one lists the fixed sections (cover,
 * mission, vocabulary, evidence, teacher guide) and then every page in order,
 * because "go to the exit ticket" is the single commonest movement in the
 * editor and it used to be a scroll of eleven screens.
 *
 * Two things are shown here that cannot be seen anywhere else:
 *
 *   ● an amber count against a page   something on it is incomplete
 *   the minutes total vs the lesson   pages summing to 125 minutes in a
 *                                     90-minute lesson is the most common
 *                                     defect in a generated pack, and it is
 *                                     invisible while the pages are collapsed
 *
 * The section dots come from the live checklist, so they mean "this section
 * passes its rules", not "this section has something typed in it".
 */

export interface OutlineSection {
  id: string;
  label: string;
  status: "done" | "incomplete" | "neutral";
  failing: number;
}

export interface OutlinePage {
  index: number;
  kind: string;
  title: string;
  durationMin: number;
  issues: number;
}

export default function PageOutline({
  sections,
  pages,
  durationMin,
  activePage,
  onJumpSection,
  onJumpPage,
  onAddPage,
}: {
  sections: OutlineSection[];
  pages: OutlinePage[];
  durationMin: number;
  activePage: number | null;
  onJumpSection: (id: string) => void;
  onJumpPage: (index: number) => void;
  onAddPage: () => void;
}) {
  const planned = pages.reduce((n, p) => n + p.durationMin, 0);
  const off = durationMin > 0 && planned !== durationMin;

  return (
    <nav className="card p-3">
      <h2 className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.1em] text-fg3">
        Outline
      </h2>

      <ul className="flex flex-col">
        {sections.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onJumpSection(s.id)}
              className="group flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface-alt"
            >
              <span
                aria-hidden
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                  s.status === "done"
                    ? "bg-ok/12 text-ok"
                    : s.status === "incomplete"
                      ? "bg-danger/12 text-danger"
                      : "border border-inkline text-fg3"
                }`}
              >
                {s.status === "done" ? "✓" : s.status === "incomplete" ? s.failing : ""}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg2 group-hover:text-fg1">
                {s.label}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 border-t border-inkline pt-2.5">
        <div className="mb-1 flex items-baseline justify-between gap-2 px-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-fg3">
            Pages
          </span>
          <span
            className={`text-[11px] tabular-nums ${off ? "font-semibold text-warn" : "text-fg3"}`}
            title={
              off
                ? `The pages add up to ${planned} minutes but the lesson is ${durationMin}.`
                : undefined
            }
          >
            {planned}/{durationMin}m
          </span>
        </div>

        {pages.length === 0 ? (
          <p className="px-1 py-2 text-[11.5px] leading-relaxed text-fg3">
            No pages yet — build the pack with AI, or add one by hand.
          </p>
        ) : (
          <ul className="flex flex-col">
            {pages.map((p) => (
              <li key={p.index}>
                <button
                  type="button"
                  onClick={() => onJumpPage(p.index)}
                  aria-current={activePage === p.index ? "true" : undefined}
                  className={`group flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface-alt ${
                    activePage === p.index ? "bg-brandsoft/70" : ""
                  }`}
                >
                  <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-fg3">
                    {p.index + 1}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-[12.5px] ${
                      activePage === p.index
                        ? "font-semibold text-brandink"
                        : "text-fg2 group-hover:text-fg1"
                    }`}
                  >
                    {p.title || "Untitled page"}
                  </span>
                  {p.issues > 0 && (
                    <span
                      aria-label={`${p.issues} issues`}
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn"
                    />
                  )}
                  <span className="shrink-0 text-[10.5px] tabular-nums text-fg3">
                    {p.durationMin}m
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onAddPage}
          className="mt-1.5 w-full rounded-md border border-dashed border-line-strong px-2 py-1.5 text-[12px] font-semibold text-fg2 transition-colors hover:border-brand/50 hover:text-fg1"
        >
          + Add page
        </button>
      </div>
    </nav>
  );
}
