import { describe, it, expect, vi } from 'vitest'
import { buildGCalUrl } from '@/lib/gcal'

describe('gcal adversarial - cubrir líneas 30-31', () => {
  it('fuerza Date.UTC NaN para cubrir fallback isNaN', () => {
    const origUTC = Date.UTC
    vi.spyOn(Date, 'UTC').mockReturnValue(NaN)
    const url = buildGCalUrl({ businessName: 'B', serviceName: 'S', date: '2026-01-15', time: '10:00', durationMin: 30 })
    expect(url).toContain('calendar.google.com')
    expect(url).toContain('20260115T100000')
    vi.mocked(Date.UTC).mockRestore()
  })

  it('mock Date isNaN via getTime', () => {
    const orig = Date.prototype.getTime
    Date.prototype.getTime = vi.fn().mockReturnValue(NaN)
    const url = buildGCalUrl({ businessName: 'B', serviceName: 'S', date: '2026-01-15', time: '10:00', durationMin: 30 })
    expect(url).toContain('calendar.google.com')
    Date.prototype.getTime = orig
  })
})
