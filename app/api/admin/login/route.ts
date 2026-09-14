import { NextResponse, NextRequest } from 'next/server';
import {
  adminUsers,
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  verifyPassword,
  verifyTotp,
} from '@/app/lib/adminAuth';
import { checkLocked, recordFailure, recordSuccess } from '@/app/lib/rateLimit';
import {
  CredentialStoreUnavailable,
  readOverrides,
} from '@/app/lib/credentialStore';

export async function POST(req: NextRequest) {
  const users = adminUsers();
  if (users.length === 0 || !process.env.SESSION_SECRET) {
    console.error('[admin/login] ADMIN_USERS or SESSION_SECRET is not set');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  let email = '';
  let password = '';
  let code = '';
  try {
    const body = await req.json();
    email = String(body?.email ?? '').trim().toLowerCase();
    password = String(body?.password ?? '');
    code = String(body?.code ?? '');
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // Throttle per address and per source, so one attacker cannot lock out a
  // real editor by hammering their address alone.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const key = `${ip}|${email}`;

  const lockedFor = checkLocked(key);
  if (lockedFor !== null) {
    console.warn(`[admin/login] locked out ${email} from ${ip}`);
    return NextResponse.json(
      { error: 'locked', retryAfter: lockedFor },
      { status: 429 }
    );
  }

  const user = users.find((u) => u.email.toLowerCase() === email);

  // A password changed in /admin lives in Blob, not in ADMIN_USERS. Fail
  // closed if that document cannot be read: treating it as absent would
  // re-accept a password the user had already replaced.
  let overrides;
  try {
    overrides = await readOverrides();
  } catch (err) {
    if (err instanceof CredentialStoreUnavailable) {
      return NextResponse.json({ error: 'store_unavailable' }, { status: 503 });
    }
    throw err;
  }

  const override = user ? overrides[user.email.toLowerCase()] : undefined;
  const salt = override?.salt ?? user?.salt;
  const hash = override?.hash ?? user?.hash;

  // Verify against a decoy when the address is unknown, so a wrong email and a
  // wrong password cost the same time and are indistinguishable.
  const DECOY_SALT = '00'.repeat(16);
  const DECOY_HASH = '00'.repeat(64);
  const passwordOk =
    verifyPassword(password, salt ?? DECOY_SALT, hash ?? DECOY_HASH) && !!user;
  const totpOk = !!user && verifyTotp(user.email, user.totp, code);

  if (!passwordOk || !totpOk) {
    recordFailure(key);
    console.warn(
      `[admin/login] failed for ${email || '(blank)'} from ${ip} ` +
        `(password ${passwordOk ? 'ok' : 'bad'}, code ${totpOk ? 'ok' : 'bad'})`
    );
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  recordSuccess(key);
  console.log(`[admin/login] success for ${user!.email} from ${ip}`);

  const res = NextResponse.json({ ok: true, email: user!.email });
  res.cookies.set(SESSION_COOKIE, createSession(user!.email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return res;
}
