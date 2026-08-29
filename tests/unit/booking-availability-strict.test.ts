import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  checkSlotWithinHours,
  computeEffectiveHours,
  DEFAULT_HOURS,
  dayOfWeekFromDateString,
} from '@/lib/booking-availability'

describe('booking-availability strict 100%', () => {
  describe('DEFAULT_HOURS', () => {
    it('7 days', () => {
      expect(DEFAULT_HOURS.length).toBe(7)
    })
    it('Sun closed, Mon-Sat open', () => {
      expect(DEFAULT_HOURS[0].is_open).toBe(false) // Sunday 0
      for (let i = 1; i <= 6; i++) expect(DEFAULT_HOURS[i].is_open).toBe(true)
      expect(DEFAULT_HOURS[1].open_time).toBe('09:00')
      expect(DEFAULT_HOURS[1].close_time).toBe('20:00')
    })
  })
  describe('computeEffectiveHours', () => {
    it('empty -> defaults', () => {
      const h = computeEffectiveHours([])
      expect(h.length).toBe(7)
      expect(h[0]).toEqual(DEFAULT_HOURS[0])
    })
    it('fills missing days', () => {
      const custom = [
        {
          day_of_week: 1,
          is_open: false,
          open_time: '10:00',
          close_time: '18:00',
          break_start: null,
          break_end: null,
        },
      ]
      const h = computeEffectiveHours(custom as any)
      expect(h[1].is_open).toBe(false)
      expect(h[2]).toEqual(DEFAULT_HOURS[2])
      expect(h[0]).toEqual(DEFAULT_HOURS[0])
    })
    it('keeps all provided', () => {
      const all = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        day_of_week: d,
        is_open: true,
        open_time: '08:00',
        close_time: '22:00',
        break_start: null,
        break_end: null,
      }))
      const h = computeEffectiveHours(all as any)
      expect(h.every((x) => x.open_time === '08:00')).toBe(true)
    })
    it('preserves provided break', () => {
      const custom = [
        {
          day_of_week: 3,
          is_open: true,
          open_time: '09:00',
          close_time: '20:00',
          break_start: '12:00',
          break_end: '13:00',
        },
      ]
      const h = computeEffectiveHours(custom as any)
      expect(h[3].break_start).toBe('12:00')
    })
  })
  describe('checkSlotWithinHours', () => {
    it('undefined -> closed', () => {
      expect(checkSlotWithinHours(undefined, '10:00', 30)).toEqual({ ok: false, reason: 'closed' })
    })
    it('is_open false -> closed', () => {
      expect(
        checkSlotWithinHours(
          { day_of_week: 1, is_open: false, open_time: '09:00', close_time: '20:00' },
          '10:00',
          30,
        ).ok,
      ).toBe(false)
    })
    it('slot exactly at open', () => {
      const dh = {
        day_of_week: 1,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: null,
        break_end: null,
      }
      expect(checkSlotWithinHours(dh, '09:00', 30)).toEqual({ ok: true })
    })
    it('slot exactly at closeEnd', () => {
      const dh = {
        day_of_week: 1,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: null,
        break_end: null,
      }
      expect(checkSlotWithinHours(dh, '19:30', 30)).toEqual({ ok: true })
      expect(checkSlotWithinHours(dh, '19:31', 30)).toEqual({ ok: false, reason: 'outside_hours' })
    })
    it('before open -> outside_hours', () => {
      const dh = {
        day_of_week: 1,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: null,
        break_end: null,
      }
      expect(checkSlotWithinHours(dh, '08:30', 30)).toEqual({ ok: false, reason: 'outside_hours' })
    })
    it('after close -> outside_hours', () => {
      const dh = {
        day_of_week: 1,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: null,
        break_end: null,
      }
      expect(checkSlotWithinHours(dh, '20:00', 30)).toEqual({ ok: false, reason: 'outside_hours' })
    })
    it('break overlap -> break', () => {
      const dh = {
        day_of_week: 1,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: '12:00',
        break_end: '13:00',
      }
      expect(checkSlotWithinHours(dh, '12:30', 30)).toEqual({ ok: false, reason: 'break' })
      expect(checkSlotWithinHours(dh, '11:45', 30)).toEqual({ ok: false, reason: 'break' }) // overlaps start
      expect(checkSlotWithinHours(dh, '12:00', 60)).toEqual({ ok: false, reason: 'break' })
    })
    it('break exactly touching no overlap', () => {
      const dh = {
        day_of_week: 1,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: '12:00',
        break_end: '13:00',
      }
      expect(checkSlotWithinHours(dh, '11:00', 60)).toEqual({ ok: true }) // ends at 12:00 exactly
      expect(checkSlotWithinHours(dh, '13:00', 30)).toEqual({ ok: true }) // starts at breakEnd
    })
    it('no break defined (null) -> ok even at break time', () => {
      const dh = {
        day_of_week: 1,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: null,
        break_end: null,
      }
      expect(checkSlotWithinHours(dh, '12:30', 30)).toEqual({ ok: true })
    })
    it('only break_start without break_end -> no break check', () => {
      const dh = {
        day_of_week: 1,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: '12:00',
        break_end: null,
      } as any
      expect(checkSlotWithinHours(dh, '12:30', 30)).toEqual({ ok: true })
    })
    it('only break_end without break_start -> no break', () => {
      const dh = {
        day_of_week: 1,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: null,
        break_end: '13:00',
      } as any
      expect(checkSlotWithinHours(dh, '12:30', 30)).toEqual({ ok: true })
    })
    it('duration 0 at open', () => {
      const dh = {
        day_of_week: 1,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: null,
        break_end: null,
      }
      expect(checkSlotWithinHours(dh, '09:00', 0)).toEqual({ ok: true })
    })
    it('property: result is always {ok:true} or {ok:false,reason}', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 6 }),
          fc.string(),
          fc.integer({ min: 0, max: 1440 }),
          (dow, time, dur) => {
            const dh = {
              day_of_week: dow,
              is_open: true,
              open_time: '09:00',
              close_time: '20:00',
              break_start: null,
              break_end: null,
            }
            const r = checkSlotWithinHours(dh, time, dur as any)
            expect([true, false]).toContain(r.ok)
            if (!r.ok) expect(['closed', 'outside_hours', 'break']).toContain((r as any).reason)
          },
        ),
      )
    })
  })
  describe('dayOfWeekFromDateString', () => {
    it('known dates', () => {
      expect(dayOfWeekFromDateString('2026-01-01')).toBe(new Date(Date.UTC(2026, 0, 1)).getUTCDay())
      expect(dayOfWeekFromDateString('2024-02-29')).toBe(4) // 2024-02-29 Thursday
      expect(dayOfWeekFromDateString('2026-01-15')).toBe(
        new Date(Date.UTC(2026, 0, 15)).getUTCDay(),
      )
    })
    it('invalid date -> NaN via getUTCDay? Actually new Date(NaN).getUTCDay() => NaN', () => {
      const v = dayOfWeekFromDateString('invalid')
      expect(Number.isNaN(v)).toBe(true)
    })
    it('empty', () => {
      const v = dayOfWeekFromDateString('')
      expect(Number.isNaN(v)).toBe(true)
    })
  })
})
