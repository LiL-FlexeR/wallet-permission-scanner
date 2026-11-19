import type { NextConfig } from 'next';
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_SERVER,
} from 'next/constants.js';
import { validateWebEnvironment } from './src/server/environment';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
  // The API destination is read at server startup, never in a build-time rewrite.
};

export default function configuration(phase: string): NextConfig {
  // Next may load instrumentation lazily. Configuration runs before the server
  // listens, so a production artifact also fails immediately on an invalid target.
  if ([PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_SERVER].includes(phase)) {
    validateWebEnvironment(process.env);
  }
  return nextConfig;
}
