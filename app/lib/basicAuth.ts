import crypto from 'crypto';

/**
 * HTTP Basic Auth for the admin area.
 *
 * Credentials live in ADMIN_USERS as comma-separated `email:password` pairs.
 * Using the email as the username keeps per-person identity — saves are
 * committed under whoever signed in — without a session layer, a provider, or
 * a login page. The browser's own dialog collects the credentials.
 *
 * Basic Auth sends the password on every request, so this is only acceptable
 * over HTTPS. Vercel terminates TLS for all deployments, and `proxy.ts`
 * additionally refuses plaintext requests outside development.
 *
 * A password may contain colons but not commas, since commas separate users.
 */
export type AdminUser = { email: string; password: string };

export function adminUsers(): AdminUser[] {
  return (process.env.ADMIN_USERS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const i = entry.indexOf(':');
      if (i < 1) return null;
      return {
        email: entry.slice(0, i).trim().toLowerCase(),
        password: entry.slice(i + 1),
      };
    })
    .filter((u): u is AdminUser => u !== null && u.password.length > 0);
}

function constantTimeEqual(a: string, b: string): boolean {
  // Hash first so differing lengths do not leak, and so the comparison is
  // always over a fixed 32 bytes.
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Returns the authenticated editor's email, or null.
 *
 * Every configured user is checked even after a match, so the time taken does
 * not reveal which entry matched or how many are configured.
 */
export function authenticate(header: string | null): string | null {
  if (!header?.startsWith('Basic ')) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return null;
  }

  const i = decoded.indexOf(':');
  if (i < 0) return null;
  const user = decoded.slice(0, i).trim().toLowerCase();
  const pass = decoded.slice(i + 1);

  let matched: string | null = null;
  for (const u of adminUsers()) {
    const ok = constantTimeEqual(u.email, user) && constantTimeEqual(u.password, pass);
    if (ok) matched = u.email;
  }
  return matched;
}

export const CHALLENGE = {
  'WWW-Authenticate': 'Basic realm="Voltix admin", charset="UTF-8"',
};
