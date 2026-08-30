/*
 * DEPRECATED — SQL seeds removed. ORM is source of truth.
 * This file is kept for historical reference only and is NOT executed.
 * Use:  DATABASE_URL=... npx tsx drizzle/seed-ultra.ts
 *   or  npm run db:seed          (ultra 2000/8000)
 *   or  npx tsx drizzle/seed.ts  (same, ultra)
 * Supabase config: supabase/config.toml [db.seed] enabled=false, sql_paths=[]
 * Reason: requirement "seeds must be with ORM, nothing in SQL" — 2026-08-30
 */

--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous) VALUES ('00000000-0000-0000-0000-000000000000', 'b8f773b2-11e7-40d0-8f52-929b480d42b8', 'authenticated', 'authenticated', 'test@barber.local', '$2a$10$irT.ajxrLkYjZxzatHv3xuM4oqBR7hJCs7Cly4cH1BxuBR8.JZ15y', '2026-08-27 21:35:40.636248+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{}', false, '2026-08-27 21:35:40.636248+00', '2026-08-27 21:35:40.636248+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous) VALUES ('00000000-0000-0000-0000-000000000000', 'ceccb7fb-36de-46ca-b539-573ce8421e5e', 'authenticated', 'authenticated', 'zaidarellano21@gmail.com', '$2a$10$pBaWRRgqvGVzQHZpb2G0yOXqc9zzSxbByoQ3DiYWvUpgLE8GfgwfW', '2026-08-27 21:35:40.636248+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{}', false, '2026-08-27 21:35:40.636248+00', '2026-08-27 21:35:40.636248+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);

--
-- Data for Name: businesses; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.businesses (id, owner_id, name, slug, type, phone, email, address, timezone, currency, logo_url, plan, plan_expires_at, telegram_bot_token, viber_bot_token, created_at, updated_at, telegram_chat_id, ls_subscription_id, ls_customer_id, ls_variant_id, viber_chat_id, owner_whatsapp, onboarding_completed, email_provider, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, resend_api_key, brand_color, enabled_modules, notification_language, meta_whatsapp_phone_number_id, meta_whatsapp_access_token, wa_template_confirmation, wa_template_reminder, wa_template_thankyou, wa_template_reactivation, wa_template_birthday, wa_template_language) VALUES ('48e04ab8-7dee-4526-b98f-45a262218869', 'ceccb7fb-36de-46ca-b539-573ce8421e5e', 'Cristain', 'cristain', 'barbershop', NULL, NULL, NULL, 'UTC', 'USD', NULL, 'free', NULL, NULL, NULL, '2026-08-27 18:13:17.894741+00', '2026-08-27 18:13:39.949871+00', NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, NULL, 587, NULL, NULL, NULL, NULL, '#2D2926', '{bookings,pos,crm,inventory,notifications}', 'en', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'en');
INSERT INTO public.businesses (id, owner_id, name, slug, type, phone, email, address, timezone, currency, logo_url, plan, plan_expires_at, telegram_bot_token, viber_bot_token, created_at, updated_at, telegram_chat_id, ls_subscription_id, ls_customer_id, ls_variant_id, viber_chat_id, owner_whatsapp, onboarding_completed, email_provider, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, resend_api_key, brand_color, enabled_modules, notification_language, meta_whatsapp_phone_number_id, meta_whatsapp_access_token, wa_template_confirmation, wa_template_reminder, wa_template_thankyou, wa_template_reactivation, wa_template_birthday, wa_template_language) VALUES ('17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', 'b8f773b2-11e7-40d0-8f52-929b480d42b8', 'Escudería', 'escuderia', 'barbershop', '+57 300 123 4567', NULL, 'Colombia', 'America/Bogota', 'COP', NULL, 'free', NULL, NULL, NULL, '2026-08-27 17:43:26.150942+00', '2026-08-27 18:16:42.898333+00', NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, NULL, 587, NULL, NULL, NULL, NULL, '#0A0A0A', '{bookings,pos,crm,inventory,notifications}', 'es', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'en');

-- Data for Name: business_hours --
INSERT INTO public.business_hours (id, business_id, day_of_week, is_open, open_time, close_time, break_start, break_end) VALUES ('23a56ee1-e7c6-40c0-9f09-b6299b0c90e5', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', 1, true, '09:00', '20:00', NULL, NULL);
INSERT INTO public.business_hours (id, business_id, day_of_week, is_open, open_time, close_time, break_start, break_end) VALUES ('192b6a9b-2325-4442-8c58-b862e577180f', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', 2, true, '09:00', '20:00', NULL, NULL);
INSERT INTO public.business_hours (id, business_id, day_of_week, is_open, open_time, close_time, break_start, break_end) VALUES ('d5fbf9ba-bfa0-4dd7-8034-3ad92198b612', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', 3, true, '09:00', '20:00', NULL, NULL);
INSERT INTO public.business_hours (id, business_id, day_of_week, is_open, open_time, close_time, break_start, break_end) VALUES ('1fbf2369-d32a-436d-b52f-723561e7d0f7', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', 4, true, '09:00', '20:00', NULL, NULL);
INSERT INTO public.business_hours (id, business_id, day_of_week, is_open, open_time, close_time, break_start, break_end) VALUES ('9ae77d9e-1d3f-43f9-b33a-81c98cc96e16', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', 5, true, '09:00', '20:00', NULL, NULL);
INSERT INTO public.business_hours (id, business_id, day_of_week, is_open, open_time, close_time, break_start, break_end) VALUES ('01390879-64ca-45a4-bcd6-6b818aceec82', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', 6, true, '09:00', '20:00', NULL, NULL);
INSERT INTO public.business_hours (id, business_id, day_of_week, is_open, open_time, close_time, break_start, break_end) VALUES ('a8b04262-c8b9-456b-bde5-35f07c98d9bd', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', 0, false, '09:00', '20:00', NULL, NULL);

-- Data for Name: locations --
INSERT INTO public.locations (id, business_id, name, slug, address, phone, is_active, created_at) VALUES ('11111111-1111-1111-1111-111111111111', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', 'Escudería Centro', 'centro', 'Colombia', '+57 300 123 4567', true, '2026-08-27 19:58:26.643965+00');

-- Data for Name: employees --
INSERT INTO public.employees (id, business_id, user_id, name, role, phone, email, avatar_url, is_active, created_at, color, specialties, commission_rate, commission_fixed, bio, location_id) VALUES ('9e8eb213-7bff-481d-bf46-175e5dba458a', '48e04ab8-7dee-4526-b98f-45a262218869', NULL, 'Zaidarellano21', 'staff', NULL, 'zaidarellano21@gmail.com', NULL, true, '2026-08-27 18:13:17.906167+00', NULL, '{}', NULL, NULL, NULL, NULL);
INSERT INTO public.employees (id, business_id, user_id, name, role, phone, email, avatar_url, is_active, created_at, color, specialties, commission_rate, commission_fixed, bio, location_id) VALUES ('f822de0d-ca09-42dd-bea1-76b2ca334d7e', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', NULL, 'Escudería Owner', 'admin', '+57 300 123 4567', 'test@barber.local', NULL, true, '2026-08-27 17:43:26.183513+00', '#1a1a1a', '{corte,barba,combo}', 50.00, NULL, NULL, NULL);
INSERT INTO public.employees (id, business_id, user_id, name, role, phone, email, avatar_url, is_active, created_at, color, specialties, commission_rate, commission_fixed, bio, location_id) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', NULL, 'Ana Escudería', 'barbero', NULL, NULL, NULL, true, '2026-08-27 17:57:31.020966+00', '#ec4899', '{barba,cejas}', 50.00, 10000.00, NULL, NULL);
INSERT INTO public.employees (id, business_id, user_id, name, role, phone, email, avatar_url, is_active, created_at, color, specialties, commission_rate, commission_fixed, bio, location_id) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', NULL, 'Luis Escudería', 'barbero', '+57 310 555 0101', 'luis@escuderia.com', NULL, true, '2026-08-27 18:21:22.643814+00', '#0ea5e9', '{corte,combo,afeitado}', 45.00, NULL, NULL, NULL);
INSERT INTO public.employees (id, business_id, user_id, name, role, phone, email, avatar_url, is_active, created_at, color, specialties, commission_rate, commission_fixed, bio, location_id) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', NULL, 'Miguel Escudería', 'barbero', '+57 311 555 0102', 'miguel@escuderia.com', NULL, true, '2026-08-27 18:21:22.643814+00', '#f59e0b', '{corte,barba,cejas}', 50.00, NULL, NULL, NULL);

-- Data for Name: services --
INSERT INTO public.services (id, business_id, name, description, price, duration_min, category, is_active, created_at, capacity, cost, color, is_featured, location_id) VALUES ('fd38b05e-238e-48e2-a49c-5f0312597c06', '48e04ab8-7dee-4526-b98f-45a262218869', 'Corte de cabello', NULL, 15000.00, 60, NULL, true, '2026-08-27 18:13:39.958602+00', 1, NULL, NULL, false, NULL);
INSERT INTO public.services (id, business_id, name, description, price, duration_min, category, is_active, created_at, capacity, cost, color, is_featured, location_id) VALUES ('683dbb3c-6b10-4c85-b3b2-87fdb500ddec', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', 'Corte Clásico', 'Corte moderno con acabado profesional', 30000.00, 30, 'corte', true, '2026-08-27 18:16:53.203954+00', 1, 5000.00, NULL, false, NULL);
INSERT INTO public.services (id, business_id, name, description, price, duration_min, category, is_active, created_at, capacity, cost, color, is_featured, location_id) VALUES ('0730db42-332f-46d9-851d-e036c66fb8d6', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', 'Corte + Barba', 'Combo completo corte y barba con toalla caliente', 45000.00, 50, 'combo', true, '2026-08-27 18:16:53.203954+00', 1, 7000.00, NULL, false, NULL);
INSERT INTO public.services (id, business_id, name, description, price, duration_min, category, is_active, created_at, capacity, cost, color, is_featured, location_id) VALUES ('b06e02ba-d274-4c83-9f22-bfbc992b6f03', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', 'Barba y Perfilado', 'Afeitado y perfilado con navaja', 20000.00, 20, 'barba', true, '2026-08-27 18:16:53.203954+00', 1, 3000.00, NULL, false, NULL);
INSERT INTO public.services (id, business_id, name, description, price, duration_min, category, is_active, created_at, capacity, cost, color, is_featured, location_id) VALUES ('cf73968f-4475-463c-933c-1bc678ed1ee9', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', 'Afeitado Clásico', 'Afeitado clásico con navaja y toalla caliente', 25000.00, 30, 'afeitado', true, '2026-08-27 18:16:53.203954+00', 1, 4000.00, NULL, false, NULL);
INSERT INTO public.services (id, business_id, name, description, price, duration_min, category, is_active, created_at, capacity, cost, color, is_featured, location_id) VALUES ('48d9363a-a97b-49ce-b24a-db424141beea', '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95', 'Diseño de Cejas', 'Perfilado y diseño de cejas', 15000.00, 15, 'cejas', true, '2026-08-27 18:16:53.203954+00', 1, 2000.00, NULL, false, NULL);

-- Data for Name: employee_services --
INSERT INTO public.employee_services (employee_id, service_id, created_at) VALUES ('f822de0d-ca09-42dd-bea1-76b2ca334d7e', '683dbb3c-6b10-4c85-b3b2-87fdb500ddec', '2026-08-27 18:16:53.251618+00');
INSERT INTO public.employee_services (employee_id, service_id, created_at) VALUES ('f822de0d-ca09-42dd-bea1-76b2ca334d7e', '0730db42-332f-46d9-851d-e036c66fb8d6', '2026-08-27 18:16:53.251618+00');
INSERT INTO public.employee_services (employee_id, service_id, created_at) VALUES ('f822de0d-ca09-42dd-bea1-76b2ca334d7e', 'b06e02ba-d274-4c83-9f22-bfbc992b6f03', '2026-08-27 18:16:53.251618+00');
INSERT INTO public.employee_services (employee_id, service_id, created_at) VALUES ('f822de0d-ca09-42dd-bea1-76b2ca334d7e', 'cf73968f-4475-463c-933c-1bc678ed1ee9', '2026-08-27 18:16:53.251618+00');
INSERT INTO public.employee_services (employee_id, service_id, created_at) VALUES ('f822de0d-ca09-42dd-bea1-76b2ca334d7e', '48d9363a-a97b-49ce-b24a-db424141beea', '2026-08-27 18:16:53.251618+00');
INSERT INTO public.employee_services (employee_id, service_id, created_at) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '48d9363a-a97b-49ce-b24a-db424141beea', '2026-08-27 18:16:53.251618+00');
INSERT INTO public.employee_services (employee_id, service_id, created_at) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '683dbb3c-6b10-4c85-b3b2-87fdb500ddec', '2026-08-27 18:21:22.670611+00');
INSERT INTO public.employee_services (employee_id, service_id, created_at) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '0730db42-332f-46d9-851d-e036c66fb8d6', '2026-08-27 18:21:22.670611+00');
INSERT INTO public.employee_services (employee_id, service_id, created_at) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cf73968f-4475-463c-933c-1bc678ed1ee9', '2026-08-27 18:21:22.670611+00');
INSERT INTO public.employee_services (employee_id, service_id, created_at) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', '683dbb3c-6b10-4c85-b3b2-87fdb500ddec', '2026-08-27 18:21:22.670611+00');
INSERT INTO public.employee_services (employee_id, service_id, created_at) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', '0730db42-332f-46d9-851d-e036c66fb8d6', '2026-08-27 18:21:22.670611+00');
INSERT INTO public.employee_services (employee_id, service_id, created_at) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'b06e02ba-d274-4c83-9f22-bfbc992b6f03', '2026-08-27 18:21:22.670611+00');
INSERT INTO public.employee_services (employee_id, service_id, created_at) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', '48d9363a-a97b-49ce-b24a-db424141beea', '2026-08-27 18:21:22.670611+00');
INSERT INTO public.employee_services (employee_id, service_id, created_at) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '683dbb3c-6b10-4c85-b3b2-87fdb500ddec', '2026-08-27 21:28:42.855784+00');
INSERT INTO public.employee_services (employee_id, service_id, created_at) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b06e02ba-d274-4c83-9f22-bfbc992b6f03', '2026-08-27 21:28:42.855784+00');

-- PostgreSQL database dump complete
