# Feature Specification: Customer 360 — Experiencia Profesional para Clientes de Barbería

**Feature Branch**: `009-customer-360`

**Created**: 2026-09-01

**Status**: Draft

**Input**: Usuario propone transformar el módulo cliente de "ver mis reservas" a CRM personal de barbería estilo Booksy/SQUIRE/Fresha con 23 capacidades: Inicio/Dashboard, Mis reservas (próximas/historial/rebook), Reservar cita (7 pasos + Cualquier barbero), Elegir servicio, Elegir barbero, Favoritos, Mi estilo/preferencias, Historial servicios, Fotos/estilos, Pagos, Lista de espera, Recordatorios, Cancelar/reprogramar, Fidelización, Promociones, Reseñas, Notificaciones, Reservar para terceros, Tarjetas regalo, Ubicación/contacto, Chat, Check-in, Estado cita. Ver `proxy.ts:387`, `app/client/page.tsx:1`, `app/(client)/client/dashboard/dashboard-client.tsx:1`, `app/book/[slug]/booking-form.tsx:1`, `drizzle/schema.ts:219`, `supabase/migrations/`.

**Constitution**: Pronto Barber Constitution v1.0.0 — II Cliente Real Primero, III Integridad Transaccional NON-NEGOTIABLE, IV Mobile-First PWA, I Pronto-First.

---

## Overview

Unificar los dos portales actuales (`app/client/page.tsx:1` anon `?phone=` y `app/(client)/client/dashboard/page.tsx:1` auth `user_id`) en un único **Customer 360** que conecta `Perfil → Reservas → Historial → Barbero favorito → Preferencias → Estilos → Pagos → Puntos → Reseñas → Notificaciones` y permite `rebooking inteligente` + `check-in` + `lista de espera` sin llamar.

Stack congelado: Next.js 16 + React 19 + Tailwind + shadcn/ui + Supabase (Postgres+Auth+Storage+RLS) + Serwist PWA + next-intl `es-CO/COP/America/Bogota` + Docker standalone. Ver `.specify/memory/constitution.md`.

Navegación cliente propuesta (mobile bottom-tab):
```
Inicio | Reservas (Próximas/Historial/Espera) | Mi estilo (Preferencias/Cortes/Favoritos) | Fidelidad | Pagos | Perfil
```

---

## User Scenarios & Testing

### User Story 1 — Reservar cita premium con "Cualquier barbero" (Priority: P1) 🎯 MVP

Como cliente quiero elegir servicio → barbero (o Cualquier barbero) → fecha → hora → confirmar sin crear cuenta (solo nombre+tel) y ver confirmación + recordatorios, con disponibilidad en tiempo real.

**Why this priority**: Si reservar no es frictionless (<60s móvil) y no muestra disponibilidad real, el resto no genera ingresos. Es la adquisición #1. Booksy lo hace en 1-click rebook.

**Independent Test**: Anónimo en `book/escuderia` móvil 375px: `Corte + Barba $35.000 45min` → elige `Cualquier barbero` → ve slots reales (excluye `business_hours` + `break` + `employee_unavailability` + `holidays`) → `POST /api/book 201 confirmed`. Dos POST paralelos mismo slot → 1×201 1×409 `slot_taken`.

**Acceptance Scenarios**:
1. **Given** `services` activos y `employees` con `employee_services` y `business_hours Lun-Sáb 09-20 break 13-14`, **When** elige `Cualquier barbero` + fecha/hora válida, **Then** sistema auto-asigna barbero libre con especialidad (`app/api/book:290-321` `no_staff_available` 409 si ninguno) y crea `appointments.status=confirmed` con `price/duration` correctos.
2. **Given** servicio `CORTE PREMIUM $25.000 45min Corte personalizado Lavado Secado Styling` con fotos/productos/barberos que lo realizan, **When** abre detalle, **Then** ve duración/precio/descripción/fotos/barberos.
3. **Given** intenta reservar fuera de horario o durante `employee_unavailability` (vacaciones), **When** confirma, **Then** `outside_availability 400` aunque UI sea bypasseada (server `checkSlotWithinHours`).
4. **Given** reserva creada, **When** pasan 24h y 2h antes, **Then** `notification_log` no duplica y dispara recordatorio (SQUIRE/Booksy pattern).

---

### User Story 2 — Inicio / Dashboard + Mis reservas + Historial + Rebook (Priority: P1) 🎯 MVP

Como cliente quiero al entrar ver mi próxima cita (fecha/barbero/servicio/precio/estado `Confirmada/Pendiente/Completada`), CTAs `Ver cita / Reprogramar / Cancelar / Reservar nuevamente` y lista de próximas + historial con detalle y rebook 1-click.

**Why this priority**: Es el "hub" que Booksy expone: próxima cita + historial + rebook reduce fricción y aumenta recurrencia.

**Independent Test**: Login `?phone=` o `user_id` link → `GET /api/client/me` → Inicio muestra `Próxima: Corte+Barba Carlos Mar 1 Sep 18:30 ✓ Confirmada [Ver][Reprogramar]` + historial 20 items `25 Ago Corte clásico Carlos $25.000 ✓ Completada` → click `Reservar nuevamente` → `/book/escuderia?service=&employee=` pre-seleccionado.

**Acceptance Scenarios**:
1. **Given** cliente `Cristian` con próxima `2026-09-01 18:30`, **When** abre `/client`, **Then** ve card `TU PRÓXIMA CITA Corte+Barba Carlos 1 Sep 18:30 ✓ Confirmada` con botones como spec.
2. **Given** historial con 10 citas `completed/cancelled/no_show`, **When** abre `Historial`, **Then** lista ordenada desc con precio/barbero/estado y `Ver detalles`.
3. **Given** cita pasada `Corte clásico 25 Ago`, **When** click `Reservar nuevamente`, **Then** `/book/escuderia?service=<id>&employee=<id>` pre-fill y confirma sin reingresar datos (`dashboard-client.tsx:343-351` pattern).
4. **Given** sin próxima cita, **When** abre Inicio, **Then** ve CTA `¿Quieres volver a tu estilo habitual? [Corte + Barba $35.000 Reservar nuevamente]`.

---

### User Story 3 — Cancelar / Reprogramar sin llamar + Política (Priority: P1)

Como cliente quiero reprogramar/cancelar sin llamar, viendo política `cancelación gratis hasta 2h antes, luego cargo $10.000`.

**Why this priority**: Reduce no-shows y carga operativa. Booksy permite cancel/reprogram sujeto a política.

**Independent Test**: Desde `TU CITA Mar 1 Sep 18:30 [Reprogramar][Cancelar]` → reprograma a nuevo slot válido → `PUT /api/client/appointments/[id] 200` con validación `isTooSoonInTz` (2h) y `isPastInTz`; cancelar → `PATCH cancel 200 status=cancelled` libera slot y dispara `waitlist.notifyNext`.

**Acceptance Scenarios**:
1. **Given** cita en 3h, **When** cancela, **Then** `cancelled` sin cargo, slot liberado, notificación barbero.
2. **Given** cita en 1h (dentro de `cancel_lead_time`), **When** cancela, **Then** `cancelled_late` con flag cargo y aviso `podría aplicarse $10.000`.
3. **Given** quiere reprogramar, **When** elige nueva fecha/hora ocupada, **Then** `slot_taken 409` + sugiere `Lista de espera`.

---

### User Story 4 — Check-in + Estado cita en tiempo real + Reseñas (Priority: P1) — INCLUIDO por decisión "sí" 2026-09-01

Como cliente quiero hacer `Check-in [Estoy aquí]` / `QR`, ver timeline `✓ Reservada → ✓ Confirmada → ● En espera → ○ En servicio → ○ Completada` y si `Carlos está terminando, ~10min`, y después calificar `★★★★★ + tags + comentario`.

**Why this priority**: Diferencia barbería moderna. SQUIRE tiene check-in, Booksy reviews. Usuario confirmó incluir en Slice 1 ("si").

**Independent Test**: Cita `confirmed` → Check-in → `PATCH status=checked_in` (client allowed) → timeline actualiza → staff avanza a `in_service` → cliente ve `En servicio` → al `completed` → prompt reseña `¿Cómo estuvo? ★★★★★ [Atención][Corte] [Enviar]` → `POST /api/reviews 201`.

**Acceptance Scenarios**:
1. **Given** cita `confirmed` a 10min, **When** cliente click `Estoy aquí`, **Then** `checked_in` y staff ve en agenda.
2. **Given** en `checked_in`, **When** barbero termina anterior, **Then** cliente ve `En espera ~10min` y luego `En servicio`.
3. **Given** cita `completed` hace 5min, **When** abre historial, **Then** prompt reseña con tags `Atención/Corte/Puntualidad/Ambiente` y puede consultar reseñas previas.
4. **Given** intenta check-in si cita ya `completed/cancelled`, **Then** `fsm_guard 409`.

---

### User Story 5 — Mi estilo / Preferencias + Fotos + Favoritos (Priority: P2) 🔥 Alta — Slice 2

Como cliente quiero guardar `MI ESTILO Low Fade longitud media Máquina #1→#2 Barba 3mm Barbero Carlos Notas "Dejar volumen"` + `Mis cortes [FOTO Low Fade Carlos 25 Ago]` + `Favoritos ★ Carlos Mañana 17:30` para que el barbero lo consulte antes de atender.

**Why this priority**: Es el diferenciador vs agenda genérica; transforma a sistema relación. Alta según tabla.

**Independent Test**: En `Mi estilo` edita `Low Fade + Barba 3mm` + foto upload `storage` → barbero ve en ficha `client-detail-view.tsx` + cliente ve `Último corte Low Fade 25 Ago Carlos`. Favoritos toggle estrella → lista con `próxima disponibilidad`.

**Acceptance Scenarios**:
1. **Given** cliente con `preferred_barber_id=Carlos`, **When** reserva nueva, **Then** `Carlos` pre-seleccionado.
2. **Given** guarda estilo `Low Fade` con foto, **When** reserva `Mi corte favorito`, **Then** `service_id+employee_id+notes` prefill.
3. **Given** marca `Andrés` favorito, **When** abre `Favoritos`, **Then** ve `Andrés Próxima: Mié 18:00 [Reservar]`.

---

### User Story 6 — Fidelización + Promociones + Pagos historial (Priority: P2) 🔥 Alta — Slice 2

Como cliente quiero ver `MI FIDELIDAD ███████░░░ 7/10 Corte gratis` o `120 pts → 100pts=$10.000`, recibir `OFERTA Corte+Barba $35k→$29.9k hasta 5 Sep` segmentada (inactivo 30d / cumpleaños) sin spam, y ver `Pagos 25 Ago $35k ✓ Pagado`.

**Why this priority**: Retención y LTV. Booksy tiene tarjetas fidelización y SQUIRE loyalty+marketing.

**Independent Test**: `GET /api/client/loyalty` muestra puntos + progreso; promo segmentada aparece solo si `last_visit_at 30d` o `birthday within 7d`; pagos lista desde `transactions` POS `status=completed`.

**Acceptance Scenarios**:
1. **Given** `7/10 visitas`, **When** abre Fidelidad, **Then** `Te faltan 3 → Corte gratis`.
2. **Given** `120 pts`, **When** paga $35k, **Then** `+35 pts` y puede canjear `100 pts`.
3. **Given** inactivo 30d, **When** campaña corre, **Then** recibe 1 promo, no bombardeo (1 por semana max).

---

### User Story 7 — Lista de espera automática (Priority: P2) 🔥 Alta — Slice 2

Como cliente quiero si `Carlos Hoy ❌ No disponible [Unirme]` elegir `Hoy 17-20h` y si alguien cancela recibir `Se liberó 18:30 con Carlos [Reservar ahora]` (SQUIRE pattern).

**Why this priority**: Aumenta ocupación sin llamadas.

**Independent Test**: Slot lleno → `POST /api/waitlist {desired_at: today 17-20}` → `waiting`; otro cancela 18:30 → `notifyNext` → cliente recibe push/WhatsApp → confirma en 30m → `converted`.

**Acceptance Scenarios**:
1. **Given** `Carlos` lleno hoy, **When** se une `Hoy 17-20`, **Then** `waitlist.status=waiting`.
2. **Given** cancel 18:30, **When** cron/trigger corre, **Then** primero en fila `notified` con TTL 30m.
3. **Given** notificado no confirma en 30m, **Then** `expired` y siguiente en fila notificado.

---

### User Story 8 — Pagos online + Anticipo (Priority: P2) — diferido PSP pero diseño en Slice 2

Como cliente quiero pagar anticipo al reservar y ver `Pagos` con `método/anticipo/saldo/propina/recibo`.

**Why this priority**: Booksy permite pagar en app. Pero PSP real postergado; V1 solo diseño + `pending` transaction.

**Independent Test**: Booking con `payment_method=online` crea `transactions.status=pending deposit $10k` + `payment_intent` stub; webhook (stub) confirma.

**Acceptance Scenarios**:
1. **Given** servicio $35k con `requires_deposit true`, **When** reserva, **Then** debe pagar $10k anticipo.
2. **Given** paga anticipo, **When** llega, **Then** saldo $25k en POS.

---

### User Story 9 — Notificaciones + Recordatorios + Ubicación/Contacto (Priority: P2/P3)

Como cliente quiero `Notificaciones 🔔 Confirmada hace 10m 🎁 10pts Se liberó 18:30`, recordatorios 24h/2h/post-servicio `¿Qué tal?`, y ver `Barbería Escudería ★4.9 📍 Calle XX 09-20 [Cómo llegar][WhatsApp][Llamar]`.

**Why this priority**: Reduce no-show; SQUIRE enfatiza marketing.

**Independent Test**: `notification_log` no duplica; cron 24h/2h dispara; perfil `notification_prefs` toggles.

**Acceptance Scenarios**:
1. **Given** cita mañana 18:30, **When** son 18:30-24h, **Then** push/WhatsApp `Tu cita es mañana`.
2. **Given** desactiva `WhatsApp`, **When** recordatorio, **Then** solo Email.

---

### User Story 10 — Reservar para otra persona + Ubicación + Chat transaccional (Priority: P3) 🟡 Media

Como padre quiero `¿Para quién? ● Yo ○ Mi hijo` y chatear transaccional `¿Puedo cambiar mi corte? Claro.` y ver ubicación.

**Why this priority**: Útil pero no bloqueante V1.

**Independent Test**: Reserva con `recipient: child` crea `appointments.notes=para Mi hijo` + link familiar.

**Acceptance Scenarios**:
1. **Given** elige `Mi hijo`, **When** confirma, **Then** cita con `guest_name`.
2. **Given** envía chat, **When** barbería responde, **Then** hilo en `notifications`.

---

### User Story 11 — Tarjetas regalo + Estado tiempo real + IA estilos (Priority: P3/P4) 🟢 Avanzada

Como cliente quiero `🎁 Tarjeta $50k Para: [Nombre] [Comprar]` y ver `Silla 3 libre` y `IA recomienda Low Fade`.

**Why this priority**: Diferenciador futuro, no V1.

**Acceptance Scenarios**:
1. **Given** compra regalo $50k, **When** receptor reserva, **Then** descuenta saldo `gift_cards.balance`.

---

### Edge Cases

- Reserva concurrente mismo slot → `pg_advisory_xact_lock` 1 gana `032`
- `Cualquier barbero` sin nadie libre → `no_staff_available 409` + sugiere waitlist
- Reprogram dentro de `cancel_lead_time` → `cancelled_late` con cargo
- Check-in si ya `completed` → `fsm_guard 409` `039/047`
- Reseña sin `completed` → `403`
- Foto >5MB → `storage.file_size_limit 50MiB` `config.toml:123` rechaza
- Waitlist TTL 30m expira → `expired` y siguiente
- Fidelidad `7/10` con visita concurrente → `remaining` decrement atómico `pg_advisory_xact_lock`
- Pago anticipo falla → `payment_status=failed` y cita `pending_payment` no confirma hasta webhook
- `preferences jsonb` vacío → UI muestra placeholder, no null error

## Requirements

### Functional Requirements

- **FR-C1**: System MUST unificar portales en `GET /api/client/me` (phone OTP + `user_id` link `056_clients_auth.sql`) que retorna 360: `client, upcoming, history, loyalty, memberships, favorites, preferences, styles`.
- **FR-C2**: System MUST implementar reserva 7 pasos `servicio→barbero(+Cualquier)→fecha→hora→contacto→pago→confirmada` con validación `checkSlotWithinHours` + `get_booked_slots` + `check_barber_availability:040`.
- **FR-C3**: System MUST mostrar `Inicio` con próxima cita + timeline `Reservada→Confirmada→En espera→En servicio→Completada` + CTAs.
- **FR-C4**: System MUST soportar `Mis reservas` próximas/historial + `Reservar nuevamente` 1-click `?service=&employee=` (`dashboard-client.tsx:343`).
- **FR-C5**: System MUST permitir `Reprogramar/Cancelar` con `cancel_lead_time` `supabase/migrations/054` y liberar slot + `waitlist.notifyNext`.
- **FR-C6**: System MUST implementar `Check-in` `POST /api/client/check-in {appointment_id}` → `checked_in` solo si `confirmed` y no `fsm_guard`, y `GET /api/client/checkin-code` QR.
- **FR-C7**: System MUST gestionar `reviews` `appointment_id unique, rating 1-5, tags[], comment` solo si `completed` y `business_id` match, 1 por cita.
- **FR-C8**: System MUST gestionar `preferences jsonb` `{cut, length, clipper, beard, barber_id, notes}` + `status VIP` + `preferred_barber_id` FK + `favorites` M2M.
- **FR-C9**: System MUST gestionar `client_styles` `{photo_url, service_id, barber_id, notes, is_favorite}` con `storage` bucket `inventory` o `client-styles`.
- **FR-C10**: System MUST implementar `waitlist` `desired_at range, status waiting/notified/converted/expired` con `enqueue` desde booking si lleno + `notifyNext` en cancel + TTL 30m (`lib/waitlist.ts:1`).
- **FR-C11**: System MUST implementar `favorites` con `próxima disponibilidad` calculada `lib/booking-availability.ts`.
- **FR-C12**: System MUST integrar fidelización existente `loyalty_accounts/movements` `062_loyalty.sql` + `memberships/client_memberships` `072_memberships.sql` en cliente: ver progreso, puntos, canjear (`lib/loyalty.ts:31`).
- **FR-C13**: System MUST segmentar promos `promotions` `061_promotions.sql` `1 promo/semana, inactivo 30d, cumpleaños` y no bombardear.
- **FR-C14**: System MUST mostrar `Pagos` historial desde `transactions` `status=completed` (`drizzle/schema.ts:472`) con `método/anticipo/saldo/propina/recibo`.
- **FR-C15**: System MUST disparar recordatorios 24h/2h/post `¿Qué tal?` vía `notification_log` `002` + `cron:007` sin duplicado 1h window.
- **FR-C16**: System MUST exponer `Notificaciones` lista `🔔 🎁 ✂ 💳` desde `notification_log` + `waitlist` events.
- **FR-C17**: System MUST mostrar `Ubicación` `locations 044` con `name, slug, address, phone, hours, is_active` y `Cómo llegar/WhatsApp/Llamar`.
- **FR-C18**: System MUST soportar `Reservar para otra persona` `recipient: self|child|other guest_name` en `appointments.notes` o `guest_client_id`.
- **FR-C19**: System MUST proveer `Chat transaccional` hilo por `appointment_id` o `client_id` (no libre, moderado).
- **FR-C20**: System MUST soportar `Tarjetas regalo` `gift_cards(code unique, amount, balance, business_id, purchaser, recipient, expires_at)` con compra y redención parcial (V2).
- **FR-C21**: System MUST mantener `payment_intent/deposit_amount/payment_status` en `appointments` para anticipo stub V1 (PSP real V2).

### Key Entities

- **Client360**: `clients.id, business_id, location_id, name, phone(E.164), email, birthday, notes, tags, preferences jsonb, status, preferred_barber_id FK, notification_prefs`
- **Appointment**: `id, business_id, location_id, client_id, employee_id?, service_id, starts_at, ends_at, status FSM 9 estados `039/047`, price, deposit_amount, payment_status, checkin_code, recurring_id?, guest_name?` — `039_appointment_fsm.sql:1` `check_fsm_transition()`
- **Favorite**: `client_id, employee_id` PK
- **ClientStyle**: `id, client_id, business_id, service_id, employee_id, photo_url, notes, is_favorite`
- **Review**: `id, appointment_id unique, client_id, business_id, employee_id, rating 1-5, tags text[], comment, created_at`
- **Waitlist**: `id, business_id, location_id, service_id, employee_id?, client_id, desired_at tstz, desired_end tstz, status, created_at` — `063_waitlist.sql:1`
- **Loyalty**: `loyalty_accounts(client_id PK, points)` + `loyalty_movements(type earn/redeem)` `062`
- **Membership**: `memberships + client_memberships(remaining, expires_at)` `072`
- **Transaction**: `id, business_id, appointment_id?, amount, payment_method cash/card/transfer/online, status pending/completed/refunded, tip_amount, discount` `041`
- **NotificationLog**: `id, business_id, appointment_id?, channel, event, status` `002` — dedup
- **GiftCard**: `id, business_id, code unique, amount, balance, purchaser_client_id, recipient_name, expires_at` — NEW

## Success Criteria

### Measurable Outcomes

- **SC-001**: Reserva anónima `book/escuderia` completa en ≤60s móvil (servicio→confirmar) sin cuenta; 95% intentos sin error.
- **SC-002**: Cero doble reservas en 10 intentos paralelos (2 POST mismo slot → 1×201 1×409) medido `vitest concurrent`.
- **SC-003**: Dashboard cliente carga próxima+historial en p95 <1.5s (`GET /api/client/me`).
- **SC-004**: Cancel/reprogram sin llamar funciona <15s y libera slot inmediato + notifica waitlist <60s.
- **SC-005**: Check-in QR funciona y FSM `confirmed→checked_in→in_service→completed` sin `fsm_guard` violations.
- **SC-006**: Reseña post-`completed` crea 1 por cita y es visible en historial.
- **SC-007**: Favoritos + Mi estilo persisten y pre-seleccionan barbero/servicio en próxima reserva (1-click).
- **SC-008**: Lista espera: slot lleno → waiting → cancel → notified 30m TTL → converted ≥30% si confirma.
- **SC-009**: Fidelización: `7/10 → Corte gratis` visible y canje atómico sin overspend.
- **SC-010**: Notificaciones no duplican (1h window) y recordatorios 24h/2h llegan ≤5min ventana.
- **SC-011**: Fotos estilos upload ≤5MB y storage `client-styles` bucket OK, PWA compatible.
- **SC-012**: Pagos historial muestra `Pagado $35k` desde `transactions` y anticipo stub si `online`.
- **SC-013**: Cobertura críticos ≥80% (`booking-availability`, `waitlist`, `reviews`, `preferences`) + E2E `reserva→checkin→reseña` verde.

## Assumptions

- Se usa Supabase local `127.0.0.1:54321/54322` y Cloud prod; `IS_DOCKER=true` traduce URLs `lib/supabase/getUrl.ts:10`.
- `businesses.slug=escuderia` es default (seed `drizzle/seed.ts:188`); `locations 2` Centro/Norte ya existen `044`.
- Pagos online V1 es stub `payment_intent` sin PSP; Bold/Wompi/Stripe V2 post-validación.
- Chat V1 es transaccional por `appointment_id`, no websocket libre (usa `notification_log` + `appointments.notes`).
- Reseñas moderadas post-envío, visibles solo para negocio + autor.
- `client_styles` fotos requieren `storage` bucket `client-styles` (o reuse `inventory`).
- Multi-idioma `es-CO` ya via `next-intl`.

## Dependencies

- Migraciones `001..087` + `058_rbac_barbero` aplicadas; `087_landing_generic` ya.
- `proxy.ts:332` stealth + `app/page.tsx:130` client-first (reciente fix) debe mantenerse.
- `lib/auth/roles.ts:190` + `proxy.ts` RBAC.

## Out of Scope (V1 — Slice 1+2)

- PSP real (Bold/Wompi/Stripe) y vault tarjetas — solo stub.
- Marketplace multi-tenant self-service signup.
- IA recomendación estilos — solo guardar `preferences` V1.
- Tarjetas regalo compra flujo completo — solo schema V1.

