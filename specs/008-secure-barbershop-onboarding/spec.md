# Feature Specification: Secure Barbershop Onboarding — Max Security

**Feature Branch**: `008-secure-barbershop-onboarding`
**Created**: 2026-08-29
**Status**: Draft
**Input**: Una barbería no se puede registrar normalmente, debe ser por otro lado más controlado y seguro, con máxima seguridad y licenciamiento/suscripción. Ningún cliente debe conocer el link de administración. Todo transparente.

## User Scenarios & Testing

### User Story 1 — Lead aplica (P1)
Como emprendedor quiero solicitar alta de mi barbería sin poder auto-crearla, para que el sistema sea controlado.

**Acceptance**:
1. `GET /register` redirige a `/apply` si `ALLOW_PUBLIC_REGISTER=false`
2. `POST /api/apply` con `business_name, owner_name, email, phone, NIT, city, plan` + Turnstile token → 201 crea `barbershop_applications` status `pending`, no crea `businesses` ni `auth.users`, rateLimit 5/h por IP, CAPTCHA validado
3. Sin Turnstile válido → 400
4. Email duplicado pending → 409

### User Story 2 — Super-admin aprueba (P1)
Como super-admin quiero ver solicitudes pending, verificar NIT, aprobar con plan y generar license_key.

**Acceptance**:
1. `GET /admin/applications` solo si `x-user-role=super_admin` (proxy), si no 404 (no 302)
2. Lista muestra `pending` con datos, botón Aprobar genera `license_key=uuid`, `POST /api/admin/applications/[id]/approve` crea `auth.users` + `businesses(license_key, license_status=active, plan, expires_at)` + `insertOwnerAsEmployee`, envía email magic link, cambia status a `approved`
3. Rechazar cambia a `rejected`

### User Story 3 — Owner activa licencia (P1)
Como owner aprobado quiero activar mi barbería con licencia.

**Acceptance**:
1. Click magic link → `/auth/callback` valida `license_key` existe y no expirada, permite setear password en `/reset-password`
2. Sin `license_key` válida, `GET /register` y `POST /api/book` sin licencia bloqueado (si se intenta crear business sin licencia)
3. `businesses.license_status` en `active` permite `onboarding` y `dashboard`, si `suspended` bloquea `proxy` con 404

### User Story 4 — Invisibilidad admin (P1)
Como cliente nunca debo ver ni adivinar la administración.

**Acceptance**:
1. `GET /admin/*` sin super_admin → 404 (no 302 a /login) — no enumera
2. `view-source:https://.../escuderia` no contiene `/admin`, `/dashboard`, `/pos` — solo `/book`, `/client`
3. `GET /sitemap.xml` no lista `/admin`, `/dashboard`, `/client`; `GET /robots.txt` tiene `Disallow: /admin`
4. `GET /escuderia` footer no tiene `STAFF` link, solo `RESERVAR` y `MI CUENTA` (/client)
5. `__NEXT_DATA__` de `/escuderia` no prefetch `/admin`

## Requirements

### Functional

- **FR-SEC-001**: System MUST deshabilitar `GET /register` público cuando `ALLOW_PUBLIC_REGISTER=false` (env) → redirect `/apply`
- **FR-SEC-002**: System MUST tener `barbershop_applications(id, business_name, owner_name, email, phone, nit, city, requested_plan, status pending/approved/rejected, license_key uuid unique, created_at)` con RLS solo super_admin
- **FR-SEC-003**: System MUST validar Turnstile (`TURNSTILE_SECRET_KEY`) y `rateLimit` en `POST /api/apply`
- **FR-SEC-004**: System MUST generar `license_key` al aprobar y guardar en `businesses.license_key` + `license_status` + `license_expires_at`
- **FR-SEC-005**: System MUST proteger `proxy.ts` para `path.startsWith('/admin')` con `404` si no super_admin, y `X-Robots-Tag: noindex` + `metadata.robots index:false`
- **FR-SEC-006**: System MUST ocultar todos los links `/admin` de páginas públicas y no indexarlos

### Non-Functional

- **NFR-SEC-001**: `app/(admin)` no debe estar en `__NEXT_DATA__` de público, `sitemap` y `robots` deben excluirlo, `proxy` debe responder 404 idéntico a ruta inexistente (timing similar)
- **NFR-SEC-002**: `license_key` debe ser `uuid v4` criptográficamente aleatorio, único, no secuencial

### Success Criteria

- **SC-SEC-001**: `curl /register` → 302 a `/apply` cuando `ALLOW_PUBLIC_REGISTER=false`
- **SC-SEC-002**: `curl -X POST /api/apply` sin Turnstile → 400, con Turnstile y 6 intentos/h → 429 en el 6º
- **SC-SEC-003**: `GET /admin/dashboard` sin super_admin → 404 (no 302), con `grep -r "/admin" app/escuderia` → 0
- **SC-SEC-004**: `GET /sitemap.xml` no contiene `/admin`, `GET /robots.txt` contiene `Disallow: /admin`, `view-source` de `/escuderia` no contiene `/admin`

## Dependencies

- `lib/auth/roles.ts` con `isSuperAdmin` (ya existe `isBarbero` etc.)
- `supabase/migrations` para `barbershop_applications` y `businesses.license_*`
- `TURNSTILE_SECRET_KEY` env
