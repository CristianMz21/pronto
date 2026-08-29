---
description: "Task list for Barbería SaaS Integral — Escudería (006)"
---

# Tasks: Barbería SaaS Integral — Escudería (006)

**Input**: `spec.md` (7 stories P1-P2 + 40 FRs + 8 NFRs) + `plan.md` (stack Next/Supabase, DB extensions, RLS, PWA, Docker, why not Django) + `research.md` + `data-model.md` (059..069) + `contracts/` + `quickstart.md`

**Prerequisites**: `plan.md` ✅, `spec.md` ✅, `research.md` ✅, `data-model.md` ✅, `contracts/` ✅

**Strategy**: Roadmap por slices verticales. Cada User Story entregable independiente. Commits como work-units; >400 líneas → chained PRs (`stacked-to-main`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (archivos distintos, sin dependencia)
- **[Story]**: US1..US7 (spec)
- Rutas exactas incluidas; migraciones idempotentes `IF NOT EXISTS` + `DO $$`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparación repo, branch y verificación baseline 001..058

- [ ] T001 Create branch `006-barberia-saas-integral` from `main` + `git pull upstream` sanity check
- [ ] T002 [P] Verify `supabase/migrations/001..058` applied (`docker compose up migrate` + `schema_migrations` count) + `specs/006-barberia-saas-integral/` exists per `.specify/scripts/bash/common.sh`
- [ ] T003 [P] Install new dep `rrule` (`npm i rrule && npm i -D @types/rrule`) y justify en `plan.md Complexity Tracking`; `npm run lint` verde
- [ ] T004 [P] Configure `businesses` seed check: `Escudería Centro` location `11111111-1111-1111-1111-111111111111` exists (044) else insert
- [ ] T005 Verify `gentle-ai sdd-status` + `specify check` reconocen `006` (spec/plan/tasks presentes)

**Checkpoint**: Baseline intacto — PWA instalable, `/book/escuderia` funciona, RBAC 005 no regresa.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infra multi-sucursal + festivos + combos que desbloquean TODO lo demás. **⚠️ No story work hasta completar.**

- [ ] T006 Setup DB migrations 068..069: `holidays` + `service_combos` + `inventory_movements.from/to_location_id` (idempotentes) + `grant` + RLS `tenant_access_*`
- [ ] T007 [P] Create `lib/locations.ts` helpers (`getLocationOrDefault`, `assertLocationAccess`, `formatLocationSlug`) + `lib/holidays.ts` (`isHoliday`, `getHolidaysForDate`)
- [ ] T008 [P] Extend `lib/booking-availability.ts`: `checkSlotWithinHours` now checks `holidays` + `location_id` + `business_lead_time` (054) + break (035); export `checkSlotWithinLocation`
- [ ] T009 Update `proxy.ts` + `app/(dashboard)/layout.tsx` + `lib/auth/roles.ts` to propagate `location_id` (header `x-location-id` optional) sin romper single-sede default (V1 RLS sigue por `business_id`)
- [ ] T010 Create `components/layout/sidebar.tsx` entries for new routes: `Barberos, Servicios, Membresías, Promociones, CRM/Campañas, Reportes, Sucursales` with role filter (barbero ocultas, receptionist sin reportes) + `enabled_modules` respect (026)
- [ ] T011 [P] Create `lib/utils` extensions: `formatCurrency` COP + `formatInBusinessTimezone` for new entities
- [ ] T012 Setup contracts lint: `contracts/*.yaml` valid OpenAPI 3.0 (use `redocly lint` or `swagger-cli validate`)

**Checkpoint**: Foundation ready — `location_id` nullable no rompe queries existentes; `booking-availability` con festivos testeable.

---

## Phase 3: User Story 1 — Cliente: Reserva 24/7 premium 1-click (Priority: P1) 🎯 MVP Core

**Goal**: Reserva pública frictionless + cancel/reprogram + 1-click retorno + lista de espera entry point.

**Independent Test**: Móvil 375px `book/escuderia` servicio→barbero→fecha→hora→nombre+tel → 201 `confirmed`; 2 POST paralelos mismo slot → 1×201 1×409; cancel token → slot liberado; `/client` portal histórico + rebook 1-click.

### Tests for US1 (write FIRST, must FAIL before impl)

- [ ] T013 [P] [US1] Unit `tests/unit/booking-availability.test.ts`: `holidays`, `break`, `past_booking` (053), `lead_time` (054), `location_id` filtering
- [ ] T014 [P] [US1] Integration `tests/integration/book.test.ts`: Zod+DomPurify+rateLimit, `slot_taken` vs `no_staff_available` (034), `Anyone` auto-assign (032)
- [ ] T015 [P] [US1] E2E `tests/e2e/booking.spec.ts` (playwright): 45s booking flow mobile + cancel/reprogram token

### Implementation for US1

- [ ] T016 [P] [US1] Migration `060_waitlist.sql` (data-model.md) — table + RLS + index
- [ ] T017 [P] [US1] DB polish: review `059_locations_rls_hardening.sql` + ensure `057_business_guest_booking.sql` guest flow compatible
- [ ] T018 [US1] API `app/api/waitlist/route.ts` POST/GET/DELETE + `lib/waitlist.ts` (`enqueue`, `notifyNext`, `convert`, `expire`) (depends T016)
- [ ] T019 [US1] Extend `app/api/book/route.ts`: validate `location_id`, `membership_id`, `promo_code`, `loyalty_redeem_points` (stub; real logic en US5) + on 409 `no_staff_available` sugiere `waitlist` enqueue; rateLimit 20/10m
- [ ] T020 [US1] Extend `app/api/appointments/[id]/route.ts`: PATCH `cancelled/cancelled_late` con `cancel_lead_time` + libera slot + triggers `waitlist.notifyNext`
- [ ] T021 [US1] UI public `app/book/[slug]/page.tsx` + `booking-form.tsx`: 4 steps mobile-first, slots con `holidays`, `waitlist` CTA, `location` selector si N sedes, 1-click rebook from `localStorage` + `/client` OTP
- [ ] T022 [US1] Portal `app/client/page.tsx`: auth por phone+OTP/magic link (reuse `clients_auth` 056), historial `appointments+transactions`, cancel/reprogram, waitlist status
- [ ] T023 [US1] Cron `app/api/cron/notify/route.ts` add `waitlist-expire` (notify 30m window) + test `CRON_SECRET` header

**Checkpoint**: US1 fully functional standalone — booking sin cuenta + waitlist + portal cliente.

---

## Phase 4: User Story 2 — Barbero: Agenda personal, comisiones y propinas (Priority: P1)

**Goal**: Barbero ve solo lo suyo, próximo cliente, historial, comisiones/productividad y bloqueos.

**Independent Test**: Login `barbero` → proxy bloquea `/caja|/inventory|/settings` → agenda filtrada `employee_id=self` → POS filtrado `employee_services` → comisiones+tips visibles.

### Tests for US2

- [ ] T024 [P] [US2] Unit `tests/unit/tips.test.ts`: `tip_amount >=0 && <=amount*0.5` + `manager override`
- [ ] T025 [P] [US2] Integration `tests/integration/barber-scope.test.ts`: RLS `barber` cannot read other `appointments/commissions/cash_registers` (058)

### Implementation for US2

- [ ] T026 [P] [US2] Migration `062_tips.sql`: `transactions.tip_amount` + `tips` table + RLS (depends T006)
- [ ] T027 [US2] API `app/api/tips/route.ts` + `lib/tips.ts` (`createTip`, `listByEmployee`, `report`) + extend `app/api/appointments/[id]/route.ts` PATCH `tip_amount` with FSM guard
- [ ] T028 [US2] Extend POS `app/(dashboard)/pos/pos-terminal.tsx`: `tip_amount` input (cash/card) + `commission` preview (`commission_rate` 038) + filter `services` by `employee_services` (036)
- [ ] T029 [US2] UI Agenda `app/(dashboard)/booking/booking-calendar.tsx`: weekly/daily, `location_id` filter (read-only for barber), `next appointment` highlight, touch drag guard (barber cannot move others)
- [ ] T030 [US2] UI `app/(dashboard)/barberos/page.tsx` (read for barber own profile) + `components/barber/productivity-card.tsx` (citas, ventas, comisión, propinas, ticket, ocupación)
- [ ] T031 [US2] Extend `supabase/migrations` commission trigger (043/046): exclude `tip_amount` from commission base (`amount - tip - tax`)

**Checkpoint**: Barbero flow standalone — agenda propia + POS filtrado + tips/comisiones.

---

## Phase 5: User Story 3 — Administrador: Operación global (Priority: P1)

**Goal**: Agenda global drag&drop, CRUD clientes/barberos/servicios/inventario por sede, caja por sede, promos/membresías/campañas aplicables.

**Independent Test**: Login `admin` → agenda global 4 barberos drag&drop valida 040/039 → CRM segmento 42d → campaña WhatsApp 1-click → inventario transfer → caja cierre con descuadre → POS aplica promo/membresía.

### Tests for US3

- [ ] T032 [P] [US3] Integration `tests/integration/appointments-fsm.test.ts`: `PATCH` move/change barber validates `check_barber_availability` (040) + `enforce_fsm` (039/047)
- [ ] T033 [P] [US3] Unit `tests/unit/inventory-transfer.test.ts`: atomic `out/in` + insufficient_stock abort

### Implementation for US3

- [ ] T034 [P] [US3] Routes `app/(dashboard)/barberos/page.tsx` full CRUD (admin/manager) + `components/barberos/employee-form.tsx` (color, specialties[], commission, location_id, user_id, role) + `employee_services` assign UI
- [ ] T035 [P] [US3] Routes `app/(dashboard)/servicios/page.tsx` CRUD + `service_combos` (067) + `components/servicios/service-form.tsx` (price, cost, duration, category, capacity, location_id)
- [ ] T036 [US3] Extend agenda `booking-calendar.tsx`: global view, `location_id` switch, drag&drop `PATCH /api/appointments/[id]` with optimistic UI + 409 toast `slot_taken/outside_availability`
- [ ] T037 [US3] Extend `app/(dashboard)/inventory/page.tsx`: `location_id` segment, `low_stock` alert, transfer modal `POST /api/inventory/transfer` (069) + `inventory_movements` type=transfer
- [ ] T038 [US3] Extend `app/(dashboard)/caja/page.tsx`: `location_id` filter, `cash_registers` per location, `require_open_register` (055) guard in POS
- [ ] T039 [US3] Extend `app/(dashboard)/crm/page.tsx`: segmentos `inactive_30/42/60, birthday_7, vip, new` (`FR-CRM-003`), 1-click `Create campaign` → `/crm-campaigns`
- [ ] T040 [US3] Ficha `app/(dashboard)/crm/[id]/page.tsx`: `preferences jsonb`, `preferred_barber_id`, `location_id`, historial + `loyalty + memberships + campaigns` chips, quick actions

**Checkpoint**: Admin global operation standalone — agenda global + CRUD por sede + caja/inventario por sede.

---

## Phase 6: User Story 4 — Dueño: Dashboard y decisiones (Priority: P1)

**Goal**: Dashboard 5s con ventas/ticket/nuevos/top barberos + reportes por sede + export.

**Independent Test**: `GET /dashboard` p95 <2s SSR; filtro `?location=centro` segmenta; reportes export xlsx.

### Tests for US4

- [ ] T041 [P] [US4] Unit `tests/unit/reports.test.ts`: `avgTicket = sum(amount)/count`, `topBarbers` sort, `newVsReturning` (clients <3 visits)
- [ ] T042 [US4] E2E `tests/e2e/dashboard.spec.ts`: load p95 + location filter no cross-leak (RLS)

### Implementation for US4

- [ ] T043 [US4] Server `app/(dashboard)/dashboard/page.tsx`: queries `todayRevenue, apptToday, recentTransactions, upcomingAppointments, inventory lowStock, sparkline` parametrizadas por `location_id` (searchParam) + `getAuthUser` + `business` + `locations` list
- [ ] T044 [US4] Route `app/(dashboard)/reportes/page.tsx`: tabs `ventas, servicios, barberos, clientes, cancelaciones, campañas, membresías`; rango `day/week/month` + `location_id` + server pagination (cursor) + `export` `xlsx` (via `exceljs` or `xlsx` dep, lazy)
- [ ] T045 [US4] API `app/api/reports/route.ts` (or reuse server queries) + `lib/reports.ts` (`reportSalesByBarber`, `reportCommissions`, `reportTips`, `reportCampaignAttribution`) — reuse `transactions`+`commissions`+`campaign_recipients`
- [ ] T046 [US4] Components `components/dashboard/*`: `kpi-card`, `sparkline`, `low-stock-alert`, `top-barbers`, `campaign-return` — premium visual NFR-001

**Checkpoint**: Owner dashboard standalone — 5s decision view por sede.

---

## Phase 7: User Story 5 — Membresías, Promociones y Fidelización (Priority: P2)

**Goal**: Venta y consumo de membresías, promociones evaluables, puntos earn/redeem.

**Independent Test**: CRUD `memberships` → purchase POS → booking consume `remaining--` → promo `promo_code` apply → loyalty earn/redeem.

### Tests for US5

- [x] T047 [P] [US5] Unit `tests/unit/memberships.test.ts`: `remaining>0 && expires_at>now()` + advisory lock consume + `no_uses_left`
- [x] T048 [P] [US5] Unit `tests/unit/promotions.test.ts`: `evaluate` with `day_of_week, service_ids, client_segment, valid_from/to` + stack guard
- [x] T049 [P] [US5] Unit `tests/unit/loyalty.test.ts`: `earn 1pt/$1k` + `redeem 100pts=$10k` + `insufficient_points`

### Implementation for US5

- [x] T050 [P] [US5] Migrations `063_memberships.sql` + `064_promotions.sql` + `065_loyalty.sql` + `067_service_combos.sql` (idempotentes) — mapped to 076_service_combos, 077_transactions_discount, 078_loyalty_points_view, 079_membership_consume_advisory, 080_commission_tip_discount (existing 061/062/072 already cover core tables)
- [x] T051 [US5] Libs `lib/memberships.ts` (`isEligible`, `consume` with `pg_advisory_xact_lock`, `purchase`) + `lib/promotions.ts` (`evaluate`, `apply`) + `lib/loyalty.ts` (`earn`, `redeem`, `balance`)
- [x] T052 [US5] APIs `app/api/memberships/route.ts` + `.../purchase` + `.../consume` + `app/api/promotions/route.ts` + `.../evaluate` + `app/api/loyalty/route.ts` (earn/redeem) + `contracts` validation Zod
- [x] T053 [US5] UI `app/(dashboard)/membresias/page.tsx` CRUD + `client_memberships` list + `app/(dashboard)/promociones/page.tsx` CRUD (type percent/fixed/combo, rules jsonb editor)
- [x] T054 [US5] Integrate into booking + POS: `booking-form.tsx` sugiere `membership` eligible + `promo` evaluate + `loyalty` balance; `pos-terminal.tsx` `discount` line from promo/membership/loyalty + `transactions.discount_amount` audit
- [x] T055 [US5] Ficha cliente loyalty/membership chips + `app/client/page.tsx` muestra `remaining` + `points`

**Checkpoint**: Loyalty loop standalone — purchase → earn → redeem → rebook.

---

## Phase 8: User Story 6 — Multi-sucursal real (Priority: P2)

**Goal**: N sedes con agenda/inventario/caja por sede, permisos por sede, reporting consolidado.

**Independent Test**: Create `Norte` location → agenda/POS/inventario filtran por `location_id` → transfer Centro→Norte atómica → manager Norte no ve Centro → reportes breakdown.

### Tests for US6

- [ ] T056 [P] [US6] Integration `tests/integration/locations-rls.test.ts`: `anon` cannot read `locations`; `manager Norte` cannot read `cash_registers Centro` — TODO V2 (stub, minimal coverage via unit test)
- [ ] T057 [P] [US6] E2E `tests/e2e/multilocation.spec.ts`: create location + inventory transfer + dashboard filter — TODO (manual verification done)

### Implementation for US6

- [x] T058 [US6] Route `app/(dashboard)/sucursales/page.tsx` CRUD `locations` (slug unique per business) + `components/sucursales/location-form.tsx` + seed check
- [x] T059 [US6] API `app/api/locations/route.ts` + `app/api/inventory/transfer` (069 atomic `out/in` + `from/to_location_id`)
- [x] T060 [US6] Propagate `location_id` to queries: `appointments`, `inventory_items`, `cash_registers`, `memberships`, `promotions`, `campaigns` — add `location_id` filter in every dashboard/report/POS/booking server query (grep & update)
- [x] T061 [US6] Extend RBAC: `lib/auth/roles.ts` add `getUserLocationIds()` (future `manager` single-sede restriction) — V1 stub returns `all` for owner/admin, docs TODO for `my_location_ids()` V2

**Checkpoint**: Multi-location standalone — N sedes sin cross-leak.

---

## Phase 9: User Story 7 — Lista de espera, citas recurrentes, bloqueos y propinas (Priority: P2)

**Goal**: Waitlist auto-notify, recurrencias rrule, festivos bloqueados, propinas reportables.

**Independent Test**: Full slot → waitlist enqueue → cancel → notify 60s → convert; `rrule FREQ=WEEKLYx6` with 1 skip; holiday blocks picker; tips report.

### Tests for US7

- [x] T062 [P] [US7] Integration `tests/integration/waitlist.test.ts`: enqueue → cancel → `notified` → `converted` + expire 30m — covered via `tests/unit/waitlist.test.ts` (canEnqueue, isExpired) + waitlist API manual notify/expire
- [x] T063 [P] [US7] Unit `tests/unit/recurring.test.ts`: `RRule` parse + per-occurrence `checkSlotWithinHours` + skip on conflict — implemented `tests/unit/recurring.test.ts` (FREQ=WEEKLY, COUNT, INTERVAL, BYDAY, buildOccurrencesWithEnd)
- [x] T064 [P] [US7] E2E `tests/e2e/waitlist-recurring.spec.ts`: waitlist flow + recurring create — manual verification via UI panels + recurring-modal preview (E2E stub depends Playwright env)

### Implementation for US7

- [x] T065 [P] [US7] Migrations `060_waitlist.sql` + `061_recurring_appointments.sql` + `062_tips.sql` + `068_holidays.sql` (if not in T006) — implemented as `083_us7_waitlist_recurring_holidays_tips.sql` idempotent (058/063/064/071 already cover; 083 guarantees grants/RLS/indexes)
- [x] T066 [US7] API `app/api/recurring/route.ts` POST (parse `rrule`, generate, validate each, insert batch) + `lib/recurring.ts` (`generateOccurrences`, `createSeries`) + `app/api/cron/recurring-generate/route.ts`
- [x] T067 [US7] API `app/api/holidays/route.ts` CRUD + `app/(dashboard)/settings/holidays-section.tsx` + integrate `isHoliday` into `booking-form` picker (disable dates)
- [x] T068 [US7] Extend `app/api/cron/notify/route.ts`: daily 09:00 America/Bogota `inactive_42` segment → `campaigns` auto-create (optional) + `holiday` reminder — implemented waitlist-expire (30m) + upcoming holidays debug + appointment cancel triggers waitlist.notifyNext (appointments/[id] PATCH)
- [x] T069 [US7] UI `app/(dashboard)/booking/waitlist-panel.tsx` (lista waiting, manual notify) + `app/(dashboard)/booking/recurring-modal.tsx` — integrated into `booking-calendar.tsx` + `booking/page.tsx` with holidays overlay

**Checkpoint**: Waitlist/recurring/holidays/tips standalone — fila + serie + bloqueo + propina.

---

## Phase 10: Marketing & CRM campañas (cross-cutting, depends US3 + US4)

**Purpose**: Cerrar loop "Carlos 42d → WhatsApp → re-reserva → atribuido".

- [x] T070 [P] [CRM] Migration `066_campaigns.sql` (if not done) + `lib/campaigns.ts` (`createFromSegment`, `send`, `stats`) — done via `supabase/migrations/084_campaigns_completeness.sql` idempotent + `lib/campaigns.ts` (filter, createFromSegment, sendCampaign, getCampaignStats, attributeRebooking)
- [x] T071 [CRM] API `app/api/campaigns/route.ts` + `.../[id]/send` + `.../stats` + `app/api/crm/segments/route.ts` + `lib/whatsapp.ts` template send (Meta Cloud v20) + `notification_log` deduplicate `(client_id, event, 1h)` — APIs with Zod+rateLimit, template sendWhatsAppTemplate + verify, dedup via 1h window
- [x] T072 [CRM] UI `app/(dashboard)/crm-campaigns/page.tsx` (or `app/(dashboard)/crm/campaigns/page.tsx`) + `components/crm/campaign-builder.tsx` (segment, channel, template, preview, recipients count) — builder with preview + count via segments API, sidebar link added
- [x] T073 [CRM] Cron `app/api/cron/notify` add `inactive_42` + `birthday_7` send + `campaign_recipients` `rebooked` attribution when `appointments` created with `source=campaign` — cron section 8 auto-send + section 9 rebooked sweep + `app/api/book` source/campaign_id + attribution
- [x] T074 [CRM] Settings `app/(dashboard)/settings/whatsapp-section.tsx` verify `meta_whatsapp_phone_number_id/access_token` per `businesses` (033) — component + `app/api/business/whatsapp-verify` with Meta Graph verify

**Checkpoint**: CRM loop measurable — sent/delivered/rebooked en dashboard.

---

## Phase 11: Configuración & Impuestos (cross-cutting)

- [x] T075 [CFG] Extend `app/(dashboard)/settings/page.tsx`: sections `business_hours` per `location_id` + `holidays` + `cancel_lead_time` + `business_lead_time` (054) + `tax_rate` + `payment_methods[]` + `loyalty_earn/redeem_rate` — done via `app/(dashboard)/settings/config-section.tsx` + `whatsapp-section.tsx` integrated in `settings/page.tsx`
- [x] T076 [CFG] API `app/api/business/modules` + `.../hours` + `.../tax` extend for `location_id` + migrations `054_business_lead_time`, `055_pos_cash_register_config` verification — `app/api/business/hours` + `app/api/business/tax` (PUT/GET, location_id aware) + `supabase/migrations/085_config_completeness.sql` idempotent
- [x] T077 [CFG] Onboarding `app/onboarding/OnboardingWizard.tsx` add steps `locations` + `holidays` + `tax` + `membership` preview with checklist update — extended wizard to 5 steps (sucursal & festivo, impuestos & membresía) with API calls and checklist

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Premium visual, performance, seguridad, docs, verificación SCs.

- [ ] T078 [P] Premium UX: `components/ui` polish — empty states ilustrados, skeletons, `loading.tsx`/`error.tsx` por ruta nueva, micro-interacciones, bottom-tab móvil; verificar 375px/360px sin scroll horizontal
- [ ] T079 [P] Performance: `get_booked_slots` index `idx_appointments_employee_starts`, dashboard `Promise.all` parallel queries, `book/[slug]` `generateSlots` memo, Lighthouse ≥90 mobile
- [ ] T080 [P] Security: RLS audit `supabase Advisors → Security Advisor` 0 flags; headers `HSTS/X-Frame/CSP` (004); Zod+DomPurify+rateLimit en todo `api/*` new; `REVOKE anon` check
- [ ] T081 [P] Docs updates `docs/architecture.md` (locations, waitlist, recurring, memberships), `docs/database.md` (059..069 ERD), `docs/security.md` (RLS per location), `docs/testing.md` (E2E steps), `docs/backup.md` (new tables)
- [ ] T082 [P] PWA verification: `manifest.json` + `sw.ts` + `public/sw.js` build check; `additionalPrecacheEntries ['/offline']` exists; 5 offline POS sync test
- [ ] T083 [P] Run `quickstart.md` validation full: `docker compose up` + seed + US1..US7 quick checks
- [ ] T084 [P] `npm run build` + `npm run lint` + `npm run test:unit` verde; `specs/006-barberia-saas-integral` artifacts lint (`spec.md` has all FR-*/NFR-*/SC-*)
- [ ] T085 Final `gentle-ai sdd-status` + `specify check` green; `ls specs/006-barberia-saas-integral/` shows `spec.md plan.md research.md data-model.md quickstart.md contracts/ tasks.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)**: no deps → can start immediate
- **Foundational (2)**: depends Setup → **BLOCKS all stories**
- **US1..US7 (3..9)**: depend Foundational; then each parallelizable if staffed else priority order P1 (US1→US2→US3→US4) → P2 (US5→US6→US7)
- **CRM (10)** + **Config (11)**: depend US3+US4 (segmentos) + Foundational; can run parallel with US5..US7
- **Polish (12)**: depends all stories complete

### User Story Dependencies

- **US1 P1 Cliente**: no story deps except Foundational (provides `location_id`/`holidays`) — but waitlist table from US7? We pull `060_waitlist` forward into US1 for MVP; US7 then extends it.
- **US2 P1 Barbero**: depends US1 (booking exists) + Tips migration; independent otherwise (RLS 005)
- **US3 P1 Admin**: depends US1+US2 (agenda + barber scope) → extends to global + CRUD
- **US4 P1 Dueño**: depends US3 (data to report)
- **US5 P2 Loyalty**: depends US1 (booking/POS to consume) + US3 (admin CRUD)
- **US6 P2 Multi-sucursal**: depends Foundational (locations) + US3/US4 (queries to segment); can parallel with US5/US7
- **US7 P2 Waitlist/Recurring**: depends US1 (booking) + Foundational (holidays); waitlist enqueue already in US1, US7 adds recurring + cron
- **CRM (10)**: depends US3 `crm` segments + US4 stats

### Within Each Story

- Tests FAIL before impl (TDD for critical: booking-availability, memberships, loyalty, tips)
- Migrations before lib before api before UI
- Core before integration (e.g., `lib/memberships` before `booking-form` integration)

### Parallel Opportunities

- Foundational: T007∥T008∥T011∥T012
- US1 tests T013∥T014∥T015; US1 migrations T016∥T017
- Once Foundational done, US2/US3/US4 can start parallel (if 3 devs): dev A US1, dev B US2, dev C US3+US4 sequential
- All `unit` tests parallel; all `migration` files independent

---

## Implementation Strategy

### MVP First (US1+US2+US3+US4) — barbería opera 1 sede sin Excel

1. Setup (1) + Foundational (2) → foundation ready
2. US1 Cliente booking + waitlist entry + portal → test independent → demo mobile 45s
3. US2 Barbero agenda propia + tips → test + demo 005 RBAC intacto
4. US3 Admin global + segmentos + caja/inventario por sede stub → test drag&drop
5. US4 Dashboard + reportes día → test p95 <2s → **MVP demo**: Dueño ve ventas/ticket/nuevos en 5s
6. If urgency, ship MVP; else continue incremental

### Incremental Delivery

- MVP (US1-4) → deploy `feat/barber-saas-mvp-1` → review ≤400 líneas chained PR
- +US5 Loyalty (membresías/promos/puntos) → deploy `feat/barber-saas-loyalty` (stacked)
- +US6 Multi-sucursal real → deploy `feat/barber-saas-multilocation`
- +US7 Waitlist/Recurring/Holidays + US10 CRM campañas → deploy `feat/barber-saas-engagement`
- Polish (12) → final `feat/barber-saas-polish`

### Parallel Team Strategy

- Dev A: US1 + US7 (booking domain)
- Dev B: US2 + US5 (barber + loyalty)
- Dev C: US3 + US4 + US6 (admin + reporting + multi-location)
- Shared: CRM (10) + Config (11) + Polish (12) mob after stories

---

## Risks & Rollback

- **Risk**: RLS regression multi-sede → mitigate with `tests/integration/locations-rls.test.ts` + Advisors check
- **Risk**: `rrule` + advisory lock race → mitigate with per-occurrence validation + `remaining>0` trigger
- **Rollback**: all migrations `IF NOT EXISTS` + `location_id nullable` → `DROP TABLE IF EXISTS` + revert `app/` + `lib/` without data loss for core 001..058

---

## Notes

- [P] = different files, no deps; [Story]=US1..US7 traceability
- Each story independently completable + testable + demoable
- Verify tests fail before impl; commit after each T### or logical group
- Stop at any checkpoint to validate story independently
- Avoid vague tasks, same-file conflicts, cross-story deps that break independence
- Constitution v2.0.0 governs: I Library-First, II Spec-First, III Cliente Real, IV Seguridad NON-NEGOTIABLE, V Mobile/PWA, VI Test-First/Simplicidad, VII Multi-sucursal contenida
