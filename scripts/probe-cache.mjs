/**
 * Why is the build's cache hit rate 0%?
 *
 * A real build reported `13 model calls · 0.0k cached in (0%) · 232.3k fresh in
 * · ~$4.93` — every call paying full price for the same ~12k-token system
 * prefix. This isolates the cause with four tiny requests instead of guessing.
 *
 * The suspects, in order:
 *   1. caching simply isn't working at all (breakpoint ignored on this endpoint)
 *   2. varying `output_config.effort` between stages invalidates the system cache
 *   3. the per-model split means each model has its own cache (expected, but
 *      shouldn't zero it out)
 *
 * Costs a few cents: the prefix is ~2k tokens and each reply is capped tiny.
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

// A stable prefix comfortably over the 1024-token minimum.
const PREFIX =
  "You are a lesson designer. Follow these standards exactly.\n" +
  Array.from({ length: 220 }, (_, i) =>
    `Rule ${i + 1}: every activity must name its skill, state its timing, and end with a checkable product that a teacher can mark at a glance.`
  ).join("\n");

const system = [
  { type: "text", text: PREFIX, cache_control: { type: "ephemeral", ttl: "1h" } },
];

async function call(label, { model, effort, betas }) {
  const res = await client.beta.messages.create({
    model,
    max_tokens: 16,
    thinking: { type: "adaptive" },
    output_config: { effort },
    ...(betas ? { betas } : {}),
    system,
    messages: [{ role: "user", content: "Reply with the single word: ok" }],
  });
  const u = res.usage;
  console.log(
    `  ${label.padEnd(42)} write=${String(u.cache_creation_input_tokens ?? 0).padStart(5)} ` +
      `read=${String(u.cache_read_input_tokens ?? 0).padStart(5)} fresh=${String(u.input_tokens).padStart(5)}`
  );
  return u;
}

console.log("\n1. Does caching work at all on this endpoint? (same model, same effort)");
await call("sonnet-5 effort=medium  (writes)", { model: "claude-sonnet-5", effort: "medium" });
const a = await call("sonnet-5 effort=medium  (should READ)", { model: "claude-sonnet-5", effort: "medium" });

console.log("\n2. Does changing effort invalidate the cached system prefix?");
const b = await call("sonnet-5 effort=high    (same prefix)", { model: "claude-sonnet-5", effort: "high" });
const c = await call("sonnet-5 effort=medium  (back again)", { model: "claude-sonnet-5", effort: "medium" });

console.log("\n3. Is the cache per-model? (expected: yes)");
const d = await call("opus-5   effort=medium  (other model)", { model: "claude-opus-5", effort: "medium" });

const hit = (u) => (u.cache_read_input_tokens ?? 0) > 0;
console.log("\n── verdict ──");
console.log(`  caching works at all............ ${hit(a) ? "YES" : "NO  <-- the whole cause"}`);
if (hit(a)) {
  console.log(`  survives an effort change....... ${hit(b) ? "YES" : "NO  <-- this is the cause"}`);
  console.log(`  recovers when effort returns.... ${hit(c) ? "YES" : "NO"}`);
  console.log(`  shared across models............ ${hit(d) ? "YES (unexpected)" : "no (expected — per-model)"}`);
}
console.log();
