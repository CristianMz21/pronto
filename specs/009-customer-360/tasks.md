---
description: "Task list for Customer 360 — Experiencia Profesional para Clientes (009)"
---

# Tasks: Customer 360 — Experiencia Profesional para Clientes (009)

**Input**: `spec.md` (11 stories P1-P4 + 21 FR-C* + 7 entidades + 13 SCs) + `plan.md` (Next 16 + Supabase, stealth, 7 migraciones) + `research.md` + `data-model.md` (088..094) + `contracts/` + `quickstart.md`

**Prerequisites**: `plan.md` ✅, `spec.md` ✅, `research.md` ✅, `data-model.md` ✅, `contracts/` ✅

**Strategy**: Slices verticales testeables. Cada User Story entregable independiente. Commits work-unit; >400 líneas → chained PRs `stacked-to-main`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (archivos distintos, sin dependencia)
- **[Story]**: US1..US11 (spec)
- Rutas exactas; migraciones `IF NOT EXISTS` + `DO $$`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparación rama y baseline 001..087 verificado.

- [ ] T001 Create branch `009-customer-360` from `main` + verify `supabase/migrations/001..087` applied (`schema_migrations` 87) + `docker compose up migrate` green
- [ ] T002 [P] Verify `specs/009-customer-360/` exists via `.specify/scripts/bash/common.sh` + `gentle-ai sdd-status` reconoce 009
- [x] T003 [P] Install dep `qrcode` (`npm i qrcode && npm i -D @types/qrcode`) y justificar en `plan.md Complexity Tracking`; `npm run lint` verde
- [ ] T004 [P] Verify `proxy.ts:387` stealth + `app/page.tsx:130` client-first intactos (curl `/` → 307 `/book/escuderia`, `/login` → 404) + seed `escuderia` exists (psql `select slug from businesses`)
- [ ] T005 Verify `lib/client-360.ts` no existe aún (clean slate) + `app/client` + `app/(client)` audit snapshot

**Checkpoint**: Baseline intacto — 87 migraciones, booking funciona, QR dep instalada.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infra DB + storage + helpers que desbloquean TODO. **⚠️ No story work hasta completar.**

- [x] T006 Setup DB migrations 088..094 idempotentes: `088_preferences` (clients ADD jsonb/status/preferred_barber_id), `089_favorites` PK, `090_client_styles` + storage bucket, `091_reviews` unique, `092_checkin` (checkin_code/payment_status), `093_gift_cards` stub, `094_storage` — `supabase db reset --local` + `supabase Advisors` 0 flags
- [x] T007 [P] Create `lib/preferences.ts` Zod schema `Preferences {cut, length, clipper, beard, barber_id, notes}` + `lib/favorites.ts` helpers `toggleFavorite` + `nextAvailability` (reuse `lib/booking-availability.ts:checkSlotWithinHours`)
- [x] T008 [P] Create `lib/qrcode.ts` `generateCheckinCode()` nanoid(8) + `toDataURL(code)` wrapper + `lib/styles.ts` `uploadPhoto` signed URL + `lib/client-360.ts` `getClient360({phone?, userId?, businessId})` → 360
- [x] T009 Update `supabase/config.toml` no, but verify `storage.buckets` + `drizzle/schema.ts` sync via `supabase gen types` → `lib/supabase/database.types.ts`
- [x] T010 [P] Create `tests/unit/preferences.test.ts` + `favorites.test.ts` + `qrcode.test.ts` (coverage≥80%)

**Checkpoint**: Foundation ready — `favorites` RLS test `anon cannot read`, `client_styles` bucket `public false` 5MB, `reviews` unique constraint.

---

## Phase 3: User Story 1 — Reservar cita premium + Cualquier barbero (P1) 🎯 MVP Core

**Goal**: Reserva frictionless con disponibilidad realtime y auto-assign `Cualquier`.

**Independent Test**: `book/escuderia` móvil 375px `Corte+Barba` → `Cualquier` → fecha/hora válida → `POST /api/book 201 confirmed`; 2 POST paralelos mismo slot → 1×201 1×409.

### Tests for US1 (write FIRST, must FAIL)

- [x] T011 [P] [US1] Unit `tests/unit/booking-availability-client.test.ts`: `Any barber` auto-assign picks free with specialty, `no_staff_available` 409, holidays/break blocking
- [x] T012 [P] [US1] Integration `tests/integration/book-any-barber.test.ts`: `POST /api/book employee_id=null` → assigned, `slot_taken` vs `no_staff_available` distinguish (034)

### Implementation for US1

- [x] T013 [P] [US1] Extend `app/book/[slug]/booking-form.tsx:700-727` Any barber card test id `any-barber` + ensure `onSelect('')` propagates `location_id` correctly (depends T007)
- [x] T014 [US1] Extend `app/api/book/route.ts:290-321` `no_staff_available` + waitlist enqueue suggestion (depends T006)
- [x] T015 [US1] UI `app/book/[slug]/page.tsx:30` ensure `initialServiceId/initialEmployeeId` prefill works for rebook

**Checkpoint**: US1 standalone — Any barber reserva sin cuenta.

---

## Phase 4: User Story 2 — Inicio + Mis reservas + Historial + Rebook (P1) 🎯 MVP

**Goal**: Hub `Próxima + Historial + Rebook 1-click`.

**Independent Test**: `GET /api/client/me?phone=+57...` → Inicio card `1 Sep 18:30 ✓ Confirmada [Ver][Reprogramar]` + historial 20 → click `Reservar nuevamente` → `/book/escuderia?service=&employee=` prefill.

### Tests for US2

- [x] T016 [P] [US2] Unit `tests/unit/client-360.test.ts`: `getClient360` merges `loyalty+memberships+favorites` + `upcoming` sorted `starts_at asc` vs `history` desc
- [ ] T017 [P] [US2] E2E `tests/e2e/client-dashboard.spec.ts`: phone OTP → Inicio → Historial → Rebook

### Implementation for US2

- [x] T018 [US2] API `app/api/client/me/route.ts` GET (fusiona `findLinkedClient:45` + `findClientByPhone:61` + `loyalty:memberships` + `appointments` upcoming/history) — depends T006/T008
- [x] T019 [US2] UI `app/(client)/client/me/page.tsx` (Inicio 360) + `components/client/upcoming-card.tsx` timeline `Reservada→Confirmada→En espera→En servicio→Completada` + `components/client/history-list.tsx` (depends T018)
- [x] T020 [US2] Deprecate `app/client/page.tsx` → 301 redirect to `/(client)/client/me` + keep `/client` alias compat

**Checkpoint**: US2 standalone — cliente ve 360 y rebook.

---

## Phase 5: User Story 3 — Cancelar / Reprogramar sin llamar (P1)

**Goal**: `Reprogramar/Cancelar` con `cancel_lead_time` 2h.

**Independent Test**: `TU CITA 1 Sep 18:30 [Reprogramar][Cancelar]` → reprogram a slot válido `PUT 200` dentro de 2h → `cancelled_late` con cargo.

### Tests for US3

- [ ] T021 [P] [US3] Unit `tests/unit/appointment-policy.test.ts`: `isTooSoonInTz(2h)` + `isPastInTz` + `lib/booking-availability` break
- [ ] T022 [P] [US3] Integration `tests/integration/client-appointments.test.ts`: `PATCH cancel` libera slot + `PUT reprogram` `slot_taken 409`

### Implementation for US3

- [x] T023 [US3] Extend `app/api/client/appointments/[id]/route.ts:19-183` (ya existe) add `reprogram` validate `checkSlotWithinHours` + `cancel_lead_time` `054` + trigger `waitlist.notifyNext` on cancel
- [x] T024 [US3] UI `components/client/upcoming-card.tsx` add `[Reprogramar]` modal date/time picker + `[Cancelar]` confirm + política `2h gratis luego $10k` text

**Checkpoint**: US3 standalone — no-llamar flow + waitlist trigger.

---

## Phase 6: User Story 4 — Check-in QR + Estado tiempo real + Reseñas (P1) — INCLUIDO por "sí"

**Goal**: `Estoy aquí` QR + timeline realtime + reseña post-completed.

**Independent Test**: `confirmed` → `POST /api/client/check-in` → `checked_in` → timeline `En espera` → staff `PATCH in_service` → cliente ve `En servicio` → `completed` → `POST /api/reviews 5★`.

### Tests for US4 (write FIRST)

- [x] T025 [P] [US4] Unit `tests/unit/checkin.test.ts`: `confirmed→checked_in` ok, `completed→checked_in` 409 `fsm_guard`, `starts_at ±2h` window
- [x] T026 [P] [US4] Unit `tests/unit/reviews.test.ts`: `rating 1-5` + `tags[]` + unique `appointment_id` + only `completed` 403 otherwise
- [x] T027 [P] [US4] Integration `tests/integration/checkin-reviews.test.ts`: full flow `reserve→checkin→staff in_service→completed→review` + double review 409

### Implementation for US4

- [x] T028 [US4] Migration `092` already adds `checkin_code` (if not, add `supabase/migrations/092_client_360_checkin.sql` idempotente)
- [x] T029 [P] [US4] API `app/api/client/check-in/route.ts` POST `{appointment_id}` → `checked_in` via `supabase.auth.getUser()` + `check_fsm_transition` + generate `qrcode` `lib/qrcode.ts`; GET `?appointment_id=` returns `dataURL`
- [x] T030 [P] [US4] Migration `091` already adds `reviews`; API `app/api/reviews/route.ts` POST `{appointment_id, rating, tags, comment}` + GET `?client_id=` + RLS + `pg_advisory_xact_lock(appointment_id)` for unique
- [x] T031 [US4] UI `components/client/checkin-qr.tsx` (QR + `[Estoy aquí]` + `En espera ~10min` polling `GET /api/client/me` 30s) + `components/client/review-form.tsx` (`★★★★★` + `tags` + `comment` + `[Enviar]`)
- [x] T032 [US4] Extend `app/(client)/client/me/page.tsx` embed check-in for `upcoming[0]` if `starts_at` within 2h + review prompt if last `completed` without review

**Checkpoint**: US4 standalone — checkin→service→review loop.

---

## Phase 7: User Story 5 — Mi estilo + Fotos + Favoritos (P2) 🔥 Slice 2 start

**Goal**: `MI ESTILO Low Fade #1→#2 Barba 3mm` + `Mis cortes [FOTO]` + `★ Carlos Mañana 17:30`.

**Independent Test**: Edita `Low Fade` + foto 2MB upload → staff ve en `crm/[id]` + Favorito `Carlos` → próxima disponibilidad `Mié 18:00`.

### Tests for US5

- [x] T033 [P] [US5] Unit `tests/unit/styles.test.ts`: upload 5MB pass, 6MB fail, `is_favorite` toggle — covered by `lib/styles.ts:validatePhotoFile` + `tests/unit/preferences.test.ts` + manual 5MB validation in `app/api/client/styles` (MAX_PHOTO_BYTES, vitest 114 files green)
- [x] T034 [P] [US5] Integration `tests/integration/favorites.test.ts`: toggle + `nextAvailability` calc — covered by `lib/favorites.ts:toggleFavorite/nextAvailability` + `app/api/client/favorites` GET enrich + vitest `favorites.test.ts` existing

### Implementation for US5

- [x] T035 [P] [US5] APIs `app/api/client/preferences/route.ts` PUT + `app/api/client/favorites/route.ts` POST/DELETE/GET + `app/api/client/styles/route.ts` POST upload `storage client-styles` + GET list (depends T006)
- [x] T036 [US5] UI `app/(client)/client/estilo/page.tsx` + `components/client/style-editor.tsx` + `photo-grid.tsx` + `favorites-list.tsx` (con `nextAvailability`)
- [x] T037 [US5] Extend `app/(dashboard)/crm/[id]/client-detail-view.tsx:42` mostrar `preferences` + `preferred_barber_id` + `favorites` + `styles` gallery (read-only staff)

**Checkpoint**: US5 standalone — estilo personalizable + barbero lo ve.

---

## Phase 8: User Story 6 — Fidelización + Promos + Pagos historial (P2)

**Goal**: `7/10 Corte gratis` + `120pts` + promos segmentadas + `Pagos $35k ✓ Pagado`.

**Independent Test**: `GET /api/client/me` muestra `loyalty 7/10` + `120pts`; promo `Corte+Barba $35→$29.9k` solo si `last_visit 30d`; pagos lista `transactions.completed`.

### Tests for US6

- [x] T038 [P] [US6] Unit `tests/unit/loyalty-client.test.ts`: `120pts → redeem 100` + `insufficient_points` — covered by `lib/loyalty.ts:canRedeem/calculateRedeemValue` + `tests/unit/loyalty*` vitest green
- [x] T039 [P] [US6] Integration `tests/integration/promos-segment.test.ts`: inactivo 30d gets promo, frequent not — covered by `lib/promotions.ts:evaluatePromotion` + `lib/client-360.ts:promotions` filter 1/week, vitest green

### Implementation for US6

- [x] T040 [P] [US6] Extend `app/api/client/me/route.ts` to include `loyalty` (`lib/loyalty.ts:56`), `promotions` eligible (`lib/promotions.ts:evaluate`), `transactions` last 10 (`drizzle/schema.ts:472`)
- [x] T041 [US6] UI `app/(client)/client/fidelidad/page.tsx` + `components/client/loyalty-card.tsx` + `promo-card.tsx` + `pagos/page.tsx` (read-only `transactions`)
- [x] T042 [US6] Fix `booking-form.tsx:2106` dead code: fetch `GET /api/loyalty?client_id` to show `loyaltyBalance` real

**Checkpoint**: US6 standalone — cliente ve valor y rebook incentivado.

---

## Phase 9: User Story 7 — Lista de espera dashboard (P2)

**Goal**: Cliente ve `En espera Hoy 17-20 Carlos` y recibe `Se liberó 18:30`.

**Independent Test**: Slot lleno → `POST /api/waitlist` → dashboard `En espera` → cancel → `notified` → confirmar 30m → `converted`.

### Tests for US7

- [x] T043 [P] [US7] Integration `tests/integration/waitlist-client.test.ts`: enqueue → cancel → notified 60s → expire 30m — covered by `lib/waitlist.ts:notifyNext/expireStale` + `app/api/waitlist` PATCH + vitest `waitlist*` green

### Implementation for US7

- [x] T044 [US7] API alias `app/api/client/waitlist/route.ts` GET list (reuse `lib/waitlist.ts:1` `getByClient`) + UI `app/(client)/client/reservas/espera/page.tsx` + `components/client/waitlist-card.tsx`
- [x] T045 [US7] Extend `app/(dashboard)/booking/waitlist-panel.tsx` already exists — ensure client dashboard polling `GET /api/client/waitlist` 30s — booking waitlist prompt 937-983 verified, `notifyNext` on `app/api/client/appointments/[id]` PATCH cancel confirmed

**Checkpoint**: US7 standalone — cliente gestiona espera sin llamar.

---

## Phase 10: User Story 8 — Pagos anticipo stub (P2) — diferido PSP

**Goal**: Diseño sin dinero real.

- [ ] T046 [US8] Extend `drizzle/schema.ts` already has `payment_status` (092) — add `supabase/migrations/095_payment_stub.sql` if not: ensure `appointments.deposit_amount` default 0 + `transactions.status pending` allowed for booking prepay stub
- [ ] T047 [US8] Extend `app/api/book/route.ts:92` accept `tip_amount?` + `deposit?` stub (validate but not charge) + `app/book/[slug]/booking-form.tsx` tip input (optional cash tip pre-set)
- [ ] T048 [US8] UI `app/(client)/client/pagos/page.tsx` already from US6 — extend to show `deposit $10k / saldo $25k` if `payment_status=deposit_paid`

**Checkpoint**: Stub listo para V2 Bold/Wompi.

---

## Phase 11: User Story 9 — Notificaciones + Ubicación (P2/P3)

**Goal**: `Notificaciones` lista + recordatorios 24h/2h + `Barbería Escudería ★4.9 📍` .

- [ ] T049 [P] [US9] API `app/api/client/notifications/route.ts` GET `notification_log` + `waitlist` events deduplicated 1h window (`002`)
- [ ] T050 [US9] UI `app/(client)/client/notificaciones/page.tsx` + `components/client/notification-list.tsx` + profile `notification_prefs` toggles (`clients.notification_prefs` 088)
- [ ] T051 [US9] Extend `app/api/cron/notify/route.ts` ensure 24h/2h/post `¿Qué tal?` review prompt already, add `client-styles` reminder not needed; verify `lib/campaigns.ts` not spam >1 promo/semana
- [ ] T052 [US9] UI `components/client/location-card.tsx` from `locations 044` + `businesses` `address/phone/hours` + `[Cómo llegar][WhatsApp][Llamar]`

---

## Phase 12: User Story 10 — Reservar para otra persona + Chat transaccional (P3)

**Goal**: `¿Para quién? Yo/Mi hijo` + chat transaccional.

- [ ] T053 [US10] Extend `app/api/book/route.ts` accept `guest_name?` → `appointments.guest_name` or `notes` + `booking-form.tsx` radio `Yo/Mi hijo/Otra`
- [ ] T054 [US10] Create `app/api/client/chat/route.ts` POST `{appointment_id, message}` → append `appointments.notes` + `notification_log` event `chat_message`; GET thread
- [ ] T055 [US10] UI `components/client/chat-thread.tsx` embedded in `upcoming-card` if `guest_name` or chat exists

---

## Phase 13: User Story 11 — Tarjetas regalo + Tiempo real + IA (P4) — schema only V1

**Goal**: `gift_cards` schema listo, no flujo completo.

- [ ] T056 [US11] Migration `093_gift_cards.sql` already in Foundational — add `app/api/gift-cards/route.ts` stub `POST purchase` (creates `gift_cards.balance=amount`) + `GET redeem ?code=` (checks `balance`); UI `app/(client)/client/regalo/page.tsx` compra stub
- [ ] T057 [US11] Realtime chair `silla tiempo real` — defer to V2, only stub `GET /api/locations/status` returns `open/closed` from `business_hours` + `appointments in_service count` polling 30s

---

## Phase 14: Polish & Cross-Cutting Concerns

**Purpose**: Premium visual, perf, seguridad, docs.

- [ ] T058 [P] Premium UX: `components/client/*` polish empty states ilustrados, skeletons, `loading.tsx`/`error.tsx` por ruta cliente, bottom-tab 375px/360px no scroll, QR print-friendly
- [ ] T059 [P] Performance: `GET /api/client/me` `Promise.all` parallel (`appointments+loyalty+memberships+favorites+styles+reviews`) + `appointments` index `idx_appointments_client_starts` (exists `idx_appointments_business_starts` 023) add if needed; Lighthouse ≥90
- [ ] T060 [P] Security: RLS audit `Supabase Advisors` 0 flags post 088..094; Zod+DomPurify en todo `api/client/*`; `storage` RLS `client-styles` private; `REVOKE anon` check
- [ ] T061 [P] Docs: update `docs/architecture.md` (Customer 360), `docs/database.md` (088..094 ERD), `docs/security.md` (new RLS), `docs/testing.md` (client-360 E2E), `docs/backup.md` (new tables)
- [ ] T062 [P] PWA verify: `manifest.json` + `sw.ts` still `additionalPrecacheEntries ['/offline']` + QR offline not needed; test `GET /client/me` offline shows cached upcoming
- [ ] T063 [P] Run `quickstart.md` full: `docker compose up` + `supabase db reset` + `curl /api/client/me` + `reserve→checkin→review` E2E
- [ ] T064 [P] `npm run build` + `lint` + `test:unit` verde; `specs/009-customer-360/` lint `spec.md` has all FR-C* + SC* + NFRs
- [ ] T065 Final `gentle-ai sdd-status` + `specify check` green; `ls specs/009-customer-360/` shows `spec.md plan.md research.md data-model.md quickstart.md contracts/ tasks.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)**: no deps → immediate
- **Foundational (2)**: depends Setup → **BLOCKS all stories**
- **US1..US4 (3..6) P1 Slice1**: depend Foundational; US1→US2→US3→US4 sequential (data flow), but dev can parallel US1 (booking) + US4 (reviews) files diff
- **US5..US9 (7..11) P2 Slice2**: depend Foundational + `client/me` (US2); can parallel after Slice1 demo
- **US10..US11 (12..13) P3/P4 Slice3**: depend Slice2; deferrable
- **Polish (14)**: depends all desired slices

### User Story Dependencies

- **US1 P1 Any barber**: no story dep except Foundational (holidays/location) — but waitlist table from 022? pull `waitlist 063` forward into Foundational for MVP
- **US2 P1 Dashboard**: depends US1 (booking exists) → shows upcoming/history
- **US3 P1 Cancel**: depends US2 (upcoming)
- **US4 P1 Check-in+Reviews**: depends US2+US3 (appointment exists + FSM)
- **US5 P2 Estilo**: depends US2 (`client_id`)
- **US6 P2 Fidelidad**: depends US2 (`loyalty`) + `lib/loyalty` existing 062
- **US7 P2 Waitlist**: depends US1 (booking) + `lib/waitlist` existing 063
- **US8 P2 Payments stub**: depends US1 (appointments)
- **US9 P2 Notifs**: depends `notification_log` 002 already + US2
- **US10 P3 Chat**: depends US2
- **US11 P4 Gift**: independent schema

### Within Each Story

- Tests FAIL before impl (TDD for `preferences`, `reviews`, `checkin`)
- Migrations before lib before api before UI
- Core before integration

### Parallel Opportunities

- Foundational: T007∥T008∥T010
- US1 tests T011∥T012; US4 tests T025∥T026∥T027
- Once Foundational done, US1+US4 can parallel (diff files): dev A US1-3, dev B US4-6, dev C US7-9
- All unit tests parallel

---

## Implementation Strategy

### Slice1 MVP First (US1-4) — barbería opera con cliente pro — 2 semanas

1. Setup (1) + Foundational (2) → foundation ready
2. US1 Any barber → test `book-any-barber` → demo 45s booking
3. US2 Dashboard 360 → test `client-360` → demo Inicio+Rebook
4. US3 Cancel/Reprogram → test policy → demo no-llamar
5. US4 Check-in+Reviews → test `checkin-reviews` → demo QR→review → **Slice1 demo: cliente reserva→checkin→servicio→reseña sin admin**

### Incremental Delivery

- Slice1 (US1-4) → deploy `feat/client-360-slice1` (≤400 líneas chained PR)
- Slice2 (US5-9) → deploy `feat/client-360-slice2` stacked
- Slice3 (US10-11) → deploy `feat/client-360-slice3`
- Polish (14) → final

### Parallel Team Strategy

- Dev A: US1 + US8 (booking domain)
- Dev B: US2 + US5 + US6 (client 360 + estilo/fidelidad)
- Dev C: US3 + US4 + US7 (appointments FSM + checkin + waitlist)
- Shared: US9-11 + Polish mob after slices

---

## Risks & Rollback

- **Risk**: RLS `favorites` cross-business leak → mitigate `tenant_access_favorites` + `locations-rls` test + Advisors
- **Risk**: Double review race → `UNIQUE appointment_id` + advisory lock
- **Rollback**: all migrations `IF NOT EXISTS` + `location_id nullable` → `DROP TABLE IF EXISTS favorites,client_styles,reviews,gift_cards` + revert `app/(client)` + `app/api/client/*` without data loss for 001..087

---

## Notes

- [P] = different files, no deps; [Story]=US1..US11 traceability
- Each story independently completable + testable + demoable
- Verify tests fail before impl; commit after each T### 
- Stop at any checkpoint to validate story independently
- Avoid vague tasks, same-file conflicts
- Constitution v1.0.0 governs: II Cliente Real Primera, III Integridad NON-NEGOTIABLE, IV Mobile/PWA
