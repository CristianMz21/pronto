-- 3FN: Extract clients.total_visits/spent/last_visit_at to materialized view
create materialized view if not exists public.client_stats as
select
  c.id as client_id,
  c.business_id,
  count(t.id)::int as total_visits,
  coalesce(sum(t.amount),0)::numeric(10,2) as total_spent,
  max(t.created_at) as last_visit_at
from public.clients c
left join public.transactions t on t.client_id = c.id and t.status = 'completed'
group by c.id, c.business_id;

create unique index if not exists idx_client_stats_client on client_stats(client_id);
create index if not exists idx_client_stats_business on client_stats(business_id);

-- Refresh function
create or replace function public.refresh_client_stats()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently public.client_stats;
  return null;
end;
$$;
-- Trigger to refresh on transaction changes (deferred, best effort)
drop trigger if exists trg_refresh_client_stats on transactions;
create trigger trg_refresh_client_stats after insert or update or delete on transactions
for each statement execute function public.refresh_client_stats();

grant select on client_stats to anon, authenticated;
-- Keep original columns for now as cache, will be deprecated after app migrates to view
