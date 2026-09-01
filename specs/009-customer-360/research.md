# Research: Customer 360

**Branch**: `009-customer-360` | **Date**: 2026-09-01

## Summary

Auditoría de `app/client` vs `app/(client)`, gaps 12/23, decisiones `qrcode` y PSP stub.

## Findings

### 1. Dual Portal Audit

- `app/client/page.tsx:45-59` `findLinkedClient` / `61-81` `findClientByPhone` → anon `?phone=` muestra solo `loyalty/memberships`. No historial staff.
- `app/(client)/client/dashboard/page.tsx:60-67` auth `user_id` → upcoming/history via `appointments` + `transactions`. Duplicado, no 360.
- Decisión: unificar en `app/(client)/client/me` con `GET /api/client/me` que resuelve por `phone` (anon) o `user_id` (auth) → 360.

### 2. Booking & Payments

- `app/book/[slug]/booking-form.tsx:700-727` Any barber ya; `app/api/book:290-321` `no_staff_available` bien.
- `drizzle/schema.ts:529` permite `online` pero `app/api/pos/transaction:11` rechaza → booking sin cobro.
- Decisión: V1 stub `payment_status` sin PSP; V2 Bold/Wompi.

### 3. QR Check-in

- Opciones: `qrcode` npm 30kB vs `canvas` manual vs server SVG.
- `qrcode` elegido: tipos TS, 0 CVE, genera `toDataURL` y `toCanvas` tanto server (API) como client (component), probado con `hooks/useBarcodeScanner.ts` para staff scan.
- Alternativa `canvas` rechazada: más código, sin tests.

### 4. Fotos/Styles Storage

- `supabase/config.toml:123` `file_size_limit 50MiB` global, pero bucket `client-styles` necesita `5MB` + `public false`.
- Reusar `inventory` bucket rechazado: RLS `inventory_items.is_active` vs `client_styles` private diff.

### 5. Gift Cards

- `promotions.value` fijo no sirve para saldo; `gift_cards` NUEVA tabla con `balance` requerido. V1 solo schema, flujo compra V2.

### 6. Why Not PSP V1

- Ver `plan.md` ADR: rompería `appointments.status=confirmed` → `pending_payment` + webhook PCI. Posponer.

### 7. Constitution Alignment

- Ver `plan.md` gates I-VII todos PASS.

## Open Questions Resolved

- Slice1 incluye Check-in+Reviews: **Sí** (user 2026-09-01).
- Root priority: ya `app/page.tsx:130` → `/book/escuderia` client-first, mantener.

## References

- `drizzle/schema.ts:219` clients
- `supabase/migrations/039_appointment_fsm.sql`
- `lib/waitlist.ts:1` TTL 30m
- `lib/loyalty.ts:31`
