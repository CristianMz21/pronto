# Sentry Evaluation — Offline POS (Escudero / Pronto)

> Decision record for adding error monitoring to the Next.js 16 PWA. Scaffold is already
> in place (`sentry.client.config.ts`, `sentry.server.config.ts`, `@sentry/nextjs` installed).
> Activation is opt-in via `NEXT_PUBLIC_SENTRY_DSN`.

## 1. Options Compared

| Criteria | Sentry SaaS (sentry.io) | GlitchTip (self-hosted, Sentry API-compatible) | Self-hosted Sentry |
|---|---|---|---|
| **Hosting** | Managed, global edge | Self-hosted Docker (single container + Postgres) | Heavy (Kafka, Snuba, etc.) |
| **Setup effort** | `withSentryConfig` + DSN | Same SDK, point DSN to `https://glitchtip.your-domain` | Complex infra |
| **Bundle cost** | ~25–35 kB gzipped (client) tree-shakable; lazy-load via `tunnelRoute` | Identical (same SDK) | Identical |
| **Offline / POS** | Queues events in IndexedDB, sends on reconnect (offline-friendly) | Same — but you control data residency | Same |
| **Privacy** | Data leaves EU? Configurable region (`us`/`eu`/`de`) | Data stays on your VPS | Data stays on your VPS |
| **Pricing** | Free 5k events/mo, then $26/mo | Free (your infra) | Free but infra cost high |
| **Maintenance** | Zero | Low: one container, auto-upgrade | High |
| **Alerting** | Full (Slack, email, PagerDuty) | Subset (email, Slack) but enough for barbershop scale | Full |

**Recommendation for this project (single barbershop, offline-first POS):**

- **Default: GlitchTip** — fits the self-hosted story (`NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted`), no data leaves the barbershop's VPS, one extra Docker service.
- **Acceptable alternative: Sentry SaaS `eu` region** — if you prefer zero ops. Use `tunnelRoute` to avoid ad-blockers and set `tracesSampleRate: 0.1`.
- **Avoid full self-hosted Sentry** unless you already run Kafka/ClickHouse.

## 2. Bundle & Runtime Cost

- `@sentry/nextjs` 8.x: ~70 kB client (uncompressed), ~22 kB gzipped. With `tunnelRoute` + `autoInstrument: false`, effective cost ~18 kB.
- Server: zero bundle impact (Node import only).
- Performance: no effect on Lighthouse if `tracesSampleRate` ≤ 0.2 and `replaysSessionSampleRate: 0`.
- Offline queue: Sentry uses `IndexedDB` when `offline` — same DB as `lib/offline-db.ts`, no conflict.

## 3. Setup Steps (already scaffolded)

All files below exist but are **inactive** until a DSN is set. See inline comments.

1. **Install** (done):
   ```bash
   npm install @sentry/nextjs
   ```

2. **Client config** — `sentry.client.config.ts`:
   ```ts
   import * as Sentry from "@sentry/nextjs";
   Sentry.init({
     dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, // unset => no-op
     tracesSampleRate: 0.1,
     replaysSessionSampleRate: 0,
     enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
   });
   ```

3. **Server config** — `sentry.server.config.ts` (same guard).

4. **Next.js wrapper** — `next.config.js`:
   ```js
   // Uncomment when DSN is ready:
   // const { withSentryConfig } = require("@sentry/nextjs");
   // module.exports = withSentryConfig(withSerwist(withNextIntl(withBundleAnalyzer(nextConfig))), { silent: true })
   //
   // Alternative for GlitchTip: set SENTRY_DSN to your instance URL; nothing else changes.
   ```

5. **Env**:
   ```
   NEXT_PUBLIC_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
   # or GlitchTip:
   NEXT_PUBLIC_SENTRY_DSN=https://<key>@glitchtip.trypronto.app/<id>
   SENTRY_AUTH_TOKEN=... # only for sourcemap upload in CI
   ```

6. **CI sourcemaps** (optional, after DSN):
   ```yaml
   - run: npx sentry-cli sourcemaps upload .next --auth-token $SENTRY_AUTH_TOKEN --org ... --project ...
   ```

7. **Verify**:
   ```bash
   NEXT_PUBLIC_SENTRY_DSN=https://... npm run build && npm run start
   # trigger error: curl http://localhost:3000/api/debug-sentry
   ```

## 4. Activation Checklist

- [ ] Choose SaaS vs GlitchTip and create project
- [ ] Set `NEXT_PUBLIC_SENTRY_DSN` in `.env.local` and in deployment secrets
- [ ] Uncomment `withSentryConfig` in `next.config.js`
- [ ] Set `tracesSampleRate` and `replaysSessionSampleRate` per cost preference
- [ ] Add `tunnelRoute: "/monitoring"` in `withSentryConfig` to bypass ad-blockers
- [ ] Verify offline queue: go offline, trigger error, go online, see event appear
- [ ] (Optional) Wire `sentry-cli` sourcemap upload in CI

## 5. Why Not Enabled by Default

- No DSN is set — SDK is a no-op without it, so installing it does not affect bundle in production until you add the env var.
- POS offline flow already handles `online` recovery; Sentry's offline transport is complementary, not required for correctness.
- Keeping `withSentryConfig` commented avoids an extra webpack plugin in the Docker build until you opt in.

## 6. Alternative: No Sentry

If you prefer zero extra bundle, keep the current `console.error` + server logs and add a lightweight `/api/health` + Uptime Kuma check. This is sufficient for a single shop but loses stack traces and breadcrumbs.
