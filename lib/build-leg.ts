import { type StageEvent } from "./ai";

/**
 * ONE LEG OF A BUILD.
 *
 * A build is 7–22 minutes across 12–14 model calls (docs/DEPLOYMENT.md §2), and
 * no serverless platform will hold a request open for that. So the build runs
 * in legs: this consumes the stage generator until either the build finishes or
 * the leg's time budget is spent, and the client asks again for the next one.
 *
 * It lives here rather than inline in the route for one reason — it is the piece
 * that decides whether a build ever completes, and a real build costs about
 * five dollars and twenty minutes to exercise. That is not a thing to verify by
 * running it, so it is a plain function over an async iterable with the clock
 * injected, and lib/build-leg.test.ts drives it with a fake generator.
 *
 * WHAT MAKES LEGS SAFE is that `generateLessonPack` is re-entrant: it persists
 * the pack after every stage and each stage checks whether its work is already
 * there, so a later leg skips to the first unfinished stage without paying for
 * the ones behind it.
 */
export interface LegResult {
  /** The generator reached `done` — the build is complete. */
  finished: boolean;
  /**
   * How many stages finished in THIS leg.
   *
   * Zero and not finished means the leg achieved nothing, and the caller must
   * not simply ask again: that is an unbounded loop, and each turn of it can
   * spend real money. It is what a stage too slow for the platform's ceiling
   * looks like from the outside.
   */
  stagesCompleted: number;
}

export interface LegOptions {
  /** How long the leg may run before stopping at the next stage boundary. */
  budgetMs: number;
  /** The client hung up. */
  aborted: () => boolean;
  /** Persist. Awaited before the event is forwarded, so the UI never shows a stage as done before it is saved. */
  onStageDone: (event: StageEvent) => Promise<void>;
  /** Forward to the client. */
  onEvent: (event: StageEvent) => void;
  /** Injectable clock, so the test does not have to spend real seconds. */
  now?: () => number;
}

export async function consumeLeg(
  stream: AsyncIterable<StageEvent>,
  opts: LegOptions
): Promise<LegResult> {
  const now = opts.now ?? Date.now;
  const startedAt = now();
  let stagesCompleted = 0;

  for await (const event of stream) {
    if (opts.aborted()) break;

    if (event.type === "stage-done" || event.type === "done") {
      await opts.onStageDone(event);
    }
    opts.onEvent(event);

    if (event.type === "done") {
      return { finished: true, stagesCompleted };
    }
    if (event.type === "stage-done") {
      stagesCompleted++;
      /* THE BUDGET IS CHECKED HERE AND NOWHERE ELSE — after a stage has landed
         and been persisted, so the point we stop at and the state on disk are
         the same thing. Stopping mid-stage would discard work already paid for.

         The consequence is that the budget is a floor, not a ceiling: a stage
         beginning one millisecond under budget runs to completion. That is why
         the route sets it well below maxDuration — the gap is the headroom for
         the longest single stage.

         `holdLeg` is the exception, and it exists because "the stage has landed"
         is not the same as "nothing else is already paid for". Stages issued
         concurrently complete together and yield one after another, so a stop
         between them discards a finished, billed result and the next leg buys
         it again. A stage carrying finished siblings says so and the leg carries
         on to flush them; the budget applies at the following boundary. */
      if (!event.holdLeg && now() - startedAt > opts.budgetMs) break;
    }
  }

  return { finished: false, stagesCompleted };
}
