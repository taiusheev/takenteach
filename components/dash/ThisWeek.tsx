import Link from "next/link";
import type { WeeklyDigest } from "@/lib/weekly-digest";

/**
 * THE WEEK, ON THE DASHBOARD.
 *
 * ── THE SAME RULE AS LibraryPulse ────────────────────────────────────────
 * A figure earns its place by changing what someone does next, not by being
 * true. So "3 lessons taught" is one quiet line rather than a card, and the
 * two findings that are genuinely decisions — the packs are running long, and
 * a page keeps getting cut that nobody marked droppable — are the parts given
 * any weight.
 *
 * ── IT DISAPPEARS WHEN IT HAS NOTHING TO SAY ─────────────────────────────
 * Returns null on a quiet week. A section that renders "0 lessons taught ·
 * nothing waiting" every Monday is a section people learn to scroll past, and
 * it takes the weeks that DO matter down with it.
 *
 * ── THE UNTAUGHT LESSONS ARE NOT A REPROACH ──────────────────────────────
 * Worth saying because the wording nearly went the other way. "5 lessons you
 * haven't taught" reads as an accusation; a coach who built ahead over half
 * term has done nothing wrong. They are listed because a finished pack sitting
 * unused is usually a thing someone forgot they had, and that is worth a
 * click — not because anyone owes anyone an explanation.
 */
export default function ThisWeek({ digest }: { digest: WeeklyDigest }) {
  const { taught, pacing, unused, skipped } = digest;

  /* The finding worth leading with: a page cut more than once that the pack
     itself called core. The author decided it was essential and the room
     disagreed, repeatedly — which is a fact about the LESSON, and the only
     place it can be seen. A cut page that WAS marked optional is the cut path
     working as designed, so it is not surfaced here. */
  const wrongAboutItself = skipped.filter((s) => !s.wasMarkedOptional);

  const nothingToSay =
    taught.length === 0 &&
    unused.length === 0 &&
    !pacing.note &&
    wrongAboutItself.length === 0;
  if (nothingToSay) return null;

  return (
    <section className="mb-10">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[13px] font-bold uppercase tracking-widest text-fg2">
          This week
        </h2>
        {taught.length > 0 && (
          <p className="text-[12.5px] text-fg3">
            {taught.length} {taught.length === 1 ? "lesson" : "lessons"} taught
            {taught[0]?.cohort ? ` · ${taught[0].cohort}` : ""}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {/* The packs are the wrong length for this room. The only feedback
            loop there is on whether generated durations survive contact. */}
        {pacing.note && (
          <div className="rounded-xl border border-warn/40 bg-warn/8 px-4 py-3">
            <p className="text-[12.5px] leading-relaxed text-fg1">{pacing.note}</p>
          </div>
        )}

        {wrongAboutItself.map((s) => (
          <div
            key={s.title}
            className="rounded-xl border border-inkline bg-surface px-4 py-3"
          >
            <p className="text-[12.5px] leading-relaxed text-fg1">
              You skipped{" "}
              <strong className="font-semibold">{s.title}</strong> {s.count} times,
              and it isn&apos;t marked as a page you can drop.
            </p>
            <p className="mt-0.5 text-[11.5px] text-fg3">
              Marking it droppable in the editor means the next pack plans
              around losing it, instead of you deciding at minute sixty.
            </p>
          </div>
        ))}

        {unused.length > 0 && (
          <div className="rounded-xl border border-inkline bg-surface px-4 py-3">
            <p className="mb-2 text-[12.5px] text-fg2">
              {unused.length} finished{" "}
              {unused.length === 1 ? "lesson is" : "lessons are"} ready and
              haven&apos;t been taught yet.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {unused.slice(0, 6).map((u) => (
                <Link
                  key={u.id}
                  href={`/materials/${u.id}`}
                  className="rounded-md border border-inkline px-2.5 py-1 text-[11.5px] text-fg2 transition-colors hover:border-brand/50 hover:text-fg1"
                >
                  {u.title}
                  <span className="ml-1.5 text-fg3">{u.daysWaiting}d</span>
                </Link>
              ))}
              {unused.length > 6 && (
                <span className="self-center text-[11.5px] text-fg3">
                  +{unused.length - 6} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
