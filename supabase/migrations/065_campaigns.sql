create table if not exists public.campaigns (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  name text not null,
  segment text not null check (segment in ('inactive_30','inactive_42','inactive_60','birthday_7','vip','new','all')),
  channel text not null default 'whatsapp' check (channel in ('whatsapp','email','telegram')),
  template text not null,
  status text not null default 'draft' check (status in ('draft','sending','sent','cancelled')),
  stats jsonb not null default '{"sent":0,"delivered":0,"rebooked":0}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.campaign_recipients (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','delivered','rebooked','failed')),
  primary key (campaign_id, client_id)
);
alter table campaigns enable row level security;
alter table campaign_recipients enable row level security;
drop policy if exists tenant_access_campaigns on campaigns;
create policy tenant_access_campaigns on campaigns for all using (business_id in (select my_business_ids()));
drop policy if exists tenant_access_campaign_recipients on campaign_recipients;
create policy tenant_access_campaign_recipients on campaign_recipients for all using (
  exists (select 1 from campaigns where campaigns.id = campaign_recipients.campaign_id and campaigns.business_id in (select my_business_ids()))
);
create index if not exists idx_campaigns_business on campaigns(business_id, status);
grant all on table campaigns to anon, authenticated;
grant all on table campaign_recipients to anon, authenticated;
