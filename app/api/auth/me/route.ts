import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('deriv_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  try {
    const res = await fetch(
      `${process.env.DERIV_API_BASE}/trading/v1/options/accounts`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Deriv-App-ID': process.env.DERIV_APP_ID!,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!res.ok) {
      throw new Error('Failed to fetch account');
    }

    const accounts = await res.json();
    return NextResponse.json({ accounts });
  } catch {
    return NextResponse.json({ error: 'api_error' }, { status: 500 });
  }
}
