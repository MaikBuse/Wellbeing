import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Required by the Dockerfile: ships a self-contained server.js.
  output: 'standalone',
  // postgres.js must stay out of the bundler — it is a runtime-only dependency.
  serverExternalPackages: ['postgres'],
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Traffic arrives browser -> LAN-LB Traefik -> cluster Traefik -> pod.
      // Without this, Next compares the Action request Origin against the
      // internal host and rejects every form submission with a 403.
      allowedOrigins: ['wellbeing.int.buse.io'],
    },
  },
  async headers() {
    return [
      {
        // A cached service worker can pin itself for a very long time.
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
