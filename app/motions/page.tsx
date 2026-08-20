import Link from "next/link";
import {
  MOTION_LEVELS,
  MOTION_TOPICS,
  SEED_MOTIONS,
  searchMotions,
} from "@/lib/motions";
import { DEBATE_FORMATS, debateFormat } from "@/lib/debate-formats";
import MotionFilters from "@/components/MotionFilters";

export const dynamic = "force-dynamic";

/**
 * Motion Library — the reusable object a resolution used to be a retyped string.
 *
 * Every card carries the briefing a coach would otherwise write by hand, and
 * ends in the one click that matters: build a lesson on this motion, with the
 * wording, level and format already filled in.
 */
export default async function MotionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const query = {
    q: sp.q ?? "",
    topic: sp.topic ?? "all",
    level: sp.level ?? "all",
    format: sp.format ?? "all",
  };
  const results = searchMotions(SEED_MOTIONS, query);
  const ages = [...new Set(SEED_MOTIONS.map((m) => m.ageBand))];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="font-display text-4xl text-fg1">Motion Library</h1>
        <p className="mt-1 max-w-2xl text-sm text-fg3">
          Real motions with the briefing already done — background, the definition
          fight, what each side runs, and where the round actually clashes. Build a
          lesson on any of them in one click.
        </p>
      </div>

      <MotionFilters
        q={query.q}
        topic={query.topic}
        level={query.level}
        format={query.format}
        topics={[...MOTION_TOPICS]}
        levels={[...MOTION_LEVELS]}
        formats={DEBATE_FORMATS.map((f) => ({ id: f.id, label: f.short }))}
        total={SEED_MOTIONS.length}
      />

      <p className="mb-3 text-xs text-fg3">
        {results.length} motion{results.length === 1 ? "" : "s"}
        {results.length !== SEED_MOTIONS.length && ` of ${SEED_MOTIONS.length}`}
        {ages.length > 0 && ` · ages ${ages.length} bands`}
      </p>

      <ul className="flex flex-col gap-4">
        {results.map((m) => {
          // hand the whole briefing to the builder — the teacher types nothing
          const build = new URLSearchParams({
            // the wizard seeds its idea box from skillFocus
            skillFocus: `Teach ${m.skillFocus} using the motion "${m.text}". The round turns on: ${m.keyClash}`,
            resolution: m.text,
            gradeBand: m.ageBand,
            motion: m.id,
          });
          return (
            <li
              key={m.id}
              className="rounded-xl border border-inkline bg-inkcard p-5 transition-colors hover:border-accent/40"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded bg-inkmid px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg3">
                  {m.topic}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    m.level === "beginner"
                      ? "bg-ok/12 text-ok"
                      : m.level === "intermediate"
                        ? "bg-brand/12 text-brand"
                        : m.level === "advanced"
                          ? "bg-warn/12 text-warn"
                          : "bg-danger/12 text-danger"
                  }`}
                >
                  {m.level}
                </span>
                <span className="text-[11px] text-fg3">{m.ageBand}</span>
                {m.formats.length > 0 && (
                  <span className="text-[11px] text-fg3">
                    ·{" "}
                    {m.formats
                      .map((f) => debateFormat(f)?.short ?? f)
                      .join(" · ")}
                  </span>
                )}
              </div>

              <h2 className="text-lg font-bold leading-snug text-fg1">{m.text}</h2>
              <p className="mt-1 text-xs text-fg3">{m.background}</p>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-inkline/70 bg-inkmid/40 p-3">
                  <h3 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-ok/80">
                    Proposition runs
                  </h3>
                  <ul className="flex flex-col gap-1 text-xs text-fg2">
                    {m.proArguments.map((a) => (
                      <li key={a}>· {a}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-inkline/70 bg-inkmid/40 p-3">
                  <h3 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-danger/80">
                    Opposition runs
                  </h3>
                  <ul className="flex flex-col gap-1 text-xs text-fg2">
                    {m.conArguments.map((a) => (
                      <li key={a}>· {a}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <p className="mt-3 text-xs text-fg2">
                <span className="font-bold text-fg1">Definitions.</span>{" "}
                {m.definitions}
              </p>
              <p className="mt-1.5 text-xs text-fg2">
                <span className="font-bold text-fg1">The round turns on.</span>{" "}
                {m.keyClash}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href={`/materials/new?${build.toString()}`}
                  className="btn btn-primary btn-sm"
                >
                  Build a lesson on this motion
                </Link>
                <span className="text-[11px] text-fg3">
                  Teaches: {m.skillFocus}
                </span>
              </div>
            </li>
          );
        })}
        {results.length === 0 && (
          <li className="rounded-xl border border-dashed border-inkline px-5 py-10 text-center text-sm text-fg3">
            No motions match those filters.
          </li>
        )}
      </ul>
    </div>
  );
}
