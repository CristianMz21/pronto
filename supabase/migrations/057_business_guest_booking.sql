-- Migration 057: allow_guest_bookings per business
-- When false, only registered clients (auth.users linked via clients.user_id) can book online

alter table public.businesses
  add column if not exists allow_guest_bookings boolean not null default true;

comment on column public.businesses.allow_guest_bookings is 'When false, only registered clients can book online; guests (user_id null) are blocked (401 guest_not_allowed)';
