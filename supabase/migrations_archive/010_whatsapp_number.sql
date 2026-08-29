-- Migration 010: Add whatsapp_number column to clients
-- Each client can have a WhatsApp phone number for direct client notifications

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS whatsapp_number text;

COMMENT ON COLUMN clients.whatsapp_number IS
  'WhatsApp phone in E.164 format (with or without leading +). Used for Meta Cloud API notifications.';
