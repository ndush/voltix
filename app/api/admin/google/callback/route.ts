import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import {
  createSession,
  isAllowedEmail,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from '@/app/lib/adminAuth';

export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? req.nextUrl.origin;
  const fail = (reason: string) =>
    NextResponse.redirect(`${base}/admin?error=${reason}`);

  const url = req.nextUrl;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const jar = await cookies();
  const savedState = jar.get('g_state')?.value;
  const verifier = jar.get('g_verifier')?.value;

  if (!state || !savedState || state !== savedState) return fail('state');
  if (!code || !verifier) return fail('no_code');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail('not_configured');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${base}/api/admin/google/callback`,
      code_verifier: verifier,
    }),
    cache: 'no-store',
  });

  if (!tokenRes.ok) {
    console.error(
      `[admin/google] token ${tokenRes.status}: ${(await tokenRes.text()).slice(0, 300)}`
    );
    return fail('token');
  }

  const { access_token } = await tokenRes.json();
  if (!access_token) return fail('token');

  // Asking Google directly over TLS avoids having to verify a JWT signature
  // ourselves; the response is trusted because we made the request.
  const infoRes = await fetch(
    'https://openidconnect.googleapis.com/v1/userinfo',
    { headers: { Authorization: `Bearer ${access_token}` }, cache: 'no-store' }
  );
  if (!infoRes.ok) return fail('userinfo');

  const info = (await infoRes.json()) as {
    email?: string;
    email_verified?: boolean;
  };

  // An unverified address proves nothing about who owns it.
  if (!info.email || info.email_verified === false) return fail('unverified');

  if (!isAllowedEmail(info.email)) {
    console.warn(`[admin/google] denied ${info.email}: not in ADMIN_EMAILS`);
    return fail('not_allowed');
  }

  const res = NextResponse.redirect(`${base}/admin`);
  res.cookies.set(SESSION_COOKIE, createSession(info.email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  res.cookies.delete('g_state');
  res.cookies.delete('g_verifier');
  return res;
}
