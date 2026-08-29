-- Remove the overly permissive public read policy on businesses.
-- The booking page (app/book/[slug]) is a Next.js server component that now uses
-- the service role client to fetch business data server-side — no anon access needed.
-- This closes the full-table read exposure including smtp_pass, resend_api_key, bot tokens, etc.

DROP POLICY IF EXISTS "public_read_businesses_for_booking" ON public.businesses;
