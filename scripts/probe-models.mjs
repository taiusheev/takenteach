/**
 * The cheapest possible check that a build will not fail.
 *
 * Run this FIRST when credits land, before any real build.
 *
 * The cost work routes stages across Opus 5 and Sonnet 5, but nothing has ever
 * proven that Sonnet accepts the exact request shape this codebase sends —
 * adaptive thinking + `output_config.effort` + a structured-output format, with
 * no fallbacks attached. If it doesn't, every build fails, and it fails AFTER
 * the expensive Opus stages have already run.
 *
 * This sends one tiny request per model with that exact shape and a schema, and
 * reports what came back. Total cost is a fraction of a cent.
 *
 *   node scripts/probe-models.mjs
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

// .env.local is Next's convention; this script runs outside Next, so load it.
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    for (const line of readFileSync(
      new URL("../.env.local", import.meta.url),
      "utf8"
    ).split("\n")) {
      const m = line.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) process.env.ANTHROPIC_API_KEY = m[1].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* fall through to the check below */
  }
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set (checked env and .env.local).");
  process.exit(1);
}

const client = new Anthropic();

// The same shape lib/ai.ts sends: adaptive thinking, effort inside
// output_config, and a JSON schema as the output format.
const SCHEMA = {
  type: "object",
  properties: { ok: { type: "boolean" }, model: { type: "string" } },
  required: ["ok", "model"],
  additionalProperties: false,
};

const CASES = [
  { model: "claude-opus-5", effort: "high", fallback: true },
  { model: "claude-opus-5", effort: "medium", fallback: true },
  // The ones that have never run. Sonnet takes no fallback entry, because an
  // Opus 4.8 fallback is only documented as valid for an Opus 5 primary.
  { model: "claude-sonnet-5", effort: "high", fallback: false },
  { model: "claude-sonnet-5", effort: "medium", fallback: false },
  { model: "claude-sonnet-5", effort: "low", fallback: false },
];

let failed = 0;
for (const c of CASES) {
  const label = `${c.model} @ ${c.effort}${c.fallback ? " +fallback" : ""}`;
  try {
    const stream = client.beta.messages.stream({
      model: c.model,
      max_tokens: 1000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: c.effort,
        format: { type: "json_schema", schema: SCHEMA },
      },
      ...(c.fallback
        ? {
            betas: ["server-side-fallback-2026-06-01"],
            fallbacks: [{ model: "claude-opus-4-8" }],
          }
        : {}),
      messages: [
        {
          role: "user",
          content: 'Reply with ok=true and model set to your own name.',
        },
      ],
    });
    const msg = await stream.finalMessage();
    const u = msg.usage ?? {};
    const cost =
      ((u.input_tokens ?? 0) * (c.model.includes("opus") ? 5 : 3) +
        (u.output_tokens ?? 0) * (c.model.includes("opus") ? 25 : 15)) /
      1e6;
    console.log(
      `  PASS  ${label.padEnd(34)} stop=${msg.stop_reason} in=${u.input_tokens} out=${u.output_tokens} ~$${cost.toFixed(4)}`
    );
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${label.padEnd(34)} ${err?.status ?? ""} ${err?.message ?? err}`);
  }
}

console.log(
  failed === 0
    ? "\nAll shapes accepted — the model policy is safe to build with.\n"
    : `\n${failed} shape(s) rejected. Fix aiStream in lib/ai.ts BEFORE running a build.\n`
);
process.exit(failed === 0 ? 0 : 1);
