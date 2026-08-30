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


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';

COPY auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous) FROM stdin;
00000000-0000-0000-0000-000000000000	b8f773b2-11e7-40d0-8f52-929b480d42b8	authenticated	authenticated	test@barber.local	$2a$10$irT.ajxrLkYjZxzatHv3xuM4oqBR7hJCs7Cly4cH1BxuBR8.JZ15y	2026-08-27 21:35:40.636248+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	{"provider": "email", "providers": ["email"]}	{}	f	2026-08-27 21:35:40.636248+00	2026-08-27 21:35:40.636248+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	ceccb7fb-36de-46ca-b539-573ce8421e5e	authenticated	authenticated	zaidarellano21@gmail.com	$2a$10$pBaWRRgqvGVzQHZpb2G0yOXqc9zzSxbByoQ3DiYWvUpgLE8GfgwfW	2026-08-27 21:35:40.636248+00	\N	\N	\N	\N	\N	\N	\N	\N	\N	{"provider": "email", "providers": ["email"]}	{}	f	2026-08-27 21:35:40.636248+00	2026-08-27 21:35:40.636248+00	\N	\N			\N		0	\N		\N	f	\N	f
\.

COPY public.businesses (id, owner_id, name, slug, type, phone, email, address, timezone, currency, logo_url, plan, plan_expires_at, telegram_bot_token, viber_bot_token, created_at, updated_at, telegram_chat_id, ls_subscription_id, ls_customer_id, ls_variant_id, viber_chat_id, owner_whatsapp, onboarding_completed, email_provider, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, resend_api_key, brand_color, enabled_modules, notification_language, meta_whatsapp_phone_number_id, meta_whatsapp_access_token, wa_template_confirmation, wa_template_reminder, wa_template_thankyou, wa_template_reactivation, wa_template_birthday, wa_template_language) FROM stdin;
48e04ab8-7dee-4526-b98f-45a262218869	ceccb7fb-36de-46ca-b539-573ce8421e5e	Cristain	cristain	barbershop	\N	\N	\N	UTC	USD	\N	free	\N	\N	\N	2026-08-27 18:13:17.894741+00	2026-08-27 18:13:39.949871+00	\N	\N	\N	\N	\N	\N	t	\N	\N	587	\N	\N	\N	\N	#2D2926	{bookings,pos,crm,inventory,notifications}	en	\N	\N	\N	\N	\N	\N	\N	en
17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	b8f773b2-11e7-40d0-8f52-929b480d42b8	Escudería	escuderia	barbershop	+57 300 123 4567	\N	Colombia	America/Bogota	COP	\N	free	\N	\N	\N	2026-08-27 17:43:26.150942+00	2026-08-27 18:16:42.898333+00	\N	\N	\N	\N	\N	\N	t	\N	\N	587	\N	\N	\N	\N	#0A0A0A	{bookings,pos,crm,inventory,notifications}	es	\N	\N	\N	\N	\N	\N	\N	en
\.


--
-- Data for Name: business_hours; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.business_hours (id, business_id, day_of_week, is_open, open_time, close_time, break_start, break_end) FROM stdin;
23a56ee1-e7c6-40c0-9f09-b6299b0c90e5	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	1	t	09:00	20:00	\N	\N
192b6a9b-2325-4442-8c58-b862e577180f	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	2	t	09:00	20:00	\N	\N
d5fbf9ba-bfa0-4dd7-8034-3ad92198b612	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	3	t	09:00	20:00	\N	\N
1fbf2369-d32a-436d-b52f-723561e7d0f7	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	4	t	09:00	20:00	\N	\N
9ae77d9e-1d3f-43f9-b33a-81c98cc96e16	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	5	t	09:00	20:00	\N	\N
01390879-64ca-45a4-bcd6-6b818aceec82	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	6	t	09:00	20:00	\N	\N
a8b04262-c8b9-456b-bde5-35f07c98d9bd	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	0	f	09:00	20:00	\N	\N
\.


--
-- Data for Name: locations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.locations (id, business_id, name, slug, address, phone, is_active, created_at) FROM stdin;
11111111-1111-1111-1111-111111111111	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	Escudería Centro	centro	Colombia	+57 300 123 4567	t	2026-08-27 19:58:26.643965+00
\.


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employees (id, business_id, user_id, name, role, phone, email, avatar_url, is_active, created_at, color, specialties, commission_rate, commission_fixed, bio, location_id) FROM stdin;
9e8eb213-7bff-481d-bf46-175e5dba458a	48e04ab8-7dee-4526-b98f-45a262218869	\N	Zaidarellano21	employee	\N	zaidarellano21@gmail.com	\N	t	2026-08-27 18:13:17.906167+00	\N	{}	\N	\N	\N	\N
f822de0d-ca09-42dd-bea1-76b2ca334d7e	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	\N	Escudería Owner	owner	+57 300 123 4567	test@barber.local	\N	t	2026-08-27 17:43:26.183513+00	#1a1a1a	{corte,barba,combo}	50.00	\N	\N	\N
aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	\N	Ana Escudería	barber	\N	\N	\N	t	2026-08-27 17:57:31.020966+00	#ec4899	{barba,cejas}	50.00	10000.00	\N	\N
bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	\N	Luis Escudería	barber	+57 310 555 0101	luis@escuderia.com	\N	t	2026-08-27 18:21:22.643814+00	#0ea5e9	{corte,combo,afeitado}	45.00	\N	\N	\N
cccccccc-cccc-cccc-cccc-cccccccccccc	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	\N	Miguel Escudería	barber	+57 311 555 0102	miguel@escuderia.com	\N	t	2026-08-27 18:21:22.643814+00	#f59e0b	{corte,barba,cejas}	50.00	\N	\N	\N
\.


--
-- Data for Name: services; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.services (id, business_id, name, description, price, duration_min, category, is_active, created_at, capacity, cost, color, is_featured, location_id) FROM stdin;
fd38b05e-238e-48e2-a49c-5f0312597c06	48e04ab8-7dee-4526-b98f-45a262218869	Corte de cabello	\N	15000.00	60	\N	t	2026-08-27 18:13:39.958602+00	1	\N	\N	f	\N
683dbb3c-6b10-4c85-b3b2-87fdb500ddec	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	Corte Clásico	Corte moderno con acabado profesional	30000.00	30	corte	t	2026-08-27 18:16:53.203954+00	1	5000.00	\N	f	\N
0730db42-332f-46d9-851d-e036c66fb8d6	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	Corte + Barba	Combo completo corte y barba con toalla caliente	45000.00	50	combo	t	2026-08-27 18:16:53.203954+00	1	7000.00	\N	f	\N
b06e02ba-d274-4c83-9f22-bfbc992b6f03	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	Barba y Perfilado	Afeitado y perfilado con navaja	20000.00	20	barba	t	2026-08-27 18:16:53.203954+00	1	3000.00	\N	f	\N
cf73968f-4475-463c-933c-1bc678ed1ee9	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	Afeitado Clásico	Afeitado clásico con navaja y toalla caliente	25000.00	30	afeitado	t	2026-08-27 18:16:53.203954+00	1	4000.00	\N	f	\N
48d9363a-a97b-49ce-b24a-db424141beea	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	Diseño de Cejas	Perfilado y diseño de cejas	15000.00	15	cejas	t	2026-08-27 18:16:53.203954+00	1	2000.00	\N	f	\N
\.


--
-- Data for Name: employee_services; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee_services (employee_id, service_id, created_at) FROM stdin;
f822de0d-ca09-42dd-bea1-76b2ca334d7e	683dbb3c-6b10-4c85-b3b2-87fdb500ddec	2026-08-27 18:16:53.251618+00
f822de0d-ca09-42dd-bea1-76b2ca334d7e	0730db42-332f-46d9-851d-e036c66fb8d6	2026-08-27 18:16:53.251618+00
f822de0d-ca09-42dd-bea1-76b2ca334d7e	b06e02ba-d274-4c83-9f22-bfbc992b6f03	2026-08-27 18:16:53.251618+00
f822de0d-ca09-42dd-bea1-76b2ca334d7e	cf73968f-4475-463c-933c-1bc678ed1ee9	2026-08-27 18:16:53.251618+00
f822de0d-ca09-42dd-bea1-76b2ca334d7e	48d9363a-a97b-49ce-b24a-db424141beea	2026-08-27 18:16:53.251618+00
aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	48d9363a-a97b-49ce-b24a-db424141beea	2026-08-27 18:16:53.251618+00
bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb	683dbb3c-6b10-4c85-b3b2-87fdb500ddec	2026-08-27 18:21:22.670611+00
bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb	0730db42-332f-46d9-851d-e036c66fb8d6	2026-08-27 18:21:22.670611+00
bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb	cf73968f-4475-463c-933c-1bc678ed1ee9	2026-08-27 18:21:22.670611+00
cccccccc-cccc-cccc-cccc-cccccccccccc	683dbb3c-6b10-4c85-b3b2-87fdb500ddec	2026-08-27 18:21:22.670611+00
cccccccc-cccc-cccc-cccc-cccccccccccc	0730db42-332f-46d9-851d-e036c66fb8d6	2026-08-27 18:21:22.670611+00
cccccccc-cccc-cccc-cccc-cccccccccccc	b06e02ba-d274-4c83-9f22-bfbc992b6f03	2026-08-27 18:21:22.670611+00
cccccccc-cccc-cccc-cccc-cccccccccccc	48d9363a-a97b-49ce-b24a-db424141beea	2026-08-27 18:21:22.670611+00
aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	683dbb3c-6b10-4c85-b3b2-87fdb500ddec	2026-08-27 21:28:42.855784+00
bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb	b06e02ba-d274-4c83-9f22-bfbc992b6f03	2026-08-27 21:28:42.855784+00
\.


--
-- PostgreSQL database dump complete
--



-- PostgreSQL database dump complete
--

