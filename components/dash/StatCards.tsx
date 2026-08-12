import Link from "next/link";
import {
  IconInsights,
  IconLibrary,
  IconReview,
  IconRounds,
} from "@/components/shell/icons";

/**
 * The four numbers a coach opens this to see.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────
 * The brief asks for "Lessons Created / Lessons This Month / Time Saved /
 * Favorite Templates" with trend indicators like "+18% this month".
 *
 * Three of those cannot be told truthfully today, and the brief itself rules
 * out "meaningless statistics" in the same document.
 *
 *   Time saved       is invented. There is no measurement of how long a lesson
 *                    takes by hand, so any figure is a marketing number printed
 *                    inside the tool — and the first time a teacher does the
 *                    arithmetic and finds it hollow, every other number on the
 *                    page loses its credibility too.
 *   Favorites        has no table. There is nothing to count.
 *   +18% this month  needs a previous month to compare against. With nine
 *                    lessons in the library, a trend line is noise wearing a
 *                    percentage sign.
 *
 * So these are four true, live figures, and three of them are LINKS — a number
 * you can act on should be reachable from where you read it. "Awaiting review"
 * is the one that changes what a coach does next, so it is the one that gets
 * the accent.
 *
 * `This month` is real and is kept, because it is counted, not modelled.
 */

export interface DashStat {
  label: string;
  value: number;
  href?: string;
  note?: string;
  tone?: "default" | "accent";
  icon: "library" | "built" | "review" | "classes";
}

const ICONS = {
  library: IconLibrary,
  built: IconInsights,
  review: IconReview,
  classes: IconRounds,
};

export default function StatCards({ stats }: { stats: DashStat[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => {
        const Icon = ICONS[s.icon];
        const accent = s.tone === "accent" && s.value > 0;
        const body = (
          <>
            <div className="flex items-center justify-between gap-2">
              <dt className="truncate text-[11.5px] font-semibold uppercase tracking-[0.08em] text-fg3">
                {s.label}
              </dt>
              <Icon
                size={15}
                className={accent ? "shrink-0 text-brand" : "shrink-0 text-fg3"}
              />
            </div>
            <dd className="mt-2 flex items-baseline gap-2">
              <span
                className={`font-display text-[26px] leading-none ${
                  accent ? "text-brand" : "text-fg1"
                }`}
              >
                {s.value}
              </span>
              {s.note && (
                <span className="truncate text-[11.5px] text-fg3">{s.note}</span>
              )}
            </dd>
          </>
        );

        return s.href ? (
          <Link
            key={s.label}
            href={s.href}
            className="card card-interactive px-4 py-3.5"
          >
            {body}
          </Link>
        ) : (
          <div key={s.label} className="card px-4 py-3.5">
            {body}
          </div>
        );
      })}
    </dl>
  );
}
