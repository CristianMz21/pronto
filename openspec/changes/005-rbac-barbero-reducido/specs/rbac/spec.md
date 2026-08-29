# Delta for rbac

## ADDED Requirements

### Requirement: Canonical Roles

The system SHALL define exactly four canonical dashboard roles: `owner`, `admin`, `staff`, `barbero`. `owner` is derived from `businesses.owner_id = auth.uid()` and is not stored in `employees.role`. `admin`, `staff`, and `barbero` are stored in `employees.role` with a DB CHECK constraint.

The system MUST enforce that `employees.role` can only contain values in `('admin','staff','barbero')` (plus legacy `'employee'` migrated to `'staff'`). Any insert or update with an invalid role MUST be rejected by the database. The default for new dashboard employees created without an explicit role MUST be `staff` unless the onboarding selector specifies `barbero`.

#### Scenario: Owner resolved without employees row

- GIVEN an authenticated user `U` who owns a business via `businesses.owner_id = U`
- AND `U` has no row in `employees`
- WHEN `getUserRole()` is called for `U` within that business context
- THEN the returned role is `owner`

#### Scenario: Role stored in employees is authoritative for non-owners

- GIVEN a user `U` is not an owner
- AND `U` has an active row `employees(user_id=U, role='barbero', is_active=true)`
- WHEN `getUserRole()` resolves
- THEN the returned role is `barbero`

#### Scenario: DB rejects invalid role

- GIVEN an active business
- WHEN an insert into `employees` with `role='superadmin'` is attempted
- THEN the database MUST reject it with a CHECK violation

#### Scenario: Backfill legacy employee role

- GIVEN existing rows with `employees.role = 'employee'`
- WHEN migration `058_rbac_barbero` runs
- THEN every `'employee'` value MUST be updated to `'staff'`

### Requirement: Role Resolution Single Source

The system MUST provide a single source of truth for role resolution in `lib/auth/roles.ts`. No other module SHALL duplicate role-parsing logic. Resolution precedence MUST be: `owner` (via `businesses.owner_id`) > `employees.role` (active row with `user_id = auth.uid()`) > unauthenticated/unknown (no role). `getUserRole()` MUST be server-only, accept a Supabase client and `userId` plus `businessId` context when needed, and return a canonical role or `null`.

#### Scenario: Owner precedence over employee row

- GIVEN user `U` is both `businesses.owner_id` and has an `employees` row with `role='barbero'`
- WHEN `getUserRole()` is evaluated for that business
- THEN the result is `owner` (owner wins)

#### Scenario: Multiple employee rows across businesses

- GIVEN user `U` is `barbero` in business `B1` and `staff` in business `B2`
- WHEN `getUserRole()` is called scoped to `B1`
- THEN it returns `barbero`
- AND when scoped to `B2` it returns `staff`

#### Scenario: Inactive employee has no dashboard role

- GIVEN `employees(user_id=U, is_active=false, role='barbero')`
- WHEN `getUserRole()` is called
- THEN it returns `null` (treated as no dashboard access, redirected to onboarding/login by layout)

### Requirement: Permission Mapping Role to Routes

The system MUST define a declarative `role → route permissions` map in `lib/auth/roles.ts` that is the sole authority for proxy and layout guards. The matrix is:

| Route prefix | `owner` | `admin` | `staff` | `barbero` |
|--------------|---------|---------|---------|-----------|
| `/dashboard` | ALLOW | ALLOW | ALLOW | ALLOW (read-only own scope) |
| `/pos` | ALLOW | ALLOW | ALLOW | ALLOW (filtered — see barber-scope) |
| `/caja` | ALLOW | ALLOW | ALLOW | DENY |
| `/crm` | ALLOW | ALLOW | ALLOW | DENY |
| `/inventory` | ALLOW | ALLOW | ALLOW | DENY |
| `/booking` | ALLOW | ALLOW | ALLOW | ALLOW (own agenda only) |
| `/settings` | ALLOW | ALLOW | ALLOW | DENY |
| `/client` | N/A (client portal, not dashboard RBAC) | N/A | N/A | N/A |
| `/book/[slug]` | PUBLIC (no auth, no RBAC) | PUBLIC | PUBLIC | PUBLIC |

`hasPermission(role, path)` / `canAccessRoute(role, pathname)` helpers MUST implement this matrix with prefix matching (e.g. `/caja` matches `/caja`, `/caja/reports`, `/caja/*`). Adding a new dashboard route without updating this map MUST default to DENY for `barbero`.

#### Scenario: Matrix lookup for barbero on allowed route

- GIVEN role `barbero`
- WHEN `canAccessRoute('barbero','/booking')` is called
- THEN it returns `true`

#### Scenario: Matrix lookup for barbero on denied route

- GIVEN role `barbero`
- WHEN `canAccessRoute('barbero','/caja')` is called
- THEN it returns `false`

#### Scenario: Prefix matching denies sub-paths

- GIVEN role `barbero`
- WHEN `canAccessRoute('barbero','/inventory/movements/123')` is called
- THEN it returns `false`

#### Scenario: Owner always allowed

- GIVEN role `owner`
- WHEN `canAccessRoute('owner','/settings/members')` is called
- THEN it returns `true`

### Requirement: Role Helpers and Headers

`lib/auth/roles.ts` MUST export at minimum: `getUserRole()`, `isBarbero(role)`, `isPrivileged(role)` (owner/admin), `canAccessRoute(role, pathname)`, and `ROLE_PERMISSIONS` constant. `proxy.ts` and `app/(dashboard)/layout.tsx` MUST consume these helpers rather than re-implementing checks. The resolved role MUST be forwarded as `x-user-role` request header by `proxy.ts` so Server Components can avoid a second DB lookup when the header is present.

#### Scenario: Helpers are pure and testable

- GIVEN `ROLE_PERMISSIONS` is imported in a unit test
- WHEN `canAccessRoute('barbero','/settings')` and `canAccessRoute('staff','/settings')` are called
- THEN results are `false` and `true` respectively without any I/O

#### Scenario: x-user-role header propagation

- GIVEN `proxy.ts` resolved role `barbero` for user `U`
- WHEN the request is forwarded to the App Router
- THEN `headers().get('x-user-role')` equals `barbero`

### Requirement: Onboarding Role Selector

The onboarding flow (`app/onboarding/*`) MUST present a role selector when creating the first employee record for a non-owner member: options `staff` (default) and `barbero`. Selecting `barbero` MUST create the employee with `role='barbero'`. If no selection is made, the system MUST default to `staff`. Existing onboarding that creates the owner MUST NOT create an `employees` row for the owner.

#### Scenario: Onboarding creates staff by default

- GIVEN a new user `U` invited to business `B` and onboarding does not specify a role
- WHEN the employee record is created
- THEN `employees.role` is `staff`

#### Scenario: Onboarding creates barbero when selected

- GIVEN the onboarding form selects `Barbero`
- WHEN the employee record is created
- THEN `employees.role` is `barbero` and `is_active` is `true`

#### Scenario: Owner onboarding does not create employee row

- GIVEN a new user `U` completes onboarding as business owner of `B`
- WHEN onboarding finalizes
- THEN `businesses.owner_id = U` and no `employees` row is created for `U` in `B`
