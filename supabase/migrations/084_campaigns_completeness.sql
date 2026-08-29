-- Migration 084: CRM Campaigns completeness — idempotent (T070)
-- Ensures campaigns + campaign_recipients + notification_log dedup + attribution
-- Stacked-to-main: no destructive changes, only IF NOT EXISTS / DO $$ guards.

-- ── campaigns (from 065) completeness ─────────────────────────────────────
create table if not exists public.campaigns (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  name text not null,
  segment text not null check (segment in ('inactive_30','inactive_42','inactive_60','birthday_7','vip','new','all')),
  channel text not null default 'whatsapp' check (channel in ('whatsapp','email','telegram')),
  template text not null,
  status text not null default 'draft' check (status in ('draft','sending','sent','cancelled')),
  stats jsonb not null default '{"sent":0,"delivered":0,"rebooked":0}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Ensure missing columns if table existed with slightly different definition
alter table public.campaigns add column if not exists location_id uuid references public.locations(id) on delete set null;
alter table public.campaigns add column if not exists segment text;
alter table public.campaigns add column if not exists channel text not null default 'whatsapp' check (channel in ('whatsapp','email','telegram'));
alter table public.campaigns add column if not exists template text;
alter table public.campaigns add column if not exists status text not null default 'draft' check (status in ('draft','sending','sent','cancelled'));
alter table public.campaigns add column if not exists stats jsonb not null default '{"sent":0,"delivered":0,"rebooked":0}'::jsonb;
alter table public.campaigns add column if not exists sent_at timestamptz;
alter table public.campaigns add column if not exists created_at timestamptz not null default now();

create table if not exists public.campaign_recipients (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','delivered','rebooked','failed')),
  primary key (campaign_id, client_id)
);

alter table public.campaign_recipients add column if not exists status text not null default 'pending' check (status in ('pending','sent','delivered','rebooked','failed'));

alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;

drop policy if exists tenant_access_campaigns on public.campaigns;
create policy tenant_access_campaigns on public.campaigns
  for all using (business_id in (select public.my_business_ids()));

drop policy if exists tenant_access_campaign_recipients on public.campaign_recipients;
create policy tenant_access_campaign_recipients on public.campaign_recipients
  for all using (
    exists (select 1 from public.campaigns where campaigns.id = campaign_recipients.campaign_id and campaigns.business_id in (select public.my_business_ids()))
  );

create index if not exists idx_campaigns_business on public.campaigns(business_id, status);
create index if not exists idx_campaigns_location on public.campaigns(location_id) where location_id is not null;
create index if not exists idx_campaigns_created on public.campaigns(business_id, created_at desc);
create index if not exists idx_campaign_recipients_campaign on public.campaign_recipients(campaign_id);
create index if not exists idx_campaign_recipients_client on public.campaign_recipients(client_id);
create index if not exists idx_campaign_recipients_status on public.campaign_recipients(campaign_id, status);

grant all on table public.campaigns to anon, authenticated;
grant all on table public.campaign_recipients to anon, authenticated;

-- ── notification_log dedup helper (client_id, event, 1h window) ───────────
-- Existing table has unique (ref_id, type, channel). For 1h dedup we handle in
-- code via time window query, but add index for efficient lookup.
create index if not exists idx_notification_log_business_ref_type on public.notification_log(business_id, ref_id, type);
create index if not exists idx_notification_log_sent_at on public.notification_log(sent_at desc);
-- Composite index for 1h window check: business_id + ref_id + type + sent_at
create index if not exists idx_notification_log_dedup on public.notification_log(business_id, ref_id, type, sent_at desc);

-- ── attribution: appointments.campaign_id for source=campaign ──────────────
alter table public.appointments add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
create index if not exists idx_appointments_campaign on public.appointments(campaign_id) where campaign_id is not null;

-- ── ensure businesses whatsapp columns already exist (033) — verify ─────────
-- meta_whatsapp_phone_number_id / meta_whatsapp_access_token already in businesses
-- Ensure additional whatsapp template columns exist for completeness (no-op if present)
do $$
begin
  -- These were added in 033/058; ensure they exist for local devs that skipped them
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='businesses' and column_name='meta_whatsapp_phone_number_id') then
    alter table public.businesses add column meta_whatsapp_phone_number_id text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='businesses' and column_name='meta_whatsapp_access_token') then
    alter table public.businesses add column meta_whatsapp_access_token text;
  end if;
end $$;
