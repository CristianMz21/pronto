-- Миграция 013: флаг завершения онбординга
--
-- onboarding_completed = true означает, что пользователь прошёл wizard при первом входе.
-- Используется для редиректа: новые пользователи → /onboarding, вернувшиеся → /dashboard.

alter table public.businesses
  add column if not exists onboarding_completed boolean not null default false;
