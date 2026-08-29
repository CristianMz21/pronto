-- Миграция 035: Обеденный перерыв в рабочих часах (Фаза 1 — общий на весь бизнес)
--
-- Добавляет опциональные break_start/break_end в business_hours (по дню).
-- NULL/NULL = перерыва нет (текущее поведение всех существующих строк).
-- Формат такой же, как open_time/close_time: text "HH:MM".
--
-- Персональный перерыв по сотруднику — отдельная задача, сюда не входит.

alter table public.business_hours
  add column break_start text,
  add column break_end   text;
