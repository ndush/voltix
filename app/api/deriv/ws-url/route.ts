import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';

// Mints a short-lived authenticated WebSocket URL for one trading account.
//
// The Deriv access token stays server-side in an httpOnly cookie and is never
// exposed to the browser. What the browser receives is the OTP-bearing URL,
// which Deriv scopes to a single account, invalidates after one use, and
// expires after 120 seconds.
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('deriv_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  let accountId: string | undefined;
  try {
    accountId = (await req.json())?.account_id;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  if (!accountId || typeof accountId !== 'string') {
    return NextResponse.json({ error: 'account_id_required' }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(
      `${process.env.DERIV_API_BASE}/trading/v1/options/accounts/${encodeURIComponent(
        accountId
      )}/otp`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Deriv-App-ID': process.env.DERIV_APP_ID!,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );
  } catch (err) {
    console.error('[ws-url] network failure', err);
    return NextResponse.json({ error: 'network_error' }, { status: 502 });
  }

  const body = await res.text();

  if (!res.ok) {
    console.error(`[ws-url] upstream ${res.status}: ${body.slice(0, 500)}`);
    return NextResponse.json(
      { error: 'upstream_error', status: res.status },
      { status: res.status === 401 ? 401 : 502 }
    );
  }

  let url: string | undefined;
  try {
    url = JSON.parse(body)?.data?.url;
  } catch {
    console.error(`[ws-url] non-JSON body: ${body.slice(0, 200)}`);
  }

  if (!url) {
    return NextResponse.json({ error: 'no_url_returned' }, { status: 502 });
  }

  return NextResponse.json({ url });
}
