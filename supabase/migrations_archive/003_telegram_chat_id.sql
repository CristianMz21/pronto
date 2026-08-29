-- Добавляем telegram_chat_id в businesses
-- Сохраняется когда владелец пишет /start своему боту

alter table public.businesses
  add column if not exists telegram_chat_id text;
