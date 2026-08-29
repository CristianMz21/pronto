-- Migration 055: configurable cash register requirement for POS cash sales
-- When false, POS can process cash payments without an open register.
-- When true (default), cash payments require an open cash_registers row (existing behavior).

alter table public.businesses
  add column if not exists require_cash_register_for_cash boolean not null default true;

comment on column public.businesses.require_cash_register_for_cash is 'When true, cash POS sales require an open cash register; when false, cash sales allowed without caja';
