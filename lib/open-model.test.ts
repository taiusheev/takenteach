/**
 * The open-weight seam, tested where it can be tested without spending money.
 *
 * Three things matter here and none of them need a network call:
 *   1. that the feature is genuinely OFF by default, because the whole claim
 *      of this experiment is that it changes nothing until asked;
 *   2. that a real generator grammar survives conversion into the form strict
 *      mode requires — this is where a port silently breaks;
 *   3. that a provider reply maps onto the shape fourteen call sites read.
 *
 *   node --test lib/open-model.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { hardenSchema, runsOpen, openModel, OPEN_MODELS } from "./open-model.ts";

/** Restore the environment around each case — these are process globals. */
function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

// ── off by default ───────────────────────────────────────────────────────────

test("no stage runs open unless something says so", () => {
  /* The load-bearing claim of the whole experiment: merely having this code in
     the tree changes no build. If this ever fails, a deploy silently moved
     production onto a different model. */
  withEnv({ OPEN_MODEL_TASKS: undefined }, () => {
    for (const t of ["activities", "evidence", "qa", "plan", "outline"]) {
      assert.equal(runsOpen(t), false, `${t} ran open with nothing configured`);
    }
  });
});

test("one named stage runs open and the others do not", () => {
  // The honest experiment moves one stage at a time — 94% of spend is on the
  // judgment stages, so "all or nothing" is the wrong first move.
  withEnv({ OPEN_MODEL_TASKS: "foundation" }, () => {
    assert.equal(runsOpen("foundation"), true);
    assert.equal(runsOpen("evidence"), false);
    assert.equal(runsOpen("activities"), false);
  });
});

test("`all` means all", () => {
  withEnv({ OPEN_MODEL_TASKS: "all" }, () => {
    assert.equal(runsOpen("evidence"), true);
    assert.equal(runsOpen("anything-at-all"), true);
  });
});

test("an unknown model name disables the path rather than guessing", () => {
  // Falling back to some default model on a typo would run a build on a model
  // nobody chose and report it as the one they typed.
  withEnv({ OPEN_MODEL: "llama-9000" }, () => assert.equal(openModel(), null));
});

test("every listed model does real constrained decoding", () => {
  /* The shortlist exists for this property alone. A stage that returns
     unparseable JSON is a failed build, not a cheaper one, so a model without
     strict decoding does not belong on this list however cheap it is. */
  for (const [name, m] of Object.entries(OPEN_MODELS)) {
    assert.equal(m.strict, true, `${name} is listed without strict decoding`);
    assert.ok(m.keyEnv && m.baseUrl && m.id);
    assert.ok(m.out > 0 && m.in > 0, `${name} has no rate, so its calls would meter as free`);
  }
});

// ── the grammar survives ─────────────────────────────────────────────────────

/** Every object in a JSON Schema tree, for the invariants below. */
function objects(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    node.forEach((n) => objects(n, out));
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const o = node as Record<string, unknown>;
  if (o.type === "object" && o.properties) out.push(o);
  for (const v of Object.values(o)) objects(v, out);
  return out;
}

/** A schema with the shapes the real generator uses: nesting, arrays, enums. */
const realistic = z.object({
  activities: z.array(
    z.object({
      kind: z.enum(["hook", "drill"]),
      title: z.string(),
      prompts: z.array(
        z.object({ label: z.string(), guide: z.string(), trap: z.string() })
      ),
      exitBallot: z.object({
        rows: z.array(z.object({ criterion: z.string(), test: z.string() })),
        repairs: z.array(z.string()),
      }),
      optional: z.boolean(),
      durationMin: z.number().int(),
    })
  ),
});

test("every object in a converted grammar is closed and fully required", () => {
  /* Groq's two requirements beyond plain JSON Schema. A schema missing either
     is rejected outright — which is the good failure. The bad one would be a
     provider accepting it and ignoring the constraint. */
  const fmt = betaZodOutputFormat(realistic) as unknown as { schema: unknown };
  const hardened = hardenSchema(fmt.schema);
  const objs = objects(hardened);
  assert.ok(objs.length >= 4, `expected the nested objects, found ${objs.length}`);
  for (const o of objs) {
    assert.equal(o.additionalProperties, false, "an object was left open");
    const props = Object.keys(o.properties as Record<string, unknown>);
    assert.deepEqual(
      [...(o.required as string[])].sort(),
      props.sort(),
      "a property is missing from required"
    );
  }
});

test("conversion keeps the structure, and only drops the noise", () => {
  const fmt = betaZodOutputFormat(realistic) as unknown as { schema: unknown };
  const h = hardenSchema(fmt.schema) as Record<string, unknown>;
  const acts = (h.properties as Record<string, Record<string, unknown>>).activities;
  const item = acts.items as Record<string, unknown>;
  const props = item.properties as Record<string, Record<string, unknown>>;

  assert.deepEqual(props.kind.enum, ["hook", "drill"], "the enum was lost");
  assert.equal(props.optional.type, "boolean");
  assert.equal(props.durationMin.type, "integer");
  // Nested two deep — where a naive conversion stops recursing.
  const ballotRows = (props.exitBallot.properties as Record<string, Record<string, unknown>>).rows;
  assert.equal((ballotRows.items as Record<string, unknown>).additionalProperties, false);
});

test("the enum survives as a REAL constraint, not a description", () => {
  /* The trap: the helper serialises enums into description text. Passed through
     or stripped, the field becomes an unconstrained string, the model returns
     something else, and our own zod parse fails a line later for a reason that
     looks nothing like its cause. */
  const fmt = betaZodOutputFormat(realistic) as unknown as { schema: unknown };
  const h = hardenSchema(fmt.schema) as Record<string, unknown>;
  const acts = (h.properties as Record<string, Record<string, unknown>>).activities;
  const props = (acts.items as Record<string, Record<string, unknown>>).properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(props.kind.enum, ["hook", "drill"], "the enum did not become a real keyword");
  assert.equal(props.kind.description, undefined, "the serialised copy was left behind too");
});

test("meaningless numeric bounds are dropped and real ones kept", () => {
  const h = hardenSchema({
    type: "object",
    properties: {
      loose: { type: "integer", description: "{minimum: -9007199254740991, maximum: 9007199254740991}" },
      tight: { type: "integer", description: "{minimum: 1, maximum: 20}" },
    },
  }) as Record<string, unknown>;
  const p = h.properties as Record<string, Record<string, unknown>>;
  assert.equal(p.loose.minimum, undefined, "the safe-integer sentinel is not a constraint anyone meant");
  assert.equal(p.tight.minimum, 1, "a real bound was lost");
  assert.equal(p.tight.maximum, 20);
});

test("the grammar does not grow in transit", () => {
  /* The helper smuggles numeric constraints into `description` as
     "{minimum: -9007199254740991, …}". Anthropic ignores them; here they are
     tokens on every request, on every field, on every call. */
  const fmt = betaZodOutputFormat(realistic) as unknown as { schema: unknown };
  const before = JSON.stringify(fmt.schema);
  const after = JSON.stringify(hardenSchema(fmt.schema));
  assert.match(before, /9007199254740991/, "the fixture no longer exercises this");
  assert.doesNotMatch(after, /9007199254740991/, "bounds noise survived conversion");
  assert.ok(after.length < before.length, "conversion should not grow the grammar");
});

test("a grammar with no bounds noise is left alone", () => {
  // The stripping is keyed on the "{…}" shape, so a real description written
  // by a human must survive it.
  const withDoc = { type: "object", properties: { a: { type: "string", description: "The claim." } } };
  const h = hardenSchema(withDoc) as Record<string, unknown>;
  const p = (h.properties as Record<string, Record<string, unknown>>).a;
  assert.equal(p.description, "The claim.");
});
