import { NextResponse, NextRequest } from 'next/server';
import { authenticate, CHALLENGE, adminUsers } from '@/app/lib/basicAuth';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ---- Admin area: HTTP Basic Auth ----
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    // Basic Auth puts the password on the wire with every request, so refuse
    // to accept one over plaintext. Vercel always terminates TLS; this guards
    // against a misconfigured self-hosted deployment.
    const proto = req.headers.get('x-forwarded-proto');
    if (process.env.NODE_ENV === 'production' && proto && proto !== 'https') {
      return new NextResponse('HTTPS required', { status: 403 });
    }

    if (adminUsers().length === 0) {
      return new NextResponse(
        'Admin is not configured. Set ADMIN_USERS in the environment.',
        { status: 503 }
      );
    }

    const email = authenticate(req.headers.get('authorization'));
    if (!email) {
      return new NextResponse('Authentication required', {
        status: 401,
        headers: CHALLENGE,
      });
    }

    // Pass the identity downstream so a save can be attributed to a person.
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
