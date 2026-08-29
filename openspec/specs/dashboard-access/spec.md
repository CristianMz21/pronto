# Delta for dashboard-access

## ADDED Requirements

### Requirement: Proxy Early Guard and x-user-role Header

`proxy.ts` MUST act as the earliest RBAC guard. For every request to protected dashboard prefixes `['/dashboard','/pos','/caja','/crm','/inventory','/booking','/settings']` with an authenticated user, it MUST resolve the user's canonical role (via `getUserRole()` or a lightweight `employees` lookup cached per request) and:

1. Set request header `x-user-role` to that role (and `x-user-id`, `x-user-email` as today) so Server Components can read it without re-querying auth.
2. If role is `barbero` and `pathname` starts with any of `['/caja','/inventory','/settings']` (including sub-paths), it MUST redirect with `302` to `/dashboard` (preserving no sensitive data in the redirect). The redirect MUST happen before any rendering to avoid flicker.
3. For allowed routes (`/dashboard`, `/pos`, `/booking` for barbero), the request MUST pass through with the header set.
4. Unauthenticated requests to protected paths MUST still redirect to `/login` as today; role checks MUST NOT run for unauthenticated users.
5. Public routes `/` , `/book/*`, `/client/*`, `/login`, `/register` MUST NOT be affected by this guard.

#### Scenario: Barbero blocked from /caja by proxy

- GIVEN authenticated user `U` with role `barbero`
- WHEN `U` navigates to `/caja`
- THEN `proxy.ts` returns `302 Location: /dashboard` and no dashboard component renders

#### Scenario: Barbero blocked from nested inventory path

- GIVEN role `barbero`
- WHEN `U` requests `/inventory/movements/123`
- THEN the proxy redirects `302` to `/dashboard`

#### Scenario: Barbero allowed to /booking and /pos

- GIVEN role `barbero`
- WHEN `U` requests `/booking` or `/pos`
- THEN `proxy.ts` forwards the request with `x-user-role: barbero` and no redirect

#### Scenario: Owner allowed everywhere

- GIVEN role `owner`
- WHEN `U` requests `/caja`, `/inventory`, or `/settings`
- THEN no redirect occurs; headers include `x-user-role: owner`

#### Scenario: Public booking untouched

- GIVEN an unauthenticated visitor
- WHEN they request `/book/escuderia`
- THEN `proxy.ts` does not check role, does not redirect to `/login` or `/dashboard`, and the page renders (may use `service` client)

### Requirement: Dashboard Layout Resolve and Block

`app/(dashboard)/layout.tsx` MUST resolve the current business and canonical role on every render. It MUST:

1. Resolve `business` as today: first `businesses.owner_id = user.id`, else `employees(user_id=user.id, is_active=true) → businesses`.
2. Resolve `role` via `getUserRole()` or `x-user-role` header (header is trusted because `proxy.ts` overwrites it; layout MUST still validate it against DB if present, falling back to DB on mismatch).
3. If no business is resolved, redirect to `/onboarding` (existing behavior).
4. If role is `barbero` and `x-pathname` (set by proxy) matches a denied prefix (`/caja`,`/inventory`,`/settings`,`/crm`), it MUST redirect to `/dashboard` (server `redirect()`). This is the second line of defense if proxy is bypassed.
5. Provide `business` + `role` to children (via context/props/headers) so inner pages can apply barber-scope filters without extra lookups.

#### Scenario: Layout blocks barbero direct navigation to /crm

- GIVEN `barbero` `U` somehow bypasses proxy and reaches `layout.tsx` with `x-pathname=/crm`
- WHEN `layout.tsx` renders
- THEN it calls `redirect('/dashboard')` and the CRM page never mounts

#### Scenario: Layout propagates role to booking page

- GIVEN `barbero` `U(E1)` loads `/booking`
- WHEN `layout.tsx` resolves `role=barbero` and `employee_id=E1`
- THEN the booking page receives scope `employee_id=E1` and applies own-agenda filter

#### Scenario: Staff layout has no block

- GIVEN role `staff`
- WHEN `U` navigates to `/caja`
- THEN `layout.tsx` does not redirect; the page renders normally

### Requirement: RLS Is Real Enforcement

Migration `058_rbac_barbero.sql` MUST be the authoritative enforcement. It MUST:

1. Add a CHECK constraint on `employees.role` (`admin|staff|barbero`, migrating legacy `employee`→`staff`) idempotently (`DO $$` / `IF NOT EXISTS`).
2. Create a stable helper `public.current_user_role()` (or `current_user_role_for_business(uuid)`) that returns the caller's role for the current business, using `auth.uid()` and `my_business_ids()`, with `SECURITY DEFINER` and `SET search_path = public`, stable.
3. Add/Replace RLS policies so that:
   - `owner`/`admin`/`staff` retain permissive `my_business_ids()` access (no regression).
   - `barbero` is restricted to rows where `employee_id = (select id from employees where user_id=auth.uid() and is_active=true)` for tables `appointments`, `transactions`, `commissions`, and equivalent filtering for `employee_services`/`services` via assignment.
   - `barbero` has **no** read access to `cash_registers` and `cash_movements` (and `inventory_*` if cash/inventory are coupled) — a `select` on those tables as `barbero` MUST return 0 rows.
4. Be idempotent: re-running the migration MUST NOT error (guard every `CREATE POLICY`, `ADD CONSTRAINT`, `CREATE FUNCTION` with existence checks).
5. Not break `anon`/`authenticated` GRANTs required for PostgREST.

#### Scenario: RLS denies barbero cash_registers read

- GIVEN `barbero` `U(E1)` authenticated via `authenticated` role
- WHEN `U` runs `select * from cash_registers where business_id in (select my_business_ids())`
- THEN 0 rows are returned (policy denies), while the same query as `owner` returns the business's registers

#### Scenario: RLS allows barbero own appointment

- GIVEN `appointments(id=A1, employee_id=E1, business_id=B)` and `barbero` `U` maps to `E1`
- WHEN `U` selects `appointments where id=A1`
- THEN the row is returned

#### Scenario: RLS denies barbero foreign appointment

- GIVEN `appointments(id=A2, employee_id=E2)` and `barbero` `U(E1)`
- WHEN `U` selects `appointments where id=A2`
- THEN 0 rows returned (existing service-role reads via `service` key are unaffected)

#### Scenario: Owner/admin/staff still see all with RLS

- GIVEN `owner` `O` of business `B` with appointments for `E1` and `E2`
- WHEN `O` queries `appointments` as `authenticated`
- THEN all appointments of `B` are returned (tenant policy plus privileged role allows all)

### Requirement: Public and Client Routes Untouched

The change MUST NOT modify behavior of `/book/[slug]` (public booking) or the client portal `/client/*`. Specifically:

- `public_read_employees_for_booking`, `public_read_services_for_booking`, and business public reads used by `/book` MUST remain intact and MUST NOT gain role checks.
- `client_self_*` and `client_can_read_*` policies on `clients`, `appointments`, `transactions`, `businesses` MUST remain intact.
- `proxy.ts` MUST NOT redirect `/book/*` or `/client/*` based on dashboard roles, and RLS for `barbero` MUST NOT affect `anon` reads used by public booking.

#### Scenario: Public booking still works for anon

- GIVEN an anon visitor
- WHEN they load `/book/escuderia`
- THEN employees and services for that business are readable via the public policies and the booking form renders

#### Scenario: Client portal login still works

- GIVEN a registered client `C(user_id=U)` in business `B`
- WHEN `U` logs into `/client/login` and visits `/client/dashboard`
- THEN `U` can read own `clients` row, own appointments and transactions via `client_self_*` policies, unaffected by dashboard RBAC

#### Scenario: Barbero accessing /book is treated as anon public

- GIVEN `barbero` `U` visits `/book/escuderia` while authenticated
- WHEN the page renders
- THEN it uses the public/service read path as today; no RBAC redirect occurs

### Requirement: No Multi-Tenant Regression

`my_business_ids()` behavior MUST remain the single tenant boundary. RBAC restrictions for `barbero` MUST be additive (ANDed with tenant check), not a replacement. A `barbero` in business `B1` MUST NOT see data from `B2` even if `employee_id` filtering were bypassed. A user with no business (neither owner nor active employee) MUST still be redirected to `/onboarding` by the layout.

#### Scenario: Barbero cannot cross business boundary

- GIVEN `barbero` `E1` in `B1` and appointment `A3` in `B2` with coincidental `employee_id=E1` (should not happen but test isolation)
- WHEN `E1` queries appointments
- THEN `A3` is not returned because `business_id not in (select my_business_ids())`

## MODIFIED Requirements

### Requirement: Dashboard Access Control

The system SHALL enforce role-based access to dashboard routes via `proxy.ts`, `app/(dashboard)/layout.tsx`, and Supabase RLS, with `lib/auth/roles.ts` as the single source of truth. Previously this was only tenant isolation via `my_business_ids()` without role distinction.
(Previously: any active employee saw the full dashboard)

#### Scenario: Barbero full dashboard access before change (historical)

- GIVEN any active employee
- WHEN they visited `/caja` or `/inventory`
- THEN access was granted (tenant check only) — this behavior is now DENIED for `barbero`

#### Scenario: Barbero denied after change

- GIVEN role `barbero`
- WHEN they visit `/caja`, `/inventory`, `/settings`, or `/crm`
- THEN they are redirected `302` to `/dashboard` by proxy (and blocked by layout/RLS if they bypass)
