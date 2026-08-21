// type-only: this module stays pure aggregation and must not pull in the DB layer
import type { MaterialRow, ObservationRow, StudentRow, TaughtRow } from "./db";
import type { LessonPack } from "./lesson-pack-schema";

/**
 * "WHAT DID I GET THROUGH, AND WHAT DIDN'T I?"
 *
 * ── THE THING THIS COULD NOT ANSWER BEFORE ───────────────────────────────
 * A teacher asked for a look back at the week, and the honest reason the
 * platform could not give one was not a missing screen: it was that nothing
 * recorded a lesson being TAUGHT. Built, reviewed, published, printed — all
 * logged. Put in front of a class — nowhere. So a library of twelve finished
 * packs looked identical whether all twelve had been taught or none had, and
 * "what haven't I got to yet" was not a hard query, it was an impossible one.
 * `teaching_log` (lib/schema.ts) is that missing fact; this turns it into the
 * week.
 *
 * ── WHAT THIS DELIBERATELY IS NOT ────────────────────────────────────────
 * Not a productivity score, and not a nag. Every figure here is one a coach
 * would act on, and each finding states what it saw rather than grading the
 * person: "four of five ran out of time" is information; "you are behind" is
 * an opinion, and an opinion from a tool is how a weekly email gets filtered
 * to trash in week three.
 *
 * ── THE CLOCK IS INJECTED ────────────────────────────────────────────────
 * `today` is a parameter, exactly as it is in lib/build-leg.ts, so the whole
 * thing is testable without waiting for a Monday. Dates are compared as
 * "YYYY-MM-DD" text throughout — lexicographic order IS chronological order in
 * that format, which is why the schema stores them that way, and it means no
 * timezone can silently move a lesson into the wrong week.
 */

/** How long a built lesson may sit before "not taught yet" is worth saying. */
const UNUSED_GRACE_DAYS = 7;
/** Below this many taught lessons, a pacing pattern is a coincidence. */
const MIN_FOR_PACING = 3;
/** Below this, a repeatedly-skipped page is just one skipped page. */
const MIN_FOR_SKIP_PATTERN = 2;

export type Pacing = "behind" | "on" | "ahead";

export interface TaughtEntry {
  title: string;
  cohort: string;
  taughtOn: string;
  pacing: string;
  rating: number;
}

export interface PacingVerdict {
  behind: number;
  on: number;
  ahead: number;
  /** null when there is not enough evidence to claim a pattern */
  note: string | null;
}

export interface UnusedLesson {
  id: number;
  title: string;
  series: string;
  /** how long it has been sitting built and untaught */
  daysWaiting: number;
}

export interface SkippedPage {
  title: string;
  count: number;
  /** did the pack itself mark this page droppable? see `activity.optional` */
  wasMarkedOptional: boolean;
}

export interface WeeklyDigest {
  from: string;
  to: string;
  taught: TaughtEntry[];
  pacing: PacingVerdict;
  /** built, ready, and still never put in front of a class */
  unused: UnusedLesson[];
  /** pages this teacher cut more than once */
  skipped: SkippedPage[];
  /** students on the roster with no observation in the window */
  unseenStudents: string[];
  /** true once there is anything at all worth reading */
  hasData: boolean;
  headline: string;
}

/** Days between two "YYYY-MM-DD" strings. Both are UTC dates, so no DST case. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** `today` minus n days, as "YYYY-MM-DD". */
export function daysAgo(today: string, n: number): string {
  const t = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(t)) return today;
  return new Date(t - n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * What the pacing across the week says about the lessons themselves.
 *
 * This is the only feedback loop there is on whether generated durations match
 * a real room, so it is worth stating plainly when it points one way. It reads
 * only lessons where the coach actually answered — an unanswered pacing field
 * is not evidence of good pacing.
 */
function pacingVerdict(taught: TaughtEntry[]): PacingVerdict {
  const behind = taught.filter((t) => t.pacing === "behind").length;
  const on = taught.filter((t) => t.pacing === "on").length;
  const ahead = taught.filter((t) => t.pacing === "ahead").length;
  const answered = behind + on + ahead;
  if (answered < MIN_FOR_PACING) return { behind, on, ahead, note: null };

  const majority = Math.ceil(answered / 2);
  if (behind >= majority) {
    return {
      behind, on, ahead,
      note: `${behind} of ${answered} lessons ran out of time. These packs are being planned longer than this class gets through — worth building the next few shorter, or marking more pages droppable.`,
    };
  }
  if (ahead >= majority) {
    return {
      behind, on, ahead,
      note: `${ahead} of ${answered} lessons finished early. There is room for more per lesson than these packs are asking for.`,
    };
  }
  return { behind, on, ahead, note: null };
}

/**
 * Pages cut more than once, and whether the pack expected it.
 *
 * The interesting half is `wasMarkedOptional`. A page the author already
 * marked droppable being skipped is the cut path working exactly as designed.
 * A page NOT marked droppable being cut twice is the pack being wrong about
 * its own priorities — the author called it core and the room disagreed.
 */
function skippedPages(rows: TaughtRow[], byId: Map<number, LessonPack>): SkippedPage[] {
  const counts = new Map<string, number>();
  const optional = new Set<string>();
  for (const r of rows) {
    for (const title of r.skipped) {
      const key = title.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const pack = r.material_id === null ? undefined : byId.get(r.material_id);
    for (const a of pack?.activities ?? []) {
      if (a.optional) optional.add(a.title.trim());
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_FOR_SKIP_PATTERN)
    .sort((a, b) => b[1] - a[1])
    .map(([title, count]) => ({
      title,
      count,
      wasMarkedOptional: optional.has(title),
    }));
}

/**
 * Lessons that are finished and have never been taught.
 *
 * The grace period matters: a pack built yesterday is not neglected, it is
 * new, and a digest that lists it teaches the reader to skim this section.
 * Only counts packs with pages — an empty draft belongs on the "unfinished"
 * list the dashboard already keeps (lib/resume.ts), not this one.
 */
function unusedLessons(
  materials: MaterialRow[],
  taught: TaughtRow[],
  today: string
): UnusedLesson[] {
  const everTaught = new Set(
    taught.map((t) => t.material_id).filter((id): id is number => id !== null)
  );
  const out: UnusedLesson[] = [];
  for (const m of materials) {
    if (m.type !== "lesson-pack" || everTaught.has(m.id)) continue;
    const pack = m.content as LessonPack;
    if ((pack.activities?.length ?? 0) === 0) continue;
    const built = (m.updated_at ?? "").slice(0, 10);
    const daysWaiting = daysBetween(built, today);
    if (daysWaiting < UNUSED_GRACE_DAYS) continue;
    out.push({
      id: m.id,
      title: m.title,
      series: pack.series ?? "",
      daysWaiting,
    });
  }
  return out.sort((a, b) => b.daysWaiting - a.daysWaiting);
}

/**
 * The week, from the records of it.
 *
 * `materials` and `students` are the caller's already-scoped lists; `taught`
 * is this teacher's own log (see `listTaught`). Everything is filtered to the
 * window here rather than in SQL so the boundary is one testable rule.
 */
export function weeklyDigest(args: {
  today: string;
  days?: number;
  taught: TaughtRow[];
  materials: MaterialRow[];
  students: StudentRow[];
  observations: ObservationRow[];
}): WeeklyDigest {
  const days = args.days ?? 7;
  const from = daysAgo(args.today, days);
  const to = args.today;

  const inWindow = args.taught.filter(
    (t) => t.taught_on >= from && t.taught_on <= to
  );
  const taught: TaughtEntry[] = inWindow.map((t) => ({
    title: t.lesson_title,
    cohort: t.cohort,
    taughtOn: t.taught_on,
    pacing: t.pacing,
    rating: t.rating,
  }));

  const byId = new Map<number, LessonPack>();
  for (const m of args.materials) {
    if (m.type === "lesson-pack") byId.set(m.id, m.content as LessonPack);
  }

  const seen = new Set(
    args.observations
      .filter((o) => o.observed_on >= from && o.observed_on <= to)
      .map((o) => o.student_id)
  );
  const unseenStudents = args.students
    .filter((s) => !s.archived && !seen.has(s.id))
    .map((s) => s.name);

  const pacing = pacingVerdict(taught);
  const unused = unusedLessons(args.materials, args.taught, to);
  const skipped = skippedPages(inWindow, byId);

  /* `hasData` is about the WEEK, not the library. A teacher with a full
     library and a quiet week should get "nothing logged" rather than a report
     assembled out of older rows — a digest that pads itself is one nobody
     trusts the week it matters. */
  const hasData = taught.length > 0 || unused.length > 0;

  return {
    from,
    to,
    taught,
    pacing,
    unused,
    skipped,
    unseenStudents,
    hasData,
    headline: headlineFor(taught.length, unused.length, days),
  };
}

/**
 * THE LOOP, CLOSED — what the teaching log should tell the NEXT build.
 *
 * Without this the digest is a report nobody acts on: it can say "four of five
 * lessons ran out of time" every week for a term while the generator keeps
 * planning fifteen pages for a ninety-minute class, because nothing carries
 * the observation back to the only place that could use it. This is the one
 * piece of evidence the product has about whether its own duration estimates
 * survive contact with a real room.
 *
 * ── WHY PACING AND NOT THE SKIPPED PAGES ─────────────────────────────────
 * The skipped-page list is the more interesting half of the digest and it is
 * deliberately NOT here. Those are page TITLES — "THE COUNTERPUNCH", "PAGE 3"
 * — and they belong to the pack they came from. Telling a new build about a
 * title that will not exist in it teaches nothing; the transferable fact would
 * be the page KIND, which this table does not store. A human reading the
 * digest knows what their own titles mean, so that half stays there until
 * there is a real answer here.
 *
 * Scoped to one teacher by the caller (`listTaught` is user-scoped) and silent
 * below three answered lessons, for the same reason `recentActivityGuidance`
 * is: a pattern of two is a coincidence, and a prompt full of confident
 * guesses is worse than a prompt with a gap in it.
 */
export function teachingFeedbackForPrompt(taught: TaughtRow[], today?: string): string {
  /* Recent only. A term-old pattern describes a class that has since moved on,
     and the generator would be calibrating against students who are no longer
     in the room. */
  const recent = today
    ? taught.filter((t) => t.taught_on >= daysAgo(today, 60))
    : taught;

  const behind = recent.filter((t) => t.pacing === "behind").length;
  const on = recent.filter((t) => t.pacing === "on").length;
  const ahead = recent.filter((t) => t.pacing === "ahead").length;
  const answered = behind + on + ahead;
  if (answered < MIN_FOR_PACING) return "";

  const majority = Math.ceil(answered / 2);
  if (behind >= majority) {
    return `This teacher's own recent lessons ran OUT OF TIME: ${behind} of the last ${answered} they taught did not finish. Plan this one to fit the room they actually have — fewer pages rather than shorter ones, and mark the genuinely droppable pages as optional so the cut path is decided here instead of improvised at minute sixty.`;
  }
  if (ahead >= majority) {
    return `This teacher's own recent lessons FINISHED EARLY: ${ahead} of the last ${answered} left time spare. This class gets through more than these packs are asking of them — plan for the full duration rather than trimming to be safe.`;
  }
  return "";
}

function headlineFor(taughtCount: number, unusedCount: number, days: number): string {
  const span = days === 7 ? "this week" : `in the last ${days} days`;
  if (taughtCount === 0 && unusedCount === 0) {
    return `Nothing logged as taught ${span}.`;
  }
  if (taughtCount === 0) {
    return `Nothing logged as taught ${span}, and ${unusedCount} finished lesson${unusedCount === 1 ? " is" : "s are"} waiting.`;
  }
  const lead = `${taughtCount} lesson${taughtCount === 1 ? "" : "s"} taught ${span}`;
  return unusedCount === 0
    ? `${lead}.`
    : `${lead}, ${unusedCount} finished lesson${unusedCount === 1 ? "" : "s"} still waiting.`;
}
