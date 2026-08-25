# Database Migrations

**Migrations run automatically** when you start the app with `docker-compose up`.
The migration runner (`scripts/migrate.js`) tracks applied files in the `schema_migrations` table
and only runs new ones.

If you need to apply migrations manually (e.g. local dev without Docker), run them in order
in **Supabase Dashboard → SQL Editor**.

Each file is self-contained and idempotent (`IF NOT EXISTS` / `IF EXISTS` guards).

---

## Migration order

| File | What it creates |
|---|---|
| `001_initial_schema.sql` | Core tables: `businesses`, `employees`, `services`, `clients`, `appointments`, `transactions`, `inventory_items`, `inventory_movements`. Row Level Security on all tables. |
| `002_notification_log.sql` | `notification_log` table — prevents duplicate notifications (email, Telegram, Viber). |
| `003_telegram_chat_id.sql` | Adds `telegram_bot_token` and `telegram_chat_id` columns to `businesses`. |
| `004_billing.sql` | Adds `plan`, `plan_expires_at`, `ls_customer_id`, `ls_subscription_id` to `businesses`. SaaS mode only — safe to run in self-hosted mode too. |
| `005_security_fixes.sql` | Tightens RLS policies, adds `my_business_ids()` helper function. |
| `006_viber_user_id.sql` | Adds `viber_bot_token`, `viber_chat_id` to `businesses`; `viber_user_id` to `clients`. |
| `007_cron_jobs.sql` | Sets up `pg_cron` scheduler to call `/api/cron/notify` every 15 minutes. Requires `pg_cron` and `pg_net` extensions enabled in Supabase. Values are substituted from `NEXT_PUBLIC_APP_URL` and `CRON_SECRET` env vars automatically. **Optional** — skipped with a warning if pg_cron is not enabled. |
| `008_client_stats_trigger.sql` | PostgreSQL trigger that auto-updates `total_visits`, `total_spent`, `last_visit_at` on `clients` when a transaction is completed. |
| `009_business_hours.sql` | `business_hours` table (open/close times per weekday). RPC function `get_booked_slots()` for the public booking page. Public read policies for booking widget. |
| `010_whatsapp_number.sql` | Adds `whatsapp_number` column to `clients` for Meta WhatsApp Cloud API notifications. |
| `011_drop_viber_id.sql` | Drops the unused `clients.viber_id` column (superseded by `viber_user_id` added in 006). |
| `012_business_owner_whatsapp.sql` | Adds `owner_whatsapp` column to `businesses` — the owner's personal WhatsApp number for receiving alerts (e.g. low-stock). Separate from the client-facing WhatsApp number. |
| `013_onboarding_completed.sql` | Adds `onboarding_completed boolean NOT NULL DEFAULT false` to `businesses`. Controls the first-run redirect: new users → `/onboarding`, returning users → `/dashboard`. |
| `014_get_booked_slots_employee.sql` | Replaces the `get_booked_slots()` RPC with an updated version that accepts an optional `p_employee_id uuid` parameter. When provided, returns only that employee's booked slots; when `NULL`, returns all slots for the business (previous behaviour). |
| `015_email_provider.sql` | Adds per-business email settings to `businesses`: `email_provider` (`'smtp'` \| `'resend'`), `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_from`, `resend_api_key`. Lets owners configure their email provider from the UI without editing `.env`. |
| `016_revoke_sensitive_columns_from_anon.sql` | Drops the `public_read_businesses_for_booking` RLS policy. The public booking page now uses the service-role client server-side, so anonymous read access to the `businesses` table is no longer needed. Closes full-table read exposure of `smtp_pass`, `resend_api_key`, bot tokens, etc. |
| `017_prevent_double_booking.sql` | Adds `check_slot_availability()` trigger function and `prevent_double_booking` trigger on `appointments`. Fires `BEFORE INSERT OR UPDATE` and raises `slot_already_booked` if the same employee already has a non-cancelled booking at the same `starts_at`. Conflict check is skipped when `employee_id IS NULL` (walk-in businesses, fitness classes, etc.). |
| `018_unique_sku.sql` | Adds a partial unique index `unique_sku_per_business` on `inventory_items (business_id, sku)` where `sku IS NOT NULL AND sku != ''`. Prevents duplicate SKUs within the same business while keeping SKU optional (NULL / empty values are excluded from the constraint). |

The table above covers the foundational migrations (`001`–`018`) in detail. Migrations `019`–`035` add further features and fixes (retail/barcode mode, security hardening, WhatsApp columns, booking-availability fixes, business hours break time, and more) — see the individual files in `supabase/migrations/` for what each one does. All of them run automatically and require no manual steps.

---

## How to run

1. Open your [Supabase Dashboard](https://supabase.com) → select your project
2. Click **SQL Editor** in the left sidebar
3. Click **New query**
4. Open a migration file, copy its full contents, paste into the editor
5. Click **Run**
6. Repeat for the next file in order

> **Tip:** You can run all files in a single session — just paste them one at a time and verify each succeeds before moving to the next.

---

## About 007_cron_jobs.sql (optional)

This migration sets up a database-level cron job (pg_cron) to send notifications
every 15 minutes. The migration runner substitutes `NEXT_PUBLIC_APP_URL` and
`CRON_SECRET` from your `.env` automatically.

If `pg_cron` is not enabled, the migration is **skipped with a warning** — the app
still works, you just won't have database-level scheduling. You can use an external
cron service (e.g. [cron-job.org](https://cron-job.org)) instead, calling:
`GET /api/cron/notify` with header `Authorization: Bearer <CRON_SECRET>`.

To enable pg_cron:
1. Supabase Dashboard → **Database** → **Extensions**
2. Enable **pg_cron** and **pg_net**
3. Re-run `docker-compose up` — the migration will be applied on the next start

---

## Skipping migrations

- **004_billing.sql** — safe to skip if you never plan to use SaaS billing mode
- **007_cron_jobs.sql** — skip if you use an external cron service (cron-job.org) instead of pg_cron
