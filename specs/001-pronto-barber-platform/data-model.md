# Data Model — Pronto Barber Platform

**Feature**: `001-pronto-barber-platform` | **Date**: 2026-08-27

## Entidades Existentes (no se tocan salvo extensión aditiva)

- **businesses** (`001`): `id, owner_id, name, slug(unique), type, phone, email, address, timezone(default UTC→America/Bogota para barbería), currency(default USD→COP), logo_url, plan, plan_expires_at, telegram/viber/whatsapp tokens, onboarding_completed, email_provider + smtp_*, resend_api_key, wa_template_*, brand_color, enabled_modules text[]`.
- **employees**: `id, business_id, user_id, name, role, phone, email, avatar_url, is_active`.
- **services**: `id, business_id, name, description, price, duration_min, category, capacity(default 1), is_active`.
- **clients**: `id, business_id, name, phone, email, notes, tags[], telegram_id, viber_user_id, whatsapp_number, birthday, total_visits, total_spent, last_visit_at` (+ `025_client_phone_unique` y `026`/`027`).
- **appointments**: `id, business_id, client_id, employee_id, service_id, starts_at, ends_at, status, price, source, notes`.
- **transactions**: `id, business_id, appointment_id, client_id, employee_id, amount, payment_method, status, items jsonb, receipt_number(seq)`.
- **inventory_items/movements**, **business_hours** (`day_of_week 0-6, is_open, open_time, close_time, break_start, break_end`), **notification_log**.

## Nuevas Entidades (migraciones 036..040)

### employee_services
```sql
create table public.employee_services (
  employee_id uuid references public.employees(id) on delete cascade,
  service_id  uuid references public.services(id) on delete cascade,
  primary key (employee_id, service_id)
);
```
Índice `idx_employee_services_service`. RLS: `business_id in (select my_business_ids())` via join a `employees`.

### employee_unavailability
```sql
create table public.employee_unavailability (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text, -- vacaciones, descanso, baja
  created_at  timestamptz default now(),
  check (ends_at > starts_at)
);
```
Índice `idx_emp_unavail_employee_range`. RLS igual.

### cash_registers + cash_movements
```sql
create table public.cash_registers (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  opened_by     uuid not null references auth.users(id),
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  opening_cash  numeric(10,2) not null default 0,
  expected_cash numeric(10,2),
  actual_cash   numeric(10,2),
  difference    numeric(10,2) generated always as (actual_cash - expected_cash) stored,
  status        text not null default 'open' check (status in ('open','closed'))
);
create table public.cash_movements (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  register_id uuid not null references public.cash_registers(id) on delete cascade,
  type        text not null check (type in ('in','out')),
  amount      numeric(10,2) not null check (amount>0),
  reason      text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);
```

### commissions
```sql
create table public.commissions (
  id             uuid primary key default uuid_generate_v4(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  employee_id    uuid not null references public.employees(id) on delete cascade,
  service_id     uuid references public.services(id) on delete set null,
  amount         numeric(10,2) not null,
  rate_snapshot  numeric(5,2), -- ej 50.00 = 50%
  type           text not null check (type in ('percentage','fixed','per_service','per_product')),
  created_at     timestamptz default now()
);
```

### Extensión appointments.status
```sql
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('pending','confirmed','scheduled','checked_in','in_service','completed','cancelled','no_show','paid'));
```

## Relaciones Clave

- `businesses 1—* employees 1—* employee_services *—1 services` (especialidades)
- `employees 1—* employee_unavailability` (bloquea `check_barber_availability`)
- `appointments.employee_id` → `employees`; `appointments.service_id` → `services`; validado por trigger `check_slot_availability` (032) + nuevo `check_barber_availability` (break/unavailability/services).
- `transactions.appointment_id` opcional, `transactions.employee_id` para comisión; `commissions.transaction_id` FK cascade.
- `cash_registers` 1—* `cash_movements` + `transactions` (cash) agregadas a `expected_cash` al cerrar.

## Índices y Triggers Nuevos

- `idx_employee_services_*`, `idx_emp_unavail_employee_range`, `idx_cash_registers_business_status`, `idx_commissions_employee`.
- Trigger `check_barber_availability` BEFORE INSERT/UPDATE en `appointments` (valida fuera de horario con `lib/booking-availability` lógica SQL, vacaciones y servicio habilitado).
- Trigger `generate_commission` AFTER INSERT en `transactions` (calcula `commissions` según `employees.commission_rate` o `employee_services` override futuro).

## RLS

Todas las nuevas tablas: `enable row level security` + policy `tenant_access_* using (business_id in (select my_business_ids()))`. Grants `anon, authenticated` como 001.
