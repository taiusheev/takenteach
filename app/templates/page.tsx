import type { Metadata } from "next";
import Link from "next/link";
import { listMaterials } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/dal";
import { canCreate } from "@/lib/workflow";
import { SUBJECT_DEFS, type Subject } from "@/lib/subjects";
import { commonFields, isUnbuilt, pageEstimate } from "@/lib/content-types";
import type { LessonPack } from "@/lib/lesson-pack-schema";
import { IconStack } from "@/components/shell/icons";
import UseTemplateButton from "./UseTemplateButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Templates" };

/**
 * THE TEMPLATE LIBRARY.
 *
 * ── THESE ARE YOUR OWN LESSONS ───────────────────────────────────────────
 * The brief describes a template marketplace with ten categories and stock
 * cards. Building that would mean inventing content — a shelf of "Public
 * Forum Fundamentals" packs nobody wrote, in a house style nobody chose, which
 * a teacher opens once and never again. The product's whole premise is that a
 * department's lessons look like ONE publication; seeding it with generic
 * material is the opposite of that.
 *
 * So a template here is a pack the department has already built and reviewed.
 * "Use template" remixes it: the arc, the page kinds and the pacing survive,
 * the topic does not. That is a stronger starting point than any blank, and it
 * gets better every time somebody writes a good lesson.
 *
 * ── WHAT QUALIFIES ───────────────────────────────────────────────────────
 * Reviewed at least as far as `approved`, and actually built. A draft nobody
 * has checked is not a template — it is work in progress, and offering it as a
 * starting point propagates whatever is wrong with it into every lesson made
 * from it. This is the same eligibility rule the exemplar picker uses when
 * choosing what to ground a build on (lib/memory.ts).
 *
 * ── THE CATEGORIES ARE REAL, NOT A FIXED LIST ────────────────────────────
 * The brief lists ten fixed categories. These are derived from what the
 * library actually contains, so the page can never offer a filter that matches
 * nothing — the failure that makes a category bar feel broken.
 */
export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { legacyRole: role, scope } = await requireActiveSession("/templates");
  const sp = await searchParams;
  const all = await listMaterials(scope);

  const eligible = all.filter(
    (m) =>
      m.type === "lesson-pack" &&
      (m.status === "approved" || m.status === "published") &&
      !isUnbuilt(m.type, m.content)
  );

  /* Format, not subject, is the axis a teacher browses on here: "I need a
     Public Forum lesson" is the question. Subject is a coarser cut and is
     already the library's own filter. */
  const categories = [
    ...new Set(
      eligible.map((m) => (m.content as LessonPack).format?.trim()).filter(Boolean)
    ),
  ].sort() as string[];

  const active = sp.format ?? "all";
  const shown =
    active === "all"
      ? eligible
      : eligible.filter((m) => (m.content as LessonPack).format === active);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-7">
        <h1 className="text-[24px] font-bold tracking-[-0.02em] text-fg1">
          Templates
        </h1>
        <p className="mt-1 max-w-2xl text-[13.5px] text-fg2">
          Lessons your department has already reviewed, reusable as a starting
          point. Using one keeps its shape and pacing and clears the topic, so
          the build fills it in for whatever you are teaching next.
        </p>
      </div>

      {eligible.length === 0 ? (
        /* THE EMPTY STATE IS THE COMMON ONE at this size of library, so it
           explains the rule rather than just saying "nothing here". A teacher
           with nine drafts and no approved packs should learn why this page is
           empty and exactly what would fill it. */
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brandsoft text-brand">
            <IconStack size={22} />
          </span>
          <h2 className="text-[16px] font-semibold text-fg1">
            No templates yet
          </h2>
          <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-fg2">
            A lesson becomes a template once it has been built and approved in
            review. That way a starting point is something a person signed off,
            not the first draft that happened to exist.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            <Link href="/review" className="btn btn-primary">
              Open the review queue
            </Link>
            <Link href="/" className="btn btn-secondary">
              Back to library
            </Link>
          </div>
        </div>
      ) : (
        <>
          {categories.length > 1 && (
            <div className="mb-5 flex flex-wrap gap-1.5">
              <FilterChip href="/templates" label="All" active={active === "all"} count={eligible.length} />
              {categories.map((c) => (
                <FilterChip
                  key={c}
                  href={`/templates?format=${encodeURIComponent(c)}`}
                  label={c}
                  active={active === c}
                  count={eligible.filter((m) => (m.content as LessonPack).format === c).length}
                />
              ))}
            </div>
          )}

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((m) => {
              const c = m.content as LessonPack;
              const fields = commonFields(m.content);
              const def = SUBJECT_DEFS[m.subject as Subject];
              return (
                <li key={m.id} className="card flex flex-col p-4">
                  {/* The pack's OWN accent, as a rail. A template card should
                      look like the thing it produces — this is the colour it
                      will be printed in. */}
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full"
                      style={{ background: fields.accentColor || "var(--brand)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/materials/${m.id}`}
                        className="block truncate text-[14.5px] font-semibold text-fg1 hover:underline"
                      >
                        {c.title || m.title}
                      </Link>
                      <p className="mt-0.5 truncate text-[12px] text-fg3">
                        {def?.label ?? m.subject}
                        {c.skillFocus ? ` · ${c.skillFocus}` : ""}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 line-clamp-2 min-h-[2.4em] text-[12.5px] leading-relaxed text-fg2">
                    {c.subtitle || c.mission || "No summary on this pack."}
                  </p>

                  {/* Format · level · duration · length — the four things that
                      decide whether a template fits the lesson you have to
                      teach on Thursday. */}
                  <dl className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-inkline pt-3 text-[11.5px] text-fg3">
                    {c.format && <Meta label="Format" value={c.format} />}
                    {c.gradeBand && <Meta label="Level" value={c.gradeBand} />}
                    {c.durationMin > 0 && (
                      <Meta label="Length" value={`${c.durationMin} min`} />
                    )}
                    <Meta
                      label="Pages"
                      value={String(pageEstimate(m.type, m.content))}
                    />
                  </dl>

                  <div className="mt-3.5">
                    {canCreate(role) ? (
                      <UseTemplateButton
                        materialId={m.id}
                        title={c.title || m.title}
                      />
                    ) : (
                      <p className="text-[11.5px] text-fg3">
                        TAs and judges give feedback; they don&apos;t build
                        materials.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-fg3">{label}</dt>
      <dd className="font-semibold text-fg2">{value}</dd>
    </div>
  );
}

/** A category filter. A link, not a button — so it is shareable and works back. */
function FilterChip({
  href,
  label,
  active,
  count,
}: {
  href: string;
  label: string;
  active: boolean;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
        active
          ? "border-brand/40 bg-brandsoft text-brandink"
          : "border-inkline text-fg2 hover:border-line-strong hover:text-fg1"
      }`}
    >
      {label}
      <span className="text-[11px] font-normal text-fg3">{count}</span>
    </Link>
  );
}
