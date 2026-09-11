import { NextResponse, NextRequest } from 'next/server';
import {
  createSession,
  passwordMatches,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from '@/app/lib/adminAuth';

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
    console.error('[admin/login] ADMIN_PASSWORD or SESSION_SECRET is not set');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  let password = '';
  try {
    password = (await req.json())?.password ?? '';
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  if (!passwordMatches(password)) {
    // Slow a scripted guesser without holding a real user up noticeably.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: 'invalid_password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return res;
}
