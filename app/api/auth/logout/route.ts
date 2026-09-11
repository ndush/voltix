import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete('deriv_token');
  cookieStore.delete('deriv_refresh');
  cookieStore.delete('deriv_expires_at');
  cookieStore.delete('deriv_can_refresh');
  return NextResponse.json({ ok: true });
}
