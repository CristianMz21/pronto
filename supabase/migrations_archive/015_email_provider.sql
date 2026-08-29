-- Миграция 015: настройки email-провайдера per-бизнес
--
-- Хранит параметры отправки email прямо в БД, чтобы владелец мог
-- настроить SMTP или Resend из интерфейса без правки .env.
-- Поддерживаемые провайдеры: 'smtp', 'resend'.

alter table public.businesses
  add column if not exists email_provider  text,          -- 'smtp' | 'resend' | null
  add column if not exists smtp_host       text,
  add column if not exists smtp_port       integer default 587,
  add column if not exists smtp_user       text,
  add column if not exists smtp_pass       text,
  add column if not exists smtp_from       text,
  add column if not exists resend_api_key  text;
