import type { LessonPack } from "@/lib/lesson-pack-schema";
import { RIGOR_DEFS, type RigorLevel } from "@/lib/lesson-quality";
import { debateFormat } from "@/lib/debate-formats";

/**
 * What this lesson actually is, on the page that is supposed to be about it.
 *
 * Until now the material page showed ten panels of diagnostics about a pack and
 * not one line of the pack itself — to find out what the lesson taught you had
 * to open the print preview and read A4 sheets. This is the answer to "what did
 * I build?": the mission, what students will be able to do, the shape of the
 * lesson, and what it teaches with.
 */
export default function PackSummary({ pack }: { pack: LessonPack }) {
  const rigor = RIGOR_DEFS[pack.rigorLevel as RigorLevel];
  const format = debateFormat(pack.debateFormat);
  const totalMin = pack.activities.reduce((n, a) => n + (a.durationMin || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-inkline bg-inkcard p-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Chip>{pack.gradeBand}</Chip>
          <Chip>{rigor?.label ?? pack.rigorLevel}</Chip>
          <Chip>{pack.durationMin} min</Chip>
          <Chip>
            {pack.activities.length} page{pack.activities.length === 1 ? "" : "s"}
          </Chip>
          {format && <Chip>{format.short}</Chip>}
          {pack.skillFocus && <Chip accent>{pack.skillFocus}</Chip>}
        </div>

        {pack.mission && (
          <>
            <Label>Today&apos;s mission</Label>
            <p className="mb-3 text-sm leading-relaxed text-fg1">{pack.mission}</p>
          </>
        )}

        {pack.resolution && (
          <>
            <Label>Resolution</Label>
            <p className="mb-3 text-sm italic leading-relaxed text-fg2">
              {pack.resolution}
            </p>
          </>
        )}

        {pack.successCriteria.length > 0 && (
          <>
            <Label>By the end, students can</Label>
            <ul className="flex flex-col gap-1">
              {pack.successCriteria.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm text-fg2">
                  <span aria-hidden className="text-accent">
                    ✓
                  </span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {pack.activities.length > 0 && (
        <div className="rounded-xl border border-inkline bg-inkcard p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <Label>Lesson plan</Label>
            <span className="text-[11px] text-fg3">
              {totalMin} min across {pack.activities.length} pages
            </span>
          </div>
          <ol className="flex flex-col divide-y divide-inkline/50">
            {pack.activities.map((a, i) => (
              <li key={i} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="w-5 shrink-0 text-right text-xs text-fg3">
                  {i + 1}
                </span>
                <span className="w-24 shrink-0 truncate rounded bg-inkmid px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg3">
                  {a.kind}
                </span>
                <span className="min-w-0 flex-1 truncate text-fg1">{a.title}</span>
                <span className="shrink-0 text-[11px] text-fg3">
                  {a.durationMin}m
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {pack.vocabulary.length > 0 && (
          <div className="rounded-xl border border-inkline bg-inkcard p-4">
            <Label>Word bank ({pack.vocabulary.length})</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pack.vocabulary.map((v, i) => (
                <span
                  key={i}
                  title={v.definition}
                  className="rounded border border-inkline bg-inkmid px-2 py-0.5 text-xs text-fg2"
                >
                  {v.term}
                </span>
              ))}
            </div>
          </div>
        )}

        {pack.evidenceCards.length > 0 && (
          <div className="rounded-xl border border-inkline bg-inkcard p-4">
            <Label>Source deck ({pack.evidenceCards.length})</Label>
            <ul className="mt-2 flex flex-col gap-1.5">
              {pack.evidenceCards.map((c, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="shrink-0 font-bold text-fg3">Card {c.id}</span>
                  <span className="min-w-0 flex-1 truncate text-fg2">
                    {c.institution}
                    {c.year ? ` ${c.year}` : ""}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-fg3">
                    {c.side}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-fg3">
      {children}
    </h3>
  );
}

function Chip({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        accent
          ? "bg-accent/15 text-accent"
          : "border border-inkline bg-inkmid text-fg2"
      }`}
    >
      {children}
    </span>
  );
}
