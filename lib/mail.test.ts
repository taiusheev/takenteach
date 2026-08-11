import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { passwordResetMail, sendMail } from "./mail";

/**
 * The mail transport, with `fetch` faked.
 *
 * The properties worth holding are not "does Resend work" — that is Resend's
 * job — but the three ways this could hurt someone:
 *
 *   1. sending from a development machine, or printing a live reset link into a
 *      production log;
 *   2. throwing on a transport failure, which would turn "the mail provider is
 *      down" into a 500 on the password-reset route and, worse, into an
 *      account-enumeration oracle, since a failure would only be visible for
 *      addresses that actually exist;
 *   3. putting the reset link — a live credential — into an error log.
 */

const REAL_FETCH = globalThis.fetch;
const ENV = { ...process.env };

/**
 * Next 16.3 types `process.env.NODE_ENV` as readonly, which is right for
 * application code and unhelpful for the one place that has to drive both
 * branches of an `isProd` check. Written through a widened view rather than
 * with `as never` at seven call sites.
 */
function setEnv(key: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[key];
  else env[key] = value;
}

interface Captured {
  url: string;
  init: RequestInit;
}

function fakeFetch(response: () => Promise<Response> | Response) {
  const calls: Captured[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return response();
  }) as typeof fetch;
  return calls;
}

function silence() {
  const logs: string[] = [];
  const realLog = console.log;
  const realError = console.error;
  console.log = (...a: unknown[]) => void logs.push(a.join(" "));
  console.error = (...a: unknown[]) => void logs.push(a.join(" "));
  return {
    logs,
    restore: () => {
      console.log = realLog;
      console.error = realError;
    },
  };
}

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  process.env = { ...ENV };
});

describe("sendMail", () => {
  test("development logs and sends nothing", async () => {
    setEnv("NODE_ENV", "development");
    setEnv("RESEND_API_KEY", "re_should_not_be_used");
    setEnv("MAIL_FROM", "TakenTeach <noreply@takenteach.com>");
    const calls = fakeFetch(() => new Response("{}", { status: 200 }));
    const out = silence();

    const res = await sendMail(passwordResetMail("ada@school.org", "https://x/reset?token=abc"));
    out.restore();

    assert.deepEqual(res, { ok: true, via: "console" });
    assert.equal(calls.length, 0, "a development machine sent real email");
    // ...and the link IS printed locally, which is the point of the branch.
    assert.ok(out.logs.join("\n").includes("token=abc"));
  });

  test("production with no key drops the message rather than throwing", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("RESEND_API_KEY", undefined);
    const calls = fakeFetch(() => new Response("{}", { status: 200 }));
    const out = silence();

    const res = await sendMail(passwordResetMail("ada@school.org", "https://x/r?token=abc"));
    out.restore();

    assert.deepEqual(res, { ok: false, via: "transport" });
    assert.equal(calls.length, 0);
    // The whole point of the seam: the caller learns it failed, nothing throws.
  });

  test("production with a key posts to Resend, authorized, as text", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("RESEND_API_KEY", "re_live_key");
    setEnv("MAIL_FROM", "TakenTeach <noreply@takenteach.com>");
    const calls = fakeFetch(() => new Response(JSON.stringify({ id: "x" }), { status: 200 }));

    const res = await sendMail(passwordResetMail("ada@school.org", "https://x/r?token=abc"));

    assert.deepEqual(res, { ok: true, via: "transport" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.equal(
      (calls[0].init.headers as Record<string, string>).Authorization,
      "Bearer re_live_key"
    );
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.from, "TakenTeach <noreply@takenteach.com>");
    assert.deepEqual(body.to, ["ada@school.org"]);
    assert.match(body.text, /token=abc/);
    assert.equal(body.html, undefined, "text only — see the note in mail.ts");
  });

  test("a rejection from Resend is a false, not an exception", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("RESEND_API_KEY", "re_live_key");
    setEnv("MAIL_FROM", "TakenTeach <noreply@takenteach.com>");
    fakeFetch(() => new Response("domain not verified", { status: 403 }));
    const out = silence();

    const res = await sendMail(passwordResetMail("ada@school.org", "https://x/r?token=abc"));
    out.restore();

    assert.deepEqual(res, { ok: false, via: "transport" });
    const logged = out.logs.join("\n");
    assert.match(logged, /403/, "the status is what makes this diagnosable");
    assert.match(logged, /domain not verified/);
    /* THE LINK MUST NOT BE IN THE LOG. It is a live credential — anyone reading
       the log could take over the account. Same reason sessions store a hash. */
    assert.equal(logged.includes("token=abc"), false, "logged a live reset link");
  });

  test("an unreachable transport is a false, not an exception", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("RESEND_API_KEY", "re_live_key");
    setEnv("MAIL_FROM", "TakenTeach <noreply@takenteach.com>");
    fakeFetch(() => {
      throw new Error("getaddrinfo ENOTFOUND api.resend.com");
    });
    const out = silence();

    const res = await sendMail(passwordResetMail("ada@school.org", "https://x/r?token=abc"));
    out.restore();

    assert.deepEqual(res, { ok: false, via: "transport" });
    assert.equal(out.logs.join("\n").includes("token=abc"), false);
  });

  test("a missing MAIL_FROM is refused rather than guessed", async () => {
    // Sending from a default nobody verified would be silently undeliverable,
    // and a guessed sender is how a domain earns a spam reputation.
    setEnv("NODE_ENV", "production");
    setEnv("RESEND_API_KEY", "re_live_key");
    setEnv("MAIL_FROM", undefined);
    const calls = fakeFetch(() => new Response("{}", { status: 200 }));
    const out = silence();

    const res = await sendMail(passwordResetMail("ada@school.org", "https://x/r"));
    out.restore();

    assert.deepEqual(res, { ok: false, via: "transport" });
    assert.equal(calls.length, 0);
  });

  test("MAIL_FORCE_SEND is the deliberate way to test a new sending domain", async () => {
    setEnv("NODE_ENV", "development");
    setEnv("MAIL_FORCE_SEND", "1");
    setEnv("RESEND_API_KEY", "re_live_key");
    setEnv("MAIL_FROM", "TakenTeach <noreply@takenteach.com>");
    const calls = fakeFetch(() => new Response("{}", { status: 200 }));

    const res = await sendMail(passwordResetMail("ada@school.org", "https://x/r"));

    assert.deepEqual(res, { ok: true, via: "transport" });
    assert.equal(calls.length, 1);
  });
});
