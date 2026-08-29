-- Миграция 008: Автоматическое обновление статистики клиента
--
-- Проблема: поля total_visits и total_spent в таблице clients
-- не обновлялись при добавлении транзакции через POS.
-- Клиент покупал услугу, но в карточке оставалось 0.
--
-- Решение: триггер — автоматическое правило в базе данных.
-- Как только вставляется новая транзакция со статусом 'completed'
-- и привязанным клиентом — сразу пересчитываем его статистику.

create or replace function public.update_client_stats()
returns trigger language plpgsql as $$
begin
  -- Обрабатываем только завершённые транзакции с указанным клиентом
  if new.status = 'completed' and new.client_id is not null then
    update public.clients
    set
      total_visits = (
        select count(*)
        from public.transactions
        where client_id = new.client_id
          and status = 'completed'
      ),
      total_spent = (
        select coalesce(sum(amount), 0)
        from public.transactions
        where client_id = new.client_id
          and status = 'completed'
      ),
      last_visit_at = (
        select max(created_at)
        from public.transactions
        where client_id = new.client_id
          and status = 'completed'
      )
    where id = new.client_id;
  end if;
  return new;
end;
$$;

create trigger trg_transactions_update_client_stats
  after insert on public.transactions
  for each row execute procedure public.update_client_stats();

-- Пересчитываем статистику для всех существующих клиентов
-- (исправляет данные которые уже накопились до этой миграции)
update public.clients c
set
  total_visits = sub.visits,
  total_spent  = sub.spent,
  last_visit_at = sub.last_at
from (
  select
    client_id,
    count(*)                    as visits,
    coalesce(sum(amount), 0)    as spent,
    max(created_at)             as last_at
  from public.transactions
  where status = 'completed'
    and client_id is not null
  group by client_id
) sub
where c.id = sub.client_id;
