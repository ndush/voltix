import { NextResponse, NextRequest } from 'next/server';
import { createMagicToken, isAllowedEmail } from '@/app/lib/adminAuth';
import { sendMagicLink } from '@/app/lib/email';

export async function POST(req: NextRequest) {
  if (!process.env.SESSION_SECRET || !process.env.ADMIN_EMAILS) {
    console.error('[admin] SESSION_SECRET or ADMIN_EMAILS is not set');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  let email = '';
  try {
    email = (await req.json())?.email ?? '';
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  // Whether an email provider exists is a property of the deployment, not of
  // the address, so it is reported either way. Anything that varied with the
  // address would let someone enumerate who can administer the site.
  const emailNotConfigured = !process.env.RESEND_API_KEY;
  const generic = NextResponse.json({ ok: true, emailNotConfigured });

  if (!isAllowedEmail(email)) {
    await new Promise((r) => setTimeout(r, 600));
    return generic;
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? req.nextUrl.origin;
  const link = `${base}/api/admin/verify?token=${encodeURIComponent(
    createMagicToken(email)
  )}`;

  await sendMagicLink(email, link);
  return generic;
}
