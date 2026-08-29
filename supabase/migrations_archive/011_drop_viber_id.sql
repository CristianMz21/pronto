-- Миграция 011: Удаление устаревшей колонки viber_id
--
-- В начальной схеме (001) была создана колонка clients.viber_id.
-- В миграции 006 была добавлена clients.viber_user_id — именно она используется в коде.
-- Колонка viber_id нигде не используется и создаёт путаницу.

alter table public.clients
  drop column if exists viber_id;
