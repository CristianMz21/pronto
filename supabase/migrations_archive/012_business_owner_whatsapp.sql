-- Миграция 012: WhatsApp номер владельца бизнеса
--
-- Добавляем поле owner_whatsapp в таблицу businesses.
-- Это WhatsApp-номер владельца для получения алертов (например, мало товара на складе).
-- Отличается от whatsapp_number клиентов — это личный номер владельца, не публичный номер бизнеса.
-- Формат: международный с + (например, +79001234567).

alter table public.businesses
  add column if not exists owner_whatsapp text;
