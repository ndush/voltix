import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

type Account = {
  account_id?: string;
  balance?: number;
  currency?: string;
  account_type?: string;
  status?: string;
};

// Deriv's OpenAPI spec declares `balance` as a number, but the API returns it
// as a string ("10000.00"). Coerce at the boundary so the rest of the app can
// treat it as a number, and so a future change back to a real number is a
// no-op rather than a crash.
function coerce(a: Record<string, unknown>): Account {
  const raw = a.balance;
  const n = typeof raw === 'string' ? parseFloat(raw) : (raw as number);
  return {
    ...(a as Account),
    balance: Number.isFinite(n) ? n : undefined,
  };
}

// Deriv has not published the response envelope for this endpoint, and it has
// changed shape before. Accept a bare array, a { data: [...] } wrapper, or a
// single object, so a future change degrades to an empty list instead of a
// crash.
function toAccounts(payload: unknown): Account[] {
  if (Array.isArray(payload)) return payload.map(coerce);
  if (payload && typeof payload === 'object') {
    for (const key of ['data', 'accounts', 'result']) {
      const inner = (payload as Record<string, unknown>)[key];
      if (Array.isArray(inner)) return inner.map(coerce);
    }
    if ('balance' in (payload as object))
      return [coerce(payload as Record<string, unknown>)];
  }
  return [];
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('deriv_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  let res: Response;
  try {
    res = await fetch(
      `${process.env.DERIV_API_BASE}/trading/v1/options/accounts`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Deriv-App-ID': process.env.DERIV_APP_ID!,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );
  } catch (err) {
    console.error('[auth/me] network failure', err);
    return NextResponse.json({ error: 'network_error' }, { status: 502 });
  }

  const body = await res.text();

  if (!res.ok) {
    // Surface the upstream status so an expired token (401) is
    // distinguishable from a scope problem (403) or an outage (5xx).
    console.error(`[auth/me] upstream ${res.status}: ${body.slice(0, 500)}`);
    return NextResponse.json(
      { error: 'upstream_error', status: res.status },
      { status: res.status === 401 ? 401 : 502 }
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.error(`[auth/me] non-JSON body: ${body.slice(0, 200)}`);
    return NextResponse.json({ error: 'bad_upstream_body' }, { status: 502 });
  }

  const accounts = toAccounts(parsed);
  if (accounts.length === 0) {
    console.error(
      `[auth/me] no accounts parsed; top-level keys: ${
        parsed && typeof parsed === 'object'
          ? Object.keys(parsed).join(',')
          : typeof parsed
      }`
    );
  }

  return NextResponse.json({ accounts });
}
