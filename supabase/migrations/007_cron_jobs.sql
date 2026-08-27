-- Миграция 007: Автоматический планировщик уведомлений (pg_cron + pg_net)
--
-- Что это делает:
--   Создаёт задачу внутри базы данных Supabase, которая каждые 15 минут
--   автоматически вызывает /api/cron/notify — отправляет напоминания о записях,
--   благодарности после визита, поздравления с днём рождения и т.д.
--
-- ВАЖНО — перед запуском этого файла:
--
--   1. Включите расширение pg_cron в Supabase Dashboard:
--      Database → Extensions → найдите "pg_cron" → включите (Toggle ON)
--
--   2. Убедитесь что расширение pg_net тоже включено:
--      Database → Extensions → "pg_net" → должно быть включено (обычно уже включено)
--
--   3. ЗАМЕНИТЕ два значения-заглушки в этом файле:
--      - YOUR_APP_URL  → ваш реальный домен, например: https://myapp.com
--      - YOUR_CRON_SECRET → значение CRON_SECRET из вашего файла .env
--
--   4. Запустите этот файл в Supabase Dashboard → SQL Editor
--
-- ─────────────────────────────────────────────────────────────────────────────

-- Local-safe wrapper: skip if pg_cron/pg_net not available (e.g. supabase local without extensions)
-- Production (scripts/migrate.js) does env substitution for ${NEXT_PUBLIC_APP_URL}/${CRON_SECRET}
-- and treats this file as optional; local supabase start without pg_cron should just NOTICE and continue.
DO $pronto_outer$
BEGIN
  -- Try to enable extensions if available; if not, skip gracefully
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '007_cron_jobs: pg_cron not available (%), skipping pronto-notify job', SQLERRM;
    RETURN;
  END;
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA net;
  EXCEPTION WHEN OTHERS THEN
    -- supabase local may place pg_net in extensions schema; try that
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '007_cron_jobs: pg_net not available (%), skipping pronto-notify job', SQLERRM;
      RETURN;
    END;
  END;

  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
    RAISE NOTICE '007_cron_jobs: cron schema missing, skipping';
    RETURN;
  END IF;

  -- Remove existing job if present
  BEGIN
    PERFORM cron.unschedule('pronto-notify');
  EXCEPTION WHEN OTHERS THEN
    -- job doesn't exist yet, ignore
    NULL;
  END;

  -- Schedule: every 15 min -> /api/cron/notify
  -- Note: ${NEXT_PUBLIC_APP_URL} and ${CRON_SECRET} are substituted by scripts/migrate.js in production.
  -- For local supabase start (no substitution), use a placeholder that won't break; external cron is preferred locally.
  PERFORM cron.schedule(
    'pronto-notify',
    '*/15 * * * *',
    $$
    select net.http_get(
      url     := '${NEXT_PUBLIC_APP_URL}/api/cron/notify',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ${CRON_SECRET}'
      )
    ) as request_id;
    $$
  );
END $pronto_outer$;

-- После запуска можно проверить что задача создана:
-- SELECT * FROM cron.job WHERE jobname = 'pronto-notify';
--
-- Посмотреть историю запусков (последние выполнения):
-- SELECT * FROM cron.job_run_details WHERE jobname = 'pronto-notify' ORDER BY start_time DESC LIMIT 10;
