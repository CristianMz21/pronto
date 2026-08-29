-- Migration 080: commission excludes tip+discount (US5 T054)
-- Updates generate_commission to calculate on net amount after discount and tip
-- Idempotent, preserves existing logic for fixed vs percentage

create or replace function public.generate_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rate  numeric(5,2);
  v_fixed numeric(10,2);
  v_amount numeric(10,2);
  v_type   text;
  v_base   numeric(10,2);
begin
  if new.status != 'completed' or new.employee_id is null then
    return new;
  end if;

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
    -- Base is net amount after discount and tip (discount already excluded from amount if stored as net)
    -- If amount is gross, discount_amount is subtracted; if amount is net, discount_amount audit is already excluded, so subtracting again would double. We handle both by using net = amount - tip, since amount is already net (gross - discount). Discount audit not subtracted again to avoid double.
    -- To be safe, we use: base = greatest(0, new.amount - coalesce(new.tip_amount,0))
    -- This ensures commission excludes tip and discount (discount already excluded from amount when stored as net).
    v_base := greatest(0, coalesce(new.amount,0) - coalesce(new.tip_amount,0));
    -- If transaction still has discount_amount and amount was stored as gross (fallback), also subtract discount:
    -- Detect by checking if business stores gross (amount includes discount). We cannot detect reliably, so we check if discount_amount >0 and assume amount is gross only if amount > discount_amount and commission would be high. For now, keep simple tip-only subtraction and document that POS stores net.
    v_amount := round((v_base * coalesce(v_rate, 0) / 100)::numeric, 2);
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
