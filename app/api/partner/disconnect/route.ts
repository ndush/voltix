import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readSession, SESSION_COOKIE } from '@/app/lib/adminAuth';
import { PARTNER_TOKEN_COOKIE } from '@/app/lib/partner';

export async function POST() {
  const editor = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!editor)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PARTNER_TOKEN_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return res;
}
