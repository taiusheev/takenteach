import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

/**
 * PASSWORD HASHING — scrypt, from node:crypto.
 *
 * No dependency. That is the point, not an accident: bcrypt and argon2 are both
 * native modules needing node-gyp, this project is developed on Windows, and it
 * has just spent a port getting rid of the one native build it had
 * (better-sqlite3, which a serverless host could not run). scrypt is a real
 * memory-hard KDF (RFC 7914), it ships in the Node standard library, and it is
 * on OWASP's list of acceptable choices. The alternative is not "a better hash",
 * it is "a build that fails on a fresh machine".
 *
 * WHAT NOT TO DO HERE. Not SHA-256, not SHA-256 with a salt, not any number of
 * rounds of it: a general-purpose hash is designed to be fast, which is the
 * single property a password hash must not have. The whole job of the numbers
 * below is to make each guess expensive.
 *
 * THE FORMAT IS SELF-DESCRIBING:
 *
 *     scrypt$16384$8$1$<salt b64>$<hash b64>
 *
 * The cost parameters travel with each hash rather than living in a constant.
 * That is what makes them raisable: turn N up next year and existing users
 * still verify against their own stored parameters, then get rehashed at the
 * new cost on their next successful login. A bare hash with the parameters in
 * code can never be strengthened without locking everyone out.
 */

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

/**
 * N=16384, r=8, p=1 → 128 · N · r = 16 MiB and roughly 50–100 ms per hash on a
 * laptop. `maxmem` is set explicitly because Node's default cap is 32 MiB and
 * scrypt throws rather than degrading if the parameters exceed it — so raising
 * N later without raising this would fail at runtime, on the login path, for
 * everyone at once.
 */
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const KEYLEN = 32;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, PARAMS);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/**
 * Verify a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed stored value: a corrupt row
 * is a failed login, not a 500 that tells the caller their guess was
 * interestingly wrong.
 */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  let expected: Buffer;
  let salt: Buffer;
  try {
    expected = Buffer.from(hashB64, "base64");
    salt = Buffer.from(saltB64, "base64");
  } catch {
    return false;
  }
  if (expected.length === 0 || salt.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: PARAMS.maxmem,
    });
  } catch {
    // Stored parameters we can no longer satisfy (an N raised beyond maxmem, say).
    return false;
  }

  // Length-check first: timingSafeEqual THROWS on a length mismatch rather than
  // returning false, so calling it directly turns a malformed hash into a 500.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * True when a hash was made with weaker parameters than we now use, so the
 * caller can transparently re-hash on a successful login.
 */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) < PARAMS.N;
}

/**
 * A readable, high-entropy one-time password for a seeded account.
 *
 * The alphabet excludes the characters that get misread when a password is
 * copied off a terminal by eye — 0/O, 1/l/I — because this string's entire
 * purpose is to be transcribed once. 4 groups of 5 from a 29-character
 * alphabet is ~97 bits, which is far beyond what a rate-limited login needs
 * and costs nothing.
 */
export function generatePassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  let out = "";
  for (let i = 0; i < 20; i++) {
    if (i > 0 && i % 5 === 0) out += "-";
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
