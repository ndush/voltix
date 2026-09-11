import { NextResponse, NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
  const token = req.cookies.get('deriv_token')?.value;

  if (!token && req.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
