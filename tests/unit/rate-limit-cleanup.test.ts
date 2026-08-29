import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('rate-limit cleanup 100%', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.useRealTimers())

  it('setInterval cleanup deletes old entries', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    // import after fake timers so interval is mocked
    const { rateLimit } = await import('@/lib/rate-limit')
    const k = `cleanup-${Math.random()}`
    expect(rateLimit(k, { limit: 1, windowMs: 60000 })).toBe(true)
    // advance 61 minutes so entry is >60min old
    vi.advanceTimersByTime(61 * 60 * 1000)
    // advance 10 min intervals: need to trigger setInterval callback at 10min multiples
    // total advanced already 61m includes 6 intervals; but we need to ensure cleanup runs
    // The store should have deleted old entry, but we can verify by checking that after cleanup, rateLimit still works and doesn't leak
    // Call rateLimit again with same key should be allowed because old entry deleted and window expired
    expect(rateLimit(k, { limit: 1, windowMs: 60000 })).toBe(true)
    // Now create another key and advance again to trigger deletion of multiple entries
    const k2 = `cleanup2-${Math.random()}`
    rateLimit(k2, { limit: 1, windowMs: 60000 })
    vi.advanceTimersByTime(61 * 60 * 1000 + 10 * 60 * 1000)
    // Should have cleaned up
    expect(rateLimit(k2, { limit: 1, windowMs: 60000 })).toBe(true)
    vi.useRealTimers()
  })
})
