/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // appDir is now stable in Next.js 14
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY || 'dashboard-key',
  },
  // Enable strict mode
  reactStrictMode: true,
  // Optimize for production
  swcMinify: true,
  // Enable image optimization
  images: {
    domains: [],
  },
  // Enable async/await
  transpilePackages: [],
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;