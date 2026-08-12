-- Migration 033: WhatsApp Business (Meta Cloud API) columns on businesses
--
-- database.types.ts and app code (settings-tabs.tsx, api/cron/notify,
-- api/email/confirm) have referenced these 8 columns since 2026-05-27
-- (meta_whatsapp_*) and 2026-07-08 (wa_template_*), but no migration in
-- this repository ever created them — a fresh self-hosted install hits
-- "column does not exist" on every query that selects them, which breaks
-- the notify cron and booking-confirmation email entirely since these
-- columns are selected together with required fields like telegram_bot_token.
-- This migration catches the schema up to what the app code has always expected.
--
-- meta_whatsapp_phone_number_id — Meta Cloud API phone number ID
-- meta_whatsapp_access_token    — Meta Cloud API access token
-- wa_template_confirmation      — name of the booking-confirmation HSM template
-- wa_template_reminder          — name of the appointment-reminder HSM template (24h and 1h)
-- wa_template_thankyou          — name of the post-visit thank-you HSM template
-- wa_template_reactivation      — name of the re-engagement HSM template (30-day dormant clients)
-- wa_template_birthday          — name of the birthday HSM template
-- wa_template_language          — BCP-47 language code for all templates (default 'en')
--
-- If a template column is NULL the WhatsApp notification for that event is silently skipped.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS meta_whatsapp_phone_number_id text,
  ADD COLUMN IF NOT EXISTS meta_whatsapp_access_token     text,
  ADD COLUMN IF NOT EXISTS wa_template_confirmation       text,
  ADD COLUMN IF NOT EXISTS wa_template_reminder           text,
  ADD COLUMN IF NOT EXISTS wa_template_thankyou           text,
  ADD COLUMN IF NOT EXISTS wa_template_reactivation       text,
  ADD COLUMN IF NOT EXISTS wa_template_birthday           text,
  ADD COLUMN IF NOT EXISTS wa_template_language           text NOT NULL DEFAULT 'en';
