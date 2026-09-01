# Testing — Pronto Barber

> `npm run lint` + `npm run test:unit` (vitest jsdom) + `npm run test:e2e` (playwright) — ver `specs/006-barberia-saas-integral/quickstart.md` para verificación por US.

## Unit (vitest `tests/unit/`)

- `booking-availability.test.ts` + `booking-lead-time.test.ts` + `booking-availability-strict.test.ts`: `checkSlotWithinHours`, breaks, holidays, `isTooSoonMinutes`.
- `waitlist.test.ts`: `canEnqueue`, `isExpired` 30m window.
- `recurring.test.ts`: `RRule` parse `FREQ=WEEKLY;COUNT=6` + `buildOccurrencesWithEnd` + skip on conflict.
- `memberships.test.ts` / `promotions.test.ts` / `loyalty.test.ts` / `tips.test.ts` / `cash-register.test.ts` / `commission-strict.test.ts` / `inventory-transfer.test.ts`.
- `reports.test.ts`: `avgTicket = sum/ count`, `topBarbers` sort, `newVsReturning`.
- `campaigns` + `auth-user-strict` + `rate-limit-strict` + `offline-db-strict`.
- **Customer 360 (009)**: `preferences.test.ts` (cut/length/clipper/beard merge, validate), `favorites.test.ts` (toggle + nextAvailability), `qrcode.test.ts` (nanoid 8, toDataURL), `client-360.test.ts` (getClient360 Promise.all upcoming/history/loyalty/memberships/favorites/styles/reviews/transactions/promotions), `checkin.test.ts` (FSM confirmed→checked_in, completed→checked_in 409), `reviews.test.ts` (rating 1-5, tags, unique), `styles.test.ts` (5MB pass, 6MB fail, is_favorite), `loyalty-client.test.ts` (canRedeem, 120pts→redeem 100), `booking-availability-client.test.ts` (Any barber auto-assign, no_staff_available 409).

```bash
npm run test:unit          # all suites, coverage thresholds lines 80 / branches 75
npm run test:unit -- -t booking-availability  # single suite
vitest run --coverage       # coverage dir
```

## Integration (supabase + RLS) — `tests/integration/` or unit with mocks

- `barber-scope.test.ts`: barbero cannot read other appointments/commissions/cash_registers (058 RLS).
- `appointments-fsm.test.ts`: PATCH move/change validates `check_barber_availability` (040) + `enforce_fsm` (039/047).
- `locations-rls.test.ts`: anon cannot read locations; manager Norte cannot read cash Centro (stub V1).
- `waitlist.test.ts`: enqueue → cancel → notified → converted → expire 30m.

## E2E (Playwright `tests/e2e/`)

```bash
npx playwright install --with-deps
npm run test:e2e
npm run test:e2e -- tests/e2e/client-360.spec.ts
```

Flujos:

- `booking.spec.ts`: mobile 375px `book/escuderia` servicio→barbero→fecha→hora→nombre+tel → 201 confirmed → cancel token libera slot.
- `dashboard.spec.ts`: GET /dashboard p95 <2s SSR; filtro `?location=centro` sin cross-leak; reportes export xlsx.
- `waitlist-recurring.spec.ts`: waitlist enqueue→cancel→notify ≤60s → convert; `rrule FREQ=WEEKLYx6` con skip; holiday bloquea picker; tips report.
- `multilocation.spec.ts`: create location → inventory transfer Centro→Norte atómico → manager Norte 403 en Centro → reportes breakdown.
- **Customer 360 (009) `client-360.spec.ts`**: phone OTP → Inicio 360 (`GET /api/client/me` upcoming+history) → Historial → Rebook `?service=&employee=` prefill → Reprogram/Cancel 2h → Check-in `Estoy aquí` → staff `in_service→completed` → Review 5★ → Estilo/Favoritos → waitlist notified → pagos deposit stub.

Manual cuando Playwright no disponible: `specs/006-barberia-saas-integral/quickstart.md` US1..US7 + `docker compose up` + `curl /api/health`.

## Lint & Types

```bash
npm run lint   # eslint flat config: 2 errors = <a> vs <Link> fix; 48 warnings = set-state-in-effect (deferred)
npm run build  # next build (standalone) — must pass; verifies public/sw.js + /offline precache
npx tsc --noEmit
supabase gen types typescript --local > lib/supabase/database.types.ts
```

## Customer 360 quickstart (009)

Ver `specs/009-customer-360/quickstart.md`: `supabase db reset --local` → `curl /api/client/me?phone=+57..` → `POST /api/book Any barber` → `POST /api/client/check-in` → `POST /api/reviews` → `PUT /api/client/preferences` → `POST /api/client/favorites` → `POST /api/client/styles` → `npm run test:e2e -- tests/e2e/client-360.spec.ts`.

## Coverage gate

`vitest.config.ts` thresholds `lines 80 / branches 75` sobre `lib/**/*.ts, app/**/*.ts, proxy.ts`. Fallo bloquea `specify check` en `sdd-verify`. 009 Foundational `preferences+favorites+qrcode+client-360` ≥80%.

## Offline POS + PWA

- `GET /client/me` offline via `sw.ts` `supabase-data NetworkFirst` + `additionalPrecacheEntries ['/offline']` muestra cached `upcoming` (Serwist fallbacks `/offline`). QR offline not needed (signed `toDataURL` generated client-side, print-friendly).
- 5 ventas offline → online → `syncQueue` sin pérdida (`lib/offline-db.ts:pending_transactions` IndexedDB). Ver `app/offline/page.tsx` + `sw.ts` + `pos-terminal.tsx` online listener. Test manual: DevTools → offline → POS 5 ventas → online → check `transactions` + `pending_transactions` cleared.

5 ventas offline → online → `syncQueue` sin pérdida (`lib/offline-db.ts:pending_transactions` IndexedDB). Ver `app/offline/page.tsx` + `sw.ts` + `pos-terminal.tsx` online listener. Test manual: DevTools → offline → POS 5 ventas → online → check `transactions` + `pending_transactions` cleared.
