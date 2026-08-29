import { describe, expect, it } from 'vitest'

import { checkSlotWithHolidays, checkSlotWithinLocation } from '@/lib/booking-availability'
import { getHolidaysForDate, isHoliday, isHolidayForLocation } from '@/lib/holidays'

describe('holidays', () => {
  const holidays = [
    { business_id: 'b1', location_id: null, date: '2026-12-25', reason: 'Navidad', is_open: false },
    {
      business_id: 'b1',
      location_id: 'loc-1',
      date: '2026-12-24',
      reason: 'Mantenimiento Norte',
      is_open: false,
    },
    {
      business_id: 'b1',
      location_id: null,
      date: '2026-01-01',
      reason: 'Año nuevo pero abierto',
      is_open: true,
    },
  ]

  it('isHoliday false when empty', () => {
    expect(isHoliday('2026-12-25', [])).toBe(false)
  })
  it('isHoliday true for closed holiday', () => {
    expect(isHoliday('2026-12-25', holidays as any)).toBe(true)
  })
  it('isHoliday false for is_open true', () => {
    expect(isHoliday('2026-01-01', holidays as any)).toBe(false)
  })
  it('isHolidayForLocation business-wide blocks all', () => {
    expect(isHolidayForLocation('2026-12-25', 'loc-1', holidays as any)).toBe(true)
    expect(isHolidayForLocation('2026-12-25', 'loc-2', holidays as any)).toBe(true)
    expect(isHolidayForLocation('2026-12-25', null, holidays as any)).toBe(true)
  })
  it('location-specific holiday only blocks that location', () => {
    expect(isHolidayForLocation('2026-12-24', 'loc-1', holidays as any)).toBe(true)
    expect(isHolidayForLocation('2026-12-24', 'loc-2', holidays as any)).toBe(false)
    expect(isHolidayForLocation('2026-12-24', null, holidays as any)).toBe(false)
  })
  it('getHolidaysForDate filters', () => {
    expect(getHolidaysForDate('2026-12-25', holidays as any).length).toBe(1)
  })
  it('checkSlotWithHolidays blocks holiday', () => {
    const dayHours = { day_of_week: 1, is_open: true, open_time: '09:00', close_time: '19:00' }
    const res = checkSlotWithHolidays(dayHours, '10:00', 60, '2026-12-25', [
      { date: '2026-12-25', is_open: false },
    ])
    expect(res.ok).toBe(false)
    expect((res as { reason: string }).reason).toBe('holiday')
  })
  it('checkSlotWithinLocation respects location', () => {
    const dayHours = { day_of_week: 1, is_open: true, open_time: '09:00', close_time: '19:00' }
    const holidaysCheck = [
      { date: '2026-12-24', is_open: false, location_id: 'loc-1' },
      { date: '2026-12-25', is_open: false, location_id: null },
    ]
    // loc-1 should be blocked on 24th
    expect(
      checkSlotWithinLocation(dayHours, '10:00', 60, {
        date: '2026-12-24',
        holidays: holidaysCheck as any,
        locationId: 'loc-1',
      }).ok,
    ).toBe(false)
    // loc-2 not blocked on 24th
    expect(
      checkSlotWithinLocation(dayHours, '10:00', 60, {
        date: '2026-12-24',
        holidays: holidaysCheck as any,
        locationId: 'loc-2',
      }).ok,
    ).toBe(true)
    // business-wide holiday blocks any location
    expect(
      checkSlotWithinLocation(dayHours, '10:00', 60, {
        date: '2026-12-25',
        holidays: holidaysCheck as any,
        locationId: 'loc-2',
      }).ok,
    ).toBe(false)
  })
})
