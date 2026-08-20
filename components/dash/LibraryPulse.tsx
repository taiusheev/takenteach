import Link from "next/link";
import { IconReview } from "@/components/shell/icons";

/**
 * THE LIBRARY IN ONE LINE.
 *
 * ── WHAT THIS REPLACED, AND WHY ──────────────────────────────────────────
 * Four cards, a full band of the fold, carrying: In the library · This month ·
 * Classes running · Awaiting review. Every figure was true — which was the
 * defence for them — but true is not the same as useful, and a dashboard is
 * judged by what it helps someone DO.
 *
 * Read them as a teacher opening this at 9pm: "In the library: 12" is a number
 * they can see by scrolling. "This month: 3" changes nothing about tonight.
 * "Classes running: 2" is already a section further down the page, with names.
 * Only one of the four ever changes what happens next — something is waiting on
 * a person — and it was the fourth card, below the fold on a laptop, weighted
 * identically to three figures that ask nothing of anyone.
 *
 * So the counts stay, as one quiet line, and the one that is a decision becomes
 * a button and only appears when the answer is not zero. Same information,
 * roughly a tenth of the space, and the unfinished work — the thing this page
 * exists to surface — moves up into the fold behind it.
 */
export default function LibraryPulse({
  total,
  built,
  thisMonth,
  classes,
  awaitingReview,
}: {
  total: number;
  built: number;
  thisMonth: number;
  classes: number;
  awaitingReview: number;
}) {
  if (total === 0) return null;

  const parts: string[] = [
    `${total} ${total === 1 ? "lesson" : "lessons"}`,
  ];
  /* Only when it is not the whole library: "12 lessons · 12 built" says the
     same thing twice, and a figure that is always equal to another figure
     teaches people to stop reading the line. */
  if (built < total) parts.push(`${total - built} not built yet`);
  if (thisMonth > 0) parts.push(`${thisMonth} touched this month`);
  if (classes > 0) parts.push(`${classes} ${classes === 1 ? "class" : "classes"}`);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="text-[12.5px] text-fg3">{parts.join(" · ")}</p>
      {awaitingReview > 0 && (
        <Link
          href="/review"
          className="inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-[12px] font-semibold text-warn transition-colors hover:bg-warn/12"
        >
          <IconReview size={13} />
          {awaitingReview} waiting for review
        </Link>
      )}
    </div>
  );
}
