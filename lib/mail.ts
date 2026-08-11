/**
 * THE MAIL SEAM — Resend behind it.
 *
 * Every call site is written against `sendMail`, so the transport is one
 * function body and zero changes anywhere else. That held: adding Resend
 * touched only this file.
 *
 * ── WHY NO SDK ───────────────────────────────────────────────────────────
 * Resend publishes an npm package; this uses `fetch` against its HTTP API
 * instead. Sending an email is one POST with a bearer token and a JSON body —
 * the SDK would add a dependency, a version to keep current and a bundle to
 * ship into every serverless function, in exchange for wrapping a call that is
 * fifteen lines long. The same argument that put scrypt in lib/auth/password.ts
 * instead of bcrypt.
 *
 * ── WHAT IT DOES IN EACH ENVIRONMENT ─────────────────────────────────────
 *
 *   development           logs to the console, INCLUDING the reset link, so the
 *                         flow is testable end to end without an inbox
 *   production, no key    logs that it dropped the message, returns ok:false
 *   production, key       sends
 *
 * The development branch checks `NODE_ENV` rather than trusting itself, because
 * printing a live password-reset link into a production log is exactly the kind
 * of convenience that ships by accident. `MAIL_FORCE_SEND=1` is the deliberate
 * override, and it exists for one real job: proving a freshly verified sending
 * domain actually delivers, before the deploy that depends on it.
 *
 * ── IT NEVER THROWS ──────────────────────────────────────────────────────
 * A transport failure comes back as `ok: false`. The password-reset route
 * answers the browser identically whether the address existed or not — telling
 * an anonymous visitor "we couldn't send that" also tells them the account is
 * real — so an exception here would turn a deliverability problem into an
 * account-enumeration oracle and a 500.
 */

export interface Mail {
  to: string;
  subject: string;
  /** Plain text. Deliberately not HTML — see `body` in the POST below. */
  body: string;
}

export interface MailResult {
  ok: boolean;
  /** How it was handled, so a caller can tell the user something honest. */
  via: "console" | "transport";
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * A hung request must not hold a serverless function open until the platform
 * kills it — that would turn a slow mail provider into a failed password reset
 * AND a wasted invocation.
 */
const SEND_TIMEOUT_MS = 10_000;

export async function sendMail(mail: Mail): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const isProd = process.env.NODE_ENV === "production";
  const forced = process.env.MAIL_FORCE_SEND === "1";

  if (!isProd && !forced) {
    console.log(
      [
        "",
        "──────────────────────────────────────────────────────────────",
        "  ✉  MAIL (development — not actually sent)",
        `  To:      ${mail.to}`,
        `  Subject: ${mail.subject}`,
        "──────────────────────────────────────────────────────────────",
        mail.body,
        "──────────────────────────────────────────────────────────────",
        "",
      ].join("\n")
    );
    return { ok: true, via: "console" };
  }

  if (!apiKey) {
    /* Deliberately not a throw. Returning the failure as a fact keeps the reset
       route's answer identical either way; see the note at the top. */
    console.error(
      `[mail] RESEND_API_KEY is not set; dropped "${mail.subject}" to ${mail.to}`
    );
    return { ok: false, via: "transport" };
  }

  const from = process.env.MAIL_FROM;
  if (!from) {
    console.error(
      `[mail] MAIL_FROM is not set; dropped "${mail.subject}" to ${mail.to}`
    );
    return { ok: false, via: "transport" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        /* TEXT ONLY, on purpose. The one message this sends is a sentence and a
           link; an HTML version would be a second copy of the wording to keep in
           step and a place to get escaping wrong, and plain text lands in inboxes
           that treat unsolicited HTML with suspicion. Add `html` here when there
           is a message that genuinely needs it. */
        text: mail.body,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!res.ok) {
      /* The STATUS and Resend's error, never the body — the body of the only
         message here contains a live password-reset link, and a log is not the
         place for one. This is the same reason lib/auth/tokens.ts stores a hash
         rather than the token. */
      const detail = await res.text().catch(() => "");
      console.error(
        `[mail] Resend rejected "${mail.subject}" for ${mail.to}: ` +
          `${res.status} ${detail.slice(0, 300)}`
      );
      return { ok: false, via: "transport" };
    }

    return { ok: true, via: "transport" };
  } catch (err) {
    // Timeout, DNS, TLS, Resend down. Logged, never thrown.
    const why = err instanceof Error ? err.message : String(err);
    console.error(
      `[mail] Could not reach Resend for "${mail.subject}" to ${mail.to}: ${why}`
    );
    return { ok: false, via: "transport" };
  }
}

/** The one message phase 1 sends. Kept here so the wording lives with the sender. */
export function passwordResetMail(to: string, link: string): Mail {
  return {
    to,
    subject: "Reset your TakenTeach password",
    body: [
      "Someone asked to reset the password for this TakenTeach account.",
      "",
      "Open this link to choose a new one. It expires in one hour and can only",
      "be used once:",
      "",
      link,
      "",
      "If this wasn't you, you can ignore this email — nothing has changed.",
    ].join("\n"),
  };
}
