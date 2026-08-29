-- Migration 043: trigger generate_commission — auto-crea comisión al cobrar
-- Usa employees.commission_rate (percentage) o commission_fixed; snapshot en rate_snapshot

create or replace function public.generate_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rate  numeric(5,2);
  v_fixed numeric(10,2);
  v_amount numeric(10,2);
  v_type   text;
begin
  -- Solo para transactions completadas con employee asignado
  if new.status != 'completed' or new.employee_id is null then
    return new;
  end if;

  select commission_rate, commission_fixed into v_rate, v_fixed
  from public.employees where id = new.employee_id;

  -- Si no tiene comisión configurada, no genera nada (owner puede ser sin comisión)
  if v_rate is null and v_fixed is null then
    return new;
  end if;

  -- Prioridad: fixed > percentage
  if v_fixed is not null and v_fixed > 0 then
    v_amount := v_fixed;
    v_type := 'fixed';
  else
    -- percentage: amount * rate / 100
    v_amount := round((new.amount * coalesce(v_rate, 0) / 100)::numeric, 2);
    v_type := 'percentage';
  end if;

  -- No generar comisión 0
  if v_amount <= 0 then
    return new;
  end if;

  -- service_id: intenta extraer del primer item del jsonb si existe, sino null
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
  -- No bloquear la venta si falla comisión; loguear
  raise notice 'generate_commission failed: %', SQLERRM;
  return new;
end;
$$;

drop trigger if exists trg_generate_commission on public.transactions;
create trigger trg_generate_commission
  after insert on public.transactions
  for each row execute procedure public.generate_commission();
