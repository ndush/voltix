import crypto from 'crypto';

/**
 * Stateless admin session.
 *
 * A signed, expiring token in an httpOnly cookie. There is no user store: the
 * single shared password lives in ADMIN_PASSWORD, and SESSION_SECRET signs the
 * cookie so it cannot be forged client-side.
 */
const MAX_AGE_SECONDS = 60 * 60 * 8;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

/** Constant-time compare so a wrong password cannot be found byte by byte. */
export function passwordMatches(supplied: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still compare, so the reply time does not reveal the length.
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function createSession(): string {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = String(expires);
  const sig = crypto
    .createHmac('sha256', secret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function sessionIsValid(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;

  const expected = crypto
    .createHmac('sha256', secret())
    .update(payload)
    .digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  const expires = Number(payload);
  return Number.isFinite(expires) && expires > Date.now();
}

export const SESSION_COOKIE = 'admin_session';
export const SESSION_MAX_AGE = MAX_AGE_SECONDS;
