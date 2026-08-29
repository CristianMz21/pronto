import { describe, it, expect } from 'vitest'

import { buildGCalUrl } from '@/lib/gcal'
describe('gcal', () => {
  it('a', () => {
    expect(
      buildGCalUrl({
        businessName: 'B',
        serviceName: 'S',
        date: '2026-01-15',
        time: '10:00',
        durationMin: 30,
      }),
    ).toContain('calendar.google.com')
  })
})
