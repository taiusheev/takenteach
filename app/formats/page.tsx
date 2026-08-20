import Link from "next/link";
import { DEBATE_FORMATS, roundMinutes } from "@/lib/debate-formats";

export const dynamic = "force-dynamic";

/**
 * The formats, finally visible.
 *
 * The registry has driven generation since it landed, but a coach could never
 * see it — and the thing they actually need in the room (running order, timings,
 * who speaks when) lived only inside a prompt. Each card ends at the Round Kit:
 * the paper the room needs, printable in one click.
 */
export default function FormatsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="font-display text-4xl text-fg1">Debate formats</h1>
        <p className="mt-1 max-w-2xl text-sm text-fg3">
          Speech order, timings, questioning rules and what judges reward — for
          every format the platform teaches. Print the Round Kit and the room has
          everything it needs.
        </p>
      </div>

      <ul className="grid gap-4 md:grid-cols-2">
        {DEBATE_FORMATS.map((f) => (
          <li
            key={f.id}
            className="flex flex-col rounded-xl border border-inkline bg-inkcard p-5 transition-colors hover:border-accent/40"
          >
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-lg font-bold text-fg1">{f.label}</h2>
              <span className="rounded bg-inkmid px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg3">
                {f.short}
              </span>
            </div>
            <p className="text-xs text-fg3">
              {f.teams} · {f.speeches.length} speeches · ~{roundMinutes(f)} min with prep
            </p>
            <p className="mt-2 text-xs text-fg2">{f.typical}</p>

            <dl className="mt-3 flex flex-col gap-1.5 text-xs">
              <div>
                <dt className="inline font-bold text-fg1">{f.questioning.label}. </dt>
                <dd className="inline text-fg3">{f.questioning.rules}</dd>
              </div>
              <div>
                <dt className="inline font-bold text-fg1">Judges reward. </dt>
                <dd className="inline text-fg3">{f.judging.criteria.join(" · ")}</dd>
              </div>
              <div>
                <dt className="inline font-bold text-warn/90">Novice trap. </dt>
                <dd className="inline text-fg3">{f.commonNoviceError}</dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                href={`/formats/${f.id}/kit`}
                className="btn btn-primary btn-sm"
              >
                Round Kit — print for the room
              </Link>
              <Link
                href={`/motions?format=${f.id}`}
                className="text-[11px] font-bold text-accent hover:underline"
              >
                Motions for {f.short} →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
