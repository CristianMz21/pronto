-- supabase/seed-realistic.sql — Escudería realistic environment
-- ============================================
-- Idempotent realistic seed: 2 sedes, 10 empleados, 15 servicios, ~800 clientes, ~2500 citas, ~1200 transacciones, 50 productos, festivos 2026
-- Business: Escudería 17c1a2b5-5d3b-4d84-bbb1-d361077d4c95 (America/Bogota, COP) Owner b8f773b2-11e7-40d0-8f52-929b480d42b8
-- Sedes: Centro (11111111-1111-1111-1111-111111111111 existente) + Norte (22222222-2222-2222-2222-222222222222 nuevo)
-- Deterministico: fixed UUIDs + setseed(0.42) + ON CONFLICT DO NOTHING + existence guards -> safe re-run
-- Performante: bulk generate_series + random() + DO blocks
-- Uso: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seed-realistic.sql
--      o  supabase db reset  (añadir a supabase/config.toml sql_paths)  o  npm run db:seed:realistic
-- No requiere truncates; respeta FKs y RLS; no rompe single-sede existente
--
-- Verificación rapida tras aplicar:
--   select 'locations',count(*) from locations where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
--   union all select 'employees',count(*) from employees where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
--   union all select 'services',count(*) from services where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
--   union all select 'clients',count(*) from clients where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
--   union all select 'appointments',count(*) from appointments where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
--   union all select 'transactions',count(*) from transactions where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';

\set ON_ERROR_STOP on
begin;

-- ─────────────────────────────────────────────
-- 0) Extensions & deterministic seed
-- ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
select setseed(0.42);

-- ─────────────────────────────────────────────
-- 1) Locations: Centro (idempotente) + Norte
-- ─────────────────────────────────────────────
insert into public.locations (id, business_id, name, slug, address, phone, is_active)
values
  ('11111111-1111-1111-1111-111111111111','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Escudería Centro','centro','Cra 7 # 12-34, Bogotá','+57 300 123 4567',true)
on conflict (business_id, slug) do update set name=excluded.name, phone=excluded.phone, is_active=true;

insert into public.locations (id, business_id, name, slug, address, phone, is_active)
values
  ('22222222-2222-2222-2222-222222222222','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Escudería Norte','norte','Cl 100 # 15-20, Bogotá','+57 301 987 6543',true)
on conflict (business_id, slug) do update set name=excluded.name, phone=excluded.phone, is_active=true;

-- Ensure business updated brand/currency correct for reports
update public.businesses set timezone='America/Bogota', currency='COP', brand_color=coalesce(brand_color,'#0A0A0A')
where id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';

insert into public.business_settings (business_id, timezone, currency, brand_color, notification_language, enabled_modules, payment_methods, tax_rate, cancel_lead_time, loyalty_earn_rate, loyalty_redeem_rate, loyalty_redeem_value)
values ('17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','America/Bogota','COP','#0A0A0A','es','{bookings,pos,crm,inventory,notifications}','{cash,card,transfer}',0,60,1000,100,10000)
on conflict (business_id) do update set timezone=excluded.timezone, currency=excluded.currency, brand_color=excluded.brand_color;

-- ─────────────────────────────────────────────
-- 2) Business hours — global Mon-Sat 09:00-20:00 con break 13:00-14:00 para simular realismo, Dom cerrado
-- Nota multi-sede: el esquema actual tiene unique(business_id, day_of_week) además de (business_id, location_id, day). Para no violarlo,
-- mantenemos horas globales (location_id NULL) que sirven a ambas sedes. Los dashboards filtran por location_id en citas/transacciones,
-- no por business_hours. Si en el futuro se migra a horas por sede, este seed ya cubre location_id mediante comentario.
-- ─────────────────────────────────────────────
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
begin
  -- upsert 7 dias globales
  insert into public.business_hours (business_id, day_of_week, is_open, open_time, close_time, break_start, break_end)
  values
    (v_bid, 1, true,'09:00','20:00','13:00','14:00'),
    (v_bid, 2, true,'09:00','20:00','13:00','14:00'),
    (v_bid, 3, true,'09:00','20:00','13:00','14:00'),
    (v_bid, 4, true,'09:00','20:00','13:00','14:00'),
    (v_bid, 5, true,'09:00','20:00','13:00','14:00'),
    (v_bid, 6, true,'09:00','20:00',null,null),
    (v_bid, 0, false,'09:00','20:00',null,null)
  on conflict (business_id, day_of_week) do update set is_open=excluded.is_open, open_time=excluded.open_time, close_time=excluded.close_time, break_start=excluded.break_start, break_end=excluded.break_end;
end $$;

-- ─────────────────────────────────────────────
-- 3) Employees — 10 total (4 existentes + 6 nuevos realistas)
-- ─────────────────────────────────────────────
-- existentes ya en seed.sql: f822..., aaaa..., bbbb..., cccc... — los re-aseguramos con ON CONFLICT
insert into public.employees (id, business_id, name, role, phone, email, color, specialties, commission_rate, commission_fixed, is_active, location_id) values
  ('f822de0d-ca09-42dd-bea1-76b2ca334d7e','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Escudería Owner','admin','+57 300 123 4567','test@barber.local','#1a1a1a','{corte,barba,combo}',50.00,null,true,'11111111-1111-1111-1111-111111111111')
on conflict (id) do update set name=excluded.name, role=excluded.role, location_id=coalesce(employees.location_id, excluded.location_id);

insert into public.employees (id, business_id, name, role, phone, email, color, specialties, commission_rate, commission_fixed, is_active, location_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Ana Escudería','barbero',null,null,'#ec4899','{barba,cejas}',50.00,10000.00,true,'11111111-1111-1111-1111-111111111111')
on conflict (id) do update set specialties=excluded.specialties, color=excluded.color;

insert into public.employees (id, business_id, name, role, phone, email, color, specialties, commission_rate, commission_fixed, is_active, location_id) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Luis Escudería','barbero','+57 310 555 0101','luis@escuderia.com','#0ea5e9','{corte,combo,afeitado}',45.00,null,true,'11111111-1111-1111-1111-111111111111')
on conflict (id) do update set specialties=excluded.specialties;

insert into public.employees (id, business_id, name, role, phone, email, color, specialties, commission_rate, commission_fixed, is_active, location_id) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Miguel Escudería','barbero','+57 311 555 0102','miguel@escuderia.com','#f59e0b','{corte,barba,cejas}',50.00,null,true,'22222222-2222-2222-2222-222222222222')
on conflict (id) do update set location_id=coalesce(employees.location_id, excluded.location_id);

-- 6 nuevos
insert into public.employees (id, business_id, name, role, phone, email, color, specialties, commission_rate, commission_fixed, is_active, location_id) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Sofía Morales','barbero','+57 312 444 0103','sofia@escuderia.com','#a855f7','{corte,color,cejas}',48.00,null,true,'22222222-2222-2222-2222-222222222222'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Carlos Rivera','barbero','+57 313 555 0104','carlos@escuderia.com','#14b8a6','{corte,afeitado,combo}',50.00,null,true,'11111111-1111-1111-1111-111111111111'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Diana Torres','staff','+57 314 666 0105','diana@escuderia.com','#f43f5e','{cejas,tratamiento}',30.00,5000.00,true,'11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Jorge Herrera','barbero','+57 315 777 0106','jorge@escuderia.com','#6366f1','{barba,afeitado,corte}',45.00,null,true,'22222222-2222-2222-2222-222222222222'),
  ('bbbbbbbb-cccc-dddd-eeee-ffffffffffff','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Valentina Ríos','admin','+57 316 888 0107','valentina@escuderia.com','#0a0a0a','{corte,combo}',50.00,null,true,'11111111-1111-1111-1111-111111111111'),
  ('cccccccc-dddd-eeee-ffff-111111111111','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Andrés Gómez','barbero','+57 317 999 0108','andres@escuderia.com','#84cc16','{corte,barba,color}',42.00,null,true,'22222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────
-- 4) Service categories (3FN)
-- ─────────────────────────────────────────────
insert into public.service_categories (id, business_id, name) values
  ('10000000-0000-4000-a000-000000000001','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','corte'),
  ('10000000-0000-4000-a000-000000000002','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','barba'),
  ('10000000-0000-4000-a000-000000000003','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','combo'),
  ('10000000-0000-4000-a000-000000000004','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','afeitado'),
  ('10000000-0000-4000-a000-000000000005','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','cejas'),
  ('10000000-0000-4000-a000-000000000006','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','color'),
  ('10000000-0000-4000-a000-000000000007','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','tratamiento')
on conflict (business_id, name) do nothing;

-- ─────────────────────────────────────────────
-- 5) Services — 15 total (5 existentes + 10 nuevos con precios 15k-80k COP, duración 15-90)
-- ─────────────────────────────────────────────
-- existentes ya insertados en seed.sql — los aseguramos con colores/categorías para reportes
update public.services set color=coalesce(color,'#0ea5e9'), category=coalesce(category,'corte') where id='683dbb3c-6b10-4c85-b3b2-87fdb500ddec';
update public.services set color=coalesce(color,'#8b5cf6'), category=coalesce(category,'combo') where id='0730db42-332f-46d9-851d-e036c66fb8d6';
update public.services set color=coalesce(color,'#f59e0b'), category=coalesce(category,'barba') where id='b06e02ba-d274-4c83-9f22-bfbc992b6f03';
update public.services set color=coalesce(color,'#14b8a6'), category=coalesce(category,'afeitado') where id='cf73968f-4475-463c-933c-1bc678ed1ee9';
update public.services set color=coalesce(color,'#ec4899'), category=coalesce(category,'cejas') where id='48d9363a-a97b-49ce-b24a-db424141beea';

insert into public.services (id, business_id, name, description, price, duration_min, category, is_active, capacity, cost, color, is_featured) values
  ('11111111-aaaa-4000-a000-000000000001','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Corte Fade','Degradado moderno con detalles',35000,40,'corte',true,1,6000,'#3b82f6',true),
  ('11111111-aaaa-4000-a000-000000000002','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Corte Infantil','Corte para niños con estilo',25000,30,'corte',true,1,4000,'#10b981',false),
  ('11111111-aaaa-4000-a000-000000000003','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Barba Premium','Arreglo barba + aceites + toalla',30000,35,'barba',true,1,5000,'#f59e0b',false),
  ('11111111-aaaa-4000-a000-000000000004','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Combo VIP','Corte + barba + cejas + bebida',70000,75,'combo',true,1,12000,'#8b5cf6',true),
  ('11111111-aaaa-4000-a000-000000000005','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Color Cabello','Tinte completo con matizado',80000,90,'color',true,1,25000,'#ec4899',false),
  ('11111111-aaaa-4000-a000-000000000006','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Mechas / Iluminación','Mechas con gorro o papel',75000,85,'color',true,1,20000,'#a855f7',false),
  ('11111111-aaaa-4000-a000-000000000007','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Tratamiento Capilar','Hidratación profunda + masaje',60000,45,'tratamiento',true,1,8000,'#06b6d4',false),
  ('11111111-aaaa-4000-a000-000000000008','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Afeitado Premium','Navaja + vapor + after shave',28000,30,'afeitado',true,1,4000,'#14b8a6',false),
  ('11111111-aaaa-4000-a000-000000000009','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Perfilado Cejas Pro','Diseño + perfilado + sombreado',18000,20,'cejas',true,1,2500,'#ec4899',false),
  ('11111111-aaaa-4000-a000-00000000000a','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Corte + Color','Combo corte degradado + color',65000,60,'combo',true,1,15000,'#f43f5e',true)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────
-- 6) Employee ↔ Services mapping — asegurar que cada barbero tenga 3-5 servicios
-- ─────────────────────────────────────────────
insert into public.employee_services (employee_id, service_id) values
  -- Sofía (color/cejas/corte)
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','683dbb3c-6b10-4c85-b3b2-87fdb500ddec'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','48d9363a-a97b-49ce-b24a-db424141beea'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-aaaa-4000-a000-000000000005'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-aaaa-4000-a000-000000000006'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-aaaa-4000-a000-000000000009'),
  -- Carlos
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','683dbb3c-6b10-4c85-b3b2-87fdb500ddec'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','0730db42-332f-46d9-851d-e036c66fb8d6'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','cf73968f-4475-463c-933c-1bc678ed1ee9'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','11111111-aaaa-4000-a000-000000000001'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','11111111-aaaa-4000-a000-000000000008'),
  -- Diana (cejas/tratamiento)
  ('ffffffff-ffff-ffff-ffff-ffffffffffff','48d9363a-a97b-49ce-b24a-db424141beea'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff','11111111-aaaa-4000-a000-000000000007'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff','11111111-aaaa-4000-a000-000000000009'),
  -- Jorge
  ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','b06e02ba-d274-4c83-9f22-bfbc992b6f03'),
  ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','cf73968f-4475-463c-933c-1bc678ed1ee9'),
  ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','683dbb3c-6b10-4c85-b3b2-87fdb500ddec'),
  ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','11111111-aaaa-4000-a000-000000000003'),
  -- Valentina (admin)
  ('bbbbbbbb-cccc-dddd-eeee-ffffffffffff','683dbb3c-6b10-4c85-b3b2-87fdb500ddec'),
  ('bbbbbbbb-cccc-dddd-eeee-ffffffffffff','0730db42-332f-46d9-851d-e036c66fb8d6'),
  ('bbbbbbbb-cccc-dddd-eeee-ffffffffffff','11111111-aaaa-4000-a000-000000000004'),
  ('bbbbbbbb-cccc-dddd-eeee-ffffffffffff','11111111-aaaa-4000-a000-00000000000a'),
  -- Andrés
  ('cccccccc-dddd-eeee-ffff-111111111111','683dbb3c-6b10-4c85-b3b2-87fdb500ddec'),
  ('cccccccc-dddd-eeee-ffff-111111111111','b06e02ba-d274-4c83-9f22-bfbc992b6f03'),
  ('cccccccc-dddd-eeee-ffff-111111111111','11111111-aaaa-4000-a000-000000000005'),
  ('cccccccc-dddd-eeee-ffff-111111111111','11111111-aaaa-4000-a000-000000000001')
on conflict (employee_id, service_id) do nothing;

-- Añadir mappings faltantes para empleados originales
insert into public.employee_services (employee_id, service_id) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-aaaa-4000-a000-000000000001'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-aaaa-4000-a000-000000000003'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-aaaa-4000-a000-000000000001'),
  ('f822de0d-ca09-42dd-bea1-76b2ca334d7e','11111111-aaaa-4000-a000-000000000004')
on conflict do nothing;

-- ─────────────────────────────────────────────
-- 7) Tags (para clientes)
-- ─────────────────────────────────────────────
insert into public.tags (id, name) values
  ('20000000-0000-4000-a000-000000000001','vip'),
  ('20000000-0000-4000-a000-000000000002','frecuente'),
  ('20000000-0000-4000-a000-000000000003','nuevo'),
  ('20000000-0000-4000-a000-000000000004','moroso'),
  ('20000000-0000-4000-a000-000000000005','cumpleañero'),
  ('20000000-0000-4000-a000-000000000006','barba'),
  ('20000000-0000-4000-a000-000000000007','color')
on conflict (name) do nothing;

-- ─────────────────────────────────────────────
-- 8) Inventory — 50 productos realistas, stock y low_stock_threshold, con movimientos
--    Categorías: herramientas, producto, barba, color, tratamiento
-- ─────────────────────────────────────────────
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
declare v_centro uuid := '11111111-1111-1111-1111-111111111111';
declare v_norte uuid := '22222222-2222-2222-2222-222222222222';
begin
  if (select count(*) from public.inventory_items where business_id=v_bid) < 40 then
    insert into public.inventory_items (id, business_id, name, sku, category, unit, quantity, low_stock_threshold, cost_price, sell_price, location_id, description, barcode)
    select
      format('30000000-0000-4000-a000-%012s', lpad(gs::text,12,'0'))::uuid,
      v_bid,
      p.name,
      'SKU-'||lpad(gs::text,5,'0'),
      p.cat,
      p.unit,
      case when gs % 7 =0 then 1 + (random()*2)::int  -- ~15% low stock
           when gs % 5 =0 then 5 + (random()*5)::int
           else 15 + (random()*25)::int end,
      case when p.cat='herramientas' then 2 when p.cat='color' then 8 else 5 end,
      (3000 + (random()*20000)::int),
      (8000 + (random()*35000)::int),
      case when gs %2=0 then v_centro else v_norte end,
      p.name || ' profesional para barbería',
      '770'||lpad((100000000 + gs*37)::text,10,'0')
    from generate_series(1,50) gs
    cross join lateral (
      select * from (values
        (1,'Máquina Wahl Cordless','herramientas','pcs'),
        (2,'Tijera Profesional 6"','herramientas','pcs'),
        (3,'Capa de Corte Negra','herramientas','pcs'),
        (4,'Navaja Clásica','herramientas','pcs'),
        (5,'Peine Carbono','herramientas','pcs'),
        (6,'Cera Mate Extra Fuerte','producto','pcs'),
        (7,'Pomada Brillante','producto','pcs'),
        (8,'Gel Fijador','producto','pcs'),
        (9,'Aceite para Barba','barba','ml'),
        (10,'Bálsamo After Shave','barba','ml'),
        (11,'Espuma Afeitado','barba','ml'),
        (12,'Tónico Capilar','tratamiento','ml'),
        (13,'Shampoo Anticaspa','tratamiento','ml'),
        (14,'Acondicionador Hidratante','tratamiento','ml'),
        (15,'Tinte Negro 60ml','color','pcs'),
        (16,'Tinte Castaño 60ml','color','pcs'),
        (17,'Decolorante 500g','color','pcs'),
        (18,'Papel Aluminio Rollo','color','pcs'),
        (19,'Guantes Nitrilo M','herramientas','box'),
        (20,'Cepillo Fade','herramientas','pcs'),
        (21,'Secador Profesional','herramientas','pcs'),
        (22,'Plancha Mini','herramientas','pcs'),
        (23,'Loción Astringente','barba','ml'),
        (24,'Crema Hidratante','tratamiento','ml'),
        (25,'Serum Reparador','tratamiento','ml'),
        (26,'Cuchillas Repuesto x10','herramientas','box'),
        (27,'Toallas Desechables','herramientas','pack'),
        (28,'Pulverizador','herramientas','pcs'),
        (29,'Brocha Barba','barba','pcs'),
        (30,'Bowl Acero','barba','pcs'),
        (31,'Shampoo Matizador','color','ml'),
        (32,'Oxigenada 20vol','color','ml'),
        (33,'Oxigenada 30vol','color','ml'),
        (34,'Mascarilla Capilar','tratamiento','ml'),
        (35,'Cera en Barra','producto','pcs'),
        (36,'Fijador Spray','producto','ml'),
        (37,'Polvo Texturizador','producto','pcs'),
        (38,'Toalla Caliente Pack','tratamiento','pack'),
        (39,'Desinfectante Jarra','herramientas','ml'),
        (40,'Barbicide 500ml','herramientas','ml'),
        (41,'Peinilla Cola','herramientas','pcs'),
        (42,'Rizador','herramientas','pcs'),
        (43,'Tinte Rubio 60ml','color','pcs'),
        (44,'Tinte Gris Plata','color','pcs'),
        (45,'Borlas Algodón','herramientas','pack'),
        (46,'Espejo Mano','herramientas','pcs'),
        (47,'Silla Hidráulica Repuesto','herramientas','pcs'),
        (48,'Aceite Máquina','herramientas','ml'),
        (49,'Loción Mentolada','barba','ml'),
        (50,'Exfoliante Facial','tratamiento','ml')
      ) t(idx, name, cat, unit) where t.idx = gs
    ) p
    on conflict (id) do nothing;

    -- movimientos iniciales 'in' para cada item (audit)
    insert into public.inventory_movements (business_id, item_id, type, quantity, note)
    select v_bid, id, 'in', quantity, 'Stock inicial seed-realistic'
    from public.inventory_items where business_id=v_bid
    on conflict do nothing;

    -- algunos movimientos 'out' (consumo) para simular rotación
    insert into public.inventory_movements (business_id, item_id, type, quantity, note)
    select v_bid, id, 'out', (1 + (random()*3)::int), 'Consumo simulado mes'
    from public.inventory_items where business_id=v_bid and (random() < 0.35)
    on conflict do nothing;

    -- transferencias entre sedes (10 ejemplos)
    insert into public.inventory_movements (business_id, item_id, type, quantity, note, from_location_id, to_location_id)
    select v_bid, id, 'transfer', 2, 'Transfer Centro → Norte', v_centro, v_norte
    from public.inventory_items where business_id=v_bid and category in ('producto','barba') order by random() limit 6
    on conflict do nothing;
  else
    raise notice 'inventory already seeded, skipping';
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 9) Holidays 2026 Colombia — 18 festivos (incluye trasladables a lunes)
--    Insertamos con UUID deterministico por fecha para re-ejecución idempotente via PK
-- ─────────────────────────────────────────────
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
begin
  insert into public.holidays (id, business_id, location_id, date, reason, is_open) values
    (format('40000000-0000-4000-a000-%012s', lpad('1',12,'0'))::uuid, v_bid, null, '2026-01-01','Año Nuevo',false),
    (format('40000000-0000-4000-a000-%012s', lpad('2',12,'0'))::uuid, v_bid, null, '2026-01-12','Reyes Magos (trasladado)',false),
    (format('40000000-0000-4000-a000-%012s', lpad('3',12,'0'))::uuid, v_bid, null, '2026-03-23','San José (trasladado)',false),
    (format('40000000-0000-4000-a000-%012s', lpad('4',12,'0'))::uuid, v_bid, null, '2026-04-02','Jueves Santo',false),
    (format('40000000-0000-4000-a000-%012s', lpad('5',12,'0'))::uuid, v_bid, null, '2026-04-03','Viernes Santo',false),
    (format('40000000-0000-4000-a000-%012s', lpad('6',12,'0'))::uuid, v_bid, null, '2026-05-01','Día del Trabajo',false),
    (format('40000000-0000-4000-a000-%012s', lpad('7',12,'0'))::uuid, v_bid, null, '2026-05-18','Ascensión (trasladado)',false),
    (format('40000000-0000-4000-a000-%012s', lpad('8',12,'0'))::uuid, v_bid, null, '2026-06-08','Corpus Christi (trasladado)',false),
    (format('40000000-0000-4000-a000-%012s', lpad('9',12,'0'))::uuid, v_bid, null, '2026-06-15','Sagrado Corazón (trasladado)',false),
    (format('40000000-0000-4000-a000-%012s', lpad('10',12,'0'))::uuid, v_bid, null, '2026-06-29','San Pedro y San Pablo',false),
    (format('40000000-0000-4000-a000-%012s', lpad('11',12,'0'))::uuid, v_bid, null, '2026-07-20','Grito de Independencia',false),
    (format('40000000-0000-4000-a000-%012s', lpad('12',12,'0'))::uuid, v_bid, null, '2026-08-07','Batalla de Boyacá',false),
    (format('40000000-0000-4000-a000-%012s', lpad('13',12,'0'))::uuid, v_bid, null, '2026-08-17','Asunción (trasladado)',false),
    (format('40000000-0000-4000-a000-%012s', lpad('14',12,'0'))::uuid, v_bid, null, '2026-10-12','Día de la Raza (trasladado)',false),
    (format('40000000-0000-4000-a000-%012s', lpad('15',12,'0'))::uuid, v_bid, null, '2026-11-02','Todos los Santos (trasladado)',false),
    (format('40000000-0000-4000-a000-%012s', lpad('16',12,'0'))::uuid, v_bid, null, '2026-11-16','Independencia de Cartagena (trasladado)',false),
    (format('40000000-0000-4000-a000-%012s', lpad('17',12,'0'))::uuid, v_bid, null, '2026-12-08','Inmaculada Concepción',false),
    (format('40000000-0000-4000-a000-%012s', lpad('18',12,'0'))::uuid, v_bid, null, '2026-12-25','Navidad',false)
  on conflict (id) do nothing;
  -- Evitar duplicados por (business_id, location_id, date) con NULL handling: borrar duplicados previos por PK ya evita, pero si hay filas antiguas sin PK determinista, las dejamos.
end $$;

-- ─────────────────────────────────────────────
-- 10) Promotions & Service Combos & Memberships
-- ─────────────────────────────────────────────
insert into public.promotions (id, business_id, name, type, value, promo_code, valid_from, valid_to, is_active, rules) values
  ('50000000-0000-4000-a000-000000000001','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Descuento Bienvenida 10%','percent',10,'BIENVENIDA10', now() - interval '12 months', now() + interval '6 months', true,'{"min_amount":20000}'::jsonb),
  ('50000000-0000-4000-a000-000000000002','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Combo Lunes 15%','percent',15,'LUNES15', now() - interval '6 months', now() + interval '3 months', true,'{"weekday":1}'::jsonb),
  ('50000000-0000-4000-a000-000000000003','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','$5k Off Barba','fixed',5000,'BARBA5K', now() - interval '3 months', now() + interval '12 months', true,'{"category":"barba"}'::jsonb)
on conflict (id) do nothing;

-- on conflict business_id+promo_code: asegurar idempotencia via do nothing
insert into public.promotions (business_id, name, type, value, promo_code, valid_from, valid_to, is_active) values
  ('17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Verano 20%','percent',20,'VERANO20', now() - interval '1 month', now() + interval '2 months', true)
on conflict (business_id, promo_code) do nothing;

insert into public.service_combos (id, business_id, name, service_ids, price, duration_min, is_active) values
  ('60000000-0000-4000-a000-000000000001','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Combo Corte+Barba Ahorro',array['683dbb3c-6b10-4c85-b3b2-87fdb500ddec'::uuid,'b06e02ba-d274-4c83-9f22-bfbc992b6f03'::uuid],40000,50,true),
  ('60000000-0000-4000-a000-000000000002','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Pack Mensual 4 Cortes',array['683dbb3c-6b10-4c85-b3b2-87fdb500ddec'::uuid],100000,120,true)
on conflict (id) do nothing;

insert into public.memberships (id, business_id, name, price, duration_days, benefits, is_active) values
  ('70000000-0000-4000-a000-000000000001','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Membresía Mensual 8 Cortes',90000,30,'{"services":4,"discount_percent":10}'::jsonb,true),
  ('70000000-0000-4000-a000-000000000002','17c1a2b5-5d3b-4d84-bbb1-d361077d4c95','Membresía Trimestral VIP',240000,90,'{"services":12,"discount_percent":15}'::jsonb,true)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────
-- 11) Clients — 800 clientes realistas (generate_series, deterministico)
--     Nombres colombianos, phones únicos, emails únicos, tags, birthdays, notes, whatsapp, created_at últimos 12 meses
--     Guard: si ya hay >=500 clientes, skip (idempotencia)
-- ─────────────────────────────────────────────
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
declare v_centro uuid := '11111111-1111-1111-1111-111111111111';
declare v_norte uuid := '22222222-2222-2222-2222-222222222222';
declare v_count int;
begin
  select count(*) into v_count from public.clients where business_id=v_bid;
  if v_count >= 500 then
    raise notice 'clients already seeded % skipping', v_count;
    return;
  end if;

  insert into public.clients (id, business_id, name, phone, email, tags, birthday, notes, whatsapp_number, created_at, location_id, total_visits, total_spent, last_visit_at)
  select
    format('c%07s-0000-4000-a000-%012s', lpad(gs::text,7,'0'), lpad(gs::text,12,'0'))::uuid as id,
    v_bid,
    -- nombre compuesto
    (array['Juan','Carlos','Luis','Andrés','Felipe','Jorge','Miguel','Santiago','Daniel','Alejandro','David','Mateo','Sebastián','Samuel','Nicolás','Juan Pablo','Camilo','Diego','Oscar','Fernando','Sofía','Valentina','Mariana','Gabriela','Camila','Daniela','Alejandra','Natalia','Laura','Paula','Ana','María','Sara','Juliana','Isabella','Lucía','Manuela','Carolina','Andrea','Diana'])[1+ ( (gs*7) % 40)] || ' ' ||
    (array['García','Rodríguez','Martínez','López','González','Pérez','Sánchez','Ramírez','Torres','Rivera','Gómez','Díaz','Reyes','Morales','Cruz','Herrera','Jiménez','Mendoza','Vargas','Ortega','Silva','Rojas','Muñoz','Álvarez','Romero','Suárez','Castillo','Marín','Moreno','Ramos'])[1+ ( (gs*13) % 30)] || ' ' ||
    case when gs % 3 =0 then (array['García','Rodríguez','Martínez','López','González','Pérez','Sánchez','Ramírez','Torres','Rivera'])[1+ ( (gs*11) %10)] else '' end as name,
    -- phone único E.164 Colombia
    '+57 3' || lpad(((100000000 + gs*97) % 1000000000)::text,9,'0') as phone,
    -- email único nullable 85%
    case when gs % 7 !=0 then 'cliente'||gs||'@escuderia.test' else null end as email,
    -- tags: mezcla
    case
      when gs % 20 =0 then array['vip','frecuente']
      when gs % 10 =0 then array['vip']
      when gs % 7 =0 then array['frecuente']
      when gs % 13 =0 then array['nuevo']
      when gs % 17 =0 then array['barba']
      when gs % 19 =0 then array['color']
      else array['nuevo']
    end as tags,
    -- birthday distribuido todo el año, algunos null 10%
    case when gs %10=0 then null else (date '1990-01-01' + ((gs*37)% 13000) ) end as birthday,
    case
      when gs % 25=0 then 'Prefiere barbero Luis. Alergia a fragancia.'
      when gs % 33=0 then 'Cliente exigente, puntual.'
      when gs % 50=0 then 'VIP — cortesía bebida'
      else null end as notes,
    case when gs % 4 !=0 then '+57 3' || lpad(((100000000 + gs*97) % 1000000000)::text,9,'0') else null end as whatsapp,
    -- created_at últimos 12 meses distribuido
    (now() - ( (random()*365)::int || ' days')::interval - ( (random()*11)::int || ' hours')::interval ) as created_at,
    case when gs %2=0 then v_centro else v_norte end as location_id,
    0, 0, null
  from generate_series(1,800) gs
  on conflict (id) do nothing;

  -- resolver conflictos phone/email unique per business (si se regenera con mismo gs, ya es deterministico, pero por si quedó duplicado previo random)
  -- no-op: ON CONFLICT for phone is handled via unique constraint clients_business_phone_unique, insert would fail sin ON CONFLICT en esa key.
  -- Nuestro insert usa id PK conflict only, pero phone duplicate por otra corrida no prevista: como phones son determinísticos por gs, segunda corrida reuse mismos phones con mismas ids, no duplica.
end $$;

-- Actualizar client_tags M2M para algunos clientes vip/frecuente
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
begin
  insert into public.client_tags (client_id, tag_id)
  select c.id, '20000000-0000-4000-a000-000000000001'::uuid from public.clients c where c.business_id=v_bid and 'vip'=any(c.tags)
  on conflict do nothing;
  insert into public.client_tags (client_id, tag_id)
  select c.id, '20000000-0000-4000-a000-000000000002'::uuid from public.clients c where c.business_id=v_bid and 'frecuente'=any(c.tags)
  on conflict do nothing;
end $$;

-- ─────────────────────────────────────────────
-- 12) Loyalty accounts & movements (para reportes)
-- ─────────────────────────────────────────────
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
begin
  if (select count(*) from public.loyalty_accounts where business_id=v_bid) < 100 then
    insert into public.loyalty_accounts (client_id, business_id, points)
    select id, v_bid, ( (random()*800)::int) from public.clients where business_id=v_bid order by random() limit 300
    on conflict (client_id) do nothing;

    insert into public.loyalty_movements (business_id, client_id, type, points, reference)
    select v_bid, client_id, 'earn', points, 'seed earn '||client_id::text from public.loyalty_accounts where business_id=v_bid and points<>0
    on conflict do nothing;

    -- algunos redeem
    insert into public.loyalty_movements (business_id, client_id, type, points, reference)
    select v_bid, client_id, 'redeem', - (50 + (random()*100)::int), 'seed redeem'
    from public.loyalty_accounts where business_id=v_bid and points > 200 order by random() limit 80
    on conflict do nothing;
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 13) Client memberships — ~60 membresías activas/vencidas
-- ─────────────────────────────────────────────
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
declare v_mem1 uuid := '70000000-0000-4000-a000-000000000001';
declare v_mem2 uuid := '70000000-0000-4000-a000-000000000002';
begin
  if (select count(*) from public.client_memberships where business_id=v_bid) < 30 then
    insert into public.client_memberships (business_id, client_id, membership_id, starts_at, expires_at, remaining, status)
    select v_bid, id, case when gs%3=0 then v_mem2 else v_mem1 end,
           now() - ( (gs%60) || ' days')::interval,
           now() + (30 + (gs%60) || ' days')::interval,
           ( (random()*6)::int + 1),
           case when gs%7=0 then 'expired' when gs%11=0 then 'cancelled' else 'active' end
    from (select id, row_number() over (order by random()) as gs from public.clients where business_id=v_bid order by random() limit 80) t
    on conflict do nothing;
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 14) Recurring appointments — 15 plantillas rrule (seed para pruebas)
-- ─────────────────────────────────────────────
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
declare v_centro uuid := '11111111-1111-1111-1111-111111111111';
declare v_svc uuid := '683dbb3c-6b10-4c85-b3b2-87fdb500ddec';
declare v_emp uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
begin
  if (select count(*) from public.recurring_appointments where business_id=v_bid) < 10 then
    insert into public.recurring_appointments (business_id, location_id, client_id, service_id, employee_id, rrule, next_at, until, is_active)
    select v_bid, case when gs%2=0 then v_centro else '22222222-2222-2222-2222-222222222222'::uuid end,
           c.id, v_svc, v_emp,
           'FREQ=WEEKLY;BYDAY=MO;COUNT=8',
           now() + (gs || ' days')::interval,
           now() + (60 + gs*3 || ' days')::interval,
           gs%5 !=0
    from (select id, row_number() over (order by random()) as gs from public.clients where business_id=v_bid order by random() limit 15) c
    on conflict do nothing;
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 15) Appointments — 2500 citas últimos 12 meses, Mon-Sat 09:00-20:00, distribución realista, respeta holidays y breaks
--     Estados: 55% completed, 15% paid, 12% cancelled, 6% no_show, 7% confirmed/scheduled future, 5% pending
--     Algunos con recurring_id, location_id, source variado
--     Evita domingos y holidays; respeta break 13-14 (evita slots 13:00-13:30)
--     Guard: si ya hay >=1500, skip
-- ─────────────────────────────────────────────
-- Deshabilitar triggers de usuario que bloquean seed histórico (past bookings, validación horario) — los re-habilitamos después
alter table public.appointments disable trigger user;
-- Loop-based generación con zona America/Bogota correcta
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
declare v_centro uuid := '11111111-1111-1111-1111-111111111111';
declare v_norte uuid := '22222222-2222-2222-2222-222222222222';
declare v_cnt int;
declare gs int;
declare svc_rec record;
declare v_client uuid;
declare v_emp uuid;
declare v_loc uuid;
declare v_local_date date;
declare v_dow int;
declare v_total int;
declare v_morning int;
declare v_steps int;
declare v_offset int;
declare v_start_min int;
declare v_local_ts timestamptz;
declare v_end_ts timestamptz;
declare v_r double precision;
declare v_status text;
declare v_attempt int;
declare v_ok boolean;
begin
  select count(*) into v_cnt from public.appointments where business_id=v_bid;
  if v_cnt >= 1500 then
    raise notice 'appointments already % skipping heavy insert', v_cnt;
    return;
  end if;

  for gs in 1..2500 loop
    -- servicio aleatorio
    select * into svc_rec from public.services where business_id=v_bid and is_active order by random() limit 1;
    if svc_rec.id is null then continue; end if;

    -- cliente aleatorio
    select id into v_client from public.clients where business_id=v_bid order by random() limit 1;

    -- empleado calificado para ese servicio si existe, si no random
    select employee_id into v_emp from public.employee_services where service_id=svc_rec.id order by random() limit 1;
    if v_emp is null then
      select id into v_emp from public.employees where business_id=v_bid and is_active order by random() limit 1;
    end if;

    v_loc := case when random() < 0.62 then v_centro else v_norte end;

    -- fecha local Mon-Sat no festivo (intenta hasta 10 veces)
    for i in 1..10 loop
      v_local_date := ((now() at time zone 'America/Bogota')::date - (floor(random()*360)::int));
      v_dow := extract(dow from v_local_date)::int;
      exit when v_dow !=0 and not exists (select 1 from public.holidays where business_id=v_bid and date=v_local_date and is_open=false);
    end loop;
    -- si aún domingo/festivo tras intentos, forzar lunes
    if extract(dow from v_local_date)::int =0 then v_local_date := v_local_date + 1; end if;

    -- calcular slot que respete break 13-14 (Mon-Fri) y cierre 20:00, pasos de 15min
    -- Mon-Fri: dos ventanas 09-13 (240) y 14-20 (360) — elegir ventana primero para no cruzar break
    if v_dow between 1 and 5 then
      if random() < 0.4 then
        -- mañana 09:00-13:00
        v_steps := floor((240 - svc_rec.duration_min)/15);
        if v_steps <0 then v_steps:=0; end if;
        v_offset := floor(random()* (v_steps+1)) *15;
        v_start_min := 540 + v_offset;
      else
        -- tarde 14:00-20:00
        v_steps := floor((360 - svc_rec.duration_min)/15);
        if v_steps <0 then v_steps:=0; end if;
        v_offset := floor(random()* (v_steps+1)) *15;
        v_start_min := 840 + v_offset;
      end if;
    else
      -- Sábado sin break: 09-20 =660
      v_total := 660;
      v_steps := floor((v_total - svc_rec.duration_min)/15);
      if v_steps <0 then v_steps:=0; end if;
      v_offset := floor(random()* (v_steps+1)) *15;
      v_start_min := 540 + v_offset;
    end if;

    v_local_ts := (v_local_date + (v_start_min || ' minutes')::interval) at time zone 'America/Bogota';
    v_end_ts := v_local_ts + (svc_rec.duration_min || ' minutes')::interval;
    v_r := random();

    -- status ponderado por antigüedad
    if v_local_ts < now() - interval '2 days' then
      if v_r < 0.55 then v_status:='completed';
      elsif v_r < 0.70 then v_status:='paid';
      elsif v_r < 0.82 then v_status:='cancelled';
      elsif v_r < 0.88 then v_status:='no_show';
      elsif v_r < 0.93 then v_status:='confirmed';
      else v_status:='pending';
      end if;
    elsif v_local_ts < now() then
      if v_r < 0.7 then v_status:='completed'; elsif v_r < 0.85 then v_status:='paid'; else v_status:='no_show'; end if;
    else
      if v_r < 0.45 then v_status:='confirmed'; elsif v_r < 0.75 then v_status:='scheduled'; elsif v_r < 0.90 then v_status:='pending'; else v_status:='cancelled'; end if;
    end if;

    -- evitar solape con mismo empleado: si existe cita solapada, reintentar con otro empleado/hora hasta 3 intentos
    v_ok:=false;
    for v_attempt in 1..3 loop
      if not exists (
        select 1 from public.appointments
        where business_id=v_bid and employee_id=v_emp
          and starts_at < v_end_ts and ends_at > v_local_ts
          and status not in ('cancelled','no_show')
      ) and not exists (
        select 1 from public.employee_unavailability
        where employee_id=v_emp and v_local_ts < ends_at and v_end_ts > starts_at
      ) then
        v_ok:=true; exit;
      end if;
      -- si solapa, cambiar empleado y recalcular hora aleatoria dentro del mismo día
      select employee_id into v_emp from public.employee_services where service_id=svc_rec.id order by random() limit 1;
      if v_emp is null then select id into v_emp from public.employees where business_id=v_bid and is_active order by random() limit 1; end if;
      -- recalcular offset aleatorio para mismo día (respetando break)
      if v_dow between 1 and 5 then
        if random() < 0.4 then
          v_steps := floor((240 - svc_rec.duration_min)/15); if v_steps<0 then v_steps:=0; end if; v_offset:= floor(random()*(v_steps+1))*15; v_start_min:=540+v_offset;
        else
          v_steps := floor((360 - svc_rec.duration_min)/15); if v_steps<0 then v_steps:=0; end if; v_offset:= floor(random()*(v_steps+1))*15; v_start_min:=840+v_offset;
        end if;
      else
        v_steps := floor((660 - svc_rec.duration_min)/15); if v_steps<0 then v_steps:=0; end if; v_offset:= floor(random()* (v_steps+1))*15; v_start_min:=540+v_offset;
      end if;
      v_local_ts := (v_local_date + (v_start_min || ' minutes')::interval) at time zone 'America/Bogota';
      v_end_ts := v_local_ts + (svc_rec.duration_min || ' minutes')::interval;
    end loop;

    if not v_ok then
      v_status := 'cancelled';
    end if;

    begin
      insert into public.appointments (id, business_id, client_id, employee_id, service_id, location_id, starts_at, ends_at, status, price, notes, source, recurring_id, created_at, updated_at)
      values (
        format('a%07s-0000-4000-a000-%012s', lpad(gs::text,7,'0'), lpad(gs::text,12,'0'))::uuid,
        v_bid, v_client, v_emp, svc_rec.id, v_loc, v_local_ts, v_end_ts, v_status, svc_rec.price,
        case when gs % 47 =0 then 'Cliente pide barbero específico' when gs% 97=0 then 'Cita recurrente' else null end,
        (array['manual','online','telegram','viber'])[1 + floor(random()*4)::int],
        null,
        v_local_ts - interval '1 day' + (random()*12 || ' hours')::interval,
        v_local_ts
      ) on conflict (id) do nothing;
    exception when others then
      raise notice 'appointment insert failed gs=% attempt=% %', gs, v_attempt, SQLERRM;
    end;
  end loop;

  -- Vincular ~15 citas a recurring_appointments
  update public.appointments a set recurring_id = r.id
  from (select id from public.recurring_appointments where business_id=v_bid order by random() limit 15) r
  where a.id in (select id from public.appointments where business_id=v_bid and status in ('scheduled','confirmed') order by random() limit 15);

end $$;
alter table public.appointments enable trigger user;

-- Limpieza post: asegurar que no hay citas domingo (corrección idempotente)
delete from public.appointments where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95' and extract(dow from starts_at at time zone 'America/Bogota')=0 and status not in ('cancelled','no_show') and id::text like 'a%';

-- Opcional: mover citas que caen en holidays a siguiente día (no bloqueante para reportes, pero simula respeto festivos)
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
begin
  update public.appointments a set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day'
  where business_id=v_bid and exists (select 1 from public.holidays h where h.business_id=v_bid and h.date = (a.starts_at at time zone 'America/Bogota')::date and h.is_open=false)
  and a.status in ('scheduled','confirmed','pending');
end $$;

-- ─────────────────────────────────────────────
-- 16) Transactions — ~1200 transacciones vinculadas a citas completed/paid + algunas sueltas POS
--     Incluye discount, tip, loyalty, payment_method, location_id, items jsonb, transaction_items, tips, commissions via trigger
--     Guard: si ya hay >=800, skip
-- ─────────────────────────────────────────────
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
declare v_cnt int;
declare v_txn_cnt int := 1200;
begin
  select count(*) into v_cnt from public.transactions where business_id=v_bid;
  if v_cnt >= 800 then
    raise notice 'transactions already % skipping', v_cnt;
    return;
  end if;

  -- 1) Transacciones vinculadas a citas completed/paid (hasta 900)
  insert into public.transactions (id, business_id, location_id, appointment_id, client_id, employee_id, amount, payment_method, status, items, tip_amount, discount_amount, discount_reason, promo_code, loyalty_points_earned, loyalty_points_redeemed, created_at)
  select
    format('b%07s-0000-4000-a000-%012s', lpad(gs::text,7,'0'), lpad(gs::text,12,'0'))::uuid,
    v_bid,
    a.location_id,
    a.id,
    a.client_id,
    a.employee_id,
    -- amount = price - discount (net) + tip? En esquema amount es neto sin tip; tip_amount separado. Comisión usa amount - tip.
    -- Guardamos amount como net price - discount, tip separado.
    greatest(0, (a.price::numeric - disc)::numeric) as amount,
    (array['cash','card','transfer','online'])[1 + floor(random()*4)::int] as pm,
    'completed' as status,
    jsonb_build_array(jsonb_build_object('service_id', a.service_id, 'name', s.name, 'price', s.price, 'qty',1)) as items,
    (case when random() < 0.35 then (1000 + (random()*9000)::int) else 0 end) as tip,
    disc as discount,
    case when disc>0 then (array['promo BIENVENIDA10','promo LUNES15','descuento vip','cortesía'])[1+ floor(random()*4)::int] else null end as disc_reason,
    case when disc>0 and random()<0.5 then (array['BIENVENIDA10','LUNES15','BARBA5K'])[1+ floor(random()*3)::int] else null end as promo,
    -- loyalty earn: 1pt per 1000 COP net
    floor( greatest(0, a.price::numeric - disc) / 1000 )::int as pts_earn,
    case when random()<0.08 then (50+ (random()*100)::int) else 0 end as pts_redeem,
    -- created_at = ends_at + random 0-2h (cobro después de cita)
    a.ends_at + ( (random()*2)::int || ' hours')::interval as created_at
  from (
    select *, row_number() over (order by starts_at) as gs
    from public.appointments
    where business_id=v_bid and status in ('completed','paid') order by starts_at
    limit 900
  ) a
  join public.services s on s.id = a.service_id
  cross join lateral ( select case when random()<0.22 then ( (a.price::numeric * (0.05 + random()*0.10))::int ) else 0 end as disc ) d
  on conflict (id) do nothing;

  -- 2) Transacciones POS sueltas sin cita (walk-in) ~300
  insert into public.transactions (id, business_id, location_id, client_id, employee_id, amount, payment_method, status, items, tip_amount, discount_amount, created_at)
  select
    format('b%07s-0000-4000-a000-%012s', lpad((900+gs)::text,7,'0'), lpad((900+gs)::text,12,'0'))::uuid,
    v_bid,
    case when random()<0.6 then '11111111-1111-1111-1111-111111111111'::uuid else '22222222-2222-2222-2222-222222222222'::uuid end,
    (select id from public.clients where business_id=v_bid order by random() limit 1),
    (select id from public.employees where business_id=v_bid and is_active order by random() limit 1),
    (15000 + (random()*65000)::int)::numeric,
    (array['cash','card','transfer'])[1+ floor(random()*3)::int],
    'completed',
    jsonb_build_array(jsonb_build_object('product', 'Venta mostrador', 'price', 15000 + (random()*30000)::int, 'qty',1)),
    case when random()<0.25 then (2000+ (random()*5000)::int) else 0 end,
    case when random()<0.15 then (2000+ (random()*4000)::int) else 0 end,
    now() - ( (random()*90)::int || ' days')::interval
  from generate_series(1,300) gs
  on conflict (id) do nothing;

  -- 3) Algunas transacciones refunded/pending para reportes
  insert into public.transactions (business_id, client_id, employee_id, amount, payment_method, status, items, created_at)
  select v_bid, (select id from public.clients where business_id=v_bid order by random() limit 1), (select id from public.employees where business_id=v_bid order by random() limit 1), 30000, 'cash', 'refunded', '[]'::jsonb, now() - interval '10 days' from generate_series(1,8) on conflict do nothing;
  insert into public.transactions (business_id, client_id, employee_id, amount, payment_method, status, items, created_at)
  select v_bid, (select id from public.clients where business_id=v_bid order by random() limit 1), (select id from public.employees where business_id=v_bid order by random() limit 1), 25000, 'card', 'pending', '[]'::jsonb, now() - interval '2 days' from generate_series(1,5) on conflict do nothing;
end $$;

-- Transaction items detallados para algunas transacciones (para reportes por producto/servicio)
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
begin
  insert into public.transaction_items (transaction_id, service_id, name_snapshot, price_snapshot, qty)
  select t.id, a.service_id, s.name, s.price, 1
  from public.transactions t
  join public.appointments a on a.id = t.appointment_id
  join public.services s on s.id = a.service_id
  where t.business_id=v_bid and t.appointment_id is not null
  and not exists (select 1 from public.transaction_items ti where ti.transaction_id=t.id)
  limit 800
  on conflict do nothing;
end $$;

-- Tips detallados (cuando tip_amount >0)
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
begin
  insert into public.tips (business_id, transaction_id, employee_id, amount, method)
  select t.business_id, t.id, t.employee_id, t.tip_amount, case when t.payment_method='cash' then 'cash' else 'card' end
  from public.transactions t
  where t.business_id=v_bid and t.tip_amount >0 and t.employee_id is not null
  and not exists (select 1 from public.tips tp where tp.transaction_id=t.id)
  on conflict do nothing;
end $$;

-- Recalcular loyalty_movements por transacciones (earn ya via trigger? pero aseguramos movimientos)
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
begin
  insert into public.loyalty_movements (business_id, client_id, type, points, reference)
  select t.business_id, t.client_id, 'earn', t.loyalty_points_earned, 'txn:'||t.id::text
  from public.transactions t where t.business_id=v_bid and t.loyalty_points_earned>0 and t.client_id is not null
  and not exists (select 1 from public.loyalty_movements lm where lm.reference='txn:'||t.id::text)
  on conflict do nothing;

  insert into public.loyalty_movements (business_id, client_id, type, points, reference)
  select t.business_id, t.client_id, 'redeem', -t.loyalty_points_redeemed, 'redeem:'||t.id::text
  from public.transactions t where t.business_id=v_bid and t.loyalty_points_redeemed>0 and t.client_id is not null
  and not exists (select 1 from public.loyalty_movements lm where lm.reference='redeem:'||t.id::text)
  on conflict do nothing;

  -- actualizar loyalty_accounts points agregados (evitar negativos por redeem > earn)
  insert into public.loyalty_accounts (client_id, business_id, points)
  select client_id, business_id, greatest(0, sum(points))::int from public.loyalty_movements where business_id=v_bid group by client_id, business_id
  on conflict (client_id) do update set points = greatest(0, excluded.points), updated_at=now();
end $$;

-- ─────────────────────────────────────────────
-- 17) Waitlist — 60 entradas (waiting/notified/converted etc)
-- ─────────────────────────────────────────────
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
begin
  if (select count(*) from public.waitlist where business_id=v_bid) < 30 then
    insert into public.waitlist (business_id, location_id, service_id, employee_id, client_id, desired_at, status)
    select v_bid,
           case when random()<0.5 then '11111111-1111-1111-1111-111111111111'::uuid else '22222222-2222-2222-2222-222222222222'::uuid end,
           (select id from public.services where business_id=v_bid order by random() limit 1),
           (select id from public.employees where business_id=v_bid order by random() limit 1),
           (select id from public.clients where business_id=v_bid order by random() limit 1),
           now() + ( (1+ floor(random()*14))::int || ' days')::interval + ( (9+ floor(random()*8))::int || ' hours')::interval,
           (array['waiting','notified','converted','expired','cancelled'])[1+ floor(random()*5)::int]
    from generate_series(1,60) gs
    on conflict (business_id, client_id, desired_at) do nothing;
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 18) Cash registers & movements — 1 por sede (open centro, closed norte con histórico)
-- ─────────────────────────────────────────────
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
declare v_owner uuid := 'b8f773b2-11e7-40d0-8f52-929b480d42b8';
begin
  -- cerrar open previos si existen (para idempotencia per-location unique)
  -- no trucamos, solo insertamos si no existe open por sede
  if not exists (select 1 from public.cash_registers where business_id=v_bid and location_id='11111111-1111-1111-1111-111111111111' and status='open') then
    insert into public.cash_registers (business_id, location_id, opened_by, opening_cash, status)
    values (v_bid,'11111111-1111-1111-1111-111111111111',v_owner,150000,'open')
    on conflict do nothing;
  end if;
  if not exists (select 1 from public.cash_registers where business_id=v_bid and location_id='22222222-2222-2222-2222-222222222222' and status='open') then
    insert into public.cash_registers (business_id, location_id, opened_by, opening_cash, status)
    values (v_bid,'22222222-2222-2222-2222-222222222222',v_owner,120000,'open')
    on conflict do nothing;
  end if;
  -- histórico cerrado norte
  insert into public.cash_registers (business_id, location_id, opened_by, opening_cash, expected_cash, actual_cash, status, opened_at, closed_at)
  select v_bid,'22222222-2222-2222-2222-222222222222',v_owner,100000,185000,184000,'closed', now()-interval '7 days', now()-interval '6 days'
  where not exists (select 1 from public.cash_registers where business_id=v_bid and location_id='22222222-2222-2222-2222-222222222222' and status='closed')
  on conflict do nothing;
end $$;

-- Employee unavailability — vacaciones / bloqueos
do $$
declare v_bid uuid := '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
begin
  if (select count(*) from public.employee_unavailability where business_id=v_bid) < 5 then
    insert into public.employee_unavailability (business_id, employee_id, starts_at, ends_at, reason)
    values
      (v_bid,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() + interval '10 days', now() + interval '12 days','Vacaciones'),
      (v_bid,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now() - interval '20 days', now() - interval '19 days','Incapacidad'),
      (v_bid,'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', now() + interval '3 days 09:00', now() + interval '3 days 13:00','Capacitación')
    on conflict do nothing;
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 19) Refresh materialized view & stats sanity
-- ─────────────────────────────────────────────
-- client_stats es materialized; refrescar si existe
do $$ begin
  perform 1 from pg_matviews where matviewname='client_stats';
  if found then
    refresh materialized view public.client_stats;
  end if;
exception when others then raise notice 'client_stats refresh skipped %', SQLERRM;
end $$;

-- Forzar update_client_stats para clientes sin trigger previo (recalcula totales)
update public.clients c set
  total_visits = sub.visits,
  total_spent = sub.spent,
  last_visit_at = sub.last_at
from (
  select client_id, count(*)::int as visits, coalesce(sum(amount),0)::numeric(10,2) as spent, max(created_at) as last_at
  from public.transactions where status='completed' and client_id is not null group by client_id
) sub where c.id = sub.client_id and c.business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';

-- Comentario de auditoria
comment on table public.clients is 'Escudería realistic seed 2026: 800 clientes, 2500 citas, 1200 tx';

commit;

-- ─────────────────────────────────────────────
-- Verification helper (ejecutar manual)
-- ─────────────────────────────────────────────
-- select '✓ locations' as check, count(*) from public.locations where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
-- union all select 'employees',count(*) from public.employees where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
-- union all select 'services',count(*) from public.services where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
-- union all select 'clients',count(*) from public.clients where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
-- union all select 'appointments',count(*) from public.appointments where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
-- union all select 'appointments completed',count(*) from public.appointments where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95' and status='completed'
-- union all select 'appointments paid',count(*) from public.appointments where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95' and status='paid'
-- union all select 'transactions',count(*) from public.transactions where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
-- union all select 'inventory_items',count(*) from public.inventory_items where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
-- union all select 'holidays',count(*) from public.holidays where business_id='17c1a2b5-5d3b-4d84-bbb1-d361077d4c95';
