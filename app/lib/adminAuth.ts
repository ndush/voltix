import crypto from 'crypto';

/**
 * Passwordless admin auth.
 *
 * Two signed, expiring tokens, both HMAC'd with SESSION_SECRET:
 *  - a magic-link token, valid 10 minutes, emailed to the editor
 *  - a session token, valid 8 hours, stored in an httpOnly cookie
 *
 * Both carry the editor's email, so saves can be attributed to a person
 * rather than to a shared login. There is no user table: who may sign in is
 * whoever appears in ADMIN_EMAILS.
 */
const MAGIC_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_SECONDS = 60 * 60 * 8;

export const SESSION_COOKIE = 'admin_session';
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

function sign(payload: string, kind: string): string {
  return crypto
    .createHmac('sha256', secret())
    .update(`${kind}:${payload}`)
    .digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Who is allowed to sign in, from a comma-separated ADMIN_EMAILS. */
export function allowedEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => normaliseEmail(e))
    .filter(Boolean);
}

export function isAllowedEmail(email: string): boolean {
  const list = allowedEmails();
  const target = normaliseEmail(email);
  // Compare against every entry so the reply time does not reveal a match.
  let found = false;
  for (const e of list) if (safeEqual(e.padEnd(320), target.padEnd(320))) found = true;
  return found;
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export function createMagicToken(email: string): string {
  const expires = Date.now() + MAGIC_TTL_MS;
  // A nonce makes each link distinct even for the same address and minute.
  const nonce = crypto.randomBytes(8).toString('base64url');
  const payload = `${encode(normaliseEmail(email))}.${expires}.${nonce}`;
  return `${payload}.${sign(payload, 'magic')}`;
}

export function verifyMagicToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [emailPart, expiresPart, nonce, sig] = parts;
  const payload = `${emailPart}.${expiresPart}.${nonce}`;
  if (!safeEqual(sig, sign(payload, 'magic'))) return null;
  const expires = Number(expiresPart);
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;
  const email = decode(emailPart);
  // Revoking access by removing someone from ADMIN_EMAILS must take effect
  // even if they already hold an unexpired link.
  return isAllowedEmail(email) ? email : null;
}

export function createSession(email: string): string {
  const expires = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = `${encode(normaliseEmail(email))}.${expires}`;
  return `${payload}.${sign(payload, 'session')}`;
}

export function readSession(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [emailPart, expiresPart, sig] = parts;
  const payload = `${emailPart}.${expiresPart}`;
  if (!safeEqual(sig, sign(payload, 'session'))) return null;
  const expires = Number(expiresPart);
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;
  const email = decode(emailPart);
  return isAllowedEmail(email) ? email : null;
}
