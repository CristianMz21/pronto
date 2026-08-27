--
-- PostgreSQL database dump
--

\restrict P88cT1uHujQu6S6B9AEm4iRIYCIGfHJDRTi7F9hm3UwCMFk00bETBk0ZKGp7kuS

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

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
-- Data for Name: businesses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.businesses (id, owner_id, name, slug, type, phone, email, address, timezone, currency, logo_url, plan, plan_expires_at, telegram_bot_token, viber_bot_token, created_at, updated_at, telegram_chat_id, ls_subscription_id, ls_customer_id, ls_variant_id, viber_chat_id, owner_whatsapp, onboarding_completed, email_provider, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, resend_api_key, brand_color, enabled_modules, notification_language, meta_whatsapp_phone_number_id, meta_whatsapp_access_token, wa_template_confirmation, wa_template_reminder, wa_template_thankyou, wa_template_reactivation, wa_template_birthday, wa_template_language) FROM stdin;
48e04ab8-7dee-4526-b98f-45a262218869	ceccb7fb-36de-46ca-b539-573ce8421e5e	Cristain	cristain	barbershop	\N	\N	\N	UTC	USD	\N	free	\N	\N	\N	2026-08-27 18:13:17.894741+00	2026-08-27 18:13:39.949871+00	\N	\N	\N	\N	\N	\N	t	\N	\N	587	\N	\N	\N	\N	#2D2926	{bookings,pos,crm,inventory,notifications}	en	\N	\N	\N	\N	\N	\N	\N	en
17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	b8f773b2-11e7-40d0-8f52-929b480d42b8	Escudería	escuderia	barbershop	+57 300 123 4567	\N	Colombia	America/Bogota	COP	\N	free	\N	\N	\N	2026-08-27 17:43:26.150942+00	2026-08-27 18:16:42.898333+00	\N	\N	\N	\N	\N	\N	t	\N	\N	587	\N	\N	\N	\N	#1a1a1a	{bookings,pos,crm,inventory,notifications}	es	\N	\N	\N	\N	\N	\N	\N	en
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
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employees (id, business_id, user_id, name, role, phone, email, avatar_url, is_active, created_at, color, specialties, commission_rate, commission_fixed, bio) FROM stdin;
9e8eb213-7bff-481d-bf46-175e5dba458a	48e04ab8-7dee-4526-b98f-45a262218869	\N	Zaidarellano21	employee	\N	zaidarellano21@gmail.com	\N	t	2026-08-27 18:13:17.906167+00	\N	{}	\N	\N	\N
f822de0d-ca09-42dd-bea1-76b2ca334d7e	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	\N	Escudería Owner	owner	+57 300 123 4567	test@barber.local	\N	t	2026-08-27 17:43:26.183513+00	#1a1a1a	{corte,barba,combo}	50.00	\N	\N
aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	17c1a2b5-5d3b-4d84-bbb1-d361077d4c95	\N	Ana Escudería	barber	\N	\N	\N	t	2026-08-27 17:57:31.020966+00	#ec4899	{barba,cejas}	50.00	10000.00	\N
\.


--
-- Data for Name: services; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.services (id, business_id, name, description, price, duration_min, category, is_active, created_at, capacity, cost, color, is_featured) FROM stdin;
fd38b05e-238e-48e2-a49c-5f0312597c06	48e04ab8-7dee-4526-b98f-45a262218869	Corte de cabello	\N	15000.00	60	\N	t	2026-08-27 18:13:39.958602+00