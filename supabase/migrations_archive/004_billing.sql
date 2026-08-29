-- Колонки для LemonSqueezy billing
alter table public.businesses
  add column if not exists ls_subscription_id text,
  add column if not exists ls_customer_id     text,
  add column if not exists ls_variant_id      text;
