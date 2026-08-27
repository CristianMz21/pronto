# Feature Specification: Escudería Integración Completa — Single + Multi-sede + Admin Seguro + Landing Dinámica

**Feature Branch**: `003-escuderia-integration`

**Created**: 2026-08-27

**Status**: Draft

**Input**: Integración completa para barbería Escudería inicialmente single (1 sede) con arquitectura lista para multi-sede, protección del panel admin y landing 100% dinámica desde DB (sin hardcode).

## User Scenarios & Testing

### User Story 1 — Cliente ve landing real de Escudería (Priority: P1)

Como cliente que entra a `escuderia.com` o `localhost:3000/escuderia` quiero ver la info **real** de la barbería (nombre, teléfono, dirección, horarios, servicios/precios COP, barberos, stats) tal como está configurada en el admin, sin que el dev haya hardcodeado textos.

**Why this priority**: Si la landing es hardcodeada, cada cambio de precio/horario/barbero requiere deploy de código. Con Single Source of Truth (DB), el owner cambia en `/settings` y la landing se actualiza sola.

**Independent Test**: Cambiar en `/settings` el precio de `Corte Clásico` de 30k a 32k y el teléfono a `+57 311 999 0000` → recargar `/escuderia` → ver nuevo precio y teléfono sin rebuild. Vaciar `services` en DB → `/escuderia` muestra `No hay servicios` pero no 500.

**Acceptance Scenarios**:

1. **Given** `businesses` Escudería tiene `name=Escudería, phone=+57..., address=Colombia, brand_color=#1a1a1a`, **When** se renderiza `/escuderia`, **Then** hero, nav logo, footer y `tel:` usan esos valores (no `THE RITUAL` hardcodeado)
2. **Given** `services` tiene 5 filas activas, **When** se renderiza `#services`, **Then** se listan exactamente esas 5 con `formatCurrency COP` y `duration_min`, ordenadas por `price`
3. **Given** `employees` tiene 4 barberos con `color`/`specialties`, **When** se renderiza `#barberos`, **Then** se ven 4 cards con iniciales y `specialties` (no 4 hardcodeados)
4. **Given** `business_hours` Lun-Sáb 09:00-20:00, **When** se ve `Horario`, **Then** muestra `09-20` y `Lun-Sáb` dinámico (no `09-20` hardcodeado), y badge hero `Abierto/Cerrado` calculado con `timezone America/Bogota`

---

### User Story 2 — Owner entra al admin, cliente no (Priority: P1)

Como owner (`test@barber.local`) quiero entrar a `/dashboard`/`/settings`/`/pos`/`/caja`, y como cliente anónimo quiero que me lleve a `/login` y nunca vea datos de otra barbería.

**Why this priority**: Sin esto, cualquiera con la URL ve el panel o ve datos de otra barbería (multi-tenant leak). Es P1 de seguridad.

**Independent Test**: `curl -i http://localhost:3000/dashboard` sin cookie → `307 → /login?redirectTo=/dashboard`. `curl` con `service_role` pero sin `owner_id` no ve `businesses` ajenas (RLS `my_business_ids()`).

**Acceptance Scenarios**:

1. **Given** no hay `user` (proxy `getUser()==null`), **When** `GET /dashboard`, **Then** 307 a `/login`
2. **Given** `user` es `test@barber.local` (owner de `escuderia`), **When** `GET /settings`, **Then** 200 y ve solo `escuderia` (no `cristain`)
3. **Given** `user` no es owner ni `employees.user_id` de `escuderia`, **When** intenta `GET /api/cash/current`, **Then** 404 `not_found` (no 200 con datos ajenos)

---

### User Story 3 — Escudería abre segunda sede sin reescribir (Priority: P2)

Como owner que abre una segunda sede (`Escudería — Sede Norte`) quiero agregarla sin duplicar código, y que la landing/booking puedan filtrar por sede más adelante.

**Why this priority**: No se implementa multi-sede completo ahora (YAGNI), pero la arquitectura no debe bloquearlo (evitar `business_id` hardcodeado en cada tabla sin `location_id` nullable).

**Independent Test**: `insert into locations (business_id, name, slug, address) values ('17c1a...','Norte','norte','...')` → no rompe `proxy`, `booking`, `landing`; `locations` tiene RLS `my_business_ids()` y `business_id` FK.

**Acceptance Scenarios**:

1. **Given** `locations` existe con `business_id=escuderia`, **When** se crea `employee` con `location_id=null` (single sede), **Then** sigue funcionando (nullable)
2. **Given** se crea `locations` `norte` y `sur`, **When** se lista `services`, **Then** siguen siendo por `business_id` (no por location) hasta decidir modelo por sede

---

### Edge Cases

- `businesses` sin `phone` → landing muestra `Colombia` sin `tel:` roto
- `services` con `price=null` → `formatCurrency` no explota (fallback 0)
- `employees` sin `color` → fallback `brand_color` o `#1a1a1a`
- `business_hours` sin filas → `computeEffectiveHours` default Lun-Vie 09-19 (no 500)
- `locations` con `slug` duplicado dentro del mismo `business_id` → `unique(business_id, slug)` 409
- Ataque: `GET /dashboard` con `x-user-id: fake` → proxy ignora (solo setea si `getUser()` real), no spoof

## Requirements

### Functional Requirements

- **FR-001**: System MUST tener landing `app/escuderia/page.tsx` 100% dinámica: `business` (`name, phone, address, brand_color`), `services` (5), `employees` (4), `business_hours` (7), y stats (`count appointments`, `count employees`) todos via `createClient` SSR (anon, RLS), sin hardcode de textos de negocio
- **FR-002**: System MUST mantener hardcode solo lo editorial (ej. `Tu estilo. Nuestra precisión.` como tagline, no como dato de negocio) y distinguirlo en código con comentario `// editorial hardcode, not business data`
- **FR-003**: System MUST proteger `/dashboard`, `/pos`, `/caja`, `/crm`, `/inventory`, `/booking`, `/settings` en `proxy.ts` con `protectedPaths` + `getUser()` y redirigir a `/login?redirectTo=...` si no hay `user`; además cada `page.tsx` debe re-validar `owner_id`/`my_business_ids()` (defensa en profundidad)
- **FR-004**: System MUST tener `proxy.ts` que no permita spoof de `x-user-id` (solo lo setea el middleware tras `getUser()`, y `lib/auth-user.ts` solo lee headers si vienen del middleware, con fallback a `getUser()` si no hay header)
- **FR-005**: System MUST tener RLS `my_business_ids()` en toda tabla tenant (ya en 001, 036-043) y nueva `locations` debe seguir patrón (`business_id in (select my_business_ids())`)
- **FR-006**: System MUST crear tabla `locations` (`id, business_id, name, slug, address, phone, is_active`) con `unique(business_id, slug)`, `grant anon,authenticated`, RLS, e índice `idx_locations_business`, sin romper single-sede (todas las FK nuevas `location_id` nullable)
- **FR-007**: System MUST dejar `employees.location_id`, `services.location_id`, `appointments.location_id` como columnas nullable futuras (no obligatorias en este slice) o al menos documentar que se agregarán como `uuid references locations(id) on delete set null` sin default, para no bloquear single-sede
- **FR-008**: System MUST mantener `NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted` single-tenant ahora, pero no hardcodear `business_id` en código (siempre `eq('slug','escuderia')` o `my_business_ids()`)

### Key Entities

- **Business**: `id, owner_id, name, slug, phone, address, timezone, currency, brand_color` (1 row `escuderia`)
- **Location** (nuevo): `id, business_id, name, slug, address, phone, is_active` (1 row default `Escudería Centro` para single, listo para `Norte`/`Sur`)
- **Service**: `business_id, location_id? (nullable futuro)`
- **Employee**: `business_id, location_id? (nullable futuro), specialties, color`
- **BusinessHours**: `business_id` (futuro `location_id` nullable)

## Success Criteria

### Measurable Outcomes

- **SC-001**: Cambiar `services.price` en DB → `/escuderia` refleja nuevo precio en <1s sin rebuild (SSR)
- **SC-002**: `curl -i /dashboard` sin auth → 307; con `test@barber.local` → 200 y solo ve `escuderia` (probar `select` con `anon` no ve `cristain` si se filtra por `my_business_ids()`)
- **SC-003**: `insert into locations ...` no rompe `supabase db reset` ni `npm run build` (45 rutas)
- **SC-004**: Lighthouse `/escuderia` mobile ≥90 perf (sin hardcode que cause hydration mismatch)

## Assumptions

- Single barbería ahora = 1 `businesses` row (`escuderia`); multi-sede futuro = N `locations` rows con `business_id` FK, no N `businesses`
- La landing vive en `/escuderia` (no en `/`); si `escuderia.com` apunta aquí, se hará `proxy.ts` rewrite `host:escuderia.com → /escuderia` en futuro, no en este slice
- No se implementa UI de gestión de `locations` en este slice, solo la tabla y la preparación; la UI de `settings` sigue gestionando `business_id` single
- Hardcode editorial permitido: hero tagline, descripciones de ambiente, textos de marketing; no permitido: precios, nombres de servicios/barberos, horarios, teléfono, dirección, stats
