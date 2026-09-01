# Backup & Restore — Pronto Barber

**Fecha**: 2026-08-27 | **DB**: PostgreSQL 17 (Supabase) | **Frecuencia**: `pg_dump` nightly + PITR 7d | **RPO** 24h | **RTO** 1h

## 1. Local (supabase start)

```bash
# Dump completo (incl. auth, storage, tu data)
PGPASSWORD=postgres pg_dump -h 127.0.0.1 -p 54322 -U postgres -d postgres --clean --if-exists > backup-$(date +%F).sql
ls -lh backup-*.sql

# Restore (cuidado: borra y recrea)
supabase stop
supabase start  # o supabase db reset si solo quieres migraciones limpias sin data
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f backup-2026-08-27.sql
supabase status  # verificar 54321 OK
```

- `supabase db reset` = `DROP + CREATE` + reaplica `001..043` + `storage.buckets` (vacío) + `cron` (recrea). Útil para test limpio, **borra clientes/citas**.
- Para backup solo data (sin sistema): `pg_dump --data-only --table=public.businesses --table=public.employees ... > data.sql`

## 2. Cloud (Supabase Cloud) — PITR 7d

- Dashboard → **Database → Backups** → **PITR (Point-in-Time Recovery) 7 días** si plan Pro (automático, sin acción manual). Restaura a cualquier punto dentro de 7d.
- O `pg_dump` con `DATABASE_URL` Cloud (5432, `MIGRATE_SSL` con `certs/supabase-ca.crt`):
  ```bash
  # Usa la CA incluida: scripts/migrate.js ya lo hace, para pg_dump:
  PGPASSWORD=<db-password> pg_dump "postgresql://postgres.[ref]:[pwd]@db.[ref].supabase.co:5432/postgres?sslmode=require" > backup.sql
  # Restore Cloud:
  # Opción 1 — PITR Dashboard (recomendado): Database → Backups → Restore to point-in-time
  # Opción 2 — pg_restore:
  PGPASSWORD=<pwd> psql "postgresql://postgres.[ref]:[pwd]@db.[ref].supabase.co:5432/postgres?sslmode=require" -f backup.sql
  # Opción 3 — supabase linked:
  supabase link --project-ref <ref>
  supabase db reset --linked  # ATENCIÓN: borra y reaplica migraciones (vacía data); luego pg_restore
  ```

**RPO 24h**: con `pg_dump` nightly, pierdes máx 24h si PITR no disponible. **RTO 1h**: restore `pg_restore` o `supabase db reset --linked` + `psql` toma ~10-60m según tamaño.

## 3. Verificación restore

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -c "select count(*) from businesses; select count(*) from appointments; select count(*) from transactions;"
curl -s http://localhost:3000/api/health | jq
# Login con test@barber.local / Test1234! y abrir /book/barberia-demo
```

## 4. Migraciones

- Nuevas migraciones: crear `supabase/migrations/044_*.sql` (idempotente, `IF NOT EXISTS`), luego:
  ```bash
  supabase db reset  # local (aplica todo)
  # o para no borrar data:
  PGPASSWORD=postgres psql -h ... -f supabase/migrations/044_*.sql
  supabase gen types typescript --local 2>/dev/null > lib/supabase/database.types.ts
  ```
- Producción `scripts/migrate.js` (`MIGRATE_SSL` + `DATABASE_URL`) aplica solo pendientes vía `schema_migrations`

## 6. Tablas nuevas 006 + 009 (incluir en pg_dump --data-only si es parcial)

Para backups parciales `--data-only --table=` incluir además:

```bash
-- 006
--table=public.locations --table=public.holidays --table=public.waitlist --table=public.recurring_appointments \
--table=public.tips --table=public.memberships --table=public.client_memberships --table=public.promotions \
--table=public.loyalty_accounts --table=public.loyalty_movements --table=public.campaigns --table=public.campaign_recipients \
--table=public.service_combos --table=public.client_tags --table=public.tags --table=public.transaction_items --table=public.business_settings
# 009 Customer 360
--table=public.favorites --table=public.client_styles --table=public.reviews --table=public.gift_cards
# appointments new columns: checkin_code, payment_status, deposit_amount, guest_name (en appointments)
# clients new columns: preferences, status, preferred_barber_id, notification_prefs (en clients)
```

 Índices nuevos (`086 idx_appointments_employee_starts` etc. + `095 idx_appointments_client_starts/upcoming/payment_status`) se recrean al aplicar migraciones; no requieren dump separado.

## 5. Frecuencia recomendada — RPO 24h / RTO 1h

- **Nightly** `pg_dump` cron en VPS (`crontab -e`: `0 3 * * * PGPASSWORD=... pg_dump "postgresql://..." | gzip > /backups/backup-$(date +\%F).sql.gz`) — RPO 24h
- **PITR 7d** Supabase Cloud Pro (automático) — RPO ~0 (point-in-time), RTO ~15m
- **Semanal** `supabase db dump` + copia off-site (S3/R2) — retención 30d
- **Pre-deploy** siempre dump antes de `docker compose up --build`
- **Verificación**: restaura en staging cada mes (`supabase db reset --linked` o `pg_restore`) y verifica `select count(*) from businesses` y `curl /api/health`

**Restore local**: `supabase db reset` (borra data, reaplica 001..050) + `psql -f backup.sql` si necesitas data. **Restore Cloud**: `supabase db reset --linked` (vacía) o `pg_restore` directo; PITR no borra schema, solo restaura datos al punto elegido.
