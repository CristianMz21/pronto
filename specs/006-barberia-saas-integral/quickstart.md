# Quickstart: Barbería SaaS Integral — Escudería (006)

**Branch**: `006-barberia-saas-integral` | **Spec**: `spec.md` | **Plan**: `plan.md` | **Constitution**: `v2.0.0`

## Prerrequisitos

- Node 20+, `npm`, Docker 24+, `openssl`, `supabase` CLI (opcional)
- `cp .env.example .env` y completar:
  ```
  DATABASE_URL=postgres://postgres:[pw]@db.[ref].supabase.co:5432/postgres?sslmode=verify-full
  NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon]
  SUPABASE_SERVICE_ROLE_KEY=[service_role]
  CRON_SECRET=$(openssl rand -hex 32)
  INTERNAL_API_SECRET=$(openssl rand -hex 32)
  ```
  + `certs/supabase-ca.crt` si `verify-full`.

## Levantar desde cero

```bash
git clone <origin> escudero && cd escudero
git checkout 006-barberia-saas-integral # o main tras merge
cp .env.example .env && $EDITOR .env
docker compose up -d --build
docker compose logs -f migrate # debe ver 001..069 aplicadas, NOTICE si pgsodium sin vault
curl -s http://localhost:3000/api/health | jq
npm run lint
```

Abrir `http://localhost:3000` → login → onboarding debe pedir `locations, business_hours, employees, services, brand_color`. Completar y verificar `dashboard` carga p95 <2s.

## Seed Escudería Centro (044 idempotente)

```sql
insert into locations (id, business_id, name, slug)
select '11111111-1111-1111-1111-111111111111', id, 'Escudería Centro', 'centro'
from businesses where slug='escuderia' on conflict do nothing;
```

## Verificación por User Story (SCs)

### US1 Cliente — Reserva 1-click
```bash
# 1. Abrir móvil 375px http://localhost:3000/book/escuderia
# 2. Flujo servicio→barbero→fecha→hora→nombre+tel → confirmar ≤45s
# 3. Concurrencia:
curl -X POST http://localhost:3000/api/book -H 'content-type: application/json' \
  -d '{"slug":"escuderia","service_id":"<uuid>","employee_id":"<uuid>","starts_at":"2026-08-29T10:00:00-05:00","client":{"name":"Test","phone":"+573001112233"}}' &
curl -X POST http://localhost:3000/api/book -H 'content-type: application/json' \
  -d '{"slug":"escuderia","service_id":"<uuid>","employee_id":"<uuid>","starts_at":"2026-08-29T10:00:00-05:00","client":{"name":"Test2","phone":"+573004445566"}}' &
# → 1×201, 1×409 slot_taken
```

### US2 Barbero
```
Login barbero@test → debe ver solo /dashboard /booking /pos (sidebar filtrado)
Proxy bloquea /caja → 302 /dashboard
Agenda filtra por employee_id=self
POS filtra por employee_services
```

### US3 Admin — CRM Carlos 42d
```sql
update clients set last_visit_at = now() - interval '42 days' where name='Carlos';
-- CRM → segmento inactivos 42d debe listar Carlos
-- Crear campaña WhatsApp → notification_log status=sent, campaign_recipients pending→sent
```

### US4 Dueño — Dashboard
```
GET /dashboard → ventas hoy, ticket, nuevos/recurrentes, top barberos
Filtro ?location=centro debe segmentar sin cross-leak
Reportes → Export xlsx
```

### US5 Membresías/Promos/Puntos
```
POST /api/memberships {name:"4 cortes/mes", price:99000, duration_days:30, benefits:{cuts:4}}
POST /api/book con membership_id → remaining--, sin cobro si quedan usos
POST /api/promotions {name:"Cumple 20%", type:"percent", value:20, rules:{client_segment:"birthday"}} → apply en POS
POST /api/loyalty/earn {client_id, transaction_id, amount:45000} → +45 pts
```

### US6 Multi-sucursal
```
POST /api/locations {name:"Norte", slug:"norte"}
POST /api/inventory/transfer {item_id, from:"centro", to:"norte", qty:3} → out/in atómicos
Login manager Norte → no ve caja Centro (403)
```

### US7 Waitlist/Recurring/Tips
```
POST /api/book sin slot → 409 no_staff_available + enqueue waitlist
DELETE /api/appointments/:id (cancel) → waitlist[0] notified ≤60s
POST /api/recurring {rrule:"FREQ=WEEKLY;INTERVAL=2;COUNT=6", next_at:"2026-09-02T10:00:00-05:00"} → 6 citas
PATCH /api/appointments/:id/tip {tip_amount:5000} → commissions no sobre tip
```

## PWA

- Chrome DevTools → Application → Manifest → Installable true
- Offline: DevTools → Network offline → POS queue 5 ventas → online → syncQueue sin pérdida

## Tests

```bash
npm run test:unit   # booking-availability, commissions, tips, caja, memberships, loyalty
npm run test:e2e    # playwright booking→pos→historial→campaign
npm run build       # must pass
```

## Advisors

Supabase Dashboard → Advisors → Security Advisor → 0 flags críticos; Performance Advisor → índices `idx_waitlist_desired`, `idx_recurring_business`, `idx_appointments_location` presentes.

## Rollback

Feature es aditiva (`IF NOT EXISTS`, `location_id nullable`). Rollback: `DROP TABLE waitlist,recurring_appointments,tips,memberships,...` + revert `app/` rutas + `lib/*` helpers; no pérdida datos core (001..057 intactos).
