import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Exchanges a stored refresh token for a new access token.
//
// Deriv's OAuth guide documents neither a refresh_token in the token response
// nor an offline_access scope, so this only works if their Ory-backed server
// issues one when asked (see DERIV_REQUEST_OFFLINE_ACCESS in api/auth/url).
// When no refresh token was issued the route reports `no_refresh_token` and
// the client falls back to a fresh login.
export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get('deriv_refresh')?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: 'no_refresh_token' }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(process.env.DERIV_TOKEN_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.DERIV_APP_ID!,
        refresh_token: refreshToken,
      }),
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[auth/refresh] network failure', err);
    return NextResponse.json({ error: 'network_error' }, { status: 502 });
  }

  const body = await res.text();

  if (!res.ok) {
    console.error(
      `[auth/refresh] upstream ${res.status}: ${body.slice(0, 300)}`
    );
    return NextResponse.json({ error: 'refresh_failed' }, { status: 401 });
  }

  let data: {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  try {
    data = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'bad_upstream_body' }, { status: 502 });
  }

  if (!data.access_token) {
    return NextResponse.json({ error: 'no_access_token' }, { status: 502 });
  }

  const expiresIn = data.expires_in ?? 3600;
  const response = NextResponse.json({ ok: true, expires_in: expiresIn });
  const secure = process.env.NODE_ENV === 'production';

  response.cookies.set('deriv_token', data.access_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: expiresIn,
    path: '/',
  });
  // Readable by the client purely so it can schedule a refresh before expiry.
  response.cookies.set(
    'deriv_expires_at',
    String(Date.now() + expiresIn * 1000),
    { httpOnly: false, secure, sameSite: 'lax', maxAge: expiresIn, path: '/' }
  );
  // Deriv may rotate the refresh token; store the new one when it does.
  if (data.refresh_token) {
    response.cookies.set('deriv_refresh', data.refresh_token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
  }

  return response;
}
