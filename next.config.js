const createNextIntlPlugin = require('next-intl/plugin')
// next-pwa (previous library, dead since 2024) only injected its SW
// registration script into the Pages Router `main.js` entry — App Router
// never loads that chunk, so the service worker never registered. Migrated
// to @serwist/next, which injects into `main-app` too. Service worker
// source: app/sw.ts (compiled to public/sw.js at build time).
const withSerwist = require('@serwist/next').default({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  register: true,
  // @serwist/next defaults this to true (next-pwa defaulted to false, and
  // this project never opted in). Left at the default, any reconnect
  // anywhere in the app — mid CRM edit, mid booking form, not just POS —
  // would force a full page reload. POS already recovers from a dropped
  // connection reactively (pos-terminal.tsx's own `online` listener +
  // syncQueue()), so there's nothing that needs it.
  reloadOnOnline: false,
  // @serwist/next's precache manifest only ever contains webpack build
  // assets (JS/CSS chunks) — it never includes rendered HTML documents,
  // even for routes marked `force-static`. The `fallbacks` entry in
  // app/sw.ts serves /offline from precache when a navigation fails
  // offline, so without this explicit entry that lookup always misses:
  // the SW's fetch handler rejects with "no-response" and the browser
  // reports the whole navigation as a network error, not just a missed
  // cache — offline hard-reloads fail outright instead of showing the
  // fallback page.
  additionalPrecacheEntries: ['/offline'],
  // Disable in development to avoid confusing caching during dev, and
  // because @serwist/next's webpack plugin doesn't support Turbopack
  // (this repo's `next dev` uses --turbopack).
  disable: process.env.NODE_ENV === 'development',
})

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

// Build the list of allowed origins for Server Actions.
// Always includes localhost (dev) and trypronto.app (SaaS).
// Self-hosted: NEXT_PUBLIC_APP_URL is added automatically so server
// actions work when the app is deployed on a custom domain.
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
const appHost = appUrl ? appUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : null
const allowedOrigins = ['localhost:3000', '*.trypronto.app']
if (appHost && !allowedOrigins.includes(appHost)) {
  allowedOrigins.push(appHost)
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // required for Docker multi-stage build
  agentRules: false, // repo has no CLAUDE.md convention; don't let Next scaffold one
  // Escudería: single barbería ahora, headers críticos (HSTS, CSP, etc.)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // CSP: self + supabase + tailwind CDN is NOT used (next/font), so default-src self is safe
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co" },
        ],
      },
    ]
  },
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
    ],
  },
  async redirects() {
    const domain = process.env.APP_DOMAIN
    if (!domain) return []
    // Redirect www → non-www (301 permanent) to fix Soft 404 in Google Search Console
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: `www.${domain}` }],
        destination: `https://${domain}/:path*`,
        permanent: true,
      },
    ]
  },
}

module.exports = withSerwist(withNextIntl(nextConfig))
