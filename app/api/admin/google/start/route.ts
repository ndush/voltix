import { NextResponse, NextRequest } from 'next/server';
import crypto from 'crypto';

/**
 * Begins Google sign-in.
 *
 * Google is used only to prove who the visitor is. Whether that person may
 * edit anything is decided against ADMIN_EMAILS in the callback, so signing in
 * with any Google account is harmless.
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json({ error: 'google_not_configured' }, { status: 503 });
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? req.nextUrl.origin;
  const state = crypto.randomBytes(16).toString('hex');
  const verifier = crypto.randomBytes(64).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${base}/api/admin/google/callback`,
    response_type: 'code',
    scope: 'openid email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // Always show the chooser: an admin machine often has several accounts
    // signed in, and silently reusing the first one is confusing.
    prompt: 'select_account',
  });

  const res = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  );
  const cookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 600,
    path: '/',
  };
  res.cookies.set('g_state', state, cookie);
  res.cookies.set('g_verifier', verifier, cookie);
  return res;
}
