import { NextResponse, NextRequest } from 'next/server';
import { SESSION_COOKIE, readSession } from '@/app/lib/adminAuth';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ---- Admin area ----
  // The login and logout routes must stay reachable without a session.
  const isAuthRoute =
    pathname === '/api/admin/login' || pathname === '/api/admin/logout';

  if (!isAuthRoute && (pathname.startsWith('/admin') || pathname.startsWith('/api/admin'))) {
    const email = readSession(req.cookies.get(SESSION_COOKIE)?.value);

    if (!email) {
      // The page renders its own sign-in form; API calls get a status.
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
      return NextResponse.next();
    }

    const headers = new Headers(req.headers);
    headers.set('x-admin-email', email);
    return NextResponse.next({ request: { headers } });
  }

  // ---- Trading dashboard: requires a Deriv session ----
  if (!req.cookies.get('deriv_token')?.value && pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/api/admin/:path*'],
};
