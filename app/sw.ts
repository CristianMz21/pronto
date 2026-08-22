/// <reference lib="webworker" />
/**
 * Serwist service worker source. Compiled and injected by @serwist/next's
 * webpack plugin (see next.config.js) into public/sw.js at build time.
 *
 * next-pwa (previous library) only ever injected its registration script
 * into the Pages Router `main.js` entry, which App Router never loads — the
 * service worker registered nowhere, silently, since day one. @serwist/next
 * injects into both `main.js` and `main-app` entries, so this actually runs
 * under App Router.
 */
import { defaultCache } from '@serwist/next/worker'
import { ExpirationPlugin, NetworkFirst, Serwist } from 'serwist'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    // Cache Supabase API responses (stale-while-revalidate for freshness).
    // Not covered by defaultCache below — everything else in the old
    // next-pwa runtimeCaching config (fonts, /_next/static/*) is already
    // handled, more thoroughly, by @serwist/next's defaultCache.
    {
      matcher: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
      handler: new NetworkFirst({
        cacheName: 'supabase-data',
        networkTimeoutSeconds: 10,
        plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher({ request }) {
          return request.destination === 'document'
        },
      },
    ],
  },
})

serwist.addEventListeners()
