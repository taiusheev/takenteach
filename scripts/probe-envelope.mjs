/**
 * Does the shared-envelope grammar actually buy the cache back — and can the
 * model still produce a real stage payload through it?
 *
 * Two questions, one run:
 *   1. Two calls whose STAGE SHAPES differ (as foundation and evidence do) now
 *      send the same grammar. Does the second read the prefix the first wrote?
 *   2. Does the model return well-formed, schema-shaped JSON inside the
 *      envelope's string field, or does the double-encoding break it?
 *
 * Cheap by design: a ~2.5k-token prefix and two small but genuinely nested
 * payloads. Run this before spending on a full build.
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

const PREFIX =
  "You are the lead lesson-pack author for Ascent Academy.\n" +
  Array.from({ length: 220 }, (_, i) =>
    `Rule ${i + 1}: every activity must name its skill, state its timing, and end with a checkable product that a teacher can mark at a glance.`
  ).join("\n");

const system = [
  { type: "text", text: PREFIX, cache_control: { type: "ephemeral", ttl: "1h" } },
];

// The one grammar every staged call shares (mirrors ENVELOPE_FORMAT in lib/ai.ts).
const ENVELOPE = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: { json: { type: "string" } },
    required: ["json"],
    additionalProperties: false,
  },
};

const instruction = (name, schema) =>
  `OUTPUT FORMAT — respond with a JSON object carrying EXACTLY one key, "json", whose value is a STRING containing the ${name} JSON for this stage. Escape it as a JSON string value (\\" for quotes, \\n for newlines). Nothing else: no prose, no markdown fence, no extra keys.

Once unescaped, that string MUST parse to an object matching this schema exactly — every required field present, no invented fields:
${JSON.stringify(schema)}`;

// Two genuinely different stage shapes, both nested — the situation that used to
// send two different grammars and re-write the prefix.
const FOUNDATION = {
  type: "object",
  properties: {
    mission: { type: "string" },
    successCriteria: { type: "array", items: { type: "string" } },
    vocabulary: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          definition: { type: "string" },
          analogy: { type: "string" },
        },
        required: ["term", "definition", "analogy"],
        additionalProperties: false,
      },
    },
  },
  required: ["mission", "successCriteria", "vocabulary"],
  additionalProperties: false,
};

const EVIDENCE = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          side: { type: "string" },
          institution: { type: "string" },
          year: { type: "integer" },
          paraphrase: { type: "string" },
          limit: { type: "string" },
        },
        required: ["id", "side", "institution", "year", "paraphrase", "limit"],
        additionalProperties: false,
      },
    },
  },
  required: ["cards"],
  additionalProperties: false,
};

async function stage(label, name, schema, task) {
  const res = await client.beta.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: ENVELOPE },
    system,
    messages: [{ role: "user", content: `${task}\n\n${instruction(name, schema)}` }],
  });
  const u = res.usage;
  const text = res.content.find((b) => b.type === "text")?.text ?? "";

  let verdict = "";
  let payload = null;
  try {
    const outer = JSON.parse(text);
    if (typeof outer.json !== "string") throw new Error("no `json` string key");
    payload = JSON.parse(outer.json);
    verdict = "envelope OK";
  } catch (e) {
    verdict = `PARSE FAILED: ${e.message}`;
  }

  console.log(
    `  ${label.padEnd(22)} write=${String(u.cache_creation_input_tokens ?? 0).padStart(5)} ` +
      `read=${String(u.cache_read_input_tokens ?? 0).padStart(5)} out=${String(u.output_tokens).padStart(5)}  ${verdict}`
  );
  return { usage: u, payload };
}

console.log("\nTwo DIFFERENT stage shapes through ONE shared grammar:");
const a = await stage(
  "foundation (writes)",
  "lesson_foundation",
  FOUNDATION,
  `Write the foundation for a novice debate lesson on attacking an opponent's warrant. Resolution: "Resolved: Schools should ban smartphones during the school day." Give the mission paragraph, exactly 4 success criteria, and 3 vocabulary terms with a definition and a "think of it like…" analogy each.`
);
const b = await stage(
  "evidence   (should READ)",
  "evidence_deck",
  EVIDENCE,
  `Write 2 evidence cards (IDs A, B — one pro, one con) for that same resolution. Real institutions only, paraphrase under 40 words, and a LIMIT stating what the card cannot prove.`
);

console.log("\n── verdict ──");
const read = (u) => (u.cache_read_input_tokens ?? 0) > 0;
console.log(`  second stage reads the prefix... ${read(b.usage) ? "YES — the cache fix works" : "NO  <-- still invalidating"}`);
console.log(`  payloads parsed................. ${a.payload && b.payload ? "YES" : "NO"}`);
if (a.payload) {
  console.log(
    `  foundation: ${a.payload.successCriteria?.length} criteria, ${a.payload.vocabulary?.length} terms — e.g. "${a.payload.vocabulary?.[0]?.term}"`
  );
}
if (b.payload) {
  console.log(
    `  evidence:   ${b.payload.cards?.length} cards — e.g. ${b.payload.cards?.[0]?.institution} ${b.payload.cards?.[0]?.year}`
  );
}
console.log();
