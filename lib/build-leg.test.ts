import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { consumeLeg } from "./build-leg";
import { type StageEvent } from "./ai";

/**
 * The leg runner, driven by a fake generator.
 *
 * This is tested rather than exercised for a blunt reason: a real build costs
 * about five dollars and takes 7–22 minutes, so "run one and see" is not a
 * verification strategy anyone will repeat. The clock is injected and the stage
 * stream is a fixture, so every branch that decides whether a build completes
 * is checked in milliseconds and for nothing.
 *
 * What matters here is the pair of failure modes on either side of the budget:
 * stopping too eagerly loses paid-for work, and never stopping is the 3600-
 * second request this whole change exists to remove.
 */

/** A stage stream where each stage advances the fake clock by `ms`. */
function fakeBuild(stages: { stage: string; ms: number }[], clock: { t: number }) {
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<StageEvent> {
      for (const s of stages) {
        yield { type: "stage-start", stage: s.stage };
        clock.t += s.ms; // the stage "runs"
        yield { type: "stage-done", stage: s.stage, pack: {} as never };
      }
      yield { type: "done", pack: {} as never };
    },
  };
}

function harness(clock: { t: number }) {
  const persisted: string[] = [];
  const forwarded: string[] = [];
  return {
    persisted,
    forwarded,
    opts: {
      aborted: () => false,
      now: () => clock.t,
      onStageDone: async (e: StageEvent) => {
        persisted.push(e.stage ?? e.type);
      },
      onEvent: (e: StageEvent) => {
        forwarded.push(`${e.type}:${e.stage ?? ""}`);
      },
    },
  };
}

describe("one leg of a build", () => {
  test("a build that fits the budget finishes in one leg", async () => {
    const clock = { t: 0 };
    const h = harness(clock);
    const res = await consumeLeg(
      fakeBuild(
        [
          { stage: "outline", ms: 1000 },
          { stage: "foundation", ms: 1000 },
        ],
        clock
      ),
      { ...h.opts, budgetMs: 45_000 }
    );
    assert.equal(res.finished, true);
    assert.equal(res.stagesCompleted, 2);
  });

  test("a leg stops at the first stage boundary past its budget", async () => {
    const clock = { t: 0 };
    const h = harness(clock);
    const res = await consumeLeg(
      fakeBuild(
        [
          { stage: "outline", ms: 20_000 },
          { stage: "foundation", ms: 20_000 },
          { stage: "evidence", ms: 20_000 }, // budget blown before this starts
          { stage: "activities-1", ms: 20_000 },
        ],
        clock
      ),
      { ...h.opts, budgetMs: 30_000 }
    );
    assert.equal(res.finished, false, "should not claim the build is complete");
    assert.equal(res.stagesCompleted, 2);
    // Stopped BETWEEN stages, not inside one — the third never started.
    assert.deepEqual(h.persisted, ["outline", "foundation"]);
    assert.equal(
      h.forwarded.includes("stage-start:evidence"),
      false,
      "started a stage it had no budget to finish"
    );
  });

  test("a stage is persisted before the client is told it is done", async () => {
    /* The UI marks a stage complete on `stage-done`. If the event went out
       first and the write then failed, the teacher would see a finished stage
       that is not in the database — and would resume past it. */
    const clock = { t: 0 };
    const order: string[] = [];
    await consumeLeg(fakeBuild([{ stage: "outline", ms: 1 }], clock), {
      budgetMs: 45_000,
      aborted: () => false,
      now: () => clock.t,
      onStageDone: async (e) => {
        order.push(`persist:${e.type}`);
      },
      onEvent: (e) => {
        if (e.type !== "stage-start") order.push(`send:${e.type}`);
      },
    });
    // `done` carries the final pack and is persisted too, so it appears here as
    // well — the property under test is that each persist precedes its send.
    assert.deepEqual(order, [
      "persist:stage-done",
      "send:stage-done",
      "persist:done",
      "send:done",
    ]);
  });

  test("the budget never truncates a stage that has already started", async () => {
    /* One ten-minute stage against a 1 ms budget. It still runs to completion
       and is persisted, because stopping mid-stage would discard work already
       paid for — the budget is a floor on leg length, not a ceiling, which is
       exactly why the route sets it well below maxDuration.

       The leg then ends rather than carrying on to `done`: one stage was all
       the budget could buy, and the client asks for another leg. Both halves
       matter — truncating would lose money, and continuing would ignore the
       budget entirely. */
    const clock = { t: 0 };
    const h = harness(clock);
    const res = await consumeLeg(
      fakeBuild(
        [
          { stage: "activities-1", ms: 600_000 },
          { stage: "activities-2", ms: 600_000 },
        ],
        clock
      ),
      { ...h.opts, budgetMs: 1 }
    );
    assert.deepEqual(h.persisted, ["activities-1"]);
    assert.equal(res.stagesCompleted, 1, "the oversized stage still landed");
    assert.equal(res.finished, false, "but the leg stopped there");
  });

  test("an aborted leg stops and does not claim to be finished", async () => {
    const clock = { t: 0 };
    let aborted = false;
    const persisted: string[] = [];
    const res = await consumeLeg(
      fakeBuild(
        [
          { stage: "outline", ms: 1 },
          { stage: "foundation", ms: 1 },
        ],
        clock
      ),
      {
        budgetMs: 45_000,
        now: () => clock.t,
        aborted: () => aborted,
        onStageDone: async (e) => {
          persisted.push(e.stage ?? e.type);
          aborted = true; // the teacher hits Stop after the first stage lands
        },
        onEvent: () => {},
      }
    );
    assert.equal(res.finished, false);
    assert.deepEqual(persisted, ["outline"]);
  });

  test("a leg that completes no stage reports it, so the caller can stop", async () => {
    /* The unbounded-loop guard. A stage too slow for the platform's ceiling
       produces legs that achieve nothing; asking again forever would burn money
       and never finish, so `stagesCompleted: 0` is the signal the client turns
       into a message. */
    const clock = { t: 0 };
    const h = harness(clock);
    const res = await consumeLeg(
      {
        async *[Symbol.asyncIterator](): AsyncIterator<StageEvent> {
          yield { type: "stage-start", stage: "activities-1" };
          // ...and the platform kills the function here.
        },
      },
      { ...h.opts, budgetMs: 45_000 }
    );
    assert.equal(res.finished, false);
    assert.equal(res.stagesCompleted, 0);
  });

  /**
   * THE CONCURRENT-PAIR MONEY LOOP — found by running a real build.
   *
   * `foundation` and `evidence` are issued in one `Promise.all`, so both model
   * calls are finished and billed before either yields. They then yield one
   * after the other, and the budget check sat between them.
   *
   * Observed on a 14-page elite build: the pair took longer than the leg
   * budget, so every leg broke immediately after `foundation`, discarded the
   * already-paid-for evidence result, and the next leg bought it again. Five
   * evidence calls, none persisted, 90.4¢ of a 92.4¢ bill, twelve minutes, zero
   * evidence cards. The stall guard could not see it, because `foundation`
   * completed every single time.
   */
  test("a stage holding a finished sibling does not end the leg", async () => {
    const clock = { t: 0 };
    const h = harness(clock);
    const res = await consumeLeg(
      {
        async *[Symbol.asyncIterator](): AsyncIterator<StageEvent> {
          yield { type: "stage-start", stage: "foundation" };
          yield { type: "stage-start", stage: "evidence" };
          clock.t += 90_000; // both calls land here — both are already paid for
          yield {
            type: "stage-done",
            stage: "foundation",
            pack: {} as never,
            holdLeg: true,
          };
          yield { type: "stage-done", stage: "evidence", pack: {} as never };
          yield { type: "stage-start", stage: "activities-1" };
          clock.t += 10_000;
          yield { type: "stage-done", stage: "activities-1", pack: {} as never };
        },
      },
      { ...h.opts, budgetMs: 45_000 }
    );

    assert.ok(
      h.persisted.includes("evidence"),
      "the evidence result was paid for and must be persisted, not discarded"
    );
    assert.deepEqual(
      h.persisted,
      ["foundation", "evidence"],
      "the leg flushes the held pair, then stops at the NEXT boundary"
    );
    assert.equal(res.finished, false);
  });

  test("holdLeg does not disable the budget for the stages after it", async () => {
    const clock = { t: 0 };
    const h = harness(clock);
    await consumeLeg(
      {
        async *[Symbol.asyncIterator](): AsyncIterator<StageEvent> {
          clock.t += 90_000;
          yield {
            type: "stage-done",
            stage: "foundation",
            pack: {} as never,
            holdLeg: true,
          };
          yield { type: "stage-done", stage: "evidence", pack: {} as never };
          clock.t += 10_000;
          yield { type: "stage-done", stage: "teacher-guide", pack: {} as never };
        },
      },
      { ...h.opts, budgetMs: 45_000 }
    );
    assert.deepEqual(
      h.persisted,
      ["foundation", "evidence"],
      "once the held pair is flushed the budget applies again"
    );
  });
});
