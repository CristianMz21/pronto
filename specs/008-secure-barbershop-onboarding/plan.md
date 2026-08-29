# Implementation Plan: Secure Barbershop Onboarding

**Branch**: `008-secure-barbershop-onboarding` | **Date**: 2026-08-29 | **Spec**: `spec.md`

## Technical Context

**Stack**: Next.js 16 + Supabase + Drizzle + Turnstile + LemonSqueezy (plan). `ALLOW_PUBLIC_REGISTER=false` env.

**DB**: `barbershop_applications` + `businesses.license_key/status/expires_at` + `audit_log` for approvals.

**Auth**: `lib/auth/roles.ts` add `isSuperAdmin` (check `auth.users.user_metadata.role === 'super_admin'` or `email in SUPER_ADMINS` env). `proxy.ts` guard for `/admin`.

## Architecture

**1. DB**:
```sql
create table barbershop_applications (
  id uuid primary key default uuid_generate_v4(),
  business_name text not null,
  owner_name text not null,
  email text not null,
  phone text,
  nit text,
  city text,
  requested_plan text,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  license_key uuid unique,
  created_at timestamptz default now()
);
alter table businesses add column if not exists license_key uuid unique;
alter table businesses add column if not exists license_status text default 'pending' check (license_status in ('pending','active','suspended','revoked'));
alter table businesses add column if not exists license_expires_at timestamptz;
```

**2. Proxy**:
- `path.startsWith('/admin')` → if !isSuperAdmin → `new Response('Not Found', {status:404})` (no redirect)
- Add `X-Robots-Tag: noindex` header for `/admin/*`
- `app/(admin)/layout.tsx` also checks and renders 404

**3. APIs**:
- `POST /api/apply` with Turnstile verify `https://challenges.cloudflare.com/turnstile/v0/siteverify`, rateLimit, insert application
- `POST /api/admin/applications/[id]/approve` (super_admin only) → generate license_key, create auth user via `supabase.auth.admin.createUser`, create business, send email
- `GET /admin/applications` page list pending

**4. UI**:
- `app/apply/page.tsx` public form (no auth) with Turnstile widget
- `app/(auth)/register/page.tsx` → redirect to `/apply` if `ALLOW_PUBLIC_REGISTER=false`
- `app/(admin)/admin/applications/page.tsx` super-admin only
- Remove `STAFF` link from `app/escuderia/page.tsx` and `app/page.tsx`
- Add `app/robots.ts` and `app/sitemap.ts` already excludes admin, ensure `app/(admin)/admin/*` has `robots: {index: false}`

## Project Structure

```
app/
  apply/page.tsx
  (admin)/admin/applications/page.tsx
  (admin)/admin/layout.tsx
  api/apply/route.ts
  api/admin/applications/[id]/approve/route.ts
supabase/migrations/07x_*.sql
lib/auth/roles.ts
proxy.ts
```

## Risks

- Turnstile secret missing → fallback to allow in dev with warning, block in prod
- Super_admin bootstrap: first super_admin via env `SUPER_ADMINS=email` and `auth.users` manual update
