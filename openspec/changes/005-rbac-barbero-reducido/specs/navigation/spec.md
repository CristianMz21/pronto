# Delta for navigation

## ADDED Requirements

### Requirement: Sidebar Filtered by Role

`components/layout/sidebar.tsx` (and its mobile drawer) MUST filter navigation items by canonical role. The nav definition MUST be augmented with per-item `allowedRoles` or a `visibleFor(role)` predicate derived from `ROLE_PERMISSIONS`. For `barbero`, only the following links SHALL be visible: `/dashboard`, `/booking`, `/pos`. All other dashboard items (`/caja`, `/crm`, `/inventory`) and the `/settings` entry MUST be hidden for `barbero`. The component MUST receive `role` as a prop (server layout passes it) rather than fetching it client-side to avoid flicker and client spoofing.

Visual treatment for hidden items MUST be removal from the DOM (not just `disabled` or CSS `hidden`), so they are not reachable via keyboard or screen reader.

#### Scenario: Barbero sidebar shows only three items

- GIVEN role `barbero` and `businessName="Escudería"` passed to `<Sidebar />`
- WHEN the sidebar renders (desktop and mobile drawer)
- THEN nav shows `Dashboard`, `Booking`, `POS` and does not render `Caja`, `Clients`, `Inventory`, or `Settings`

#### Scenario: Barbero cannot tab to hidden settings

- GIVEN `barbero` sidebar rendered
- WHEN a keyboard user tabs through the nav
- THEN `Settings` is not in the tab order (not in DOM) and cannot be activated via `Enter`

#### Scenario: Staff sidebar shows full nav (no regression)

- GIVEN role `staff`
- WHEN `<Sidebar role="staff" />` renders
- THEN nav shows `Dashboard`, `POS`, `Caja`, `Clients`, `Inventory`, `Booking`, and `Settings`

#### Scenario: Admin and owner also see full nav

- GIVEN role `admin` or `owner`
- WHEN sidebar renders
- THEN the same full nav as `staff` is shown

### Requirement: Navigation Reflects Permission Matrix Single Source

The sidebar's visibility logic MUST reuse `lib/auth/roles.ts` (`canAccessRoute` / `ROLE_PERMISSIONS`) rather than a separate hard-coded list, so proxy, layout, and sidebar cannot drift. If `ROLE_PERMISSIONS.barbero` denies a path, the sidebar MUST hide it. The mapping MUST be unit-tested in isolation.

#### Scenario: Sidebar and proxy agree on denied routes

- GIVEN `ROLE_PERMISSIONS.barbero` denies `/inventory`
- WHEN `canAccessRoute('barbero','/inventory') === false`
- THEN `<Sidebar role="barbero" />` does not render an `Inventory` link and `proxy.ts` would redirect `/inventory` to `/dashboard`

#### Scenario: Adding a new denied route hides it automatically for barbero

- GIVEN a new route `/reports` is added to `ROLE_PERMISSIONS` with `barbero: false`
- WHEN sidebar renders for `barbero`
- THEN no `Reports` link appears without extra sidebar code changes (driven by map)

### Requirement: Role Prop Plumbing Without Flicker

`app/(dashboard)/layout.tsx` (server) MUST pass the resolved `role` to `<Sidebar />`. The sidebar MUST NOT fetch role client-side via Supabase, and MUST NOT show a flash of full nav before filtering. If `role` is not yet resolved (edge fallback), the sidebar MUST render a minimal skeleton without privileged links rather than the full nav.

#### Scenario: Server-rendered sidebar for barbero has no full-nav flash

- GIVEN a request for `barbero` where `layout.tsx` already resolved `role=barbero`
- WHEN the HTML is streamed to the client
- THEN the initial HTML already contains only 3 nav items; no client effect removes items post-hydration

#### Scenario: Missing role prop renders safe default

- GIVEN `<Sidebar />` is rendered without a role (fallback path)
- WHEN it mounts
- THEN it renders no privileged links and does not expose `Caja`/`Inventory`/`Settings` until role is confirmed

## MODIFIED Requirements

### Requirement: Sidebar Navigation

The sidebar SHALL display role-appropriate navigation items, filtered by canonical role via `lib/auth/roles.ts`, with desktop and mobile variants kept in sync. Previously the sidebar showed the same nav to every authenticated dashboard user.
(Previously: single static nav array shown to all employees)

#### Scenario: Pre-change sidebar for any employee

- GIVEN any active employee (barbero or staff) before this change
- WHEN sidebar rendered
- THEN all items `dashboard/pos/caja/crm/inventory/booking` plus `settings` were visible

#### Scenario: Post-change sidebar diverges by role

- GIVEN the same two users after the change
- WHEN each renders the sidebar
- THEN `staff` still sees all items, `barbero` sees only `dashboard/booking/pos`
