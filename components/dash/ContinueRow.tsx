import Link from "next/link";
import type { ResumeCard } from "@/lib/resume";
import { inkOn } from "@/lib/design/palette";

/**
 * The unfinished work, with its next action on the card.
 *
 * Each card names the state in the teacher's terms ("6 pages written — needs an
 * exit ticket") rather than in the system's ("draft"), and carries the one
 * button that continues it. The point is that resuming costs a single click
 * from the first screen, instead of: read the library, guess which title is the
 * unfinished one, open it, read the status panel, then click the action.
 */
export default function ContinueRow({ cards }: { cards: ResumeCard[] }) {
  if (cards.length === 0) return null;

  return (
    <section className="mb-9">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.1em] text-fg1">
          Pick up where you left off
        </h2>
        <span className="shrink-0 text-xs text-fg3">
          {cards.length} unfinished
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.id}
            className="card group relative flex flex-col p-4 transition-colors hover:border-brand/40"
          >
            {/* The whole card navigates to the lesson; the action button sits
                above it, so the obvious click and the precise one both work. */}
            <Link
              href={`/materials/${c.id}`}
              aria-label={c.title}
              className="absolute inset-0 rounded-[14px]"
            />

            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold"
                style={{
                  background: c.accentColor,
                  color: inkOn(c.accentColor),
                }}
              >
                {c.lessonCode || "·"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-fg1">
                  {c.title}
                </p>
                <p className="mt-0.5 truncate text-[11.5px] text-fg3">
                  {c.series || "No series"}
                </p>
              </div>
            </div>

            <p
              className={`mt-3 text-[12px] leading-snug ${
                c.tone === "finish" ? "text-ok" : "text-fg2"
              }`}
            >
              {c.headline}
            </p>

            {c.progress !== null && c.progress < 100 && (
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-alt">
                <div
                  className="h-full rounded-full bg-brand transition-all"
                  style={{ width: `${Math.max(c.progress, 3)}%` }}
                />
              </div>
            )}

            <div className="relative z-10 mt-3.5 flex">
              <Link href={c.action.href} className="btn btn-secondary btn-sm">
                {c.action.label}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
