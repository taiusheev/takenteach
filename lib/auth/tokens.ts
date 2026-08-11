import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * OPAQUE TOKENS — session cookies and password-reset links.
 *
 * Two rules, and the reasoning for each is the whole file:
 *
 * 1. THE TOKEN IS RANDOM, NOT SIGNED. A JWT would let a request be verified
 *    without touching the database, and that is exactly the property we do not
 *    want: it also means a session cannot be ended. Logging out, suspending a
 *    member, or changing a password has to revoke access *now*, and a signed
 *    token is valid until it expires no matter what the database says. One
 *    indexed primary-key lookup is not the bottleneck in an app that already
 *    runs SQLite in-process.
 *
 * 2. ONLY THE HASH IS STORED. The database holds SHA-256 of the token, never
 *    the token, so a leaked backup or a stray query log does not hand over live
 *    sessions and working reset links — the same reason passwords are not
 *    stored either.
 *
 * SHA-256 is the right hash HERE and would be badly wrong for a password. A
 * password has perhaps 30 bits of entropy and needs a slow hash to make guessing
 * expensive; these tokens have 256, so there is nothing to guess and slowing the
 * hash down would only tax every authenticated request. See ./password.ts for
 * the other half of that argument.
 */

const TOKEN_BYTES = 32;

/** A fresh 256-bit token, base64url so it is safe in a cookie and a URL alike. */
export function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** The value actually stored. Hex rather than base64 so it is greppable in a shell. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Compare two hex digests without leaking their difference through timing.
 *
 * A session lookup is a primary-key SELECT and does not need this — the database
 * does the comparison and we never see a near-miss. It matters where we compare
 * in JS, which `===` on a secret does in a data-dependent number of instructions.
 */
export function tokenMatches(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch, so the length check is not an
  // early return we could avoid — but the lengths of two digests are public.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** An ISO timestamp `seconds` from now, in the `datetime('now')` shape SQLite writes. */
export function expiryFromNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
}

/** Now, in the same shape — so comparisons against stored timestamps are string-safe. */
export function nowStamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
