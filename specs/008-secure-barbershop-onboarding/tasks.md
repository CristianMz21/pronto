# Tasks: Secure Barbershop Onboarding

**Feature**: `008-secure-barbershop-onboarding` | **Branch**: `008-secure-barbershop-onboarding`

## Phase 1: DB

- [x] **T001** Migration `073_barbershop_applications.sql` + `businesses.license_*` columns
- [x] **T002** Add `isSuperAdmin` to `lib/auth/roles.ts`

## Phase 2: Proxy & Invisibility

- [x] **T003** Update `proxy.ts` to return 404 for `/admin/*` if not super_admin, add `X-Robots-Tag`
- [x] **T004** Remove `STAFF` links from `app/escuderia/page.tsx` and `app/page.tsx`
- [x] **T005** Add `app/robots.ts` and ensure `app/sitemap.ts` excludes `/admin`, add `robots: {index: false}` to `app/(admin)/admin/layout.tsx`

## Phase 3: Apply Flow

- [x] **T006** Create `app/apply/page.tsx` with form + Turnstile
- [x] **T007** Create `app/api/apply/route.ts` with Turnstile verify + rateLimit + insert
- [x] **T008** Update `app/(auth)/register/page.tsx` to redirect to `/apply` when `ALLOW_PUBLIC_REGISTER=false`

## Phase 4: Approval

- [x] **T009** Create `app/(admin)/admin/applications/page.tsx` list pending
- [x] **T010** Create `app/api/admin/applications/[id]/approve/route.ts` to generate license and create business
- [x] **T011** Test `curl /admin/dashboard` without super_admin → 404, `view-source:/escuderia` no `/admin`
