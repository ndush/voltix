import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const cookieStore = await cookies();
  const savedState = cookieStore.get('oauth_state')?.value;
  const codeVerifier = cookieStore.get('pkce_verifier')?.value;

  // Validate CSRF state
  if (!state || state !== savedState) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/?error=state_mismatch`
    );
  }

  if (error || !code || !codeVerifier) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/?error=${error || 'missing_code'}`
    );
  }

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

  if (!data.access_token) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/?error=token_exchange_failed`
    );
  }

  // Set session cookie with access token (httpOnly for security)
  const response = NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`
  );
  response.cookies.set('deriv_token', data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: data.expires_in || 3600,
    path: '/',
  });

  // Clean up temporary cookies
  response.cookies.delete('pkce_verifier');
  response.cookies.delete('oauth_state');

  return response;
}
