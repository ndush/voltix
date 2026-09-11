import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET() {
  // Generate PKCE code_verifier and code_challenge
  const codeVerifier = crypto.randomBytes(64).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // Generate state for CSRF protection
  const state = crypto.randomBytes(16).toString('hex');

  // Build OAuth URL with affiliate token (reshare attribution)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.DERIV_APP_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback`,
    // Deriv documents only trade, account_manage, application_read and
    // payment. It does not document offline_access, and an unsupported scope
    // can fail the whole authorize request, so requesting a refresh token is
    // opt-in via DERIV_REQUEST_OFFLINE_ACCESS rather than on by default.
    scope: process.env.DERIV_REQUEST_OFFLINE_ACCESS === '1'
      ? 'trade account_manage offline_access'
      : 'trade account_manage',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    // ---- RESHARE / AFFILIATE ATTRIBUTION ----
    affiliate_token: process.env.DERIV_AFFILIATE_TOKEN!,
    utm_campaign: process.env.DERIV_AFFILIATE_CAMPAIGN!,
    utm_source: 'reshare_site',
    // -----------------------------------------
  });

  const url = `${process.env.DERIV_OAUTH_URL}?${params.toString()}`;

  // Store verifier and state in cookies for callback validation
  const response = NextResponse.json({ url });
  response.cookies.set('pkce_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  return response;
}
