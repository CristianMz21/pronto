# Proposal: Barbería SaaS Integral — Escudería

## Intent

Transformar Escudería de single-sede operativa a **SaaS multi-sucursal premium** sobre Pronto (Next.js 16 + Supabase, 57 migraciones). Ya existen Dashboard, Agenda (/booking), Clientes/CRM, POS/Caja, Inventario, Configuración. Faltan el core que cierra el loop de ingresos y retención: Membresías, Promociones, CRM campañas, Fidelización puntos, Reportes avanzados, Multi-sucursal real, Barberos/Servicios como rutas propias, Lista de espera, Citas recurrentes, Propinas, Festivos.

**Navegación objetivo**: `Dashboard / Agenda / Clientes / Barberos / Servicios / POS / Caja / Inventario / Membresías / Promociones / CRM / Reportes / Sucursales / Configuración` + `book/[slug]` público premium y `/client` portal 1-click, todo mobile-first PWA.

**Experiencias**: (1) Cliente reserva 24/7 <45s + recordatorio WhatsApp + cancel 1-click; (2) Barbero agenda propia + comisiones/propinas; (3) Admin operación global drag&drop + caja/inventario por sede; (4) Dueño dashboard 5s ventas/ticket/nuevos/top barberos.

**Función clave CRM**: "Carlos 42 días sin venir" → segmento `inactive_42` → campaña WhatsApp 1-click → `notification_log` → re-reserva atribuida.

## Scope

### In Scope

- **Clientes**: perfil, historial, `preferred_barber_id`, preferencias, cumpleaños, notas, segmentos 42d/cumple/VIP
- **Citas/Agenda**: FSM `scheduled→confirmed→checked-in→in-service→completed`, `employee_unavailability`+`holidays`+`business_hours`+break, `pg_advisory_xact_lock` anti-doble-reserva, `location_id` por sede
- **Barberos/Servicios**: rutas `/barberos` y `/servicios` propias, `employee_services` (036), `color/specialties/commission` (038), combos `service_combos`
- **Pagos/POS/Caja**: `cash/card/transfer/digital`, `cash_registers` por sede (041/055), `tips`, `discount/tax`, offline-safe POS queue (IndexedDB)
- **Ventas/Inventario**: `sku unique`, `barcode`, `transfer` inter-sede atómico, `low_stock` alerta
- **Membresías/Promociones/Fidelización**: `memberships/client_memberships` + `promotions` (percent/fixed/combo, `promo_code`, rules) + `loyalty_accounts/movements` (earn 1pt/$1k, redeem 100=$10k)
- **Marketing/CRM**: `campaigns/campaign_recipients` + `notification_log` deduplicado, plantillas WhatsApp Meta v20 > Email > Telegram, `pg_cron` + fallback `cron-job.org`
- **Lista de espera + Recurrentes**: `waitlist` FIFO + `recurring_appointments` con `rrule` (RFC 5545)
- **Reportes**: ventas/ganancias/citas/ticket/nuevos-recurrentes, por sede, export CSV/Excel, atribución campaña
- **Multi-sucursal**: `locations` (044) + `location_id` nullable en 6 tablas + `my_location_ids()` futuro
- **Usuarios/Roles**: `owner/admin/manager/barber/receptionist` via `lib/auth/roles.ts` (005), proxy+layout+sidebar+RSL 058
- **Configuración**: `business_hours/holidays/cancel_lead_time/business_lead_time/tax_rate/payment_methods/loyalty_rates` por `business` y `location`

### Out of Scope

- Facturación electrónica DIAN (solo `tax_rate`+`receipt_number` preparado)
- ERP contable (solo export CSV)
- App nativa (PWA primero)
- Marketplace multi-tenant self-service (multi-sede single-tenant sí)
- Pasarela pagos real Bold/Wompi/Stripe en V1 (solo métodos internos)

## Capabilities

### New Capabilities

- `memberships`: venta/consumo membresías con advisory lock
- `promotions`: evaluación/aplicación con rules jsonb
- `loyalty`: earn/redeem puntos
- `waitlist`: enqueue/notify/convert FIFO
- `recurring`: rrule → serie con validación por ocurrencia
- `tips`: registro/reporte propinas
- `locations`: CRUD sedes + transferencia inventario
- `campaigns`: segmentos (inactive_42, birthday_7) + send + stats atribuidos
- `holidays`: festivos por sede bloqueando picker
- `service-combos`: combos multi-servicio

### Modified Capabilities

- `booking`: añade `location_id`, `membership_id`, `promo_code`, `loyalty` apply + waitlist fallback
- `agenda`: daily/weekly por sede + drag&drop + holidays
- `pos`: descuentos promo/membresía/loyalty + tips + location filter
- `crm`: segmentos + 1-click campaign + loyalty/membership chips
- `dashboard`: p95 <2s por sede + sparkline + low-stock
- `reports`: breakdown por sede + export + atribución

## Approach

Library-first slices verticales: cada módulo = `app` ruta + `api` + `lib` helper + migración idempotente + test + `contracts/*.yaml`. Reusa advisory locks 032, FSM 039/047, `check_barber_availability` 040, `offline-db`, `whatsapp`, `my_business_ids()`. `location_id` nullable no rompe single-sede. `rrule` (~10kB) para recurrencias RFC 5545. `pg_cron` opcional con fallback `cron-job.org`. Roadmap `MVP(P1 US1-4)→V1(US5+US6)→V2(US7+CRM)→Premium(polish)` con chained PRs si >400 líneas. Ver `specs/006-barberia-saas-integral/plan.md`, `research.md`, `data-model.md`, `tasks.md`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/059..069` | New | holidays, waitlist, recurring, tips, memberships, promotions, loyalty, campaigns, combos, transfer |
| `app/(dashboard)/barberos,servicios,membresias,promociones,crm-campaigns,reportes,sucursales` | New | Rutas premium por rol |
| `app/(dashboard)/booking,crm,dashboard,pos,caja,inventory` | Modified | location_id, waitlist, recurring, promo/loyalty, tips |
| `app/book/[slug], app/client, app/api/*, lib/*` | Modified/New | booking-availability+holidays, waitlist, recurring, memberships, promotions, loyalty, tips, campaigns, locations |
| `lib/booking-availability, lib/auth/roles, components/layout/sidebar` | Modified | holidays, location, RBAC per location |
| `supabase Advisors` | Check | RLS + índices `idx_*_location` |
| `contracts/*.yaml` | New | 9 OpenAPI specs |
| `docs/*` | Modified | architecture, database, security, testing, backup |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| RLS multi-sede filtra mal | Med | V1 por `business_id` (044 probado); V2 `my_location_ids()` con tests `anon vs barber Centro vs manager Norte`; Advisors CI |
| rrule genera slots inválidos (feriado/break) | Med | Validar cada ocurrencia con `checkSlotWithinHours`+`holidays`; omitir con aviso |
| Waitlist spam WhatsApp | Low | `notification_log` dedup 1h + rateLimit 10/h + opt-out `no_whatsapp` tag |
| Membresía doble consumo race | Low | `pg_advisory_xact_lock(client_memberships.id)` + `remaining>0` trigger |
| pgsodium sin vault local | Med | `DO $$ IF EXISTS vault ELSE NOTICE` no bloquea `db reset` |

## Rollback Plan

Feature aditivo idempotente (`IF NOT EXISTS`, `location_id nullable`). Rollback: `DROP TABLE IF EXISTS waitlist,recurring_appointments,tips,memberships,client_memberships,promotions,loyalty_accounts,loyalty_movements,campaigns,campaign_recipients,holidays,service_combos` + revert `app/` rutas + `lib/*` helpers + `contracts/`; core 001..058 intacto, no pérdida datos. `DROP POLICY` + restore si RLS V2.

## Dependencies

- Migraciones `001..058` (incl 005 RBAC 058) aplicadas; `schema_migrations` source
- `lib/auth/roles.ts` (005) single source RBAC
- `lib/booking-availability.ts` + triggers 032/040/047
- `supabase cloud` con `DATABASE_URL` 5432 verify-full + `certs/supabase-ca.crt` + `CRON_SECRET`/`INTERNAL_API_SECRET`

## Success Criteria

- [ ] Reserva pública ≤45s móvil sin cuenta; 2 POST paralelos mismo slot → 1×201 1×409 (10/10)
- [ ] Barbero solo agenda/POS propios; `proxy` bloquea `/caja|/inventory|/settings` (005 no regresa)
- [ ] Agenda global drag&drop valida 040+039, FSM `scheduled→completed` sin `completed→cancelled`
- [ ] POS ≤3 taps ≤15s + tips + promo/membresía/loyalty apply + offline queue sync sin pérdida
- [ ] "Carlos 42d" inactivo → campaña WhatsApp 1-click → re-reserva atribuida (≥15% retorno 7d)
- [ ] Membresía 4 cortes/mes consume `remaining--` en booking/POS; promo cumpleaños 20% sugiere; loyalty earn 1pt/$1k
- [ ] Multi-sede: `location_id` segmenta agenda/reportes sin cross-leak; transfer atómico; manager Norte no ve Centro
- [ ] Waitlist notify ≤60s al cancelar + recurring `FREQ=WEEKLYx6` con skip si choca + holiday bloquea picker
- [ ] Dashboard p95 <2s + LCP book <1.5s + Lighthouse ≥90 + PWA instalable + `specs/006` + `openspec/changes/006` verdes en `sdd-status`/`specify`
