import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { tradingEnabled } from '@/app/lib/affiliate';
import {
  PARTNER_FLOW_COOKIE,
  PARTNER_TOKEN_COOKIE,
} from '@/app/lib/partner';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const cookieStore = await cookies();
  const savedState = cookieStore.get('oauth_state')?.value;
  const codeVerifier = cookieStore.get('pkce_verifier')?.value;

  // One registered redirect serves two flows: the owner connecting their
  // partner account, and (when enabled) a visitor signing in to trade. A
  // cookie set at the start says which is in progress.
  const isPartnerFlow = cookieStore.get(PARTNER_FLOW_COOKIE)?.value === '1';
  const base = process.env.NEXT_PUBLIC_BASE_URL!;

  if (!isPartnerFlow && !tradingEnabled()) {
    return NextResponse.redirect(base);
  }

  // A failed partner connection belongs back in the admin with an
  // explanation, not on the public home page with a raw error code.
  const failTo = (reason: string) =>
    NextResponse.redirect(
      isPartnerFlow
        ? `${base}/admin?connect_error=${reason}`
        : `${base}/?error=${reason}`
    );

  if (error) return failTo(error);
  if (!state || state !== savedState) return failTo('state_mismatch');
  if (!code || !codeVerifier) return failTo('missing_code');

  // Exchange authorization code for access token
  const tokenRes = await fetch(process.env.DERIV_TOKEN_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.DERIV_APP_ID!,
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback`,
      code_verifier: codeVerifier,
    }),
  });

  const data = await tokenRes.json();

  if (!data.access_token) return failTo('token_exchange_failed');

  if (isPartnerFlow) {
    const res = NextResponse.redirect(`${base}/admin?connected=1`);
    res.cookies.set(PARTNER_TOKEN_COOKIE, data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: data.expires_in || 3600,
      path: '/',
    });
    res.cookies.delete('pkce_verifier');
    res.cookies.delete('oauth_state');
    res.cookies.delete(PARTNER_FLOW_COOKIE);
    return res;
  }

  // Set session cookie with access token (httpOnly for security)
  const response = NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`
  );
  const secure = process.env.NODE_ENV === 'production';
  const expiresIn = data.expires_in || 3600;

  response.cookies.set('deriv_token', data.access_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: expiresIn,
    path: '/',
  });
  // Not secret: the client reads this only to schedule a refresh before the
  // access token lapses. The token itself stays httpOnly.
  response.cookies.set(
    'deriv_expires_at',
    String(Date.now() + expiresIn * 1000),
    { httpOnly: false, secure, sameSite: 'lax', maxAge: expiresIn, path: '/' }
  );
  // Only present if Deriv honoured offline_access; see api/auth/refresh.
  if (data.refresh_token) {
    response.cookies.set('deriv_refresh', data.refresh_token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
  }
  // Non-secret flag so the page knows whether a silent refresh is worth
  // attempting. Without it the page would poll an endpoint that can only fail.
  response.cookies.set('deriv_can_refresh', data.refresh_token ? '1' : '0', {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    maxAge: expiresIn,
    path: '/',
  });
  if (!data.refresh_token) {
    console.warn(
      '[auth/callback] no refresh_token issued; session ends at expiry'
    );
  }

  // Clean up temporary cookies
  response.cookies.delete('pkce_verifier');
  response.cookies.delete('oauth_state');

  return response;
}
