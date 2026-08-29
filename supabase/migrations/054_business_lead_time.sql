-- Migration 054: configurable lead time for online bookings
-- Allows each business to configure minimum advance minutes and whether to enforce it.
-- DB trigger (053) only blocks past bookings to allow immediate admin walk-ins;
-- lead time is enforced at API / client for online bookings only.

alter table public.businesses
  add column if not exists min_advance_minutes integer not null default 30 check (min_advance_minutes >= 0),
  add column if not exists booking_lead_time_enabled boolean not null default true;

comment on column public.businesses.min_advance_minutes is 'Minimum minutes in advance required for online bookings (0 = allow immediate, default 30)';
comment on column public.businesses.booking_lead_time_enabled is 'When false, online bookings only block past times, not lead time';
