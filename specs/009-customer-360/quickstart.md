# Quickstart: Customer 360

**Branch**: `009-customer-360` | **Date**: 2026-09-01

## Prerequisites

- Docker, `supabase` CLI, `NEXT_PUBLIC_DEPLOYMENT_MODE=selfhosted`, `ADMIN_SECRET_PATH=/escuderito-admin`
- `npm i` + `supabase start` + `npm run db:seed` (creates `escuderia` business, 3 locations not yet but Centro exists)

## Setup

```bash
cp .env.example .env # set local keys
supabase start # 54321/54322
npm run db:seed:ultra # 2000 clients etc
docker compose up -d --build
open http://localhost:3000/ # → 307 /book/escuderia (client-first)
```

## Verification Steps

### 1. DB Migrations 088..094

```bash
supabase db reset --local # applies 088..094 idempotente
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "\d favorites; \d client_styles; \d reviews; \d gift_cards"
# expect 4 tables
```

### 2. API `GET /api/client/me`

```bash
# anon via phone
curl "http://127.0.0.1:3000/api/client/me?phone=%2B573001234567" | jq
# expect {client, upcoming, history, loyalty, memberships, favorites}

# auth via cookie (login as test@barber.local then curl with cookie)
curl -s -H "Cookie: sb-127-auth-token=..." http://127.0.0.1:3000/api/client/me | jq .upcoming[0].status
```

### 3. Booking Any barber + Check-in

```bash
curl -X POST http://127.0.0.1:3000/api/book -H "Content-Type: application/json" -d '{"slug":"escuderia","service_id":"<svc>","employee_id":null,"starts_at":"2026-09-02T15:00:00-05:00","name":"Test","phone":"+573001111111"}'
# → 201 confirmed, checkin_code returned
curl -X POST http://127.0.0.1:3000/api/client/check-in -H "Content-Type: application/json" -d '{"appointment_id":"<id>"}' -H "Cookie: ..."
# → 200 checked_in
```

### 4. Review

```bash
# after completed (staff PATCH to completed)
curl -X POST http://127.0.0.1:3000/api/reviews -H "Content-Type: application/json" -d '{"appointment_id":"<id>","rating":5,"tags":["Atención","Corte"],"comment":"Excelente"}' -H "Cookie: ..."
# → 201
curl http://127.0.0.1:3000/api/reviews?client_id=<id> | jq
```

### 5. Preferences & Favorites

```bash
curl -X PUT http://127.0.0.1:3000/api/client/preferences -d '{"preferences":{"cut":"Low Fade","clipper":"#1→#2"}}' -H "Cookie: ..."
curl -X POST http://127.0.0.1:3000/api/client/favorites -d '{"employee_id":"<carlos>"}' -H "Cookie: ..."
curl http://127.0.0.1:3000/api/client/favorites | jq
```

### 6. Fotos

```bash
curl -X POST http://127.0.0.1:3000/api/client/styles -F "photo=@/tmp/corte.jpg" -F "service_id=<id>" -H "Cookie: ..."
# → 201 photo_url signed URL
```

### 7. Waitlist

```bash
curl -X POST http://127.0.0.1:3000/api/waitlist -d '{"service_id":"<id>","employee_id":"<carlos>","desired_at":"2026-09-01T17:00:00-05:00"}' | jq
# cancel an appointment and watch notifyNext
```

### 8. E2E

```bash
npm run test:e2e -- tests/e2e/client-360.spec.ts
# expect reserve→checkin→review green
```

## Rollback

```bash
supabase db reset --local # drops 088..094 if IF NOT EXISTS not used, but they are idempotente, so manual:
psql -c "DROP TABLE IF EXISTS favorites, client_styles, reviews, gift_cards CASCADE; ALTER TABLE clients DROP COLUMN IF EXISTS preferences, status, preferred_barber_id, notification_prefs; ALTER TABLE appointments DROP COLUMN IF EXISTS checkin_code, payment_status, deposit_amount, guest_name;"
```

