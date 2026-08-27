-- Migration 046: fix commission trigger — support UPDATE status transitions + dedup
-- Replaces 043 which only handled AFTER INSERT.
-- Now fires AFTER INSERT OR UPDATE OF status when transaction becomes completed,
-- and prevents duplicate commissions.

create or replace function public.generate_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rate  numeric(5,2);
  v_fixed numeric(10,2);
  v_amount numeric(10,2);
  v_type   text;
begin
  -- Only for transactions that are now completed with an employee assigned
  if new.status != 'completed' or new.employee_id is null then
    return new;
  end if;

  -- Deduplication: don't create second commission if one already exists for this transaction
  if exists (select 1 from public.commissions where transaction_id = new.id) then
    return new;
  end if;

  select commission_rate, commission_fixed into v_rate, v_fixed
  from public.employees where id = new.employee_id;

  if v_rate is null and v_fixed is null then
    return new;
  end if;

  if v_fixed is not null and v_fixed > 0 then
    v_amount := v_fixed;
    v_type := 'fixed';
  else
    v_amount := round((new.amount * coalesce(v_rate, 0) / 100)::numeric, 2);
    v_type := 'percentage';
  end if;

  if v_amount <= 0 then
    return new;
  end if;

  insert into public.commissions (business_id, transaction_id, employee_id, service_id, amount, rate_snapshot, type)
  values (
    new.business_id,
    new.id,
    new.employee_id,
    (case when jsonb_typeof(new.items) = 'array' and jsonb_array_length(new.items) > 0
          then (new.items->0->>'service_id')::uuid
          else null end),
    v_amount,
    v_rate,
    v_type
  );

  return new;
exception when others then
  raise notice 'generate_commission failed: %', SQLERRM;
  return new;
end;
$$;

drop trigger if exists trg_generate_commission on public.transactions;
drop trigger if exists trg_generate_commission_update on public.transactions;
-- INSERT trigger: WHEN cannot reference OLD, so separate triggers
create trigger trg_generate_commission
  after insert on public.transactions
  for each row
  when (new.status = 'completed')
  execute procedure public.generate_commission();

create trigger trg_generate_commission_update
  after update of status on public.transactions
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute procedure public.generate_commission();
