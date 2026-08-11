import Link from "next/link";
import { requireActiveSession } from "@/lib/auth/dal";
import { listMaterials } from "@/lib/db";
import { SUBJECT_DEFS, Subject, subjectDef } from "@/lib/subjects";
import { LessonPack } from "@/lib/lesson-pack-schema";
import { RIGOR_DEFS, RigorLevel } from "@/lib/lesson-quality";
import { parseUnitKey } from "@/lib/unit-plan";
import UnitBuildRunner, { UnitLessonRow } from "@/components/UnitBuildRunner";

export const dynamic = "force-dynamic";

export default async function UnitPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { scope } = await requireActiveSession();
  const { key } = await params;
  const { subject, series } = parseUnitKey(key);
  const seriesKey = series.trim().toLowerCase();

  const lessons = listMaterials(scope)
    .filter(
      (m) =>
        m.type === "lesson-pack" &&
        m.subject === subject &&
        ((m.content as LessonPack).series ?? "").trim().toLowerCase() === seriesKey
    )
    .sort((a, b) => {
      const ca = (a.content as LessonPack).lessonCode ?? "";
      const cb = (b.content as LessonPack).lessonCode ?? "";
      return ca.localeCompare(cb, undefined, { numeric: true, sensitivity: "base" });
    });

  if (lessons.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-sm text-fg2">No class found for “{series}”.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-bold text-accent hover:underline">
          ← Back to library
        </Link>
      </div>
    );
  }

  const def = subjectDef(subject);
  const first = lessons[0].content as LessonPack;
  const accent = first.accentColor || def.theme.accent;
  const rows: UnitLessonRow[] = lessons.map((m) => {
    const c = m.content as LessonPack;
    return {
      id: m.id,
      code: c.lessonCode ?? "",
      title: m.title,
      skillFocus: c.skillFocus ?? "",
      status: m.status,
      built: (c.activities ?? []).length > 0,
    };
  });
  const builtCount = rows.filter((r) => r.built).length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm font-bold text-fg3 hover:text-fg1 transition-colors">
        ← Library
      </Link>

      {/* unit header — the class's shared identity */}
      <section
        className="mt-4 mb-8 overflow-hidden rounded-2xl border border-inkline bg-inkcard"
        style={{ boxShadow: `inset 5px 0 0 ${accent}` }}
      >
        <div className="flex items-start gap-4 p-6">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-3xl text-white"
            style={{ background: accent }}
          >
            {first.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-widest text-fg3">
              {SUBJECT_DEFS[subject as Subject]?.emoji} {def.label} · Unit
            </div>
            <h1 className="font-display text-3xl text-fg1">{series}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <Chip label={first.gradeBand} />
              <Chip label={RIGOR_DEFS[first.rigorLevel as RigorLevel]?.label ?? first.rigorLevel} />
              <Chip label={`${lessons.length} lessons`} />
              <Chip label={`${builtCount} built`} />
            </div>
            {first.designMotif && (
              <p className="mt-2 text-xs text-fg3">🎨 {first.designMotif}</p>
            )}
            {first.resolution && (
              <p className="mt-2 text-xs text-fg2">
                <span className="font-bold text-fg1">{def.anchorLabel}:</span> {first.resolution}
              </p>
            )}
          </div>
        </div>
      </section>

      <UnitBuildRunner accent={accent} lessons={rows} />
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-inkline bg-inkmid px-2.5 py-1 font-semibold text-fg1">
      {label}
    </span>
  );
}
