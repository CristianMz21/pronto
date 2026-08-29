import { describe, it, expect, vi } from 'vitest'

import {
  computeEffectiveHours,
  checkSlotWithinHours,
  dayOfWeekFromDateString,
  DEFAULT_HOURS,
  type DayHours,
} from '@/lib/booking-availability'

// Drizzle mock for booking availability — replaces previous Supabase.from mocks (T014)
// db.query.businessHours.findMany now returns Drizzle rows with camelCase, mapped to DayHours for computeEffectiveHours
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      businessHours: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            {
              dayOfWeek: 1,
              isOpen: true,
              openTime: '09:00',
              closeTime: '19:00',
              breakStart: null,
              breakEnd: null,
            },
          ]),
      },
    },
  },
}))

describe('booking-availability — lib/booking-availability.ts', () => {
  it('DEFAULT_HOURS: Lun-Sáb abiertos 09:00-20:00, Dom cerrado', () => {
    // Nota: DEFAULT_HOURS es 09:00-20:00 Lun-Sáb, Dom cerrado (seed reality)
    expect(DEFAULT_HOURS.find((h) => h.day_of_week === 1)?.is_open).toBe(true)
    expect(DEFAULT_HOURS.find((h) => h.day_of_week === 0)?.is_open).toBe(false)
    expect(DEFAULT_HOURS.find((h) => h.day_of_week === 6)?.is_open).toBe(true)
  })

  it('computeEffectiveHours rellena días faltantes con default', () => {
    const partial: DayHours[] = [
      {
        day_of_week: 1,
        is_open: true,
        open_time: '08:00',
        close_time: '18:00',
        break_start: null,
        break_end: null,
      },
    ]
    const eff = computeEffectiveHours(partial)
    expect(eff).toHaveLength(7)
    expect(eff.find((h) => h.day_of_week === 1)?.open_time).toBe('08:00')
    expect(eff.find((h) => h.day_of_week === 2)?.open_time).toBe('09:00') // default
  })

  it('checkSlotWithinHours ok dentro de horario', () => {
    const day: DayHours = {
      day_of_week: 1,
      is_open: true,
      open_time: '09:00',
      close_time: '19:00',
      break_start: null,
      break_end: null,
    }
    expect(checkSlotWithinHours(day, '10:00', 45)).toEqual({ ok: true })
    expect(checkSlotWithinHours(day, '09:00', 60)).toEqual({ ok: true })
    expect(checkSlotWithinHours(day, '18:00', 60)).toEqual({ ok: true })
  })

  it('outside_hours si excede close_time', () => {
    const day: DayHours = {
      day_of_week: 1,
      is_open: true,
      open_time: '09:00',
      close_time: '19:00',
      break_start: null,
      break_end: null,
    }
    expect(checkSlotWithinHours(day, '18:30', 60)).toEqual({ ok: false, reason: 'outside_hours' })
    expect(checkSlotWithinHours(day, '08:30', 30)).toEqual({ ok: false, reason: 'outside_hours' })
  })

  it('break si cae en ventana de descanso', () => {
    const day: DayHours = {
      day_of_week: 1,
      is_open: true,
      open_time: '09:00',
      close_time: '19:00',
      break_start: '13:00',
      break_end: '14:00',
    }
    expect(checkSlotWithinHours(day, '13:30', 30)).toEqual({ ok: false, reason: 'break' })
    expect(checkSlotWithinHours(day, '12:45', 30)).toEqual({ ok: false, reason: 'break' }) // 12:45+30=13:15 overlap
    expect(checkSlotWithinHours(day, '14:00', 30)).toEqual({ ok: true }) // termina justo antes de break, empieza después
    expect(checkSlotWithinHours(day, '12:30', 30)).toEqual({ ok: true }) // termina justo antes de break
  })

  it('closed si is_open false o undefined', () => {
    const dayClosed: DayHours = {
      day_of_week: 0,
      is_open: false,
      open_time: '09:00',
      close_time: '19:00',
      break_start: null,
      break_end: null,
    }
    expect(checkSlotWithinHours(dayClosed, '10:00', 60)).toEqual({ ok: false, reason: 'closed' })
    expect(checkSlotWithinHours(undefined, '10:00', 60)).toEqual({ ok: false, reason: 'closed' })
  })

  it('dayOfWeekFromDateString es independiente de timezone', () => {
    // 2026-08-27 es jueves (4), 2026-08-30 domingo (0)
    expect(dayOfWeekFromDateString('2026-08-27')).toBe(4)
    expect(dayOfWeekFromDateString('2026-08-30')).toBe(0)
    expect(dayOfWeekFromDateString('2026-08-24')).toBe(1) // lunes
  })

  it('Drizzle businessHours rows map correctly to DayHours for computeEffectiveHours', async () => {
    // Simulate Drizzle camelCase rows as returned by db.query.businessHours.findMany
    const drizzleRows = [
      {
        dayOfWeek: 1,
        isOpen: true,
        openTime: '08:00',
        closeTime: '18:00',
        breakStart: null,
        breakEnd: null,
      },
      {
        dayOfWeek: 2,
        isOpen: true,
        openTime: '09:00',
        closeTime: '19:00',
        breakStart: '13:00',
        breakEnd: '14:00',
      },
    ]
    const dayHours: DayHours[] = drizzleRows.map((r) => ({
      day_of_week: r.dayOfWeek,
      is_open: r.isOpen,
      open_time: r.openTime,
      close_time: r.closeTime,
      break_start: r.breakStart,
      break_end: r.breakEnd,
    }))
    const eff = computeEffectiveHours(dayHours)
    expect(eff).toHaveLength(7)
    expect(eff.find((h) => h.day_of_week === 1)?.open_time).toBe('08:00')
    expect(eff.find((h) => h.day_of_week === 2)?.break_start).toBe('13:00')
    // Verify Drizzle mock was set up (supabase mock no longer needed)
    const { db } = await import('@/lib/db')
    expect(db.query.businessHours.findMany).toBeDefined()
  })
})
