# Data Model: Customer 360

**Branch**: `009-customer-360` | **Date**: 2026-09-01 | **Spec**: `spec.md`

## ERD (text)

```
Business 1--* Location
Business 1--* Client
Client 1--* Appointment
Client 1--* Favorite (M2M Employee)
Client 1--1 LoyaltyAccount
Client 1--* ClientMembership
Client 1--* ClientStyle
Client 1--* Review (via Appointment)
Client 1--* Waitlist
Client 1--* GiftCard (purchaser)
Appointment 1--0..1 Review (unique)
Appointment *--1 Service
Appointment *--0..1 Employee (barber)
Service *--* Employee (employee_services)
```

## Tables

### Alter: clients (088)

```sql
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active','inactive','VIP'));
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_barber_id uuid REFERENCES employees(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT '{"whatsapp":true,"email":true,"push":true}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_clients_preferred_barber ON clients(preferred_barber_id);
```

RLS: `USING (business_id IN (SELECT my_business_ids()))` ya; add `FOR UPDATE USING` same.

### New: favorites (089)

```sql
CREATE TABLE IF NOT EXISTS favorites (
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (client_id, employee_id)
);
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_access_favorites ON favorites FOR ALL USING (EXISTS (SELECT 1 FROM clients c WHERE c.id=client_id AND c.business_id IN (SELECT my_business_ids())));
```

### New: client_styles (090)

```sql
CREATE TABLE IF NOT EXISTS client_styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id),
  employee_id uuid REFERENCES employees(id),
  photo_url text NOT NULL,
  notes text,
  is_favorite boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE client_styles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_access_client_styles ON client_styles FOR ALL USING (business_id IN (SELECT my_business_ids()));
CREATE INDEX IF NOT EXISTS idx_client_styles_client ON client_styles(client_id);
```

Storage: bucket `client-styles` `public false` `file_size_limit 5MB` RLS `bucket_id='client-styles'`.

### New: reviews (091)

```sql
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  tags text[] DEFAULT '{}',
  comment text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_access_reviews ON reviews FOR ALL USING (business_id IN (SELECT my_business_ids()));
CREATE INDEX IF NOT EXISTS idx_reviews_business ON reviews(business_id);
```

Check: only `appointments.status='completed'` allowed via trigger or API guard `isPastInTz`.

### Alter: appointments (092)

```sql
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS checkin_code text UNIQUE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','deposit_paid','paid','failed'));
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_amount integer DEFAULT 0 CHECK (deposit_amount >=0);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS guest_name text;
CREATE INDEX IF NOT EXISTS idx_appointments_checkin ON appointments(checkin_code);
```

Generate: `nanoid(8)` en `app/api/book` insert.

### New: gift_cards (093) — schema only V1

```sql
CREATE TABLE IF NOT EXISTS gift_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  amount integer NOT NULL CHECK (amount >0),
  balance integer NOT NULL CHECK (balance >=0),
  purchaser_client_id uuid REFERENCES clients(id),
  recipient_name text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE gift_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_access_gift_cards ON gift_cards FOR ALL USING (business_id IN (SELECT my_business_ids()));
```

### Storage (094)

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('client-styles','client-styles', false) ON CONFLICT (id) DO NOTHING;
```

## Migrations Order

`088_preferences` → `089_favorites` → `090_styles` → `091_reviews` → `092_checkin` → `093_gift_cards` → `094_storage`

All `IF NOT EXISTS` + `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL END $$` idempotente.

## Indexes & Constraints

- `appointments(business_id, starts_at)` exists `idx_appointments_business_starts` + `idx_appointments_employee_starts` — reuse.
- `reviews.appointment_id UNIQUE` prevents double review race + advisory lock.

## RLS Verification

After `supabase db reset --local` → `supabase Advisors` 0 flags; `anon` cannot `SELECT favorites`; `barber` can only own `client_id` via `user_id` link.

