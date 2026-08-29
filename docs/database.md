# Database — Pronto Barber

> ERD textual + migraciones 001..086. Idempotente (`IF NOT EXISTS` + `DO $$`). RLS `tenant_access_*` en toda tabla.

## ERD (006 additions)

```
businesses 1──N locations 1──N employees (location_id nullable)
                 │           1──N employee_services ──N services (location_id nullable)
                 │           1──N employee_unavailability
                 │           1──N business_hours (+ holidays per location)
                 │
                 ├──N services (location_id)
                 ├──N service_combos
                 ├──N clients (preferred_barber_id, location_id, phone_encrypted)
                 │     ├──N loyalty_accounts / loyalty_movements
                 │     └──N client_memberships ──1 memberships
                 │
                 ├──N appointments (client, employee?, service, location, recurring_id, status FSM)
                 │     ├──N recurring_appointments 1──N appointments
                 │     └──N waitlist (client, service, employee?, location, desired_at)
                 │
                 ├──N transactions (appointment?, client, employee?, location, items jsonb, discount, tax, tip)
                 │     ├──N commissions (employee, transaction)
                 │     └──N tips (employee, transaction) + transactions.tip_amount
                 │
                 ├──N inventory_items (location_id, sku unique per business, barcode)
                 │     └──N inventory_movements (in/out/adjustment/transfer + from/to_location_id)
                 │
                 ├──N cash_registers (location_id, opened_by, closed_by)
                 ├──N promotions (location_id?, rules jsonb)
                 ├──N campaigns (segment, channel, stats) 1──N campaign_recipients
                 └──N notification_log (appointment?, campaign?, channel)
```

## Rangos

| Rango | Propósito |
|-------|-----------|
| 001 | Core businesses, employees, services, clients, appointments, transactions, inventory |
| 002-006 | notification_log, telegram/viber tokens, billing plan, viber_user_id |
| 007 | pg_cron → GET /api/cron/notify |
| 008 | client_stats total_visits/spent/last_visit_at |
| 009 | business_hours + get_booked_slots RPC |
| 014 | get_booked_slots(p_employee_id) |
| 017-032 | Doble reserva interval+capacity+pg_advisory_xact_lock |
| 023 | Performance indexes (idx_appointments_business_status_starts) |
| 035-055 | breaks, enabled_modules, phone unique, brand_color, business_lead_time, require_cash |
| 044 | locations + location_id nullable cols + seed Escudería Centro |
| 058 | holidays (single, seed) |
| 060 | waitlist (063 Waitlist original) |
| 061-062 | loyalty + promotions (061 promotions, 062 loyalty) |
| 063-064 | waitlist + recurring_appointments canonical |
| 065-069 | campaigns, tags/client_tags, transaction_items 3FN, business_settings, service_categories |
| 071 | tips (transactions.tip_amount + tips table) |
| 072-078 | memberships, service_combos, transactions.discount, loyalty_points_view, etc. |
| 080-081 | commission_tip_discount + inventory_transfer_atomic |
| 082 | locations remaining (idx_appointments_business_location_starts) |
| 083 | US7 waitlist/recurring/holidays/tips completeness (RLS+indexes) |
| 084 | campaigns completeness (RLS+indexes) |
| 085 | config completeness (business_hours location_id + businesses tax/payment/loyalty cols) |
| 086 | polish indexes (idx_appointments_employee_starts, idx_transactions_business_created, etc.) |

## Índices críticos (059..086)

- `idx_waitlist_desired (business_id, location_id, desired_at) WHERE status='waiting'`
- `idx_recurring_business (business_id, next_at) WHERE is_active`
- `idx_holidays_business_date (business_id, date)` + `idx_holidays_business_location_date`
- `idx_appointments_employee_starts (business_id, employee_id, starts_at) WHERE employee_id IS NOT NULL` — 086
- `idx_appointments_business_starts_status (business_id, starts_at, status)` — 086
- `idx_transactions_business_created (business_id, created_at DESC) WHERE status='completed'` — 086
- `idx_inventory_business_qty_threshold (business_id, quantity, low_stock_threshold)`
- `idx_campaign_recipients_client_status (campaign_id, client_id, status)`
- `idx_client_memberships_active (business_id, status, expires_at) WHERE status='active'`

## RLS

Todas `ENABLE ROW LEVEL SECURITY` + `policy tenant_access_* FOR ALL USING (business_id IN (SELECT my_business_ids()))`. Helper `my_business_ids()` = `businesses.owner_id = auth.uid() UNION employees.user_id = auth.uid() and is_active`. `my_location_ids()` V2 futuro.

Grants `GRANT ALL ON TABLE ... TO anon, authenticated` (001 pattern) + `SECURITY DEFINER stable set search_path = public` helpers.

## PII

`clients.phone_encrypted bytea` dual-write via `trg_encrypt_phone` → `encrypt_pii()` (`pgsodium` primary + `pgcrypto` fallback). Vista `clients_secure` solo `authenticated`. Ver `docs/security.md` y migrations 050/051.

## Helpers

- `get_booked_slots(p_business_id uuid, p_date date, p_employee_id uuid null)` — security definer, estático, filtra por employee cuando dado.
- `checkSlotWithinHours / checkSlotWithHolidays / checkSlotWithinLocation` (lib) espejo del trigger 032.
- `isEligible / consumeMembership` (pg_advisory_xact_lock), `evaluatePromotion`, `earn/redeem loyalty`.
