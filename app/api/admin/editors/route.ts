import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import QRCode from 'qrcode';
import crypto from 'crypto';
import {
  hashPassword,
  newTotpSecret,
  readSession,
  SESSION_COOKIE,
  totpFor,
} from '@/app/lib/adminAuth';
import {
  CredentialStoreUnavailable,
  removeEditor,
  resolveEditors,
  upsertEditor,
} from '@/app/lib/credentialStore';
import { blobConfigured } from '@/app/lib/contentStore';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function requireEditor(): Promise<string | null> {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function GET() {
  const me = await requireEditor();
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const editors = await resolveEditors();
    return NextResponse.json({
      editors: editors
        .map((e) => ({
          email: e.email,
          removable: e.removable,
          isYou: e.email.toLowerCase() === me.toLowerCase(),
        }))
        .sort((a, b) => a.email.localeCompare(b.email)),
    });
  } catch (err) {
    if (err instanceof CredentialStoreUnavailable)
      return NextResponse.json({ error: 'store_unavailable' }, { status: 503 });
    throw err;
  }
}

/** Adds an editor and returns their password and enrolment QR — once. */
export async function POST(req: NextRequest) {
  const me = await requireEditor();
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!blobConfigured())
    return NextResponse.json({ error: 'store_unavailable' }, { status: 503 });

  let email = '';
  try {
    email = String((await req.json())?.email ?? '')
      .trim()
      .toLowerCase();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  if (!EMAIL.test(email))
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });

  let editors;
  try {
    editors = await resolveEditors();
  } catch (err) {
    if (err instanceof CredentialStoreUnavailable)
      return NextResponse.json({ error: 'store_unavailable' }, { status: 503 });
    throw err;
  }

  if (editors.some((e) => e.email.toLowerCase() === email))
    return NextResponse.json({ error: 'already_exists' }, { status: 409 });

  const password = crypto.randomBytes(18).toString('base64url').slice(0, 20);
  const totp = newTotpSecret();
  const { salt, hash } = hashPassword(password);

  try {
    await upsertEditor(email, {
      salt,
      hash,
      totp,
      changedAt: Date.now(),
      addedBy: me,
    });
  } catch (err) {
    console.error(`[admin/editors] add failed for ${email}`, err);
    return NextResponse.json({ error: 'write_failed' }, { status: 502 });
  }

  console.log(`[admin/editors] ${me} added ${email}`);

  // Shown once and never stored in readable form: only the hash is kept, and
  // the secret is recoverable solely from this QR.
  const qr = await QRCode.toDataURL(totpFor(email, totp).toString(), {
    width: 320,
    margin: 2,
  });

  return NextResponse.json({ ok: true, email, password, qr });
}

export async function DELETE(req: NextRequest) {
  const me = await requireEditor();
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let email = '';
  try {
    email = String((await req.json())?.email ?? '')
      .trim()
      .toLowerCase();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // Removing yourself would lock you out of the screen you are standing on.
  if (email === me.toLowerCase())
    return NextResponse.json({ error: 'cannot_remove_self' }, { status: 400 });

  let editors;
  try {
    editors = await resolveEditors();
  } catch (err) {
    if (err instanceof CredentialStoreUnavailable)
      return NextResponse.json({ error: 'store_unavailable' }, { status: 503 });
    throw err;
  }

  const target = editors.find((e) => e.email.toLowerCase() === email);
  if (!target)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // An environment editor would still sign in after being deleted here, so
  // refuse rather than appear to revoke someone who still has access.
  if (!target.removable)
    return NextResponse.json({ error: 'env_editor' }, { status: 400 });

  try {
    await removeEditor(email);
  } catch (err) {
    console.error(`[admin/editors] remove failed for ${email}`, err);
    return NextResponse.json({ error: 'write_failed' }, { status: 502 });
  }

  console.log(`[admin/editors] ${me} removed ${email}`);
  return NextResponse.json({ ok: true });
}
