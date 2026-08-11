/**
 * Round 2: the cache is STILL 0% after effort was pinned. What else is in the key?
 *
 * The build's staged calls are byte-identical in `system`, run at one pinned
 * effort per model group, and set a 1h TTL — yet a real build reported
 * `156.8k cache writes · 127.8k uncached in · 0 reads`. By elimination the only
 * thing left that varies between two staged calls to the SAME model is the
 * structured-output grammar (`output_config.format`), which is a different Zod
 * schema per stage.
 *
 * Caching is a prefix match rendered as tools -> system -> messages. If the
 * output grammar is keyed alongside tools (ahead of system), then every stage
 * re-writes the whole ~12k exemplar prefix and no placement of cache_control
 * can ever help. This proves or kills that in six small calls.
 *
 * Secondary suspect tested in the same run: CONCURRENCY. A cache entry is only
 * readable once the first response has begun streaming, so N parallel requests
 * sharing a prefix all pay full price. The build runs foundation||evidence and
 * the activity batches concurrently.
 *
 * Costs a few cents: ~2.5k-token prefix, replies capped tiny.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

if (!process.env.ANTHROPIC_API_KEY) {
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) process.env.ANTHROPIC_API_KEY = m[1].replace(/^["']|["']$/g, "");
    }
  } catch {}
}
const client = new Anthropic();

const MODEL = "claude-sonnet-5";
const EFFORT = "high";

// A stable prefix comfortably over the 1024-token minimum for this model.
const PREFIX =
  "You are a lesson designer. Follow these standards exactly.\n" +
  Array.from({ length: 220 }, (_, i) =>
    `Rule ${i + 1}: every activity must name its skill, state its timing, and end with a checkable product that a teacher can mark at a glance.`
  ).join("\n");

const system = [
  { type: "text", text: PREFIX, cache_control: { type: "ephemeral", ttl: "1h" } },
];

// Two different structured-output grammars — the shape the staged build uses
// (one distinct schema per stage), reduced to the smallest thing that differs.
const FORMAT_A = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: { ok: { type: "string" } },
    required: ["ok"],
    additionalProperties: false,
  },
};
const FORMAT_B = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: { fine: { type: "string" }, count: { type: "integer" } },
    required: ["fine", "count"],
    additionalProperties: false,
  },
};

function report(label, u) {
  const w = u.cache_creation_input_tokens ?? 0;
  const r = u.cache_read_input_tokens ?? 0;
  console.log(
    `  ${label.padEnd(46)} write=${String(w).padStart(5)} read=${String(r).padStart(5)} fresh=${String(u.input_tokens).padStart(5)}`
  );
  return u;
}

async function call(label, { format, quiet } = {}) {
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 300,
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT, ...(format ? { format } : {}) },
    system,
    messages: [{ role: "user", content: "Reply with the single word: ok" }],
  });
  return quiet ? res.usage : report(label, res.usage);
}

const hit = (u) => (u.cache_read_input_tokens ?? 0) > 0;

console.log("\n1. Does caching work at all WITH a structured-output grammar?");
await call("format A            (writes)", { format: FORMAT_A });
const a = await call("format A            (should READ)", { format: FORMAT_A });

console.log("\n2. Does changing ONLY the output grammar invalidate the prefix?");
const b = await call("format B            (same prefix)", { format: FORMAT_B });
const c = await call("format A            (back again)", { format: FORMAT_A });

console.log("\n3. Does dropping the grammar entirely invalidate it?");
const d = await call("no format           (same prefix)", {});

console.log("\n4. Do two CONCURRENT identical calls both pay full price?");
const [p1, p2] = await Promise.all([
  call("concurrent #1", { format: FORMAT_A, quiet: true }),
  call("concurrent #2", { format: FORMAT_A, quiet: true }),
]);
report("concurrent #1       (format A)", p1);
report("concurrent #2       (format A)", p2);

console.log("\n── verdict ──");
console.log(`  caching works with a grammar.... ${hit(a) ? "YES" : "NO  <-- the whole cause"}`);
if (hit(a)) {
  console.log(`  survives a grammar change....... ${hit(b) ? "YES" : "NO  <-- THIS IS THE CAUSE"}`);
  console.log(`  recovers when grammar returns... ${hit(c) ? "YES" : "NO"}`);
  console.log(`  survives dropping the grammar... ${hit(d) ? "YES" : "NO"}`);
  console.log(
    `  concurrent pair both read....... ${hit(p1) && hit(p2) ? "YES" : `NO (${hit(p1) ? 1 : 0}+${hit(p2) ? 1 : 0} of 2) <-- parallel stages each pay`}`
  );
}
console.log();
