import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import {
  adminUsers,
  hashPassword,
  readSession,
  SESSION_COOKIE,
  verifyPassword,
  verifyTotp,
} from '@/app/lib/adminAuth';
import {
  CredentialStoreUnavailable,
  readOverrides,
  writeOverride,
} from '@/app/lib/credentialStore';

const MIN_LENGTH = 12;

export async function POST(req: NextRequest) {
  const email = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!email)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let current = '';
  let next = '';
  let code = '';
  try {
    const body = await req.json();
    current = String(body?.currentPassword ?? '');
    next = String(body?.newPassword ?? '');
    code = String(body?.code ?? '');
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  if (next.length < MIN_LENGTH)
    return NextResponse.json(
      { error: 'too_short', minimum: MIN_LENGTH },
      { status: 400 }
    );
  if (next === current)
    return NextResponse.json({ error: 'unchanged' }, { status: 400 });

  const user = adminUsers().find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
  if (!user)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let overrides;
  try {
    overrides = await readOverrides();
  } catch (err) {
    if (err instanceof CredentialStoreUnavailable)
      return NextResponse.json({ error: 'store_unavailable' }, { status: 503 });
    throw err;
  }

  // Re-authenticate before changing the credential. Holding a session is not
  // enough: an unattended browser would otherwise be enough to lock the real
  // owner out of their own account.
  const existing = overrides[user.email.toLowerCase()];
  const okCurrent = verifyPassword(
    current,
    existing?.salt ?? user.salt,
    existing?.hash ?? user.hash
  );
  const okCode = verifyTotp(user.email, user.totp, code);

  if (!okCurrent || !okCode) {
    console.warn(
      `[admin/password] change refused for ${user.email} ` +
        `(password ${okCurrent ? 'ok' : 'bad'}, code ${okCode ? 'ok' : 'bad'})`
    );
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  const { salt, hash } = hashPassword(next);
  try {
    await writeOverride(user.email, { salt, hash, changedAt: Date.now() });
  } catch (err) {
    console.error(`[admin/password] write failed for ${user.email}`, err);
    return NextResponse.json({ error: 'write_failed' }, { status: 502 });
  }

  console.log(`[admin/password] changed by ${user.email}`);
  return NextResponse.json({ ok: true });
}
