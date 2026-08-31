// Sentry server config — scaffolded, inactive until NEXT_PUBLIC_SENTRY_DSN is set.
// See docs/sentry-evaluation.md for activation steps.

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,

  // Do not capture console or HTTP breadcrumbs in tests
  beforeSend(event) {
    if (process.env.NODE_ENV === 'test') return null
    return event
  },
})
