-- Migration 086: Polish indexes & performance (T079)
-- Idempotent, stacked-to-main: only IF NOT EXISTS / DO $$.

-- ── idx_appointments_employee_starts for get_booked_slots + agenda filters ─────
-- Used by get_booked_slots(p_employee_id), booking-calendar, dashboard upcoming.
-- Previous indexes: idx_appointments_business, idx_appointments_starts_at, idx_appointments_business_status_starts, etc.
-- This one optimizes WHERE business_id=? AND employee_id=? AND starts_at BETWEEN ? AND ? AND status NOT IN (...)
create index if not exists idx_appointments_employee_starts
  on public.appointments(business_id, employee_id, starts_at)
  where employee_id is not null;

-- Covering for "Anyone" NULL auto-assign lookup (business + starts_at + status)
create index if not exists idx_appointments_business_starts_status
  on public.appointments(business_id, starts_at, status);

-- dashboard Promise.all already parallelizes 9 queries; ensure low_stock helper index present
create index if not exists idx_inventory_business_qty_threshold
  on public.inventory_items(business_id, quantity, low_stock_threshold);

-- recent transactions sparkline (last 7d)
create index if not exists idx_transactions_business_created
  on public.transactions(business_id, created_at desc)
  where status = 'completed';

-- campaign_recipients for attribution sweeps
create index if not exists idx_campaign_recipients_client_status
  on public.campaign_recipients(campaign_id, client_id, status);

-- memberships consume advisory lock benefits from index on expires_at+remaining
create index if not exists idx_client_memberships_active
  on public.client_memberships(business_id, status, expires_at)
  where status = 'active';

-- Verify on build: should be visible in Advisors → Performance Advisor suggestions = 0
