import crypto from 'crypto';
import { TOTP, Secret } from 'otpauth';

/**
 * Admin authentication: password + TOTP, then a signed session cookie.
 *
 * Editors are configured in ADMIN_USERS as JSON. Passwords are stored as
 * scrypt hashes, never plaintext, so the environment variable is not itself a
 * credential. TOTP means a leaked password alone is not enough.
 *
 * Use `npm run admin:user` to generate an entry and its enrolment QR code.
 */
export type AdminUser = {
  email: string;
  /** scrypt salt, hex */
  salt: string;
  /** scrypt hash, hex */
  hash: string;
  /** base32 TOTP secret */
  totp: string;
};

export const SESSION_COOKIE = 'admin_session';
/** Short by design: an unattended browser stays usable for at most this long. */
export const SESSION_MAX_AGE = 60 * 60;
export const TOTP_ISSUER = 'Voltix';

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

export function adminUsers(): AdminUser[] {
  const raw = process.env.ADMIN_USERS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (u): u is AdminUser =>
        !!u &&
        typeof u.email === 'string' &&
        typeof u.salt === 'string' &&
        typeof u.hash === 'string' &&
        typeof u.totp === 'string'
    );
  } catch {
    console.error('[admin] ADMIN_USERS is not valid JSON');
    return [];
  }
}

// ---------------------------------------------------------------- passwords

/**
 * Salt and hash are kept as separate hex fields rather than one delimited
 * string. A `$`-delimited form (the usual convention) is silently mangled by
 * dotenv-style variable expansion, which reads `$9ebf...` as a variable name
 * and substitutes nothing.
 */
export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16);
  return {
    salt: salt.toString('hex'),
    hash: crypto.scryptSync(password, salt, 64).toString('hex'),
  };
}

export function verifyPassword(
  password: string,
  saltHex: string,
  hashHex: string
): boolean {
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return false;
  let derived: Buffer;
  try {
    derived = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  } catch {
    return false;
  }
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

// --------------------------------------------------------------------- TOTP

export function totpFor(email: string, base32Secret: string): TOTP {
  return new TOTP({
    issuer: TOTP_ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(base32Secret),
  });
}

/**
 * Accepts the current code and the immediately adjacent windows, which covers
 * ordinary clock drift between the phone and the server.
 */
export function verifyTotp(email: string, base32Secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code.trim())) return false;
  try {
    const delta = totpFor(email, base32Secret).validate({
      token: code.trim(),
      window: 1,
    });
    return delta !== null;
  } catch {
    return false;
  }
}

export function newTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

// ----------------------------------------------------------------- sessions

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

export function createSession(email: string): string {
  const expires = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = `${Buffer.from(email).toString('base64url')}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function readSession(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [emailPart, expiresPart, sig] = parts;
  if (!safeEqual(sig, sign(`${emailPart}.${expiresPart}`))) return null;
  const expires = Number(expiresPart);
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;

  const email = Buffer.from(emailPart, 'base64url').toString('utf8');
  // Re-check membership so removing someone from ADMIN_USERS takes effect on
  // their next request rather than when their cookie happens to expire.
  return adminUsers().some((u) => u.email.toLowerCase() === email.toLowerCase())
    ? email
    : null;
}
