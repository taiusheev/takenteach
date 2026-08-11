/**
 * THE MAIL SEAM.
 *
 * No transport is configured and none is chosen yet — that decision belongs at
 * deploy time, not at the moment somebody needs to send a password reset. What
 * matters now is that every call site is written against an interface, so
 * adding Resend or SES later is one function body and zero changes anywhere
 * else.
 *
 * In development this logs to the console, and the reset link is printed in
 * full so the flow is testable end to end without an inbox. That is a
 * DEVELOPMENT behaviour and it checks `NODE_ENV` rather than trusting itself:
 * printing credentials to a production log is exactly the kind of convenience
 * that ships by accident.
 */

export interface Mail {
  to: string;
  subject: string;
  /** Plain text. HTML can come with the transport that needs it. */
  body: string;
}

export interface MailResult {
  ok: boolean;
  /** How it was handled, so a caller can tell the user something honest. */
  via: "console" | "transport";
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  if (process.env.NODE_ENV !== "production") {
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

  /* No production transport yet. Returning ok:false rather than throwing keeps
     the failure a fact the caller can handle — the password-reset route still
     answers the browser identically either way, because telling an anonymous
     visitor "we couldn't send that" also tells them the address exists. */
  console.error(
    `[mail] No transport configured; dropped "${mail.subject}" to ${mail.to}`
  );
  return { ok: false, via: "transport" };
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
