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

## Índices críticos (059..086, 088..095)

- `idx_waitlist_desired (business_id, location_id, desired_at) WHERE status='waiting'`
- `idx_recurring_business (business_id, next_at) WHERE is_active`
- `idx_holidays_business_date (business_id, date)` + `idx_holidays_business_location_date`
- `idx_appointments_employee_starts (business_id, employee_id, starts_at) WHERE employee_id IS NOT NULL` — 086
- `idx_appointments_business_starts_status (business_id, starts_at, status)` — 086
- `idx_transactions_business_created (business_id, created_at DESC) WHERE status='completed'` — 086
- `idx_inventory_business_qty_threshold (business_id, quantity, low_stock_threshold)`
- `idx_campaign_recipients_client_status (campaign_id, client_id, status)`
- `idx_client_memberships_active (business_id, status, expires_at) WHERE status='active'`
- `idx_appointments_client_starts (client_id, starts_at DESC) WHERE client_id IS NOT NULL` — 095 (Customer 360 p95 <1.5s `GET /api/client/me` upcoming/history)
- `idx_appointments_client_upcoming (business_id, client_id, starts_at)` — 095
- `idx_appointments_payment_status (payment_status) WHERE deposit_paid` — 095
- `idx_clients_preferred_barber (preferred_barber_id) WHERE not null` — 088
- `idx_favorites_client/employee` + `idx_client_styles_client/favorite/created` — 089/090
- `idx_reviews_business/client/employee/rating` + `unique_reviews_appointment` — 091
- `idx_appointments_checkin` unique partial `checkin_code` — 092
- `idx_gift_cards_business/purchaser/expires/balance` — 093

## Customer 360 (009) — 088..095

| Rango | Propósito |
|-------|-----------|
| 088 | `clients` ADD `preferences jsonb {}`, `status active/inactive/VIP`, `preferred_barber_id FK employees`, `notification_prefs {whatsapp,email,push}` + `idx_clients_status/preferred_barber` |
| 089 | `favorites` M2M `PK(client_id,employee_id)` + `tenant_access_favorites USING EXISTS clients.business_id IN my_business_ids()` + `client_self_favorites` |
| 090 | `client_styles` `id, client_id, business_id, service_id, employee_id, photo_url, notes, is_favorite` + `storage bucket client-styles private 5MB webp/png/jpeg` + `storage.objects RLS client_styles_authenticated_all` |
| 091 | `reviews` `appointment_id UNIQUE, rating 1-5 CHECK, tags text[], comment` + `tenant_access_reviews + client_self_reviews` + advisory lock api |
| 092 | `appointments` ADD `checkin_code text UNIQUE partial, payment_status unpaid/deposit_paid/paid/failed, deposit_amount int >=0, guest_name text` + `idx_appointments_checkin/guest` |
| 093 | `gift_cards` stub `code unique, amount>0, balance>=0 && <=amount, purchaser_client_id, recipient_name/email, expires_at` + `tenant_access_gift_cards` |
| 094 | Storage bucket verification private + `client_styles_service_all` policy + no anon read |
| 095 | Payments stub verification + `idx_appointments_client_starts/upcoming/payment_status` for `GET /api/client/me` perf + `transactions.tip_amount` |

```
Business 1--* Client 1--* Favorite M2M Employee, 1--* ClientStyle, 1--* Review via Appointment unique, 1--* Waitlist, 1--* GiftCard purchaser, Client 1--1 Loyalty, N Membership; Appointment *--1 Service, *--0..1 Employee, + checkin_code/payment_status/guest_name
```

## RLS

Todas `ENABLE ROW LEVEL SECURITY` + `policy tenant_access_* FOR ALL USING (business_id IN (SELECT my_business_ids()))`. Helper `my_business_ids()` = `businesses.owner_id = auth.uid() UNION employees.user_id = auth.uid() and is_active`. `my_location_ids()` V2 futuro.

Grants `GRANT ALL ON TABLE ... TO anon, authenticated` (001 pattern) + `SECURITY DEFINER stable set search_path = public` helpers.

## PII

`clients.phone_encrypted bytea` dual-write via `trg_encrypt_phone` → `encrypt_pii()` (`pgsodium` primary + `pgcrypto` fallback). Vista `clients_secure` solo `authenticated`. Ver `docs/security.md` y migrations 050/051.

## Helpers

- `get_booked_slots(p_business_id uuid, p_date date, p_employee_id uuid null)` — security definer, estático, filtra por employee cuando dado.
- `checkSlotWithinHours / checkSlotWithHolidays / checkSlotWithinLocation` (lib) espejo del trigger 032.
- `isEligible / consumeMembership` (pg_advisory_xact_lock), `evaluatePromotion`, `earn/redeem loyalty`.
