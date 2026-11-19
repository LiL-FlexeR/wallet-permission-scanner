import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

/** Request-scoped nonces authorize only framework-authored scripts. */
export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString('base64');
  const development = process.env.NODE_ENV === 'development';
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-inline'" : ''}`,
    "style-src-attr 'none'",
    `connect-src 'self'${development ? ' ws: wss:' : ''}`,
    "img-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  const headers = new Headers(request.headers);
  // Overwrite caller input; Next extracts this nonce during dynamic rendering.
  headers.set('Content-Security-Policy', policy);
  headers.delete('x-nonce');
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = {
  matcher: ['/((?!api(?:/|$)|_next/static|_next/image|favicon.ico).*)'],
};
