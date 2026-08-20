import Link from "next/link";
import { listMaterials } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/dal";
import { canCreate } from "@/lib/workflow";
import { SUBJECT_DEFS, Subject } from "@/lib/subjects";
import { Status } from "@/lib/workflow";
import { librarySummary, searchMaterials } from "@/lib/search";
import {
  ContentType,
  commonFields,
  contentTypeDef,
  isUnbuilt,
  pageEstimate,
} from "@/lib/content-types";
import { LessonPack } from "@/lib/lesson-pack-schema";
import { unitKey } from "@/lib/unit-plan";
import { packReadiness } from "@/lib/readiness";
import { resumeCards } from "@/lib/resume";
import StatusChip from "@/components/StatusChip";
import Greeting from "@/components/dash/Greeting";
import LibraryPulse from "@/components/dash/LibraryPulse";
import ContinueRow from "@/components/dash/ContinueRow";
import NewMaterialButton from "@/components/NewMaterialButton";
import DuplicateButton from "@/components/DuplicateButton";
import LibraryControls from "@/components/LibraryControls";
import { LogoMark } from "@/components/Logo";
import { inkOn } from "@/lib/design/palette";

export const dynamic = "force-dynamic";

/** The brand blue as a literal, for the two places a colour has to be COMPUTED
 *  on rather than inherited — inkOn() needs a hex, not a CSS variable. */
const BRAND = "#2563eb";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireActiveSession();
  const { legacyRole: role, scope } = session;
  const sp = await searchParams;
  const all = await listMaterials(scope);
  const summary = librarySummary(all);

  // Classes (units) — lesson-packs grouped by subject + series. Surfaced as a
  // strip so a multi-lesson class is reachable as one thing, not ten rows.
  const unitMap = new Map<
    string,
    { subject: Subject; series: string; accent: string; emoji: string; total: number; built: number }
  >();
  for (const m of all) {
    if (m.type !== "lesson-pack") continue;
    const c = m.content as LessonPack;
    const series = (c.series ?? "").trim();
    if (!series) continue;
    const k = `${m.subject}::${series.toLowerCase()}`;
    const u =
      unitMap.get(k) ??
      {
        subject: m.subject as Subject,
        series,
        accent: c.accentColor || SUBJECT_DEFS[m.subject as Subject]?.theme.accent || "#0f766e",
        emoji: c.emoji || "📚",
        total: 0,
        built: 0,
      };
    u.total += 1;
    if ((c.activities ?? []).length > 0) u.built += 1;
    unitMap.set(k, u);
  }
  const units = [...unitMap.values()].filter((u) => u.total > 1);

  const q = sp.q ?? "";
  const subject = sp.subject ?? "all";
  const status = sp.status ?? "all";
  const type = sp.type ?? "all";
  const sort = (sp.sort as "recent" | "relevance" | "title" | undefined) ?? undefined;

  const results = searchMaterials(all, {
    q,
    subject: subject as Subject | "all",
    status: status as Status | "all",
    type: type as ContentType | "all",
    sort,
  });

  const filtered = q || subject !== "all" || status !== "all" || type !== "all";

  const built = all.filter((m) => !isUnbuilt(m.type, m.content)).length;
  const inReview = all.filter((m) => m.status === "in_review").length;

  /* Counted, not modelled. `updated_at` is the schema's own text timestamp in
     "YYYY-MM-DD HH:MM:SS", so "this month" is a string prefix — no date parsing,
     and no timezone to get wrong for a figure nobody reads to the hour. */
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const thisMonth = all.filter((m) =>
    (m.updated_at ?? "").startsWith(monthPrefix)
  ).length;

  return (
    <div className="mx-auto max-w-6xl">
      {/* ── THE DASHBOARD HEAD ──
          This replaced a 459px navy band carrying the proposition, the identity
          at full size, and the two build actions.

          That band was right for a page a stranger might land on and wrong for
          the one a teacher opens every morning. It restated what the product
          does — to the person who already bought it, who already signed in, and
          who came here to do a specific job — and it cost the entire fold to do
          it. The brief's own test settles it: does this help a teacher build a
          better lesson faster? A proposition read for the ninetieth time does
          not, and the brand is now stated by the rail, the mark and the accent
          on every screen rather than by one large panel on this one.

          What replaces it is the same information ranked by usefulness: who you
          are and what to do (the greeting and the two actions), then the state
          of the library as four figures you can click. Same content, a third of
          the height, and the work starts above the fold. */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <Greeting name={session.name} />
          <p className="mt-1.5 text-[14px] text-fg2">
            {/* The product covers debate, critical thinking and academic
                writing; the old line promised only debate to every teacher on
                every visit. */}
            {all.length === 0
              ? "Build your first lesson — it takes one sentence to start."
              : "Describe the next lesson in a sentence and it builds itself."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <NewMaterialButton disabled={!canCreate(role)} />
          {canCreate(role) && (
            <Link href="/materials/new?mode=unit" className="btn btn-secondary">
              Build a full class
            </Link>
          )}
        </div>
      </div>

      {/* The state of the library, as one line rather than four cards — see
          the note in LibraryPulse on why three of those four figures never
          changed what anyone did next. */}
      <LibraryPulse
        total={summary.total}
        built={built}
        thisMonth={thisMonth}
        classes={units.length}
        awaitingReview={inReview}
      />

      {/* Unfinished work first. It is the only thing on this page that is
          about THIS teacher's next twenty minutes; everything below is about
          the library as a whole. */}
      <ContinueRow cards={resumeCards(all)} />

      <div className="mx-auto max-w-6xl">

      {units.length > 0 && (
        <div className="mb-10">
          <SectionHead
            title="Your classes"
            note={`${units.length} in progress`}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {units.map((u) => {
              const pct = u.total ? Math.round((u.built / u.total) * 100) : 0;
              return (
                <Link
                  key={`${u.subject}::${u.series}`}
                  href={`/units/${unitKey(u.subject, u.series)}`}
                  className="card card-interactive group p-4"
                >
                  {/* The class's OWN accent, not the brand's. A pack carries the
                      colour it will be printed in, and the library is the one
                      place a coach matches the screen to the paper on the desk —
                      so the brand does not overwrite it here. It stays a rail
                      rather than a fill for the same reason it does in print:
                      position and width survive a mono photocopier. */}
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full"
                      style={{ background: u.accent }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold text-fg1">
                        {u.series}
                      </div>
                      <div className="mt-0.5 text-xs text-fg3">
                        {SUBJECT_DEFS[u.subject]?.label}
                      </div>
                    </div>
                    <span
                      aria-hidden
                      className="mt-1 shrink-0 text-fg3 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                    >
                      →
                    </span>
                  </div>
                  {/* Progress as a bar rather than "3/10": a coach glancing at
                      six classes needs to see which one is behind, and reading
                      six fractions is slower than seeing six bars. */}
                  <div className="mt-3.5 flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-alt">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: u.accent }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-fg3">
                      {u.built}/{u.total}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <SectionHead title="Library" note="Search and reuse anything ever built" />

      <LibraryControls
        q={q}
        subject={subject}
        status={status}
        type={type}
        sort={sort ?? "auto"}
        summary={summary}
      />

      <div className="mb-3 text-xs text-fg3">
        {results.length} {results.length === 1 ? "result" : "results"}
        {filtered && all.length !== results.length && ` of ${all.length}`}
      </div>

      <ul className="flex flex-col gap-3">
        {results.map(({ material: m, matchLabel, snippet }) => (
          // The whole row still navigates to the material, but Teach and Print
          // are one click from the list instead of three — a teacher on the way
          // to class shouldn't have to open the material page first. Nested
          // anchors are invalid, so the row link is a full-bleed overlay and the
          // actions sit above it.
          <li
            key={m.id}
            className="card group relative flex items-start gap-4 px-5 py-4 transition-colors hover:border-brand/40"
          >
            <Link
              href={`/materials/${m.id}`}
              aria-label={m.title}
              className="absolute inset-0 rounded-[14px]"
            />
            {/* The ink is COMPUTED from the fill, not assumed to be white. A
                pack may carry any accent, and a pale one with white type on it
                is unreadable — the same rule the print system runs on, from the
                same function (lib/design/palette.ts).

                The fallback is the brand blue: a pack that never chose an accent
                should look like the product, not like whatever the default was
                two rebrands ago. */}
            <div
                className="font-display mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg"
                style={{
                  background: commonFields(m.content).accentColor || BRAND,
                  color: inkOn(commonFields(m.content).accentColor || BRAND),
                }}
              >
                {commonFields(m.content).lessonCode ||
                  contentTypeDef(m.type).emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-fg1">{m.title}</span>
                  <span className="shrink-0 rounded bg-inkmid px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg3">
                    {contentTypeDef(m.type).label}
                  </span>
                  {/* An abandoned shell reads as a real lesson until you open
                      it — and so, worse, does a build that stopped half way.
                      Only the two states that need attention are marked; a
                      finished pack wears nothing, so a badge in this list
                      always means "look at me". */}
                  {(() => {
                    const state = rowState(m.type, m.content);
                    return state ? (
                      <span
                        title={state.title}
                        className="shrink-0 rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn"
                      >
                        {state.label}
                      </span>
                    ) : null;
                  })()}
                </div>
                {/* Size and recency sit OUTSIDE the truncating half: a long
                    skill focus used to eat them, so the richest packs in the
                    library were the ones that never showed their page count. */}
                <div className="flex items-baseline gap-1 text-xs text-fg3">
                  <span className="min-w-0 truncate">
                    {SUBJECT_DEFS[m.subject]?.emoji}{" "}
                    {SUBJECT_DEFS[m.subject]?.label ?? m.subject} ·{" "}
                    {commonFields(m.content).series || "No series"} ·{" "}
                    {commonFields(m.content).skillFocus || "No skill focus"}
                  </span>
                  <span className="shrink-0 whitespace-nowrap">
                    · {pageEstimate(m.type, m.content)} pages
                  </span>
                </div>
                {snippet && (
                  <div className="mt-1.5 truncate text-xs text-fg2">
                    <span className="rounded bg-inkmid px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg3">
                      {matchLabel}
                    </span>{" "}
                    {snippet}
                  </div>
                )}
            </div>

            {/* The row's actions. Hidden until the row is hovered or focused,
                so a library of forty reads as a list rather than as a wall of
                buttons — but they are reachable by keyboard at all times, which
                a `hidden`-until-hover implementation would not be. */}
            <div className="relative z-10 flex shrink-0 items-center gap-2">
              {m.type === "lesson-pack" && !isUnbuilt(m.type, m.content) && (
                <Link
                  href={`/materials/${m.id}/teach`}
                  className="hidden rounded-md border border-brand/40 bg-brandsoft/60 px-2.5 py-1 text-[11px] font-bold text-brandink opacity-0 transition-opacity hover:bg-brandsoft focus:opacity-100 group-hover:opacity-100 sm:block"
                >
                  Teach
                </Link>
              )}
              {canCreate(role) && (
                <DuplicateButton
                  materialId={m.id}
                  title={m.title}
                  className="hidden rounded-md border border-inkline px-2.5 py-1 text-[11px] font-bold text-fg2 opacity-0 transition-opacity hover:text-fg1 focus:opacity-100 disabled:opacity-40 group-hover:opacity-100 sm:block"
                />
              )}
              <Link
                href={`/materials/${m.id}/print`}
                className="hidden rounded-md border border-inkline px-2.5 py-1 text-[11px] font-bold text-fg2 opacity-0 transition-opacity hover:text-fg1 focus:opacity-100 group-hover:opacity-100 sm:block"
              >
                Print
              </Link>
              <StatusChip status={m.status} />
            </div>
          </li>
        ))}
        {results.length === 0 && (
          /* An empty library and an empty SEARCH are different situations and
             used to get the same grey sentence. One of them wants the mark and
             a way to start; the other wants to be told the filters are the
             reason and got no advice at all. */
          <li className="rounded-2xl border border-dashed border-line-strong bg-surface px-5 py-12 text-center">
            {all.length === 0 ? (
              <>
                <LogoMark size={40} className="mx-auto opacity-90" />
                <p className="mt-4 text-[15px] font-semibold text-fg1">
                  Nothing here yet.
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-fg2">
                  Build the first pack and it will land here, searchable by
                  every skill, motion and piece of evidence inside it.
                </p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-semibold text-fg1">
                  No materials match your search and filters.
                </p>
                <p className="mt-1 text-sm text-fg2">
                  {all.length} {all.length === 1 ? "pack is" : "packs are"} in
                  the library — try clearing a filter.
                </p>
              </>
            )}
          </li>
        )}
      </ul>
      </div>
    </div>
  );
}

/**
 * The one thing a library row cannot say for itself: how far the build got.
 *
 * Returns null for anything finished — a badge that appears on every row is a
 * decoration, not a signal.
 */
function rowState(
  type: string,
  content: Parameters<typeof isUnbuilt>[1]
): { label: string; title: string } | null {
  if (type !== "lesson-pack") {
    return isUnbuilt(type, content)
      ? { label: "Empty", title: "Created but never filled in" }
      : null;
  }
  const r = packReadiness(content as LessonPack);
  if (r.level === "empty") {
    return { label: "Not built", title: "Created but never built — no pages in it yet" };
  }
  if (r.level === "planned") {
    return { label: "Planned", title: "The outline exists, but no pages are written" };
  }
  if (r.level === "partial") {
    return {
      label: "Half built",
      title: `${r.pages} pages written — still needs ${r.missing.slice(0, 2).join(" and ")}`,
    };
  }
  if (r.outstanding > 0) {
    return {
      label: `${r.outstanding} to go`,
      title: `Teachable now, but ${r.outstanding} planned page(s) were never written`,
    };
  }
  return null;
}

/** A section rule. The heading used to sit alone above a grid with nothing to
 *  separate it from the section before, so the page read as one long column of
 *  cards with occasional bold text in it. */
function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-inkline pb-2.5">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.1em] text-fg1">
        {title}
      </h2>
      <span className="shrink-0 text-xs text-fg3">{note}</span>
    </div>
  );
}
