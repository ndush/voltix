import { NextResponse, NextRequest } from 'next/server';
import {
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  verifyMagicToken,
} from '@/app/lib/adminAuth';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? undefined;
  const email = verifyMagicToken(token);
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? req.nextUrl.origin;

  if (!email) {
    return NextResponse.redirect(`${base}/admin?error=link_invalid`);
  }

  const res = NextResponse.redirect(`${base}/admin`);
  res.cookies.set(SESSION_COOKIE, createSession(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return res;
}
