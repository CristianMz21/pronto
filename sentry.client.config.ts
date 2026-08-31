// Sentry client config — scaffolded, inactive until NEXT_PUBLIC_SENTRY_DSN is set.
// See docs/sentry-evaluation.md for activation steps.
// This file is safe to keep: Sentry.init is a no-op when `enabled` is false.

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Only enable when DSN is present — keeps bundle cost zero in dev/selfhosted without Sentry.
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance: sample 10% of transactions; set to 0 to disable.
  tracesSampleRate: 0.1,

  // Session Replay: disabled by default (privacy + bundle). Enable selectively.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.1,

  // Offline POS: queue events while offline, send on reconnect (uses IndexedDB under the hood).
  // No conflict with lib/offline-db.ts — different DB name.
  // transport: Sentry.makeBrowserOfflineTransport(Sentry.makeFetchTransport),

  // Filter noisy errors (e.g. ResizeObserver, chunk load fails offline)
  beforeSend(event) {
    const msg = event.exception?.values?.[0]?.value ?? ''
    if (msg.includes('ResizeObserver loop')) return null
    if (msg.includes('Loading chunk')) return null
    return event
  },

  // Uncomment for GlitchTip self-hosted: DSN already points there, nothing else needed.
  // tunnel: "/monitoring", // requires `tunnelRoute` in withSentryConfig
})
