
/**
 * RUNNING A STAGE ON AN OPEN-WEIGHT MODEL, WITHOUT A SECOND PIPELINE.
 *
 * ── WHY THIS IS SMALL ────────────────────────────────────────────────────
 * Every model call in lib/ai.ts goes through one function, `aiStream`, and it
 * returns a deliberately narrow thing: `{ finalMessage(): Promise<Message> }`.
 * That interface was already proved swappable once — the overnight batch
 * coalescer returns its own implementation of it and the 3,600-line generator
 * is none the wiser. This is the second implementation. Nothing above it
 * changes: not the fourteen call sites, not the repair ladder, not the meter,
 * not the checklist.
 *
 * So the experiment is genuinely reversible. `OPEN_MODEL_TASKS` unset means
 * the product behaves exactly as it does today, and there is no code path to
 * regress because the branch is not taken.
 *
 * ── WHAT HAS TO BE TRUE FOR THIS TO WORK AT ALL ──────────────────────────
 * The pipeline does not ask a model for prose. It asks for JSON matching a zod
 * schema, and parses the reply with that schema a line later — a malformed
 * reply is a failed stage, not a degraded one. Anthropic gets that from
 * `betaZodOutputFormat`; here it has to come from the provider's own
 * constrained decoding.
 *
 * That is the whole reason for the model shortlist. Most "JSON mode" is a
 * request, not a guarantee, and a 90%-valid stage in a 14-call pipeline is a
 * build that fails more often than it finishes. Groq's `strict: true` does
 * real constrained decoding — but only for the gpt-oss models, which is why
 * those are the default here rather than a bigger or cheaper one.
 *
 * ── AND WHAT WE GIVE UP ──────────────────────────────────────────────────
 * PROMPT CACHING. The Anthropic path writes a ~12k-token system prefix once
 * and reads it back at 0.1x on every later call in the build; measured hit
 * rate is 40.7%. There is no equivalent here, so every call pays full price
 * for the whole prefix. It still comes out far cheaper — output dominates the
 * bill and output is where the gap is largest — but it means the headline
 * "25x cheaper per token" is not the saving you actually get, and the meter
 * will show the real one.
 */

/** Open models this adapter knows how to drive, with their published rates. */
export const OPEN_MODELS: Record<
  string,
  { id: string; baseUrl: string; keyEnv: string; in: number; out: number; strict: boolean }
> = {
  /**
   * The default, chosen for the ONE property the pipeline cannot do without.
   * Groq documents `strict: true` — genuine constrained decoding, 100% schema
   * adherence — for the gpt-oss models and no others on that platform. Cheaper
   * models exist; a cheaper model that returns invalid JSON on stage nine is
   * not cheaper.
   */
  "gpt-oss-120b": {
    id: "openai/gpt-oss-120b",
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    in: 0.15,
    out: 0.6,
    strict: true,
  },
  /** The smaller sibling. Same strict decoding; for the mechanical stages. */
  "gpt-oss-20b": {
    id: "openai/gpt-oss-20b",
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    in: 0.1,
    out: 0.5,
    strict: true,
  },
};

/** The model this run uses for open stages, or null when the feature is off. */
export function openModel(): (typeof OPEN_MODELS)[string] | null {
  const name = (process.env.OPEN_MODEL ?? "gpt-oss-120b").trim();
  return OPEN_MODELS[name] ?? null;
}

/**
 * Which stages run open this session.
 *
 * A comma list of task names, or `all`. Unset means none, which is why merely
 * having this file changes nothing. Per-task on purpose: the measured spend is
 * 6% mechanical and 94% judgment, so the honest experiment starts by moving
 * one stage and reading the result, not by flipping the whole build.
 */
export function openTasks(): Set<string> {
  const raw = (process.env.OPEN_MODEL_TASKS ?? "").trim();
  if (!raw) return new Set();
  if (raw === "all") return new Set(["*"]);
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export function runsOpen(task: string): boolean {
  const t = openTasks();
  return t.has("*") || t.has(task);
}

/**
 * The grammar, translated for a different provider's strict mode.
 *
 * The input is whatever `betaZodOutputFormat` already produced for the
 * Anthropic call — the SAME grammar, not a re-derivation from the zod object.
 * That matters more than it looks: if two providers were handed schemas built
 * by different code paths, a quality comparison between them would be
 * confounded by a difference in what they were asked for.
 *
 * ── THE TRAP THIS FUNCTION EXISTS TO AVOID ───────────────────────────────
 * The helper does NOT emit standard JSON Schema keywords for constraints. It
 * emits `{"type":"string","description":"{enum: [\"hook\",\"drill\"]}"}` — the
 * enum lives inside a string, in a format only Anthropic parses. Ship that to
 * another provider and the field becomes an unconstrained string: the model
 * may return anything, our own zod parse rejects it a line later, and the
 * stage fails for a reason that looks nothing like its cause.
 *
 * So constraints are TRANSLATED into real keywords rather than passed through
 * or stripped. Getting this wrong is silent, which is why it is tested.
 *
 * Groq's two extra requirements — every object closed, every property required
 * — are satisfied by the helper already; they are re-asserted here so a future
 * change to it cannot quietly break this path.
 */
export function hardenSchema(schema: unknown): unknown {
  return harden(schema);
}

/** `{enum: ["a","b"]}` and `{minimum: 1, maximum: 20}`, as the helper writes them. */
const ENUM_RE = /^\{enum:\s*(\[[\s\S]*\])\}$/;
const BOUNDS_RE = /(minimum|maximum):\s*(-?\d+)/g;
/** The JS safe-integer limits, which `z.number().int()` emits and nobody means. */
const SAFE_INT = 9007199254740991;

function harden(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(harden);
  if (!node || typeof node !== "object") return node;
  const o = { ...(node as Record<string, unknown>) };
  for (const k of Object.keys(o)) o[k] = harden(o[k]);

  if (typeof o.description === "string") translate(o, o.description);

  if (o.type === "object" && o.properties && typeof o.properties === "object") {
    o.additionalProperties = false;
    o.required = Object.keys(o.properties as Record<string, unknown>);
  }
  delete o.default;
  return o;
}

/** Pull real keywords out of the helper's serialised description, if it is one. */
function translate(o: Record<string, unknown>, desc: string): void {
  if (!/^\{[\s\S]*\}$/.test(desc)) return; // a human-written description; keep it

  const asEnum = desc.match(ENUM_RE);
  if (asEnum) {
    try {
      const values = JSON.parse(asEnum[1]) as unknown[];
      if (Array.isArray(values) && values.length > 0) o.enum = values;
      delete o.description;
      return;
    } catch {
      /* Unparseable: leave the description in place rather than dropping a
         constraint we failed to read. A slightly larger request beats an
         unconstrained field. */
      return;
    }
  }

  let sawBound = false;
  for (const m of desc.matchAll(BOUNDS_RE)) {
    const n = Number(m[2]);
    sawBound = true;
    // The safe-integer sentinels carry no intent and cost tokens on every call.
    if (Math.abs(n) === SAFE_INT) continue;
    o[m[1]] = n;
  }
  // `$schema` and the bounds blob are both machine noise once translated.
  if (sawBound || desc.includes("$schema")) delete o.description;
}

/**
 * Anthropic's message shape, built from an OpenAI-compatible reply.
 *
 * The call sites read exactly three things — `stop_reason`, the first text
 * block, and `usage` — so this produces those and nothing more. Widening it to
 * a faithful `BetaMessage` would be inventing fields nobody reads.
 */
export interface OpenReply {
  content: { type: "text"; text: string }[];
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
}

/** Anthropic system blocks + messages → one OpenAI-style message list. */
function toMessages(
  system: unknown,
  messages: unknown
): { role: string; content: string }[] {
  const sys = Array.isArray(system)
    ? system.map((b) => (b as { text?: string }).text ?? "").join("\n\n")
    : typeof system === "string"
      ? system
      : "";
  const out: { role: string; content: string }[] = [];
  if (sys.trim()) out.push({ role: "system", content: sys });
  for (const m of (messages as { role: string; content: unknown }[]) ?? []) {
    const c =
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((b) => (b as { text?: string }).text ?? "").join("\n")
          : "";
    out.push({ role: m.role, content: c });
  }
  return out;
}

/**
 * How many times to wait out a rate limit before giving up on a call.
 *
 * Measured on Groq's free tier: 8,000 tokens per MINUTE, against a system
 * prefix that is ~12k tokens on a grounded build. A single call can therefore
 * exceed a whole minute's allowance, and a fourteen-call build spends most of
 * its wall clock asleep. Retrying is still right — the limit is per minute, so
 * waiting genuinely clears it — but no amount of retrying makes a free tier
 * viable for this pipeline, and the trial says so rather than grinding.
 */
const MAX_RATE_LIMIT_WAITS = 4;

/** Groq puts the exact wait in the message: "Please try again in 15.48s". */
function retryAfterMs(detail: string, headers: Headers): number {
  const header = headers.get("retry-after");
  if (header && Number(header) > 0) return Number(header) * 1000;
  const m = detail.match(/try again in ([\d.]+)s/i);
  if (m) return Math.ceil(Number(m[1]) * 1000) + 500;
  return 20_000;
}

/**
 * Send one request to the open provider and return it in Anthropic's shape.
 *
 * `schemaName` matters: strict mode requires a name, and the provider uses it
 * in its own errors, so passing the generator's own stage name ("student_activities")
 * makes a schema rejection say which stage produced it.
 */
export async function callOpenModel(args: {
  model: (typeof OPEN_MODELS)[string];
  jsonSchema: unknown;
  schemaName: string;
  system: unknown;
  messages: unknown;
  maxTokens: number;
}): Promise<OpenReply> {
  const key = process.env[args.model.keyEnv];
  if (!key) {
    throw new Error(
      `${args.model.keyEnv} is not set. Add it to .env.local to run stages on ${args.model.id}.`
    );
  }
  const body = {
    model: args.model.id,
    messages: toMessages(args.system, args.messages),
    max_completion_tokens: args.maxTokens,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: args.schemaName,
        strict: args.model.strict,
        schema: hardenSchema(args.jsonSchema),
      },
    },
  };

  let res: Response | null = null;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${args.model.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) break;

    const detail = await res.text().catch(() => "");

    /* A rate limit is not a failure, it is a wait — and the provider says how
       long. Worth handling properly rather than aborting a build nine stages
       in, which on a per-minute limit is a build that could have finished. */
    if (res.status === 429 && attempt < MAX_RATE_LIMIT_WAITS) {
      const wait = retryAfterMs(detail, res.headers);
      console.log(
        `  [${args.schemaName}] rate limited, waiting ${(wait / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_RATE_LIMIT_WAITS})`
      );
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    /* Surfaced rather than swallowed. A 400 here is almost always the schema
       being rejected, and that is the single most useful thing to see when
       porting a stage — it names the field. A 429 that survives the retries is
       a tier problem, not a transient one, and says so. */
    throw new Error(
      res.status === 429
        ? `${args.model.id} is rate limited beyond what waiting fixes. This pipeline sends a large system prefix on every call, so a low tokens-per-minute tier cannot run a full build however long it waits. Detail: ${detail.slice(0, 300)}`
        : `${args.model.id} refused the request (${res.status}): ${detail.slice(0, 600)}`
    );
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = json.choices?.[0];
  const text = choice?.message?.content ?? "";

  return {
    content: text ? [{ type: "text", text }] : [],
    /* The pipeline checks for exactly one value: "refusal". Everything else it
       treats as a normal completion, so a length-capped reply falls through to
       the JSON parse and fails there with the schema error — which is more
       informative than a bespoke message about token limits. */
    stop_reason: choice?.finish_reason === "content_filter" ? "refusal" : "end_turn",
    usage: {
      input_tokens: json.usage?.prompt_tokens ?? 0,
      output_tokens: json.usage?.completion_tokens ?? 0,
      // No prompt caching on this path — see the note at the top of the file.
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}
