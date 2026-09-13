import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/app/lib/adminAuth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  // Overwrite then expire, so the cookie is gone even if a client ignores
  // deletion semantics.
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });
  return res;
}
