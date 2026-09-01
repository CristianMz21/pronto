import { describe, expect, it, vi, beforeEach } from 'vitest'

import { isFavorite, toggleInMemory, nextAvailability, FavoriteSchema } from '@/lib/favorites'
import type { DayHours } from '@/lib/booking-availability'

describe('favorites — lib/favorites.ts', () => {
  const clientId = '11111111-1111-4111-a111-111111111111'
  const employeeId = '22222222-2222-4111-a222-222222222222'
  const employeeId2 = '33333333-3333-4111-a333-333333333333'

  it('FavoriteSchema validates uuids', () => {
    expect(FavoriteSchema.safeParse({ client_id: clientId, employee_id: employeeId }).success).toBe(
      true,
    )
    expect(FavoriteSchema.safeParse({ client_id: 'bad', employee_id: employeeId }).success).toBe(
      false,
    )
  })

  it('isFavorite checks existence', () => {
    const list = [{ client_id: clientId, employee_id: employeeId }]
    expect(isFavorite(list, clientId, employeeId)).toBe(true)
    expect(isFavorite(list, clientId, employeeId2)).toBe(false)
    expect(isFavorite([], clientId, employeeId)).toBe(false)
  })

  it('toggleInMemory adds and removes', () => {
    const list = [{ client_id: clientId, employee_id: employeeId }]
    const removed = toggleInMemory(list, { client_id: clientId, employee_id: employeeId })
    expect(removed.added).toBe(false)
    expect(removed.next).toHaveLength(0)

    const added = toggleInMemory([], { client_id: clientId, employee_id: employeeId2 })
    expect(added.added).toBe(true)
    expect(added.next).toEqual([{ client_id: clientId, employee_id: employeeId2 }])

    expect(() =>
      toggleInMemory([], { client_id: 'bad', employee_id: employeeId } as unknown as {
        client_id: string
        employee_id: string
      }),
    ).toThrow()
  })

  it('nextAvailability finds next slot within business hours America/Bogota', () => {
    // Business open Mon-Sat 09:00-20:00, break 13-14, from 2026-09-01 10:00 UTC (which is 05:00 Bogota)
    const hours: DayHours[] = [
      {
        day_of_week: 0,
        is_open: false,
        open_time: '09:00',
        close_time: '20:00',
        break_start: null,
        break_end: null,
      },
      {
        day_of_week: 1,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: '13:00',
        break_end: '14:00',
      },
      {
        day_of_week: 2,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: null,
        break_end: null,
      },
      {
        day_of_week: 3,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: null,
        break_end: null,
      },
      {
        day_of_week: 4,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: null,
        break_end: null,
      },
      {
        day_of_week: 5,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: null,
        break_end: null,
      },
      {
        day_of_week: 6,
        is_open: true,
        open_time: '09:00',
        close_time: '20:00',
        break_start: null,
        break_end: null,
      },
    ]
    // 2026-09-01 is Monday (1) — leap check: 2026-09-01 UTC is Tuesday? Let's use deterministic fromDate
    const fromDate = new Date('2026-09-01T14:00:00.000Z') // 09:00 Bogota
    // No booked slots -> should find 09:30 or 10:00 slot same day
    const next = nextAvailability({
      businessHours: hours,
      bookedSlots: [],
      fromDate,
      timezone: 'America/Bogota',
    })
    expect(next).toBeTruthy()
    expect(new Date(next as string).getTime()).toBeGreaterThan(fromDate.getTime())

    // If all slots booked today, should find next day
    const booked: { starts_at: string; ends_at: string }[] = []
    // Book every 30m slot from 09:00 to 20:00 on 2026-09-01 in Bogota time
    // Convert Bogota 09:00 -> UTC 14:00
    for (let min = 9 * 60; min < 20 * 60; min += 30) {
      const h = Math.floor(min / 60),
        m = min % 60
      // 2026-09-01 in Bogota: UTC = local - offset (-5)
      // So 09:00 Bogota = 14:00 UTC, 09:30 = 14:30 UTC etc.
      // Break 13-14 Bogota = 18-19 UTC -> skip but still book for test fullness
      const start = new Date(Date.UTC(2026, 8, 1, h + 5, m, 0))
      const end = new Date(start.getTime() + 30 * 60_000)
      booked.push({ starts_at: start.toISOString(), ends_at: end.toISOString() })
    }
    const next2 = nextAvailability({
      businessHours: hours,
      bookedSlots: booked,
      fromDate,
      timezone: 'America/Bogota',
    })
    // Should be next day 2026-09-02
    expect(next2).toBeTruthy()
    expect((next2 as string).slice(0, 10)).toBe('2026-09-02')
  })

  it('nextAvailability returns null if business closed all week', () => {
    const closed: DayHours[] = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
      day_of_week: dow,
      is_open: false,
      open_time: '09:00',
      close_time: '20:00',
      break_start: null,
      break_end: null,
    }))
    expect(
      nextAvailability({
        businessHours: closed,
        bookedSlots: [],
        fromDate: new Date('2026-09-01T12:00:00Z'),
      }),
    ).toBeNull()
  })

  it('nextAvailability respects break window', () => {
    const hours: DayHours[] = [
      {
        day_of_week: 1,
        is_open: true,
        open_time: '09:00',
        close_time: '17:00',
        break_start: '12:00',
        break_end: '13:00',
      },
      {
        day_of_week: 2,
        is_open: true,
        open_time: '09:00',
        close_time: '17:00',
        break_start: null,
        break_end: null,
      },
      {
        day_of_week: 3,
        is_open: true,
        open_time: '09:00',
        close_time: '17:00',
        break_start: null,
        break_end: null,
      },
      {
        day_of_week: 4,
        is_open: true,
        open_time: '09:00',
        close_time: '17:00',
        break_start: null,
        break_end: null,
      },
      {
        day_of_week: 5,
        is_open: true,
        open_time: '09:00',
        close_time: '17:00',
        break_start: null,
        break_end: null,
      },
      {
        day_of_week: 6,
        is_open: false,
        open_time: '09:00',
        close_time: '17:00',
        break_start: null,
        break_end: null,
      },
      {
        day_of_week: 0,
        is_open: false,
        open_time: '09:00',
        close_time: '17:00',
        break_start: null,
        break_end: null,
      },
    ]
    // From Monday 11:00 Bogota -> 16:00 UTC
    const fromDate = new Date('2026-08-31T16:00:00.000Z') // 2026-08-31 is Monday 11:00 Bogota
    const next = nextAvailability({
      businessHours: hours,
      bookedSlots: [],
      fromDate,
      timezone: 'America/Bogota',
      slotDurationMin: 30,
    })
    // 12:00 break -> should skip 12:00 slot, return 13:00
    expect(next).toBeTruthy()
    // Validate not 12:00
    const iso = next as string
    const d = new Date(iso)
    const bogotaHour = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      hour12: false,
    }).format(d)
    expect(bogotaHour).not.toBe('12')
  })

  it('toggleFavorite DB helper mocked', async () => {
    const { toggleFavorite } = await import('@/lib/favorites')

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'favorites') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    client_id: clientId,
                    employee_id: employeeId,
                    created_at: new Date().toISOString(),
                  },
                  error: null,
                })),
              })),
            })),
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ error: null })),
              })),
            })),
          } as unknown as never
        }
        return {} as unknown as never
      }),
    } as unknown as Parameters<typeof toggleFavorite>[0]

    const resAdd = await toggleFavorite(mockSupabase, {
      client_id: clientId,
      employee_id: employeeId,
    })
    expect(resAdd.added).toBe(true)
  })
})
