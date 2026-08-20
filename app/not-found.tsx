import Link from "next/link";

/**
 * A lesson that isn't there.
 *
 * ── WHY THIS WORDING, AND NOT "PAGE NOT FOUND" ───────────────────────────
 * The commonest way to reach this screen is not a typo'd URL. It is opening a
 * bookmark to a lesson that belongs to another organization — because
 * `getMaterial` scopes every read and returns nothing for a row it does not
 * own, and the page then calls `notFound()`. That is deliberate: a 403 would
 * confirm the lesson exists, which is exactly what a scoped read must never
 * do (README, rule 1).
 *
 * So the copy has to cover both cases without distinguishing them, and without
 * implying the teacher lost something. "It isn't here" is true whether the
 * lesson never existed, was deleted, or belongs to a workspace they are not in.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start py-16">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-fg1">
        That isn&apos;t here.
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-fg2">
        The page or lesson you asked for doesn&apos;t exist in this workspace.
        It may have been deleted, or it may belong to a different one — if a
        colleague sent you the link, they will need to share the lesson rather
        than the address.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/" className="btn btn-primary">
          Back to the library
        </Link>
        <Link href="/materials/new" className="btn btn-secondary">
          Build a new lesson
        </Link>
      </div>
    </div>
  );
}
