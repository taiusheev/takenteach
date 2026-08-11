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
import StatusChip from "@/components/StatusChip";
import NewMaterialButton from "@/components/NewMaterialButton";
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
  const { legacyRole: role, scope } = await requireActiveSession();
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

  return (
    <div>
      {/* ── THE FRONT PAGE ──
          This used to open on a bare list with a "Library" heading. A list is
          what you show someone who already knows what the product is; the first
          screen has to say what this thing does and give the two actions that
          matter, or it reads as somebody's internal script.

          It then said the proposition in plain type on the page background, and
          the note here read "deliberately not a marketing hero: this is a
          workspace". That instinct was right and the conclusion was wrong. What
          a workspace can't afford is a hero that WASTES the fold — a stock
          photograph, a testimonial, a second "learn more". It can perfectly well
          afford a branded one, if the band carries the two build actions and the
          live state of the library, which is what a coach opening this at 8am
          actually came for. So the band earns its height four ways: it is the
          only place the identity is stated at full size, and it holds the
          proposition, the actions, and the numbers.

          Its height is a budget, not a leftover: 459px measured, which puts the
          "Your classes" rule at 563 and the bottom of the first card at 714 —
          inside a 720px viewport, the short end of a laptop. A hero that pushes
          the work below the fold has stopped being a header and become a splash
          screen, so if anything is added here, something comes out. */}
      <section className="band-deep band-deep-lit no-print">
        <div className="mx-auto max-w-5xl px-6 py-10 sm:py-12">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.07] px-3 py-1 text-xs font-semibold text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-lift)]" />
            Debate · Critical Thinking · Academic Writing
          </p>
          <h1 className="max-w-2xl text-[34px] font-bold leading-[1.08] tracking-[-0.03em] text-white sm:text-[42px]">
            Build a lesson your whole{" "}
            {/* The lifted blue, not the brand blue: #2563EB on this navy is
                3.1:1, and a highlight nobody can read is not a highlight. */}
            <span className="text-[var(--brand-lift)]">faculty</span> could have
            written.
          </h1>
          <p className="mt-3.5 max-w-xl text-[15px] leading-relaxed text-white/75">
            One house style across every pack. Evidence rules, scope limits and
            reading level checked before anything reaches a classroom.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <NewMaterialButton disabled={!canCreate(role)} tone="dark" />
            {canCreate(role) && (
              <Link
                href="/materials/new?mode=unit"
                className="btn btn-outline-light"
              >
                Build a full class
              </Link>
            )}
          </div>

          {/* The library's live state, as three numbers rather than a sentence.
              A run-on line of "12 built · 19 total · 3 awaiting review" is read
              at the speed of prose; three labelled figures are read at a glance,
              and the one that is a QUEUE gets to be a link, because a number
              you can act on should be reachable from where you read it. */}
          <dl className="mt-7 flex flex-wrap items-end gap-x-10 gap-y-4 border-t border-white/15 pt-5">
            <Stat label="Built" value={built} />
            <Stat label="In the library" value={summary.total} />
            {units.length > 0 && <Stat label="Classes running" value={units.length} />}
            {inReview > 0 && (
              <Stat
                label="Awaiting review"
                value={inReview}
                href="/review"
                accent
              />
            )}
          </dl>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 py-10">

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
                  {/* an abandoned shell reads as a real lesson until you open it */}
                  {isUnbuilt(m.type, m.content) && (
                    <span
                      title="Created but never built — no content in it yet"
                      className="shrink-0 rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn"
                    >
                      Empty
                    </span>
                  )}
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

            <div className="relative z-10 flex shrink-0 items-center gap-2">
              {m.type === "lesson-pack" && !isUnbuilt(m.type, m.content) && (
                <Link
                  href={`/materials/${m.id}/teach`}
                  className="rounded-md border border-brand/40 bg-brandsoft/60 px-2.5 py-1 text-[11px] font-bold text-brandink opacity-0 transition-opacity hover:bg-brandsoft focus:opacity-100 group-hover:opacity-100"
                >
                  ▶ Teach
                </Link>
              )}
              <Link
                href={`/materials/${m.id}/print`}
                className="rounded-md border border-inkline px-2.5 py-1 text-[11px] font-bold text-fg2 opacity-0 transition-opacity hover:text-fg1 focus:opacity-100 group-hover:opacity-100"
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

/** One figure on the hero band. `href` turns it into a queue you can open.
 *
 *  The term is written BEFORE the definition and flipped with `order`, which
 *  looks like a fussy detail and is not: a <dl> requires dt to precede dd, and
 *  a screen reader reads the pair in DOM order — "Awaiting review, 3" — while
 *  the eye wants the figure on top. Ordering in CSS is the only way to get
 *  both. */
function Stat({
  label,
  value,
  href,
  accent = false,
}: {
  label: string;
  value: number;
  href?: string;
  accent?: boolean;
}) {
  const figure = (
    <span
      className={`font-display text-[30px] leading-none ${
        accent ? "text-[var(--brand-lift)]" : "text-white"
      }`}
    >
      {value}
    </span>
  );
  return (
    <div className="flex flex-col">
      <dt className="order-2 mt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
        {label}
      </dt>
      <dd className="order-1">
        {href ? (
          <Link
            href={href}
            className="inline-flex items-baseline gap-1.5 transition-opacity hover:opacity-80"
          >
            {figure}
            <span aria-hidden className="text-sm text-[var(--brand-lift)]">
              →
            </span>
          </Link>
        ) : (
          figure
        )}
      </dd>
    </div>
  );
}
