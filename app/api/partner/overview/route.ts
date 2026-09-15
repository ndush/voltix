import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { readSession, SESSION_COOKIE } from '@/app/lib/adminAuth';
import { PARTNER_TOKEN_COOKIE, toOverview } from '@/app/lib/partner';

/** Deriv wants plain dates; default to the last 30 days. */
function range(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const days = Math.min(Math.max(Number(q.get('days') ?? 30), 1), 365);
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start_date: iso(start), end_date: iso(end), days };
}

export async function GET(req: NextRequest) {
  const editor = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!editor)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value;
  if (!token)
    return NextResponse.json({ error: 'not_connected' }, { status: 409 });

  const { start_date, end_date, days } = range(req);
  const url =
    `${process.env.DERIV_API_BASE}/partners/analytics/v1/overview` +
    `?start_date=${start_date}&end_date=${end_date}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Deriv-App-ID': process.env.DERIV_APP_ID!,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[partner/overview] network failure', err);
    return NextResponse.json({ error: 'network_error' }, { status: 502 });
  }

  const body = await res.text();

  if (res.status === 401 || res.status === 403) {
    // The connection has lapsed or the scope was refused; ask for it again
    // rather than showing stale or empty figures as if they were real.
    return NextResponse.json({ error: 'reconnect_needed' }, { status: 409 });
  }

  if (!res.ok) {
    console.error(`[partner/overview] upstream ${res.status}: ${body.slice(0, 300)}`);
    return NextResponse.json(
      { error: 'upstream_error', status: res.status },
      { status: 502 }
    );
  }

  try {
    const parsed = JSON.parse(body);
    // Deriv wraps some responses in `data`; accept either shape.
    const raw = parsed?.data ?? parsed;
    return NextResponse.json({ overview: toOverview(raw), days });
  } catch {
    console.error(`[partner/overview] bad body: ${body.slice(0, 200)}`);
    return NextResponse.json({ error: 'bad_upstream_body' }, { status: 502 });
  }
}
