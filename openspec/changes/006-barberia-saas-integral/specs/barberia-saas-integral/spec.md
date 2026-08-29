# Feature Specification: Barbería SaaS Integral — Escudería

**Feature Branch**: `006-barberia-saas-integral`

**Created**: 2026-08-28

**Status**: Draft

**Input**: SaaS integral de barbería Escudería — planificación completa con spec-kit (Next.js 16 + Supabase, 57 migraciones). Ya existen Dashboard, Agenda (/booking), Clientes/CRM, POS/Caja, Inventario, Configuración. Faltan: Membresías, Promociones, CRM campañas, Fidelización, Reportes avanzados, Multi-sucursal real, Barberos/Servicios como rutas propias, Lista de espera, Citas recurrentes, Propinas. Fuente: módulos imprescindibles + 4 experiencias + CRM "Carlos 42 días sin venir → campaña WhatsApp" + estructura premium mobile-first.

## Overview

Escudería es la barbería flagship sobre Pronto. Esta spec define el **SaaS integral** que permite operar 1→N sucursales con una experiencia premium mobile-first consistente en todo el flujo: descubrimiento → reserva 24/7 → confirmación/recordatorio → servicio → cobro → fidelización → retorno.

**Stack congelado**: Next.js 16 + React 19 + Tailwind + shadcn/ui + Supabase (Postgres+Auth+Storage+RLS) + Serwist PWA + next-intl (`es-CO`, `COP`, `America/Bogota`) + Docker `standalone`. Ver `plan.md` para decisión **por qué no Django**.

**Navegación Escudería** (sidebar premium):
`Dashboard / Agenda / Clientes / Barberos / Servicios / POS / Caja / Inventario / Membresías / Promociones / CRM / Reportes / Sucursales / Configuración` + `book/[slug]` público y `/client` portal.

**Principios traccionados**: Pronto-First (library-first), Spec-First, Mobile-First PWA offline-safe, Integridad transaccional NON-NEGOTIABLE, Simplicidad radical, Multi-sucursal contenida. Ver `.specify/memory/constitution.md` v2.0.0.

---

## User Scenarios & Testing

### User Story 1 — Cliente: Reserva 24/7 premium 1-click (Priority: P1) 🎯 MVP

Como cliente quiero reservar 24/7 eligiendo servicio/barbero/horario en <45s, recibir confirmación inmediata, recordatorio WhatsApp, y poder cancelar/reprogramar sin llamar; y volver en 1-click usando mi historial.

**Why this priority**: Es el canal de adquisición principal. Si la reserva no es frictionless y mobile-first, el resto del SaaS no genera ingresos.

**Independent Test**: Sin cuenta, en móvil, flujo `book/escuderia` servicio→barbero→fecha→hora→nombre+tel→confirmar. Cita `confirmed` con `price/duration` correctos. Cancelar/reprogramar desde link por token. Historial accesible en `/client` por teléfono+OTP o magic link. Doble reserva paralela → 1×201, 1×409.

**Acceptance Scenarios**:
1. **Given** barbería con `services` y `employees` activos y `business_hours` Lun-Sáb 09:00-19:00 con break 13:00-14:00, **When** cliente elige "Corte" 45 min + barbero "Andrés" + fecha/hora dentro de `effectiveHours`, **Then** ve slots generados por `lib/booking-availability.ts:checkSlotWithinHours` y `get_booked_slots(employee_id)` y puede confirmar con solo nombre+tel (Zod + DomPurify + rateLimit 20/10m).
2. **Given** dos clientes hacen `POST /api/book` al mismo `employee_id+starts_at` simultáneamente, **When** ambas transacciones compiten, **Then** `check_slot_availability()` (032 `pg_advisory_xact_lock`) permite solo una, la otra recibe `slot_taken` 409.
3. **Given** cita `confirmed` con `starts_at` en 48h, **When** pasan 24h y 1h antes, **Then** se encolan `notification_log` y se dispara recordatorio WhatsApp Meta Cloud API (plantilla) + Email fallback; estados registrados sin duplicados.
4. **Given** cliente quiere volver, **When** abre `/book/escuderia` y autentica por teléfono+OTP (o magic link), **Then** ve su historial, barbero habitual pre-seleccionado, y puede re-reservar en 1-click sin reingresar datos.
5. **Given** cliente quiere cancelar 12h antes (política configurable `cancel_lead_time`), **When** cancela desde link token, **Then** `status=cancelled`, slot liberado, notificación a barbero y sin penalización; si cancela <2h → `cancelled_late` con flag.
6. **Given** cliente elige "Cualquiera" (`employee_id=NULL`), **When** confirma, **Then** trigger 032 auto-asigna barbero libre con especialidad; si ninguno → `no_staff_available` 409 honesto.

---

### User Story 2 — Barbero: Agenda personal, comisiones y propinas (Priority: P1)

Como barbero quiero ver solo mi agenda diaria/semanal, mi próximo cliente, historial del cliente, registrar propinas, ver mis comisiones/productividad y gestionar mi horario/bloqueos.

**Why this priority**: El barbero es el usuario operativo más frecuente. Si su flujo no es touch-perfect y enfocado, genera fricción y errores en caja/comisiones.

**Independent Test**: Login como `role=barbero` (005 RBAC) → `proxy.ts` bloquea `/caja|/inventory|/settings` → redirect `/dashboard`. Sidebar filtrado (dashboard/booking/POS propios). Agenda `booking-calendar.tsx` filtrada por `employee_id=self`. POS filtra servicios por `employee_services`. Comisiones y propinas visibles.

**Acceptance Scenarios**:
1. **Given** barbero "Andrés" autenticado, **When** abre Agenda, **Then** ve solo sus citas `scheduled→confirmed→checked-in→in-service→completed`, con color de servicio/barbero, próxima cita destacada y CTA `Checked-in→In-service→Completed`.
2. **Given** cita `checked-in`, **When** barbero abre ficha cliente, **Then** ve `client.total_visits/total_spent/last_visit_at`, notas, preferencias, barbero habitual, cumpleaños y puede iniciar POS con contexto `bookingContext`.
3. **Given** venta POS con servicio "Corte $30.000" + `commission_rate 50%` + propina `cash $5.000`, **When** cobra, **Then** `transactions` con `items jsonb`, `commissions` $15.000 y `tips` $5.000 asociados a `employee_id`, visibles en su reporte personal y no editables por él.
4. **Given** barbero quiere bloquear vacaciones 2026-12-24 a 26 y horario Lun-Vie 09-19 con break 13-14, **When** guarda (o manager lo hace por él), **Then** `employee_unavailability` (037) bloquea slots y `checkSlotWithinHours` rechaza reservas fuera de rango con `outside_availability`.

---

### User Story 3 — Administrador: Operación global (Priority: P1)

Como administrador/recepción quiero agenda global (todos los barberos, drag&drop), gestionar clientes/barberos/servicios, operar caja e inventario, crear promociones/membresías/campañas, y ver reportes operativos.

**Why this priority**: Es quien hace que la barbería abra y cierre sin Excel. Sin operación global, single-sede no escala a multi-sucursal.

**Independent Test**: Login `admin|manager|receptionist` → ve Agenda global con filtros `location_id|employee_id|service_id|status`. CRUD clientes/barberos/servicios/inventario. POS completo. Caja apertura/cierre con descuadre. CRM campañas. Promociones y membresías aplicables en POS y booking.

**Acceptance Scenarios**:
1. **Given** agenda global con 4 barberos, **When** admin arrastra cita de 10:00 a 11:00 o cambia barbero, **Then** `PATCH /api/appointments/[id]` valida `check_barber_availability` (040) + FSM guard (039/047) y bloquea si slot ocupado (`409`) o fuera de horario/break/vacaciones.
2. **Given** cliente "Carlos" 42 días sin venir (`last_visit_at = now()-42d`), **When** admin abre CRM → segmento `inactivos 30+ días`, **Then** ve lista accionable con filtro, 1-click crea campaña WhatsApp "Te extrañamos — 20% corte esta semana" con plantilla, `notification_log` y métrica retorno.
3. **Given** inventario "Pomada" `quantity 2 threshold 5`, **When** admin ve dashboard, **Then** alerta stock bajo + notificación; venta POS descuenta `inventory_movements(type=out)` y bloquea venta si stock insuficiente sin `adjustment` explícito.
4. **Given** caja abierta 08:00 con $100.000, **When** cierra 19:00 con esperado $850.000 y real $845.000, **Then** `cash_registers difference=-$5.000` con auditoría quién/qué/cuándo; POS exige caja abierta si `require_open_register=true` (055).
5. **Given** promoción "2x1 martes" 15% y membresía "Corte ilimitado $99k/mes", **When** cliente elegible paga, **Then** descuento se aplica en POS/booking, queda trazado en `transactions.discount` y `membership_usages`, y no acumula doble promo salvo regla explícita.

---

### User Story 4 — Dueño: Dashboard y decisiones (Priority: P1)

Como dueño quiero en 5 segundos: ventas hoy, citas hoy/mañana, clientes nuevos/recurrentes, ticket promedio, top barberos, caja, inventario crítico y reportes exportables para decidir.

**Why this priority**: Si el dueño no ve tracción en 5s, no confía para escalar a multi-sucursal.

**Independent Test**: `GET /dashboard` SSR carga `todayRevenue, apptToday, newVsReturning, avgTicket, topBarbers, lowStock` en p95 <2s. Reportes día/semana/mes con exportación CSV/Excel. Filtros por `location_id` y rango fecha.

**Acceptance Scenarios**:
1. **Given** ventas del día $1.200.000 en 18 transacciones, **When** dueño abre dashboard, **Then** ve `ventas hoy $1.200.000`, `ticket promedio $66.666`, `citas hoy 20 (2 canceladas, 1 no-show)`, `nuevos 3 / recurrentes 15`, `top barbero Andrés $420k` sin gráficos irrelevantes.
2. **Given** 30 días de `transactions+commissions+tips`, **When** pide reporte "ventas por barbero" o "comisiones por período", **Then** obtiene `barbero, servicios, ventas, comisión, propinas, ticket` consistente con DB y puede exportar `xlsx` con filas visibles.
3. **Given** 2 sucursales "Centro" y "Norte" (044), **When** filtra dashboard por `location_id`, **Then** métricas se segmentan por sede y ve comparativo Centro vs Norte.
4. **Given** campaña "Carlos 42d" enviada a 40 inactivos, **When** revisa CRM reporte, **Then** ve `enviados 40, entregados 38, re-reservas 8 (20%), ingresos atribuidos $480k`.

---

### User Story 5 — Membresías, Promociones y Fidelización (Priority: P2)

Como barbería quiero vender membresías (ej. "4 cortes/mes $99k"), aplicar promociones (2x1, % descuento, combos, cumpleaños), y fidelizar con puntos/bonos para aumentar recurrencia.

**Why this priority**: Aumenta LTV y reduce churn. Sin membresía, el ticket se estanca.

**Independent Test**: CRUD `memberships` (nombre, precio, duración, beneficios, sucursal). Venta POS genera `client_memberships` vigente. Booking y POS validan elegibilidad y descuentan uso. Promociones con reglas `day_of_week, service_ids, client_segment, validity`. Puntos: `earn 1pt/$1k` → `redeem`.

**Acceptance Scenarios**:
1. **Given** membresía "4 cortes/mes $99.000" 30 días, **When** cliente la compra en POS (`cash/card/transfer`), **Then** `client_memberships status=active, remaining=4, expires_at=now()+30d` y próxima reserva "Corte" descuenta `remaining--` sin cobrar si quedan usos.
2. **Given** promoción "Cumpleaños 20% esta semana" (segmento `birthday within 7d`), **When** cliente cumpleaños reserva, **Then** el descuento se sugiere en booking/POS, con `promo_code` opcional y validación `valid_from/to`.
3. **Given** cliente acumula 120 puntos, **When** paga $45.000 corte, **Then** gana `+45 pts`, puede canjear `100 pts = $10.000` con `loyalty_redemptions` y queda auditado.

---

### User Story 6 — Multi-sucursal real (Priority: P2)

Como dueño quiero operar N sedes con agenda/inventario/caja por sede, permisos por sede, y reporting consolidado vs por sede.

**Why this priority**: Escudería quiere escalar a N locales. Sin `location_id` real, cada sede replicaría Excel.

**Independent Test**: `locations` CRUD (044 ya existe). `employees/services/appointments/inventory/cash_registers/memberships` con `location_id`. RLS `my_location_ids()` futuro (plan). Transferencia inventario entre sedes. Dashboard por sede + consolidado.

**Acceptance Scenarios**:
1. **Given** 2 sedes "Centro" y "Norte", **When** recepcionista Centro crea cita, **Then** solo ve barberos/servicios de Centro; cita con `location_id=centro`.
2. **Given** producto "Cera" con stock 10 Centro / 0 Norte, **When** se transfiere 3 unidades Norte, **Then** `inventory_movements` `out Centro` + `in Norte` atómicos y auditoría.
3. **Given** gerente solo de Norte, **When** intenta ver caja Centro, **Then** RLS bloquea (403) salvo owner multi-sede.
4. **Given** cierre de mes, **When** dueño ve reporte, **Then** ve consolidado + breakdown por sede sin doble conteo.

---

### User Story 7 — Lista de espera, citas recurrentes, bloqueos y propinas (Priority: P2)

Como barbería quiero lista de espera automática, citas recurrentes (cada 15 días), bloqueos de agenda (feriados, mantenimiento) y propinas registradas.

**Why this priority**: Reduce no-show, aumenta ocupación y transparencia con barberos.

**Independent Test**: `POST /api/book` sin slot → `waitlist` entry. Al cancelar, `waitlist` notifica primero en fila (WhatsApp). `recurring_appointments` genera serie `FREQ=WEEKLY INTERVAL=2` con `pg_cron` o trigger. `business_hours` + `employee_unavailability` bloquean. `tips` en `transactions`.

**Acceptance Scenarios**:
1. **Given** slot 10:00 lleno y 3 en `waitlist`, **When** cliente cancela 10:00, **Then** el primero en `waitlist` recibe WhatsApp "slot liberado, confirmar en 30m" y si confirma, cita se crea `confirmed` y sale de lista.
2. **Given** cliente quiere "Corte cada 15 días por 3 meses" con Andrés martes 10:00, **When** crea recurrencia, **Then** se generan 6 citas `scheduled` validando disponibilidad cada una; si una choca → se omite con aviso y resto se crea.
3. **Given** festivo 2026-12-25 `business_hours is_open=false` o `holiday_block`, **When** se intenta reservar, **Then** `outside_availability` 400 y picker no muestra día.
4. **Given** cliente paga $50.000 y deja $5.000 propina `cash`, **When** cierra POS, **Then** `transactions.tip_amount=5000` y `tips` por `employee_id`, reportable y no parte de caja salvo config.

---

### Edge Cases

- Reserva concurrente exacta mismo `employee_id+starts_at` → advisory lock garantiza 1 gana (032).
- Reserva `employee_id=NULL` sin barbero libre → `no_staff_available` 409, opción join `waitlist`.
- Editar cita cambiando `starts_at` a slot ocupado → trigger 017/031/032 bloquea en UPDATE; FSM guard 039/047 bloquea transiciones ilegales (ej. `completed→cancelled`).
- Reserva fuera de `business_hours` o break o `employee_unavailability` o festivo → `outside_availability` 400 aunque UI sea bypassed.
- Cliente con `phone`+`email` que matchean dos registros → upsert `OR` con normalización E.164 sin '+' (bug-8/9/10 fixed).
- POS offline múltiples ventas sin sync → `pending_transactions OFFLINE-*` sin colisión (offline-db) y `syncQueue()` con reintento; caja offline no cierra.
- Stock llega a 0 durante venta POS → `type=out` rechaza si `quantity<threshold` sin `adjustment`; alerta low-stock.
- `pg_cron/pg_net` no habilitado → migración 007 skip con NOTICE, fallback `cron-job.org GET /api/cron/notify CRON_SECRET`.
- `formatCurrency` sin `businesses.currency` → default `COP` parametrizado, nunca hardcode USD.
- Membresía expirada o sin usos restantes → POS rechaza uso con `membership_expired/no_uses_left` y ofrece renovación.
- Propina negativa o >50% venta → Zod `tip_amount >=0 && <= amount*0.5` salvo `MANAGER_OVERRIDE`.
- Transferencia inventario inter-sede con stock insuficiente → transacción aborta, sin movimientos parciales.
- RLS regresión: no reintroducir `public_read_businesses_for_booking` sin revocar sensibles (016).
- Teléfono colombiano en formatos `+57 300...`, `300-123-4567`, `(300) 123...` → `normalizePhone` E.164.

---

## Requirements

### Functional Requirements — Clientes (perfil, historial, barbero habitual, preferencias, cumpleaños, notas)

- **FR-CRM-001**: System MUST gestionar clientes con `name, phone(E.164), email?, birthday, notes, tags[], preferences jsonb, status(active/inactive/VIP), total_visits, total_spent, last_visit_at, preferred_barber_id, location_id` y unicidad `business_id+phone` (025).
- **FR-CRM-002**: System MUST mostrar ficha cliente con historial citas/servicios/pagos/compras, frecuencia, gasto, última/próxima cita, notas y acciones rápidas crear cita / mensaje WhatsApp / registrar venta / editar.
- **FR-CRM-003**: System MUST detectar segmentos: `inactivos 30+/42+/60d`, `cumpleaños próximos 7d`, `nuevos (<3 visitas)`, `VIP`, `frecuentes` y exponerlos como vistas filtrables.
- **FR-CRM-004**: System MUST permitir importar/exportar clientes CSV/Excel con validación y `client_phone_unique`.

### Functional Requirements — Citas (reservar, reprogramar, cancelar, lista de espera, recurrentes)

- **FR-APT-001**: System MUST implementar reserva pública `/book/[slug]` mobile-first ultra rápida: servicio→barbero→fecha→hora→contacto→confirmar sin cuenta, con validación Zod + DomPurify + rateLimit y `starts_at` no pasado (053).
- **FR-APT-002**: System MUST soportar estados FSM `scheduled→confirmed→checked-in→in-service→completed` + `cancelled/cancelled_late/no_show/paid` con guard 039/047/052 y transiciones auditadas.
- **FR-APT-003**: System MUST impedir doble reserva vía trigger `check_slot_availability()` con `pg_advisory_xact_lock` (032) y distinguir `slot_taken` vs `no_staff_available` (034).
- **FR-APT-004**: System MUST soportar `employee_id=NULL` (Anyone) con auto-assign a barbero libre con especialidad y capacidad (032).
- **FR-APT-005**: System MUST permitir reprogramar/cancelar con política `cancel_lead_time` y `business_lead_time` (054) por `businesses` y `locations`, liberando slot y notificando.
- **FR-APT-006**: System MUST implementar **lista de espera** `waitlist(business_id, location_id, service_id, employee_id?, client_id, desired_at, status=waiting/notified/converted/expired)` con notificación automática al liberar slot.
- **FR-APT-007**: System MUST implementar **citas recurrentes** `recurring_appointments(id, business_id, client_id, service_id, employee_id, rrule, location_id, next_at, until)` generando serie `appointments` con validación por ocurrencia; `pg_cron` o generación on-create.
- **FR-APT-008**: System MUST bloquear reservas fuera de `business_hours`, break (035), `employee_unavailability` (037), festivos `holidays(business_id, date, is_open=false)` y `employee_services` (036).

### Functional Requirements — Agenda (diaria/semanal, disponibilidad por barbero, bloqueos)

- **FR-AGE-001**: System MUST proveer calendario diario/semanal por `location_id` y `employee_id`, con drag&drop, filtros `status/service/location/barber`, colores por barbero (038) y vista mobile touch.
- **FR-AGE-002**: System MUST calcular disponibilidad `checkSlotWithinHours` + `get_booked_slots(p_employee_id)` + `check_barber_availability` (040) + `effectiveHours` por `business_hours`+`break`+`holidays`.
- **FR-AGE-003**: System MUST soportar bloqueos: `business_hours is_open=false`, `holidays`, `employee_unavailability` por rango y `break_start/end` por día, todo validado server-side.

### Functional Requirements — Barberos (horarios, comisiones, productividad)

- **FR-BAR-001**: System MUST gestionar barberos como `employees` con `name, avatar_url, color hex (038), specialties[], commission_rate, commission_fixed, bio, is_active, location_id, user_id, role` y constraint `role∈{owner,admin,manager,barber,receptionist}` (058).
- **FR-BAR-002**: System MUST mapear `employee_services(employee_id, service_id)` (036) para filtrar servicios por barbero en POS y booking.
- **FR-BAR-003**: System MUST gestionar `employee_unavailability` (037) (vacaciones/descanso/médico) y `business_hours` por sede (009/035/044).
- **FR-BAR-004**: System MUST registrar `commissions` por venta (042/043/046) con `rate` o `fixed` por barbero/servicio/producto, y `tips` por `employee_id`.
- **FR-BAR-005**: System MUST exponer productividad por barbero: citas, servicios, ventas, comisión, propinas, ticket promedio, ocupación (`slots_booked/slots_available`).

### Functional Requirements — Servicios (cortes, combos, duración, precio, promociones)

- **FR-SRV-001**: System MUST gestionar servicios con `name, description, duration_min, price, cost, category, capacity, color, is_featured, is_active, location_id, business_id` (038) y CRUD en `/servicios`.
- **FR-SRV-002**: System MUST soportar **combos** `service_combos(id, business_id, name, service_ids[], price, duration_min)` aplicados como `items jsonb` en `transactions`.
- **FR-SRV-003**: System MUST filtrar servicios por `employee_services` y `location_id` en booking y POS.

### Functional Requirements — Pagos (efectivo/tarjeta/transfer/digitales, caja)

- **FR-PAY-001**: System MUST soportar métodos `cash/card/transfer/digital` configurables por `businesses.payment_methods` y `transactions.payment_method` con `status=completed/pending/paid`.
- **FR-PAY-002**: System MUST implementar **caja** `cash_registers` (041) con apertura/cierre, `expected/actual/difference`, `movements`, `opened_by/closed_by`, y config `pos_cash_register_config` (055) `require_open_register`.
- **FR-PAY-003**: System MUST auditar caja y pagos (`audit_log` quién/qué/cuándo) y bloquear cierre con `difference` sin `closed_by`.

### Functional Requirements — Ventas/POS (productos, inventario, descuentos, facturación)

- **FR-POS-001**: System MUST proveer POS que cierre venta en ≤3 clicks / ≤15s móvil: cliente→servicio→barbero→productos→descuento→total→método pago→recibo→`appointments→completed/paid`, con o sin `bookingContext`.
- **FR-POS-002**: System MUST manejar inventario `inventory_items` con `sku unique per business (018), barcode (027), category, provider, cost_price, sell_price, quantity, low_stock_threshold, location_id` + `inventory_movements(type in/out/adjustment/transfer)`.
- **FR-POS-003**: System MUST soportar descuentos por línea y global (`discount_amount/percent`) con `discount_reason` y validación `discount <= max_discount%` por rol.
- **FR-POS-004**: System MUST generar `receipt_number` incremental por `business_id` y permitir impresión/WhatsApp ticket.
- **FR-POS-005**: System MUST operar **offline-safe** con `lib/offline-db.ts:pending_transactions` + `syncQueue()` al volver online, solo para POS; nunca para reservas/caja cierre.

### Functional Requirements — Marketing (WhatsApp, recordatorios, promociones, cumpleaños, inactivos)

- **FR-MKT-001**: System MUST enviar notificaciones priorizando WhatsApp Meta Cloud API v20 (`businesses.meta_whatsapp_*` 033) > Email (Resend/SMTP 015) > Telegram (003), con plantillas, `notification_log` anti-duplicado (002), reintentos y estados.
- **FR-MKT-002**: System MUST disparar: confirmación inmediata, recordatorio 24h/1h, thank-you, reactivación 30d sin visita (007 `pg_cron` o `cron-job.org` fallback), cumpleaños 7d, y "Carlos 42d inactivo → campaña".
- **FR-MKT-003**: System MUST proveer **CRM campañas** `campaigns(id, business_id, name, segment, channel, template, status=draft/sent, sent_at, stats jsonb)` + `campaign_recipients(campaign_id, client_id, status)` con creación desde segmento en 1-click.
- **FR-MKT-004**: System MUST normalizar teléfonos a E.164 sin '+' para WhatsApp y manejar errores sin exponer tokens en frontend.

### Functional Requirements — Fidelización (puntos, membresías, bonos)

- **FR-LOY-001**: System MUST gestionar **membresías** `memberships(id, business_id, location_id, name, price, duration_days, benefits jsonb, is_active)` y `client_memberships(id, client_id, membership_id, starts_at, expires_at, remaining, status=active/expired/cancelled)` con consumo en booking/POS.
- **FR-LOY-002**: System MUST gestionar **promociones** `promotions(id, business_id, location_id, name, type=percent/fixed/combo, value, promo_code?, valid_from/to, rules jsonb {day_of_week, service_ids, client_segment}, is_active)` aplicables en booking/POS con 1 promo por transacción salvo acumulo explícito.
- **FR-LOY-003**: System MUST gestionar **puntos** `loyalty_accounts(client_id, points)` + `loyalty_movements(id, client_id, type=earn/redeem/adjust, points, reference)` + `loyalty_redemptions` con earn `1pt/$1k` configurable y redeem validado.
- **FR-LOY-004**: System MUST exponer historial fidelización en ficha cliente y validar membresía/promo/puntos server-side antes de aplicar descuento.

### Functional Requirements — Reportes (ventas, ganancias, citas, ticket, nuevos/recurrentes)

- **FR-RPT-001**: System MUST proveer dashboard operativo p95 <2s: ventas hoy, citas hoy/mañana, clientes atendidos, ingresos, ticket promedio, nuevos/recurrentes, top barberos, comisiones, propinas, caja, stock bajo.
- **FR-RPT-002**: System MUST proveer reportes día/semana/mes: ventas, servicios/productos más vendidos, ingresos por barbero, comisiones, propinas, clientes nuevos/recurrentes, cancelaciones/no-show, ticket promedio, ocupación, campañas retorno, membresías vigentes/vencidas.
- **FR-RPT-003**: System MUST filtrar reportes por `location_id` y rango fecha y exportar CSV/Excel donde aporte, sin doble conteo multi-sede.
- **FR-RPT-004**: System MUST exponer métricas atribuibles a campañas: `sent/delivered/rebooked/revenue_attributed`.

### Functional Requirements — Multi-sucursal

- **FR-MUL-001**: System MUST implementar `locations(id, business_id, name, slug, address, phone, is_active)` (044) con seed `Escudería Centro` y CRUD en `/sucursales`.
- **FR-MUL-002**: System MUST propagar `location_id` nullable a `employees, services, appointments, inventory_items, cash_registers, memberships, promotions, campaigns` con índices `idx_*_location` y RLS `tenant_access_*` por `business_id` (+ futuro `my_location_ids()`).
- **FR-MUL-003**: System MUST soportar transferencia inventario inter-sede atómica `out/in` y permisos por sede (owner multi-sede vs manager single-sede).
- **FR-MUL-004**: System MUST segmentar agenda/dashboard/reportes/CRM por `location_id` con consolidado opt-in para owner.

### Functional Requirements — Usuarios/Roles (dueño/admin/gerente/barbero/recepción)

- **FR-USR-001**: System MUST implementar roles `owner/admin/manager/barber/receptionist` con `lib/auth/roles.ts` single source, `proxy.ts` guard + `x-user-role` header, y `app/(dashboard)/layout.tsx` resolve `business+role`.
- **FR-USR-002**: System MUST filtrar sidebar `components/layout/sidebar.tsx` por rol: barbero solo `Dashboard/Agenda/POS` (propios); receptionist `Agenda/Clientes/POS/Caja`; manager `+Barberos/Servicios/Inventario/Reportes`; admin/owner todo.
- **FR-USR-003**: System MUST reforzar con RLS `current_user_role()` (058): barbero solo `employee_id=self` en `appointments/commissions/tips/cash_registers`.
- **FR-USR-004**: System MUST mantener `public_read_*` para `/book` y `/client` tokenizado sin exponer `service_role` en cliente.

### Functional Requirements — Configuración (horarios, festivos, cancelación, impuestos)

- **FR-CFG-001**: System MUST configurar por `businesses` y `locations`: `business_hours(0-6, open/close, break_start/end)`, `holidays(date, reason)`, `cancel_lead_time`, `business_lead_time` (054), `timezone/currency/brand_color (024), notification_language (029), enabled_modules (026)`.
- **FR-CFG-002**: System MUST configurar impuestos `tax_rate%` y `payment_methods[]` por negocio, aplicados en POS con `tax_amount` en `transactions`.
- **FR-CFG-003**: System MUST parametrizar reglas fidelización: `loyalty_earn_rate`, `loyalty_redeem_rate`, `membership` y `promotion` defaults sin hardcode COP/locale.
- **FR-CFG-004**: System MUST exponer onboarding `app/onboarding/*` para completar `locations, business_hours, employees, services, brand_color` con checklist.

---

### Key Entities

- **Business**: `id, owner_id, name, slug, type, phone, email, address, timezone(America/Bogota), currency(COP), plan, brand_color, notification_language, enabled_modules, payment_methods, cancel_lead_time, business_lead_time, tax_rate, loyalty_earn_rate, meta_whatsapp_*/smtp_*/resend_*` — tenant root.
- **Location**: `id, business_id, name, slug, address, phone, is_active` (044) — sede física; FK nullable en resto para no romper single-sede.
- **Client**: `id, business_id, location_id?, name, phone(E.164 unique per business), email?, birthday, notes, tags[], preferences jsonb, status, whatsapp_number, preferred_barber_id, total_visits, total_spent, last_visit_at` — PII cifrada via `pgsodium` (045/050) cuando vault disponible.
- **Employee/Barbero**: `id, business_id, location_id?, user_id?, name, role, phone, email, avatar_url, color hex, specialties[], is_active, commission_rate, commission_fixed, bio` (038) — role constraint 058.
- **EmployeeService**: `employee_id, service_id` (036) — qué barbero hace qué.
- **EmployeeUnavailability**: `id, employee_id, starts_at, ends_at, reason` (037) — vacaciones/bloqueos.
- **Service**: `id, business_id, location_id?, name, description, duration_min, price, cost, category, capacity, color, is_featured, is_active`.
- **ServiceCombo**: `id, business_id, name, service_ids[], price, duration_min, is_active` — combo nuevo.
- **BusinessHours**: `business_id, location_id?, day_of_week, is_open, open_time, close_time, break_start, break_end` (009/035) — por sede.
- **Holiday**: `id, business_id, location_id?, date, reason, is_open=false` — festivos nuevo.
- **Appointment**: `id, business_id, location_id?, client_id, employee_id?, service_id, starts_at, ends_at, status FSM, price, tip_amount?, source, notes, recurring_id?` — trigger 032 anti-doble-reserva.
- **RecurringAppointment**: `id, business_id, location_id?, client_id, service_id, employee_id?, rrule, next_at, until, is_active` — nuevo.
- **Waitlist**: `id, business_id, location_id?, service_id, employee_id?, client_id, desired_at, status(waiting/notified/converted/expired)` — nuevo.
- **Transaction**: `id, business_id, location_id?, appointment_id?, client_id, employee_id?, amount, tax_amount?, discount_amount?, payment_method, status, items jsonb, receipt_number, tip_amount?`.
- **InventoryItem/Movement**: `item(location_id?, sku unique per business, barcode, quantity, cost_price, sell_price, threshold)` + `movement(type in/out/adjustment/transfer, quantity, note, created_by, from_location?, to_location?)`.
- **CashRegister**: `id, business_id, location_id?, opened_by, opened_at, closed_at, expected_cash, actual_cash, difference, status(open/closed)` (041) + config 055.
- **Commission**: `id, business_id, employee_id, transaction_id, amount, rate` (042/043/046).
- **Tip**: `id, business_id, employee_id, transaction_id, amount, method` — nuevo (parte de transactions tip_amount pero reportable separado si hace falta tabla).
- **Membership/MembershipUsage**: `membership(...)` + `client_memberships(client_id, membership_id, starts_at, expires_at, remaining, status)` — nuevo.
- **Promotion**: `id, business_id, location_id?, name, type, value, promo_code?, valid_from/to, rules jsonb, is_active` — nuevo.
- **LoyaltyAccount/Movement**: `account(client_id, points)` + `movement(type earn/redeem)` + `redemption` — nuevo.
- **Campaign/CampaignRecipient**: `campaign(name, segment, channel, template, status, stats)` + `recipient(campaign_id, client_id, status)` — nuevo; nutre `notification_log`.
- **NotificationLog**: `id, business_id, appointment_id?, campaign_id?, channel, event, status` (002) — anti-duplicado.
- **AuditLog**: `who, what, when, record, location_id?` — trazabilidad caja/pagos/inventario/membresías.

### Non-Functional Requirements

- **NFR-001 — Premium Visual**: System MUST usar shadcn/ui + Tailwind con jerarquía premium (tipografía, espaciado, colores por `brand_color` 049, estados vacíos ilustrados, micro-interacciones) — Lighthouse Best Practices ≥90. Toda ruta `/dashboard`, `/agenda`, `/clientes`, `/barberos`, `/servicios`, `/promociones`, `/crm` debe tener `loading.tsx` y `error.tsx` cuidados.
- **NFR-002 — Mobile-First**: System MUST ser touch ≥44px, navegación bottom-tab en móvil, POS y calendario usables con una mano, `booking-form.tsx` en ≤4 steps visibles, sin scroll horizontal. Test en 375px (iPhone SE) y 360px (Android).
- **NFR-003 — Performance**: LCP `/book/[slug]` <1.5s p75, dashboard p95 <2s, POS interacción <100ms, `get_booked_slots` <200ms p95 con índice `idx_appointments_employee_starts`. `runtimeCaching NetworkFirst supabase-data` PWA cacheado.
- **NFR-004 — PWA Offline-Safe**: Instalable (`manifest.json` + `site.webmanifest` + `sw.ts` Serwist con `fallbacks /offline`). Offline solo POS cola IndexedDB; reservas/caja requieren online. `additionalPrecacheEntries ['/offline']` garantizado.
- **NFR-005 — Seguridad**: RLS en toda tabla nueva, `REVOKE anon` de sensibles, `search_path=public` en funciones `SECURITY DEFINER`, headers `HSTS/XFO/CSP` (004), rateLimit `book 20/10m`, `sign_in 30/5m`, Zod+DomPurify en todo `api/*`.
- **NFR-006 — Observabilidad**: Logs estructurados en `api/*`, `notification_log` con `status=pending/sent/failed`, `audit_log` por operación crítica, `supabase Advisors` sin flags antes de merge.
- **NFR-007 — Accesibilidad**: WCAG AA (contraste, focus, aria, keyboard nav), `next-intl` `es-CO` completo, `formatCurrency` parametrizado.
- **NFR-008 — Escalabilidad**: `location_id` nullable no rompe queries existentes; índices por `business_id+location_id`; paginación server-side en CRM/reportes (cursor, no offset masivo).

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: Reserva pública completa en ≤45s móvil (servicio→confirmar) sin cuenta; 90% de intentos sin error en lab 20 usuarios.
- **SC-002**: Cero doble reservas en 10/10 intentos paralelos (2 POST mismo slot → 1×201, 1×409) medido con `k6` o `vitest concurrent`.
- **SC-003**: POS cierra venta (servicio+producto+descuento+pago) en ≤3 taps y ≤15s en móvil 4G.
- **SC-004**: Notificación WhatsApp confirmación llega ≤30s tras `appointments insert` o queda en `notification_log` con error trazable y reintento 3×.
- **SC-005**: Dashboard carga métricas día en ≤2s p95 (7 días transacciones) y muestra stock bajo sin falsos negativos (alerta dispara ≤60s tras `quantity<=threshold`).
- **SC-006**: "Carlos 42d inactivo" detectado automáticamente (cron diario 09:00 `America/Bogota`) → campaña creada → WhatsApp enviado → 15% de inactivos re-reservan en 7 días (attribution en `campaign_recipients`).
- **SC-007**: Membresía "4 cortes/mes" comprada y consumida en booking/POS con `remaining` correcto; 0 usos fuera de vigencia sin bloqueo 200.
- **SC-008**: Multi-sucursal: agenda/reportes segmentados por `location_id` sin cross-leak (RLS test `anon vs barber Centro vs manager Norte`).
- **SC-009**: Propinas y comisiones registradas y reportables por barbero/día/semana con soma consistente `SUM(commissions) == SUM(transactions*rate)`.
- **SC-010**: Lista de espera: al cancelar, `waiting[0]` notificado ≤60s y conversión ≥30% si confirma en 30m.
- **SC-011**: Citas recurrentes: serie `FREQ=WEEKLYx6` generada con 100% validación por ocurrencia; solo choca 1 → aviso y 5 creadas.
- **SC-012**: Localización COP/es-CO 100% (snapshot `formatCurrency(30000,'COP')→$30.000`), timezone `America/Bogota` en `starts_at` display.
- **SC-013**: Cobertura críticos ≥80% (`booking-availability`, `commissions`, `tips`, `cash_registers`, `memberships`, `inventory`) + E2E `cliente→reserva→recordatorio→recepción→servicio→checkout→pago→historial→campaña` verde en CI.
- **SC-014**: PWA instalable en Android/iOS, POS offline cola sync sin pérdida tras 5 ventas offline y vuelta online.
- **SC-015**: `gentle-ai sdd-status` y `specify` reconocen `006-barberia-saas-integral` con `spec.md+plan.md+tasks.md` y constitución v2.0.0.

## Assumptions

- Se usa Supabase Cloud (no local stack) con `DATABASE_URL` 5432 SSL `certs/supabase-ca.crt`, `CRON_SECRET` y `INTERNAL_API_SECRET` `openssl rand -hex 32`; `pg_cron/pg_net` opcional con fallback `cron-job.org`.
- Single sede "Escudería Centro" ya existe (044 seed); multi-sede escala añadiendo rows `locations` sin migración destructiva.
- Pagos siguen siendo `cash/card/transfer/digital` internos en V1; pasarela real (Bold/Wompi/Stripe) post-V1 si `plan` lo pide, detrás de `payment_methods[]`.
- WhatsApp Meta Cloud API v20 con `businesses.meta_whatsapp_phone_number_id/access_token` por negocio; Resend/SMTP y Telegram fallback configurables en `settings`.
- PWA resuelve distribución; no app nativa si PWA cumple (Serwist 9.5.12, `output: standalone`).
- Roles `owner/admin/manager/barber/receptionist` sobre `employees.role` existente; `owner = businesses.owner_id`; barbero reducido ya en 005.
- `appointments.status` mantiene compatibilidad legacy `pending/confirmed` durante migración y se extiende aditivamente (039/047/052).
- Billing SaaS (`004_billing.sql` `plan`) no bloquea MVP; `plan=free` + `enabled_modules` ya permite ocultar módulos.

## Dependencies

- Migraciones `001..057` + `058_rbac_barbero` (005) aplicadas; `schema_migrations` source of truth.
- `lib/auth/roles.ts` (005) como single source RBAC.
- `lib/booking-availability.ts` + triggers 032/040/047 para disponibilidad y FSM.

## Out of Scope (V1)

- Facturación electrónica DIAN (se deja `tax_rate` + `receipt_number` preparado).
- Integración contable (Alegra/Siigo) — solo export CSV.
- App nativa dedicada (PWA primero).
- Marketplace multi-tenant self-service signup (multi-sede single-tenant sí).
