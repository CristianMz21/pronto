-- Migration 029: Add notification_language column to businesses
-- This stores the language used for client-facing notifications (email, Telegram, Viber, WhatsApp).
-- Separate from the owner's dashboard UI language.
-- database.types.ts and settings-tabs.tsx already reference this column — this migration
-- just catches the schema up to what the app code has always expected.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS notification_language text DEFAULT 'en';

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_notification_language_check;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_notification_language_check
  CHECK (notification_language IN ('en', 'es', 'pt'));
