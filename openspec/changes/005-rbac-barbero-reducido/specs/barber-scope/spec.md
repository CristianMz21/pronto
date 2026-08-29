# Delta for barber-scope

## ADDED Requirements

### Requirement: Barbero Own Agenda Only

The system MUST restrict `barbero` to his own agenda. Every query that lists or mutates `appointments` for a `barbero` session MUST include a mandatory filter `appointments.employee_id = <barber_employee_id>` where `<barber_employee_id>` is the `employees.id` whose `user_id = auth.uid()` and `is_active=true`. RLS is the enforcement; application filters are defense-in-depth. `barbero` MUST NOT be able to read, update, or delete appointments where `employee_id != self`, nor create appointments assigned to another employee.

#### Scenario: Barbero lists only own appointments

- GIVEN user `U` is `barbero` linked to `employees.id = E1` in business `B`
- AND business `B` has appointments `A1(employee_id=E1)` and `A2(employee_id=E2)`
- WHEN `U` fetches `/booking` or queries `appointments` via Supabase
- THEN only `A1` is returned; `A2` is invisible (RLS filtered / app filter)

#### Scenario: Barbero cannot fetch another barber's appointment by id

- GIVEN `barbero` `U(E1)` tries to fetch `appointments.id = A2` where `A2.employee_id=E2`
- WHEN the query executes (even with `select * where id=A2`)
- THEN result is empty / 0 rows (RLS denies), not a 500

#### Scenario: Barbero create forces self assignment

- GIVEN `barbero` `U(E1)` submits a new appointment with `employee_id=E2`
- WHEN the insert reaches the database
- THEN it MUST be rejected by RLS or coerced to `E1` (spec: rejected with 403/RLS violation); the booking-calendar UI for `barbero` MUST NOT expose a selector to choose another employee and MUST auto-set `employee_id=E1`

#### Scenario: Staff sees all agendas (no regression)

- GIVEN user `U` is `staff` in business `B` with employees `E1, E2`
- WHEN `U` loads `/booking`
- THEN appointments for both `E1` and `E2` are visible

### Requirement: Barbero Assigned Services Only

The system MUST restrict `barbero` to services assigned via `employee_services`. `barbero` can only read services where a row `employee_services(employee_id=self, service_id=S)` exists. The POS catalog, booking service selector, and any service listing for `barbero` MUST be filtered to this set. `owner`/`admin`/`staff` remain unfiltered (all business services).

#### Scenario: POS catalog filtered for barbero

- GIVEN `barbero` `E1` is assigned services `S1, S2` via `employee_services`, and business also has `S3` unassigned to `E1`
- WHEN `E1` opens `/pos`
- THEN the service catalog shows only `S1, S2`; `S3` is hidden and cannot be added to the cart

#### Scenario: Barbero cannot bypass service filter via API

- GIVEN `barbero` `E1` crafts a transaction with `service_id=S3` (not assigned)
- WHEN the request is submitted
- THEN the server MUST reject it (RLS or app validation returns 403 / validation error) and no `transactions` row is created

#### Scenario: Admin sees all services

- GIVEN user `U` is `admin` in business `B`
- WHEN `U` opens `/pos` or `/booking` service selector
- THEN all active services of `B` are visible regardless of `employee_services`

### Requirement: Barbero POS Limited

The POS flow for `barbero` MUST be limited: (1) service catalog filtered as above; (2) the sale is always attributed to `employee_id=self` (no selector for other employees); (3) barbero can create `transactions` only for own services and own `employee_id`; (4) barbero MUST NOT be able to apply owner-only discounts or access cash-register controls if those controls live under `/caja`.

#### Scenario: Barbero completes a sale for own service

- GIVEN `barbero` `E1` has `S1` assigned
- WHEN `E1` creates a transaction `amount` for `S1` with `employee_id=E1`
- THEN it succeeds and appears in own history

#### Scenario: Barbero POS hides other employees

- GIVEN `barbero` `E1` renders `/pos`
- WHEN the POS UI mounts
- THEN no employee selector is shown, or it is locked to `E1` and disabled

#### Scenario: Staff POS unchanged

- GIVEN `staff` user `U` in business `B`
- WHEN `U` uses `/pos`
- THEN `U` can select any employee and any service (no barber filter), preserving prior behavior

### Requirement: No Cross-Barber Leakage via Relations

Any denormalized read that joins through `appointments`, `transactions`, or `commissions` MUST also enforce `employee_id=self` for `barbero`. Listing `clients` via recent appointments MUST NOT leak clients who only have appointments with other barbers, except where the client is also linked to the barbero's own appointment. Aggregations (dashboard KPIs, commissions) for `barbero` MUST be scoped to `employee_id=self`; the dashboard for `barbero` MUST NOT show business-wide revenue that includes other barbers' sales.

#### Scenario: Dashboard KPIs scoped for barbero

- GIVEN business `B` has 10 transactions: 2 for `E1(barbero)` and 8 for `E2`
- WHEN `E1` loads `/dashboard`
- THEN KPI totals reflect only the 2 transactions of `E1`, not the full 10

#### Scenario: Clients list does not leak for barbero

- GIVEN client `C1` has appointments only with `E2`, client `C2` with `E1`
- WHEN `barbero` `E1` queries clients (or clients via appointments)
- THEN only `C2` is visible; `C1` is absent
