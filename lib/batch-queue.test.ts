/**
 * The offline suite lib/batch-queue.ts was written to have.
 *
 * That file spends real money unattended, at 3am, on a path nobody is watching,
 * and its header lists four guarantees it makes about an API whose failure modes
 * are all invisible from the outside: results arriving in any order, per-request
 * failures, rejected params, and — the one that matters most — a request that is
 * enqueued and never settles, which hangs an overnight job forever instead of
 * failing it. None of that was covered by anything.
 *
 * It needs no network and no key: `BatchClient` is the narrow seam the module
 * was shaped around, so the whole thing runs against a fake in milliseconds.
 *
 *   node --test lib/batch-queue.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BatchCoalescer,
  BatchError,
  toBatchParams,
  type BatchClient,
  type BatchResultRow,
} from "./batch-queue.ts";

/** A message stub — only `custom_id` round-tripping is under test here. */
const msg = (id: string) => ({ id, content: [{ type: "text", text: id }] }) as never;

const ok = (custom_id: string): BatchResultRow => ({
  custom_id,
  result: { type: "succeeded", message: msg(custom_id) },
});

interface FakeOptions {
  /** Rows to return, given the ids that were submitted. */
  rows?: (ids: string[]) => BatchResultRow[];
  /** Throw instead of creating the batch. */
  createError?: Error;
  /** Statuses to walk through before "ended". */
  statuses?: string[];
}

function fakeClient(opts: FakeOptions = {}) {
  const created: { custom_id: string; params: Record<string, unknown> }[][] = [];
  // Keyed by batch id, not "the most recent one". A fake that ignores the id it
  // was handed returns batch 3's rows for batch 1, which looks exactly like the
  // module mismatching them — the first draft of this file did that and blamed
  // the coalescer for correctly rejecting requests its batch never mentioned.
  const byBatch = new Map<string, string[]>();
  let batchSeq = 0;
  const pendingStatuses = [...(opts.statuses ?? [])];

  const client: BatchClient = {
    async create(requests) {
      if (opts.createError) throw opts.createError;
      created.push(requests);
      const id = `batch_${++batchSeq}`;
      byBatch.set(id, requests.map((r) => r.custom_id));
      return { id };
    },
    async retrieve() {
      const next = pendingStatuses.shift();
      return { processing_status: next ?? "ended" };
    },
    async *results(batchId) {
      const ids = byBatch.get(batchId) ?? [];
      const rows = opts.rows ? opts.rows(ids) : ids.map(ok);
      for (const row of rows) yield row;
    },
  };
  return { client, created };
}

/** Fast timings — the defaults are a 2s window and 20s polling. */
const fast = { windowMs: 5, pollMs: 1 };

// ── the documented guarantees ────────────────────────────────────────────────

test("results are matched by custom_id, not by position", async () => {
  // The classic way to corrupt a batch: the API returns rows in ANY order, so a
  // positional match silently hands pack A's lesson to pack B.
  const { client } = fakeClient({ rows: (ids) => [...ids].reverse().map(ok) });
  const c = new BatchCoalescer(client, fast);

  const a = c.enqueue({ marker: "a" }).finalMessage();
  const b = c.enqueue({ marker: "b" }).finalMessage();
  const d = c.enqueue({ marker: "c" }).finalMessage();
  await c.drain();

  // Each handle must settle with the message carrying its OWN custom_id.
  const [ra, rb, rd] = await Promise.all([a, b, d]);
  assert.equal((ra as { id: string }).id, "req_1");
  assert.equal((rb as { id: string }).id, "req_2");
  assert.equal((rd as { id: string }).id, "req_3");
});

test("a per-request failure rejects only that request", async () => {
  const { client } = fakeClient({
    rows: (ids) => [
      ok(ids[0]),
      { custom_id: ids[1], result: { type: "errored", error: { message: "boom" } } },
      ok(ids[2]),
    ],
  });
  const c = new BatchCoalescer(client, fast);

  const a = c.enqueue({}).finalMessage();
  const b = c.enqueue({}).finalMessage();
  const d = c.enqueue({}).finalMessage();
  await c.drain();

  await assert.doesNotReject(a);
  await assert.rejects(b, (e: Error) => e instanceof BatchError && /boom/.test(e.message));
  await assert.doesNotReject(d);
});

test("canceled and expired reject with their status named", async () => {
  const { client } = fakeClient({
    rows: (ids) => [
      { custom_id: ids[0], result: { type: "canceled" } },
      { custom_id: ids[1], result: { type: "expired" } },
    ],
  });
  const c = new BatchCoalescer(client, fast);
  const a = c.enqueue({}).finalMessage();
  const b = c.enqueue({}).finalMessage();
  await c.drain();

  await assert.rejects(a, (e: Error) => /canceled/.test(e.message));
  await assert.rejects(b, (e: Error) => /expired/.test(e.message));
});

test("a request the batch never mentions is rejected, not left hanging", async () => {
  // THE failure that matters: an unsettled promise leaves the generator awaiting
  // forever, and an overnight job that hangs is worse than one that fails.
  const { client } = fakeClient({ rows: (ids) => [ok(ids[0])] }); // second row omitted
  const c = new BatchCoalescer(client, fast);

  const a = c.enqueue({}).finalMessage();
  const b = c.enqueue({}).finalMessage();
  await c.drain();

  await assert.doesNotReject(a);
  await assert.rejects(b, (e: Error) => /no result/.test(e.message));
});

test("a failed submission rejects every request in the chunk", async () => {
  const { client } = fakeClient({ createError: new Error("400 invalid params") });
  const c = new BatchCoalescer(client, fast);

  const a = c.enqueue({}).finalMessage();
  const b = c.enqueue({}).finalMessage();
  await c.drain();

  await assert.rejects(a, /invalid params/);
  await assert.rejects(b, /invalid params/);
});

test("toBatchParams strips what the Batches API rejects", () => {
  // Leaving `fallbacks` on is a 400 for the WHOLE batch — every pack in it.
  const out = toBatchParams({
    model: "claude-opus-5",
    stream: true,
    fallbacks: [{ model: "claude-opus-4-8" }],
    betas: ["server-side-fallback-2026-06-01"],
    system: "keep me",
  });
  assert.deepEqual(out, { model: "claude-opus-5", system: "keep me" });
});

test("toBatchParams does not mutate the caller's params", () => {
  // aiStream builds one request object and hands it over; mutating it here would
  // corrupt the live path's copy of the same shape.
  const original = { model: "m", stream: true, fallbacks: [] };
  toBatchParams(original);
  assert.equal(original.stream, true);
  assert.ok("fallbacks" in original);
});

// ── coalescing behaviour ─────────────────────────────────────────────────────

test("requests in the same quiet window coalesce into one batch", async () => {
  // This is the whole point: five packs blocking at the same stage boundary ride
  // in one batch, so five lessons cost about the wall-clock of one.
  const { client, created } = fakeClient();
  const c = new BatchCoalescer(client, fast);

  const all = [c.enqueue({}), c.enqueue({}), c.enqueue({}), c.enqueue({})].map((h) =>
    h.finalMessage()
  );
  await c.drain();
  await Promise.all(all);

  assert.equal(created.length, 1, "one batch");
  assert.equal(created[0].length, 4, "carrying all four requests");
});

test("a later round submits separately from an earlier one", async () => {
  const { client, created } = fakeClient();
  const c = new BatchCoalescer(client, fast);

  await c.enqueue({ round: 1 }).finalMessage().then(() => c.drain());
  // Enqueued only after round 1 settled — exactly how a stage graph walks.
  const second = c.enqueue({ round: 2 }).finalMessage();
  await c.drain();
  await second;

  assert.equal(created.length, 2);
  assert.deepEqual(created[0][0].params, { round: 1 });
  assert.deepEqual(created[1][0].params, { round: 2 });
});

test("maxPerBatch splits one round across several batches", async () => {
  const { client, created } = fakeClient();
  const c = new BatchCoalescer(client, { ...fast, maxPerBatch: 2 });

  const all = [c.enqueue({}), c.enqueue({}), c.enqueue({}), c.enqueue({}), c.enqueue({})].map(
    (h) => h.finalMessage()
  );
  await c.drain();

  // Every request still settles, and none is dropped at a chunk boundary.
  const settled = await Promise.allSettled(all);
  assert.equal(settled.filter((s) => s.status === "fulfilled").length, 5);
  assert.deepEqual(
    created.map((batch) => batch.length),
    [2, 2, 1]
  );
});

test("drain resolves only once every batch has settled", async () => {
  const { client } = fakeClient({ statuses: ["in_progress", "in_progress"] });
  const c = new BatchCoalescer(client, fast);

  let settled = false;
  const p = c.enqueue({}).finalMessage().then(() => {
    settled = true;
  });
  await c.drain();
  assert.equal(settled, true, "drain returned before the request settled");
  await p;
});

test("drain on an idle coalescer is a no-op", async () => {
  const { client, created } = fakeClient();
  const c = new BatchCoalescer(new Proxy(client, {}), fast);
  await c.drain();
  assert.equal(created.length, 0);
});

test("the batch is polled until it ends", async () => {
  const { client } = fakeClient({ statuses: ["in_progress", "canceling"] });
  const seen: string[] = [];
  const c = new BatchCoalescer(client, {
    ...fast,
    onEvent: (e) => {
      if (e.type === "polled") seen.push(e.status);
    },
  });
  await c.enqueue({}).finalMessage().then(null, () => {});
  await c.drain();
  assert.deepEqual(seen, ["in_progress", "canceling", "ended"]);
});

test("a batch that never ends fails rather than waiting forever", async () => {
  // maxWaitMs is the backstop behind the API's own 24h ceiling.
  const { client } = fakeClient({ statuses: Array(50).fill("in_progress") });
  const c = new BatchCoalescer(client, { windowMs: 5, pollMs: 1, maxWaitMs: 10 });

  const a = c.enqueue({}).finalMessage();
  await c.drain();
  await assert.rejects(a, (e: Error) => e instanceof BatchError && /did not finish/.test(e.message));
});
