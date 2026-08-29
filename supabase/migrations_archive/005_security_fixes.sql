-- ============================================================
-- Security fixes (Supabase Security Advisor recommendations)
-- ============================================================

-- Fix: Function Search Path Mutable
-- Добавляем SET search_path = public ко всем нашим функциям

create or replace function public.my_business_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.businesses where owner_id = auth.uid()
  union
  select business_id from public.employees where user_id = auth.uid() and is_active = true
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_receipt_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.receipt_number is null then
    new.receipt_number = 'REC-' || lpad(nextval('public.receipt_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

-- Fix handle_new_user if it exists (may be from previous project)
-- Если функция существует — добавляем search_path
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
  ) then
    execute $func$
      create or replace function public.handle_new_user()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $inner$
      begin
        return new;
      end;
      $inner$
    $func$;
  end if;
end;
$$;

-- ============================================================
-- Cleanup: артефакты старого проекта (scormflow)
-- Удаляем таблицы/вьюхи, которые не относятся к Pronto
-- ============================================================

-- Удаляем view plan_limits от старого проекта (у нас есть lib/plan-limits.ts)
drop view if exists public.plan_limits cascade;

-- Включаем RLS на таблице completions от старого проекта
-- (или удаляем её если она пустая и не нужна)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'completions'
  ) then
    -- Сначала включаем RLS
    execute 'alter table public.completions enable row level security';
    -- Если таблица пустая и не нужна — можно раскомментировать:
    -- execute 'drop table public.completions cascade';
  end if;
end;
$$;
