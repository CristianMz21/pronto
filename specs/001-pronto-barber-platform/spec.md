# Feature Specification: Pronto Barber Platform

**Feature Branch**: `001-pronto-barber-platform`

**Created**: 2026-08-27

**Status**: Draft

**Input**: Transformar el proyecto open-source Pronto (https://github.com/SGrappelli/pronto.git) en un software profesional de gestión para una barbería real. Pronto ya incluye reservas, CRM, POS, inventario, notificaciones, PWA y Docker con Next.js 16 + Supabase/PostgreSQL. La estrategia es clonarlo, auditarlo, levantarlo localmente y especializarlo incrementalmente sin reescribir desde cero, manteniendo cambios genéricos aportables upstream y customizaciones barbería modulares. Prioridad: MVP operativo "la barbería puede operar un día completo sin Excel/WhatsApp manual".

## User Scenarios & Testing

### User Story 1 — Auditoría y Bootstrap Local (Priority: P1)

Como equipo técnico quiero clonar Pronto, inspeccionar toda la arquitectura y levantarlo localmente con Docker + Supabase para tener un baseline funcional antes de modificar nada.

**Why this priority**: Sin baseline que funcione, cualquier feature se construye sobre humo. Es el gate de todo lo demás (FASE 0-1 del prompt).

**Independent Test**: `git clone` + `cp .env.example .env` + `docker compose up -d` → `/api/health` 200, login, dashboard, booking, CRM, POS, inventario visibles. Migraciones `001..035` aplicadas en `schema_migrations`.

**Acceptance Scenarios**:

1. **Given** repo clonado y `.env` configurado con `DATABASE_URL` (5432) y Supabase keys, **When** ejecuto `docker compose up -d`, **Then** el servicio `migrate` completa y `app` responde en `http://localhost:3000` con healthcheck verde.
2. **Given** app levantada, **When** inspecciono `package.json`, `docker-compose.yml`, `next.config.js`, `proxy.ts`, `lib/` y `supabase/migrations/`, **Then** produzco informe `PRONTO — AUDITORÍA INICIAL` con estado de ejecución, tests, arquitectura, stack, DB, auth, reservas, CRM, POS, inventario, notificaciones, PWA, seguridad, problemas críticos/importantes, deuda técnica, funciones faltantes/existentes, riesgos y recomendación.
3. **Given** suite `npm run lint` existente, **When** la ejecuto, **Then** entiendo qué testing falta (hoy solo lint, sin unit/integration/e2e).

---

### User Story 2 — Hardening y Localización Colombia (Priority: P1)

Como owner de la barbería quiero que el sistema sea seguro, estable y localizado a Colombia (COP, es-CO, formato fecha/hora, teléfono colombiano) para operar con datos reales sin riesgo.

**Why this priority**: Datos reales sin RLS/validación es irresponsable. Localización incorrecta genera pérdida de confianza inmediata.

**Independent Test**: Revisar `Security Advisor` de Supabase → 0 flags críticos; `formatCurrency(30000, 'COP')` → `$30.000`; RLS policies cubren todas las tablas; `api/book` y `api/appointments` validan Zod + rate limit.

**Acceptance Scenarios**:

1. **Given** un usuario no autenticado conoce una URL `/dashboard`, **When** intenta acceder, **Then** `proxy.ts` lo redirige a `/login` y ningún `api/*` expone datos sin `auth.uid()` o `my_business_ids()`.
2. **Given** `businesses.currency='COP'` y `timezone='America/Bogota'`, **When** se renderiza un precio o `starts_at`, **Then** se muestra como `$30.000 COP` y fecha `27 ago 2026` hora `2:30 p. m.` (es-CO, 12h según locale).
3. **Given** auditoría de `lib/supabase/service.ts` y policies 001/005/016/030, **When** reviso exposición, **Then** ningún `smtp_pass`, `resend_api_key`, `telegram_bot_token`, `meta_whatsapp_access_token` es legible por `anon`.

---

### User Story 3 — Gestión de Clientes, Barberos y Servicios (Priority: P1) 🎯 MVP Core

Como recepcionista quiero gestionar clientes, barberos y servicios con datos completos para que la agenda funcione.

**Why this priority**: Sin estas entidades la agenda no tiene sentido. Es el corazón del MVP.

**Independent Test**: Crear cliente con nombre/teléfono/notas/etiquetas/estado activo, barbero con foto/especialidades/horario/color/comisión, servicio con nombre/duración/precio/categoría/barberos asignados; todo listable y editable en `crm`, `settings`, `booking-calendar`.

**Acceptance Scenarios**:

1. **Given** estoy en CRM, **When** creo cliente con nombre "Carlos P." + teléfono colombiano + tags `VIP`, **Then** aparece en lista, con `total_visits/total_spent/last_visit_at` inicializado y `client_phone_unique` (025) previene duplicado por `business_id+phone`.
2. **Given** configuro barbero "Andrés" con `color #2563EB`, `commission 50%`, especialidades `corte, barba`, horario Lun-Vie 09:00-19:00 con break 13:00-14:00, vacaciones 2026-12-24 a 2026-12-26, **When** guardo, **Then** su disponibilidad respeta `business_hours` (009+035) + `employee_services` + `employee_unavailability`.
3. **Given** servicio "Corte + barba" 60 min $45.000 asignado a Andrés y otro barbero, **When** un cliente reserva ese servicio, **Then** solo aparecen barberos capacitados y la duración/precio son los configurados.
4. **Given** roles Owner/Manager/Barber/Receptionist, **When** un Barber intenta acceder a `/settings` (solo Owner/Manager), **Then** es bloqueado (middleware + RLS).

---

### User Story 4 — Agenda y Reserva Pública con Estados de Cita (Priority: P1)

Como cliente final quiero reservar online sin crear cuenta, y como barbero quiero operar la agenda con flujo claro y sin doble reserva.

**Why this priority**: La reserva es el principal canal de ingresos. Doble reserva destruye confianza.

**Independent Test**: Flujo público `book/[slug]` servicio→barbero→fecha→hora→nombre/tel→confirmar genera `appointments` `confirmed`. Flujo dashboard `Scheduled→Confirmed→Checked-in→In-service→Completed` (migrado desde `pending/confirmed/...`) opera por barbero, móvil usable, double-booking imposible incluso con 2 requests paralelas.

**Acceptance Scenarios**:

1. **Given** barbería publica `https://barberia.com/book/mi-barberia`, **When** cliente elige servicio "Corte" 45 min, barbero, fecha y hora dentro de `effectiveHours` y break, **Then** ve slots generados por `lib/booking-availability.ts:checkSlotWithinHours` y `get_booked_slots(employee_id)` y puede confirmar con solo nombre+tel.
2. **Given** dos clientes hacen POST `/api/book` al mismo `employee_id+starts_at` simultáneamente, **When** ambas transacciones compiten, **Then** `check_slot_availability()` (032 con `pg_advisory_xact_lock`) permite solo una, la otra recibe `slot_taken` 409.
3. **Given** cita en `Scheduled`, **When** recepcionista marca `Checked-in→In-service→Completed`, **Then** cada transición actualiza `status`, es auditable y el calendario refleja color del barbero + bloqueo de slots.
4. **Given** barbero inactivo o en vacaciones/descanso o fuera de `business_hours`, **When** se intenta reservar, **Then** el servidor rechaza con `outside_availability` / `no_staff_available` (034) y el picker no muestra ese slot.

---

### User Story 5 — POS, Caja, Comisiones y Pagos (Priority: P2)

Como cajero quiero cerrar una visita en 3 clicks (servicio+productos+descuento+método pago) y que la caja y comisiones queden registradas.

**Why this priority**: Cerrar venta rápido es crítico en flujo real; comisiones/caja son necesarias para pagar barberos y controlar efectivo.

**Independent Test**: Desde POS con o sin `bookingContext`, agregar servicios+productos inventario, aplicar descuento, elegir `cash/card/transfer`, cobrar → genera `transactions` con `items jsonb`, `receipt_number`, actualiza `client.total_spent/visits`, y `cash_registers`/`commissions` según corresponda.

**Acceptance Scenarios**:

1. **Given** cliente llega con cita `In-service`, **When** en POS selecciono servicio "Corte" + producto "Pomada" + descuento 10% + pago `cash`, **Then** total es correcto, se crea `transactions.amount`, `status completed`, `payment_method cash`, y la cita pasa a `Completed`/`Paid`.
2. **Given** barbero con comisión 50% sobre "Corte $30.000", **When** se vende, **Then** se registra `commission = $15.000` asociada a `employee_id` y es consultable en reportes.
3. **Given** apertura de caja a las 08:00 con $100.000, **When** cierro caja a las 19:00 con efectivo esperado $850.000 y real $845.000, **Then** queda `difference = -$5.000` y quién hizo cada movimiento.
4. **Given** sin internet, **When** cobro en POS, **Then** `lib/offline-db.ts:queueTransaction` guarda y `syncQueue()` sincroniza al volver online.

---

### User Story 6 — CRM Profundo, Inventario y Dashboard Operativo (Priority: P2)

Como owner quiero ver en 1 segundo el historial completo del cliente, estado de inventario y métricas del día/semana.

**Why this priority**: Visibilidad operativa reduce churn y quiebres de stock.

**Independent Test**: Entrar a `crm/[id]` muestra datos, historial citas/servicios/pagos/compras, frecuencia, gasto total, última/próxima visita, notas + acciones rápidas (crear cita, mensaje, venta). Dashboard muestra hoy/semana y alertas stock bajo real.

**Acceptance Scenarios**:

1. **Given** cliente con 5 visitas, **When** abro su ficha, **Then** veo `total_visits=5`, `total_spent`, `last_visit_at`, servicios más frecuentes y puedo crear cita en 1 click.
2. **Given** producto "Cera" `quantity 2` `low_stock_threshold 5`, **When** consulto dashboard, **Then** aparece en "productos con stock bajo" y dispara alerta Telegram/WhatsApp/Email (ya existente `api/email/low-stock`).
3. **Given** inventario con SKU, barcode, categoría, proveedor, costo/precio, **When** importo CSV/Excel o escaneo barcode USB, **Then** se crea/actualiza sin duplicar SKU (`unique_sku_per_business` 018).
4. **Given** ventas del día, **When** veo dashboard, **Then** muestra citas, clientes atendidos, ingresos, ventas, servicios, cancelaciones, no-show sin gráficos irrelevantes.

---

### User Story 7 — Reportes y Exportación (Priority: P3)

Como owner quiero reportes accionables y exportar cuando tenga sentido.

**Why this priority**: Sin métricas no hay gestión; pero es posterior al flujo operativo.

**Independent Test**: Reportes por día/semana/mes: ventas, servicios/productos más vendidos, ingresos por barbero, comisiones, clientes nuevos/recurrentes, cancelaciones/no-show, ticket promedio; export CSV/Excel donde aporte.

**Acceptance Scenarios**:

1. **Given** 30 días de transacciones, **When** pido reporte "ventas por barbero", **Then** obtengo `barbero, servicios realizados, ventas, comisión generada` consistente con `transactions`+`appointments`.
2. **Given** reporte visible, **When** hago click "Exportar", **Then** descarga `xlsx`/`csv` con las filas visibles.

---

### User Story 8 — Notificaciones, WhatsApp, PWA y Observabilidad (Priority: P2)

Como barbería quiero que cliente y equipo reciban notificaciones confiables (WhatsApp primero), que la app sea instalable y que cada acción crítica quede auditada.

**Why this priority**: WhatsApp es el canal principal en LATAM; PWA evita App Store; observabilidad es requisito para producción con datos reales.

**Independent Test**: Plantillas WhatsApp (Meta Cloud API) enviadas y logueadas con reintentos y estados; PWA instalable desde móvil, offline safe; `notification_log` evita duplicados; `audit_log` registra quién/qué/cuándo.

**Acceptance Scenarios**:

1. **Given** cita confirmada, **When** se crea `appointments`, **Then** se encola `notification_log` y se dispara confirmación + recordatorio 24h/1h + thank-you + reactivación 30 días sin visita (ya previsto `api/cron/notify` 007).
2. **Given** credenciales `businesses.meta_whatsapp_phone_number_id/access_token` configuradas en `settings`, **When** se envía WhatsApp, **Then** `lib/whatsapp.ts:sendWhatsAppMessage` normaliza a E.164 sin '+', maneja errores sin exponer tokens en frontend, y registra `notification_log`.
3. **Given** PWA instalada en Android/iOS, **When** abro POS offline, **Then** funciona (cache + IndexedDB) y al volver online recarga sin perder cola; `app/sw.ts` con `fallbacks /offline` y `additionalPrecacheEntries` garantiza fallback.
4. **Given** venta o cambio de cita, **When** ocurre, **Then** queda traza auditable.

---

### Edge Cases

- Reserva concurrente exacta misma hora + mismo empleado → solo una gana, adhesión de advisory lock.
- Reserva "Anyone" (employee_id NULL) → migración 032 auto-asigna empleado libre; si ningún barbero libre, `no_staff_available` 409 honesto.
- Reserva fuera de `business_hours` o durante `break_start/end` → `outside_hours`/`break` 400 server-side aunque cliente manipule UI.
- Cliente envía `phone` y `email` que matchean dos registros distintos → upsert correcto por `OR` combinado (bug-8/9/10 ya fixed en `api/book`).
- Barbero inactivo, de vacaciones o sin especialidad para servicio → no es candidato, no aparece disponible.
- Editar cita cambiando `starts_at` a slot ocupado → trigger 017/031/032 bloquea en UPDATE también.
- POS offline con múltiples ventas sin sync → `pending_transactions` con `local_receipt OFFLINE-*` sin colisión y con reintento.
- Stock llega a 0 durante venta → movimiento `out` rechaza o alerta, no deja stock negativo sin `adjustment` explícito.
- Supabase `pg_cron/pg_net` no habilitado → migración 007 skip con warning, fallback a `cron-job.org` llamando `GET /api/cron/notify` con `CRON_SECRET`.
- `formatCurrency` con COP y sin `currency` → default USD, migración debe parametrizar `businesses.currency`.
- RLS regresión: recrear `businesses` pública para booking ya fue cerrada en 016 (usa service-role); no reintroducir `public_read_businesses_for_booking` raw.
- Secrets rotados: cambio de `RESEEND_API_KEY`/`META_WHATSAPP_ACCESS_TOKEN` en `businesses` debe invalidar cache, no quedarse en `NEXT_PUBLIC_*`.
- Teléfono colombiano en formatos `+57 300...`, `300-123-4567`, `(300) 123...` → `normalizePhone` lo unifica.

## Requirements

### Functional Requirements

- **FR-001**: System MUST clonar, inspeccionar y levantar Pronto localmente con Docker + Supabase, verificando todas las funcionalidades (login, dashboard, reservas, clientes, POS, inventario, notificaciones, PWA) antes de modificar.
- **FR-002**: System MUST mantener `upstream` Pronto y `origin` barbería con estrategia de branches que permita sincronizar upstream y aportar mejoras genéricas sin destruir historia.
- **FR-003**: System MUST auditar y corregir seguridad: RLS en toda tabla, `my_business_ids()`, validación Zod + sanitización DomPurify + rate limiting en `api/*`, nunca service-role en cliente, secrets solo en env/DB encriptado.
- **FR-004**: System MUST localizar a Colombia: `es-CO`, `COP`, `America/Bogota`, teléfono colombiano, sin hardcodear moneda/locale.
- **FR-005**: System MUST gestionar clientes con nombre, teléfono, email opcional, cumpleaños, notas, tags, historial visitas/servicios/gasto acumulado/última/próxima cita/preferencias/etiquetas/estado activo, con estados `frecuente/nuevo/inactivo/VIP`.
- **FR-006**: System MUST gestionar barberos con nombre, foto, teléfono, email, activo, especialidades, horario laboral, descansos, vacaciones, color calendario, comisión, servicios y ventas asociados.
- **FR-007**: System MUST soportar roles Owner/Manager/Barber/Receptionist con permisos apropiados y bloqueo por URL (proxy + RLS).
- **FR-008**: System MUST gestionar servicios (corte, barba, corte+barba, afeitado, cejas, lavado, tratamientos) con nombre, descripción, duración, precio, costo, estado, categoría y barberos que pueden realizarlo.
- **FR-009**: System MUST implementar calendario que permita crear/editar/cancelar/reprogramar/confirmar/checked-in/in-service/completed/no-show/cancelled con asignación cliente/barbero/servicio/duración/notas e impida doble reserva, fuera de horario, descanso o barbero inactivo.
- **FR-010**: System MUST extender `appointments.status` para cubrir `scheduled→confirmed→checked-in→in-service→completed` además de `cancelled/no_show` de forma aditiva y compatible con trigger existente.
- **FR-011**: System MUST exponer URL pública de reservas `/book/[slug]` ultra rápida y mobile-first donde el cliente selecciona servicio→barbero→fecha→hora→nombre+tel→confirma sin crear cuenta.
- **FR-012**: System MUST implementar POS que permita cerrar visita con flujo cliente→servicio→barbero→productos adicionales→descuento→total→método pago (cash/card/transfer configurables)→pago→recibo→cita completada, sin integración real de pagos externa en MVP.
- **FR-013**: System MUST modelar comisiones (porcentual, fija, por servicio/producto) configurables por barbero y preparadas para reportes.
- **FR-014**: System MUST implementar caja con apertura, ingresos/egresos/ventas, cierre, efectivo esperado/real/diferencia y registro de quién hizo cada acción.
- **FR-015**: System MUST gestionar inventario con producto, SKU único por barbería, barcode, categoría, proveedor, costo/precio, stock, stock mínimo, movimientos/entradas/salidas/ajustes y alerta stock bajo.
- **FR-016**: System MUST mostrar ficha cliente útil con datos, historial citas/servicios/pagos/compras/frecuencia/gasto/última visita/notas y acciones rápidas crear cita/enviar mensaje/registrar venta/editar.
- **FR-017**: System MUST proveer dashboard operativo que responda hoy (citas, atendidos, ingresos, ventas, cancelaciones, no-show), semana (ingresos, citas, nuevos/recurrentes), personal (ventas/servicios/comisión) e inventario (stock bajo).
- **FR-018**: System MUST proveer reportes de ventas por día/semana/mes, servicios/productos más vendidos, ingresos por barbero, comisiones, clientes nuevos/recurrentes, cancelaciones/no-show, ticket promedio con exportación CSV/Excel donde aporte.
- **FR-019**: System MUST enviar notificaciones aprovechando infra Pronto: cliente (confirmación, 24h, 1h, thank-you, reactivación) y barbería (nueva/cancelación/cambio, stock bajo) priorizando WhatsApp > Email > Telegram.
- **FR-020**: System MUST mejorar WhatsApp: plantillas, configuración por `businesses`, manejo errores/logs/reintentos/estados, sin exponer tokens en frontend.
- **FR-021**: System MUST ser PWA instalable, responsive perfecto, POS y calendario usables touch, cargas rápidas, offline seguro (POS con cola + sync), sin forzar app nativa si PWA alcanza.
- **FR-022**: System MUST conservar buen diseño de Pronto y mejorar navegación, jerarquía, estados, formularios, tablas, calendario, POS, feedback/loading/empty/error y accesibilidad para usuario no técnico.
- **FR-023**: System MUST mantener seguridad de DB: FKs, índices, constraints, uniques, timestamps, transacciones, concurrencia con `pg_advisory_xact_lock`, y validación de integridad referencial.
- **FR-024**: System MUST mantener TypeScript estricto, funciones pequeñas, separación responsabilidades, validación y manejo de errores uniformes, sin código muerto y sin dependencias injustificadas.
- **FR-025**: System MUST aumentar cobertura de testing sobre críticos: unit (precios, reservas, disponibilidad, comisiones, inventario, caja), integration (auth, DB, bookings, POS, inventory), E2E del flujo completo.
- **FR-026**: System MUST preparar observabilidad: logging, manejo excepciones, errores visibles, logs auditables por operación crítica.
- **FR-027**: System MUST documentar estrategia de backup/restauración/migraciones/recuperación para datos reales.
- **FR-028**: System MUST permitir despliegue progresivo localhost→staging→production vía Docker con docs para VPS/dominio/HTTPS/Cloudflare/env/Supabase/backups.
- **FR-029**: System MUST distinguir modificaciones genéricas vs específicas barbería y mantener customizaciones modulares para contribuir upstream sin sacrificio del cliente.
- **FR-030**: System MUST usar arquitectura Spec Kit con trazabilidad spec→plan→tasks→implement y mantener `README.md` + `docs/*.md` actualizados.

### Key Entities

- **Business**: Tenant. `id, owner_id, name, slug, type, phone, email, address, timezone(COP: America/Bogota), currency(COP), plan, brand_color, notification_language, enabled_modules, *_token/_key` para notificaciones.
- **Client**: `id, business_id, name, phone(unique per business), email, notes, tags[], birthday, telegram_id, viber_user_id, whatsapp_number, total_visits, total_spent, last_visit_at, preferences, status(active/inactive/VIP)`.
- **Employee/Barbero**: `id, business_id, user_id, name, role(Owner/Manager/Barber/Receptionist), phone, email, avatar_url, color, specialties[], is_active`.
- **EmployeeService**: `employee_id, service_id` — qué barbero puede hacer qué servicio.
- **EmployeeUnavailability**: `employee_id, starts_at, ends_at, reason(vacaciones/descanso)` — bloquea disponibilidad.
- **Service**: `id, business_id, name, description, duration_min, price, cost, category, capacity, is_active`.
- **BusinessHours**: `business_id, day_of_week(0-6), is_open, open_time, close_time, break_start, break_end`.
- **Appointment**: `id, business_id, client_id, employee_id, service_id, starts_at, ends_at, status(scheduled/confirmed/checked-in/in-service/completed/cancelled/no_show/pending/paid), price, source, notes`.
- **Transaction**: `id, business_id, appointment_id, client_id, employee_id, amount, payment_method(cash/card/transfer/online), status, items jsonb, receipt_number`.
- **InventoryItem**: `id, business_id, name, sku(unique per business), barcode, category, unit, quantity, low_stock_threshold, cost_price, sell_price`.
- **InventoryMovement**: `id, business_id, item_id, type(in/out/adjustment), quantity, note, created_by`.
- **CashRegister**: `id, business_id, opened_by, opened_at, closed_at, expected_cash, actual_cash, difference, status(open/closed)`.
- **NotificationLog**: `id, business_id, appointment_id, channel, event, status, created_at` — anti-duplicado.
- **AuditLog**: `who, what, when, record` para ventas/pagos/caja/citas/inventario/usuarios.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Barbería puede operar un día completo sin Excel/WhatsApp manual (100% de citas, cobros y control stock del día registrados en Pronto Barber).
- **SC-002**: App levantada localmente con `docker compose up -d` y todas las verificaciones (login, dashboard, reservas, CRM, POS, inventario) pasan en <5 min tras configurar `.env`.
- **SC-003**: Cero doble reservas en test de concurrencia (2 POST paralelos mismo slot → 1 éxito 201, 1 rechazo 409) en 10/10 intentos.
- **SC-004**: POS cierra venta completa (servicio+producto+descuento+pago+recibo) en ≤3 clicks y ≤15s en móvil.
- **SC-005**: Reserva pública convierte en ≤45s en móvil (medido desde selección servicio hasta confirmación) sin crear cuenta.
- **SC-006**: Notificación WhatsApp de confirmación llega en ≤30s tras crear cita (o queda en `notification_log` con error trazable y reintento).
- **SC-007**: Dashboard carga métricas operativas del día en ≤2s (p95) y muestra stock bajo real sin falsos negativos.
- **SC-008**: Localización COP/es-CO correcta en todos los precios/fechas/horas verificada con snapshot tests.
- **SC-009**: Cobertura de tests críticos ≥80% en `booking-availability`, comisiones, caja e inventario (unit) + flujo E2E `cliente→reserva→recepción→servicio→checkout→pago→cita completada→historial` verde en CI.
- **SC-010**: Documentación permite a un dev nuevo levantar el sistema desde cero leyendo solo `README.md` + `.env.example` + `docs/local-development.md` sin asistencia.

## Assumptions

- Se usará Supabase Cloud (no stack local) para DB/Auth/Storage; `DATABASE_URL` es conexión directa 5432 con SSL `certs/supabase-ca.crt` y `CRON_SECRET` + `INTERNAL_API_SECRET` generados con `openssl rand -hex 32`.
- La barbería inicial es una sola sede; multi-tenant/multi-sede se diseña a nivel interfaces (`my_business_ids()`) sin implementarse completo en MVP.
- Métodos de pago en MVP son `cash/card/transfer` internos; no habrá integración con pasarelas reales hasta que el flujo interno sea sólido.
- Canal prioritario de notificación es WhatsApp Meta Cloud API con credenciales por `businesses.meta_whatsapp_*`; Email (Resend/SMTP) y Telegram/Viber son fallback y también configurables por negocio en `settings`.
- PWA resuelve distribución móvil; no se construirá app nativa dedicada si PWA cumple.
- Roles iniciales son Owner/Manager/Barber/Receptionist mapeados sobre `employees.role` existente; Owner es `businesses.owner_id`.
- `appointments.status` mantendrá compatibilidad con valores legacy (`pending/confirmed/...`) durante migración y se extenderá aditivamente.
- El presupuesto no incluye SaaS billing (`004_billing.sql`) en MVP; `plan=free` es suficiente y el toggle `enabled_modules` ya permite ocultar módulos no usados.

