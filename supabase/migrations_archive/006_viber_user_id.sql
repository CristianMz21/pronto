-- Миграция 006: Viber поддержка
--
-- Добавляем два поля:
--
-- 1. viber_chat_id в businesses — Viber ID владельца бизнеса.
--    Сохраняется когда владелец первый раз пишет боту (аналог telegram_chat_id).
--    Используется для отправки уведомлений ВЛАДЕЛЬЦУ:
--    новые записи, алерты low-stock, подтверждения визитов.
--
-- 2. viber_user_id в clients — Viber ID конкретного клиента.
--    Заполняется вручную в карточке клиента (CRM → клиент → редактировать).
--    В будущем можно автоматически через webhook, если клиент сам напишет боту.
--    Используется для отправки уведомлений КЛИЕНТАМ:
--    напоминания о записи, благодарность после визита, реактивация.

alter table public.businesses
  add column if not exists viber_chat_id text;

alter table public.clients
  add column if not exists viber_user_id text;
