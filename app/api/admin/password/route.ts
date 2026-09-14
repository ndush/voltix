import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import {
  hashPassword,
  readSession,
  SESSION_COOKIE,
  verifyPassword,
  verifyTotp,
} from '@/app/lib/adminAuth';
import {
  CredentialStoreUnavailable,
  resolveEditors,
  upsertEditor,
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

  let editors;
  try {
    editors = await resolveEditors();
  } catch (err) {
    if (err instanceof CredentialStoreUnavailable)
      return NextResponse.json({ error: 'store_unavailable' }, { status: 503 });
    throw err;
  }

  const user = editors.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
  if (!user)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Re-authenticate before changing the credential. Holding a session is not
  // enough: an unattended browser would otherwise be enough to lock the real
  // owner out of their own account.
  const okCurrent = verifyPassword(current, user.salt, user.hash);
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
    // Carry the TOTP secret for a stored editor; an env editor keeps theirs
    // in the environment, so it is left off here.
    await upsertEditor(user.email, {
      salt,
      hash,
      totp: user.source === 'stored' ? user.totp : undefined,
      changedAt: Date.now(),
    });
  } catch (err) {
    console.error(`[admin/password] write failed for ${user.email}`, err);
    return NextResponse.json({ error: 'write_failed' }, { status: 502 });
  }

  console.log(`[admin/password] changed by ${user.email}`);
  return NextResponse.json({ ok: true });
}
