-- 3FN: Split businesses monolito -> business_settings + business_integrations
create table if not exists public.business_settings (
  business_id uuid primary key references businesses(id) on delete cascade,
  timezone text not null default 'UTC',
  currency text not null default 'USD',
  brand_color text default '#2D2926',
  notification_language text default 'en' check (notification_language in ('en','es','pt')),
  enabled_modules text[] not null default array['bookings','pos','crm','inventory','notifications'],
  payment_methods text[] not null default array['cash','card','transfer'],
  tax_rate numeric(5,2) not null default 0 check (tax_rate >=0 and tax_rate <=100),
  cancel_lead_time integer not null default 60 check (cancel_lead_time >=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.business_integrations (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  provider text not null check (provider in ('telegram','viber','whatsapp','smtp','resend')),
  token_encrypted text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (business_id, provider)
);
-- Migrate existing data
insert into public.business_settings (business_id, timezone, currency, brand_color, notification_language, enabled_modules)
select id, timezone, currency, brand_color, notification_language, enabled_modules from public.businesses
on conflict (business_id) do nothing;

-- Migrate telegram/viber/whatsapp/smtp tokens to integrations (best effort, plain for now)
insert into public.business_integrations (business_id, provider, token_encrypted, config)
select id, 'telegram', telegram_bot_token, jsonb_build_object('chat_id', telegram_chat_id) from public.businesses where telegram_bot_token is not null
on conflict do nothing;
insert into public.business_integrations (business_id, provider, token_encrypted, config)
select id, 'viber', viber_bot_token, jsonb_build_object('chat_id', viber_chat_id) from public.businesses where viber_bot_token is not null
on conflict do nothing;

alter table business_settings enable row level security;
alter table business_integrations enable row level security;
drop policy if exists tenant_access_business_settings on business_settings;
create policy tenant_access_business_settings on business_settings for all using (business_id in (select my_business_ids()));
drop policy if exists tenant_access_business_integrations on business_integrations;
create policy tenant_access_business_integrations on business_integrations for all using (business_id in (select my_business_ids()));
grant all on table business_settings to anon, authenticated;
grant all on table business_integrations to anon, authenticated;
