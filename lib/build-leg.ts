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
    /* PERSIST FIRST, EVEN IF THE CLIENT HAS GONE.
       The abort check used to sit above this, and it cost real money. An event
       reaching here is work the generator has ALREADY finished and the meter
       has ALREADY billed; dropping it because a browser hung up does not save
       anything, it just means the next leg buys the same stage again.

       Measured on material #67: the evidence stage ran on five consecutive
       legs, one call each, and never once landed — $1.72 spent, zero pages
       written, and no error anywhere because nothing had gone wrong except
       that the result was thrown away each time. The re-entrancy guard
       (`needEvidence = pack.evidenceCards.length === 0`) was doing its job
       perfectly; it was simply never given the cards to see.

       Writing them is a few milliseconds against our own database. There is no
       version of "the client left" that makes paying twice the better trade. */
    if (event.type === "stage-done" || event.type === "done") {
      await opts.onStageDone(event);
      if (event.type === "stage-done") stagesCompleted++;
    }

    /* A BUILD FINISHING IS A FACT ABOUT THE BUILD, NOT ABOUT WHO IS WATCHING.
       Checked above the abort, because the alternative reports `finished:
       false` for a pack that is complete and on disk — so the route never
       writes `quick-build-done`, and the history shows a build that started
       and mysteriously never ended. Five of sixteen materials look like that.
       Some of them are genuinely abandoned; this makes sure none of the rest
       are merely mislabelled. */
    if (event.type === "done") {
      if (!opts.aborted()) opts.onEvent(event);
      return { finished: true, stagesCompleted };
    }

    /* Now honour the abort — unless this stage is holding a finished sibling.
       `holdLeg` means "another result is already computed and billed and is
       queued right behind me", and that is as true when the client hangs up as
       when the budget runs out. Breaking here would close the generator and
       discard it, which is precisely the loop that cost material #67 five
       evidence calls.

       `onEvent` sits below the check because the response stream the client was
       reading is gone, and writing to a closed controller throws — turning a
       tidy stop into an error the route reports as a failed build. */
    const flushingSibling = event.type === "stage-done" && !!event.holdLeg;
    if (opts.aborted() && !flushingSibling) break;

    opts.onEvent(event);

    if (event.type === "stage-done") {
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
