/**
 * Overnight builds at half price.
 *
 * The Batches API charges 50% of list for the same models, the same caching and
 * the same structured outputs. The only thing it costs is latency — typically
 * under an hour, up to 24 — which for "I need tomorrow's lesson" is free.
 *
 * THE DESIGN, and why it isn't a second pipeline:
 *
 * Every model call in this codebase funnels through `aiStream`, and every call
 * site does exactly one thing with the result — `await stream.finalMessage()`.
 * So batching does not need a rewritten generator, new prompts, or a duplicate
 * of the repair and validation logic. It needs the CALL LAYER to stop making a
 * request and start making a promise: `enqueue()` parks the request, returns
 * something that quacks like a stream, and settles it when the batch comes
 * back. The generator, the stage graph, and every gate keep working untouched.
 *
 * Coalescing falls out of that for free. The build already runs stages
 * concurrently where the data allows (foundation ‖ evidence, three activity
 * batches at once), so those land in the same batch on their own — and running
 * several packs at once coalesces across packs, which is why five overnight
 * lessons take about the same wall-clock as one.
 *
 * WHAT THE API DOCUMENTS, AND WHAT THIS FILE THEREFORE GUARANTEES:
 *  - results come back in ANY order, so everything is keyed by `custom_id`,
 *    never by position — the classic way to corrupt a batch;
 *  - a per-request failure (`errored` / `expired` / `canceled`) must reject
 *    THAT request only, leaving its siblings to succeed;
 *  - `fallbacks` is rejected on the Batches API, so it is stripped here;
 *  - requests are non-streaming, so `stream` is stripped too.
 *
 * The failure that would matter most is a silent one: a request that is
 * enqueued and never settles leaves a generator awaiting forever, and an
 * overnight job that hangs is worse than one that fails. So the reconciliation
 * step explicitly rejects anything the batch did not return.
 */

import type Anthropic from "@anthropic-ai/sdk";

/** The slice of the SDK this module needs — narrowed so tests can fake it. */
export interface BatchClient {
  create(
    requests: { custom_id: string; params: Record<string, unknown> }[]
  ): Promise<{ id: string }>;
  retrieve(batchId: string): Promise<{ processing_status: string }>;
  results(batchId: string): AsyncIterable<BatchResultRow>;
}

/**
 * The batches endpoint is the non-beta one, so its `Message` is structurally a
 * `BetaMessage` minus two fields nothing here reads (`context_management`,
 * `diagnostics`). Typing the row as `BetaMessage` keeps one message type across
 * the live and overnight paths; the single cast lives in `sdkBatchClient`.
 */
export interface BatchResultRow {
  custom_id: string;
  result:
    | { type: "succeeded"; message: Anthropic.Beta.Messages.BetaMessage }
    | { type: "errored"; error?: { type?: string; message?: string } }
    | { type: "canceled" }
    | { type: "expired" };
}

export interface CoalescerOptions {
  /**
   * How long to wait for more requests before submitting.
   *
   * Generators enqueue and then block, so a quiet window means everything that
   * could join this round has joined. Two seconds is long enough to gather the
   * concurrent stages and short enough that a six-round build doesn't spend
   * meaningful time waiting on the debounce itself.
   */
  windowMs?: number;
  /** How often to ask whether the batch has ended. */
  pollMs?: number;
  /** Give up on a batch after this long (the API's own ceiling is 24h). */
  maxWaitMs?: number;
  /** Requests per batch. The API allows 100k; this is a sanity bound. */
  maxPerBatch?: number;
  onEvent?: (e: BatchEvent) => void;
}

export type BatchEvent =
  | { type: "submitted"; batchId: string; requests: number }
  | { type: "polled"; batchId: string; status: string; waitedMs: number }
  | { type: "settled"; batchId: string; succeeded: number; failed: number };

export class BatchError extends Error {}

interface Pending {
  params: Record<string, unknown>;
  resolve: (m: Anthropic.Beta.Messages.BetaMessage) => void;
  reject: (e: unknown) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Strip what the Batches API refuses, and what only makes sense on a live
 * stream. `fallbacks` + its beta are the important pair: leaving them on is a
 * 400 for the whole batch, which would fail every pack in it at once.
 */
export function toBatchParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...params };
  delete out.stream;
  delete out.fallbacks;
  delete out.betas;
  return out;
}

export class BatchCoalescer {
  private pending = new Map<string, Pending>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  /** Batches currently in flight, so `drain()` can wait for all of them. */
  private inFlight = new Set<Promise<void>>();

  private client: BatchClient;
  private opts: CoalescerOptions;

  // Written out rather than as constructor parameter properties: Node's
  // type-stripping runner rejects that syntax, and this module's guarantees are
  // only worth anything if the offline suite can exercise the shipped file.
  constructor(client: BatchClient, opts: CoalescerOptions = {}) {
    this.client = client;
    this.opts = opts;
  }

  private get windowMs() {
    return this.opts.windowMs ?? 2000;
  }
  private get pollMs() {
    return this.opts.pollMs ?? 20_000;
  }
  private get maxWaitMs() {
    return this.opts.maxWaitMs ?? 24 * 60 * 60 * 1000;
  }
  private get maxPerBatch() {
    return this.opts.maxPerBatch ?? 500;
  }

  /**
   * Park a request and hand back a stream-shaped handle.
   *
   * The returned object exposes only `finalMessage()`, which is the entire
   * surface every call site in lib/ai.ts uses.
   */
  enqueue(params: Record<string, unknown>): {
    finalMessage: () => Promise<Anthropic.Beta.Messages.BetaMessage>;
  } {
    const id = `req_${++this.seq}`;
    const promise = new Promise<Anthropic.Beta.Messages.BetaMessage>((resolve, reject) => {
      this.pending.set(id, { params: toBatchParams(params), resolve, reject });
    });
    this.schedule();
    return { finalMessage: () => promise };
  }

  /** Restart the quiet-window timer; the last enqueue of a round wins. */
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.windowMs);
  }

  /** Submit everything parked right now, in chunks, and settle it. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.size === 0) return;
    // Take the whole map at once: anything enqueued from here on belongs to the
    // NEXT round, which is what makes a stage graph walk forward correctly.
    const taken = [...this.pending.entries()];
    this.pending.clear();

    for (let i = 0; i < taken.length; i += this.maxPerBatch) {
      const chunk = taken.slice(i, i + this.maxPerBatch);
      const job = this.runBatch(chunk).finally(() => {
        this.inFlight.delete(job);
      });
      this.inFlight.add(job);
    }
    await Promise.all([...this.inFlight]);
  }

  /** Resolve once every batch this coalescer started has settled. */
  async drain(): Promise<void> {
    await this.flush();
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }

  private async runBatch(entries: [string, Pending][]): Promise<void> {
    const byId = new Map(entries);
    let batchId: string;
    try {
      const batch = await this.client.create(
        entries.map(([custom_id, p]) => ({ custom_id, params: p.params }))
      );
      batchId = batch.id;
    } catch (err) {
      // Submission itself failed — nothing ran, so fail every request in the
      // chunk rather than leaving them parked forever.
      for (const [, p] of entries) p.reject(err);
      return;
    }
    this.opts.onEvent?.({
      type: "submitted",
      batchId,
      requests: entries.length,
    });

    const started = Date.now();
    try {
      for (;;) {
        const waited = Date.now() - started;
        if (waited > this.maxWaitMs) {
          throw new BatchError(
            `Batch ${batchId} did not finish within ${Math.round(this.maxWaitMs / 3600000)}h.`
          );
        }
        const { processing_status } = await this.client.retrieve(batchId);
        this.opts.onEvent?.({
          type: "polled",
          batchId,
          status: processing_status,
          waitedMs: waited,
        });
        if (processing_status === "ended") break;
        await sleep(this.pollMs);
      }

      let succeeded = 0;
      let failed = 0;
      for await (const row of this.client.results(batchId)) {
        // Keyed by custom_id on purpose: results come back in any order.
        const p = byId.get(row.custom_id);
        if (!p) continue; // not ours, or already settled — ignore
        byId.delete(row.custom_id);
        if (row.result.type === "succeeded") {
          succeeded++;
          p.resolve(row.result.message);
        } else {
          failed++;
          const detail =
            row.result.type === "errored"
              ? (row.result.error?.message ?? row.result.error?.type ?? "errored")
              : row.result.type;
          p.reject(new BatchError(`Batch request ${row.custom_id}: ${detail}`));
        }
      }

      // Anything the batch never mentioned. Without this a generator awaits a
      // promise that can never settle, and the whole overnight job hangs.
      for (const [id, p] of byId) {
        failed++;
        p.reject(
          new BatchError(`Batch ${batchId} returned no result for ${id}.`)
        );
      }
      this.opts.onEvent?.({ type: "settled", batchId, succeeded, failed });
    } catch (err) {
      // Polling or result-reading blew up: fail whatever is still unsettled.
      for (const [, p] of byId) p.reject(err);
    }
  }
}

/** Adapts the real SDK to the narrow interface above. */
export function sdkBatchClient(anthropic: Anthropic): BatchClient {
  return {
    async create(requests) {
      const batch = await anthropic.messages.batches.create({
        requests: requests as never,
      });
      return { id: batch.id };
    },
    async retrieve(batchId) {
      const b = await anthropic.messages.batches.retrieve(batchId);
      return { processing_status: b.processing_status };
    },
    results(batchId) {
      return anthropic.messages.batches.results(
        batchId
      ) as unknown as AsyncIterable<BatchResultRow>;
    },
  };
}

/**
 * The coalescer the call layer uses, when one is active.
 *
 * Module-level rather than passed through sixteen call sites, for the same
 * reason the budget mode is: it has to reach all of them, and exactly one
 * overnight run is active at a time in a single-process deployment.
 */
let active: BatchCoalescer | null = null;

export function setActiveCoalescer(c: BatchCoalescer | null) {
  active = c;
}

export function activeCoalescer(): BatchCoalescer | null {
  return active;
}
