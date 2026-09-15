import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { readSession, SESSION_COOKIE } from '@/app/lib/adminAuth';
import { PARTNER_FLOW_COOKIE, PARTNER_SCOPE } from '@/app/lib/partner';

/** Starts the owner's Deriv connection. Admin-only: this is their own data. */
export async function GET(req: NextRequest) {
  const editor = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!editor)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? req.nextUrl.origin;
  const verifier = crypto.randomBytes(64).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.DERIV_APP_ID!,
    // The redirect already registered with Deriv, so connecting needs no
    // change in their dashboard. The callback tells the flows apart.
    redirect_uri: `${base}/api/auth/callback`,
    scope: PARTNER_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  const res = NextResponse.redirect(
    `${process.env.DERIV_OAUTH_URL}?${params.toString()}`
  );
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 600,
    path: '/',
  };
  res.cookies.set('pkce_verifier', verifier, opts);
  res.cookies.set('oauth_state', state, opts);
  res.cookies.set(PARTNER_FLOW_COOKIE, '1', opts);
  return res;
}
