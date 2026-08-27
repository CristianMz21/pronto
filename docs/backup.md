# Backup & Restore — Pronto Barber

**Fecha**: 2026-08-27 | **DB**: PostgreSQL 17 (Supabase)

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

## 2. Cloud (Supabase Cloud)

- Dashboard → **Database → Backups** → PITR (Point-in-Time Recovery) si plan Pro
- O `pg_dump` con `DATABASE_URL` Cloud (5432, `MIGRATE_SSL` con `certs/supabase-ca.crt`):
  ```bash
  # Usa la CA incluida: scripts/migrate.js ya lo hace, para pg_dump:
  PGPASSWORD=<db-password> pg_dump "postgresql://postgres.[ref]:[pwd]@db.[ref].supabase.co:5432/postgres?sslmode=require" > backup.sql
  ```

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

## 5. Frecuencia recomendada

- **Diario** `pg_dump` cron en VPS (`crontab -e`: `0 3 * * * pg_dump ... | gzip > /backups/...`)
- **Semanal** `supabase db dump` + copia off-site (S3/R2)
- **Pre-deploy** siempre dump antes de `docker compose up --build`
