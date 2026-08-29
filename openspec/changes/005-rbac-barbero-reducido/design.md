# Design: RBAC Barbero Reducido

## Technical Approach

Single source `lib/auth/roles.ts` holds `owner|admin|staff|barbero`, resolution, and `ROLE_PERMISSIONS`. `proxy.ts` early-guard (302, sets `x-user-role`) + `layout.tsx` second gate (server `redirect()`) share `canAccessRoute()`; RLS in `058_rbac_barbero.sql` is authoritative (`employee_id=self` for barbero). Sidebar filters server-side from same map — no FOUC. `/book` and `/client` excluded and untouched.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|----------|---------|----------|--------|
| **Single source roles** | A) One module B) Per-file C) JWT claim | B drifts; C needs hook + lag | **A** — `CanonicalRole`, `ROLE_PERMISSIONS`, `getUserRole()`, `canAccessRoute()`, `isBarbero()`, `isPrivileged()`. One matrix fans out to proxy/layout/sidebar, pure helpers testable. |
| **Propagation `x-user-role`** | A) Header+validate B) Re-query C) Client fetch | B RTT; C flicker+spoofable | **A** — Proxy reuses `auth.getUser()` to resolve (`owner` via `businesses.owner_id` > `employees.role` where `is_active`), overwrites `x-user-role/x-user-id/x-pathname` (client cannot spoof). Layout reads header but re-validates vs DB. |
| **Migration 058 RLS** | A) CHECK B) ENUM C) App-only | B locks+hard rollback; C bypassable | **A** — Idempotent `DO $$`: backfill `employee→staff`, `CHECK role IN ('admin','staff','barbero')`, helpers `current_user_role()`/`current_employee_id()` (`SECURITY DEFINER STABLE`), additive RLS: `my_business_ids()` AND (`privileged` OR `employee_id=self`) on `appointments/transactions/commissions`; 0 rows for `cash_*`/`inventory_*` when barbero. |
| **Guards fail-closed** | A) Server double-gate B) Client effect C) Per-page | B flickers; C scatters | **A** — Proxy denies `barbero` on `['/caja','/inventory','/settings','/crm']` (prefix) with `302→/dashboard` before render; layout repeats on `x-pathname`. Unknown role/route → DENY. Unauth → `/login`. |
| **Sidebar no FOUC** | A) Server prop B) Client fetch C) CSS hide | B FOUC; C a11y reachable | **A** — Layout passes `role` to `Sidebar`; nav filtered via `ROLE_PERMISSIONS`. Barbero renders only `/dashboard,/booking,/pos` (removed from DOM); mobile same array. Missing `role` → skeleton. |
| **No-touch `/book`/`/client`** | A) Exclude B) Branch policies | B couples booking to RBAC & breaks anon | **A** — Proxy matcher excludes `/book/*`/`/client/*`; migration never drops `public_read_*`/`client_self_*`/`client_can_*` nor revokes `anon`/`authenticated`; booking stays `is_active` + service client. |

## Data Flow

```
Request → proxy.ts ─┬─ unauth+protected → 302 /login
                    ├─ barbero+denied → 302 /dashboard
                    └─ else → x-user-role/x-pathname → next()
          ↓
layout.tsx ─ validate x-user-role vs DB ─┬─ no business → /onboarding
                                         ├─ denied → redirect(/dashboard)
                                         └─ pass {business,role,employee_id} → Sidebar + pages → RLS scoping
/book, /client → bypass RBAC → anon/client RLS only
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `lib/auth/roles.ts` | Create | Types, matrix, helpers — single authority |
| `lib/auth-user.ts` | Modify | Optional role propagation |
| `proxy.ts` | Modify | Early deny + headers; exclude `/book`/`/client` |
| `app/(dashboard)/layout.tsx` | Modify | Resolve business/role/employee_id, second gate, pass role |
| `components/layout/sidebar.tsx` | Modify | `role` prop, filter via matrix, remove denied from DOM |
| `supabase/migrations/058_rbac_barbero.sql` | Create | Backfill, CHECK, helpers, barbero RLS (idempotent) |
| `app/onboarding/*` | Modify | Selector `staff`/`barbero`; owner creates no employee row |

## Interfaces / Contracts

```ts
export type CanonicalRole = 'owner'|'admin'|'staff'|'barbero';
export const ROLE_PERMISSIONS: Record<CanonicalRole, Record<string, boolean>>;
export const canAccessRoute: (r: CanonicalRole|null, p: string) => boolean;
export const getUserRole: (c: SupabaseClient, uid: string, biz?: string) => Promise<CanonicalRole|null>;
// headers (server-overwritten): x-user-role, x-user-id, x-pathname
// DB: current_user_role() text, current_employee_id() uuid — SECURITY DEFINER STABLE
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Matrix, prefix, default-deny | Vitest table-driven (`roles.test.ts`) |
| Integration | RLS own vs foreign `appointments`, `cash_registers`=0, assignment filter, owner/staff ok, anon `/book` | Supabase local as barbero/owner |
| E2E | Proxy 302 denied vs allow, sidebar 3 vs 7 links no FOUC | Playwright seeded users |

## Migration / Rollout

Idempotent `058`: `DO $$ IF NOT EXISTS` for constraint/policy/function; backfill before CHECK; `CREATE OR REPLACE` helpers. Deploy DB then code atomically; no flag (additive, RLS backstop). Verify `pg_policies` + smoke queries (barbero vs owner) + Playwright `barbero→/caja→/dashboard`. Rollback: `DROP POLICY IF EXISTS` barbero policies, `DROP FUNCTION current_*`, `DROP CONSTRAINT IF EXISTS employees_role_check`, revert `proxy/layout/sidebar` to `main`, delete `roles.ts` — no data loss.

## Open Questions

- [ ] Dashboard KPIs for barbero filtered to `self` vs hidden — confirm.
- [ ] If POS embeds register UI outside `/caja`, add barbero check there.

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| RLS breaks owner/admin | Med | Privileged branch stays permissive; tested vs `anon` |
| API bypass | Low | RLS is enforcement |
| Migration non-idempotent | Low | Every DDL guarded; re-run safe |
| Sidebar/proxy drift | Low | Both consume `ROLE_PERMISSIONS` |
| `/book`/`/client` regress | Low | Out-of-scope; matcher + policies untouched |
```

