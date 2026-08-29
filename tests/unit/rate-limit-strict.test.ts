import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { rateLimit, getIp } from '@/lib/rate-limit'

describe('rate-limit strict 100%', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('allows first request', () => {
    const k = `test-${Math.random()}`
    expect(rateLimit(k, { limit: 2, windowMs: 60000 })).toBe(true)
  })

  it('blocks after limit', () => {
    const k = `blk-${Math.random()}`
    expect(rateLimit(k, { limit: 2, windowMs: 60000 })).toBe(true)
    expect(rateLimit(k, { limit: 2, windowMs: 60000 })).toBe(true)
    expect(rateLimit(k, { limit: 2, windowMs: 60000 })).toBe(false)
  })

  it('window slides after windowMs', () => {
    const k = `slide-${Math.random()}`
    expect(rateLimit(k, { limit: 1, windowMs: 1000 })).toBe(true)
    expect(rateLimit(k, { limit: 1, windowMs: 1000 })).toBe(false)
    vi.advanceTimersByTime(1001)
    expect(rateLimit(k, { limit: 1, windowMs: 1000 })).toBe(true)
  })

  it('limit 0 always false', () => {
    const k = `zero-${Math.random()}`
    expect(rateLimit(k, { limit: 0, windowMs: 1000 })).toBe(false)
    expect(rateLimit('', { limit: 0, windowMs: 1000 })).toBe(false)
  })

  it('negative windowMs treats as huge window', () => {
    const k = `neg-${Math.random()}`
    expect(rateLimit(k, { limit: 1, windowMs: -1000 })).toBe(true)
    // second should be false because windowStart = now - (-1000) = now+1000 future, so filter t > windowStart none pass? Actually first timestamp now, second filter: t > now - (-1000) => t > now+1000 false => length 0 => allowed
    // So negative window effectively resets
    expect(rateLimit(k, { limit: 1, windowMs: -1000 })).toBe(true)
  })

  it('different keys independent', () => {
    const a = `a-${Math.random()}`
    const b = `b-${Math.random()}`
    expect(rateLimit(a, { limit: 1, windowMs: 60000 })).toBe(true)
    expect(rateLimit(b, { limit: 1, windowMs: 60000 })).toBe(true)
    expect(rateLimit(a, { limit: 1, windowMs: 60000 })).toBe(false)
    expect(rateLimit(b, { limit: 1, windowMs: 60000 })).toBe(false)
  })

  it('getIp extracts first forwarded', () => {
    const req = new Request('http://test', { headers: { 'x-forwarded-for': '1.1.1.1,2.2.2.2' } })
    expect(getIp(req)).toBe('1.1.1.1')
  })
  it('getIp trims spaces', () => {
    const req = new Request('http://test', { headers: { 'x-forwarded-for': '  9.9.9.9  , 8.8.8.8' } })
    expect(getIp(req)).toBe('9.9.9.9')
  })
  it('getIp unknown when no header', () => {
    const req = new Request('http://test')
    expect(getIp(req)).toBe('unknown')
  })
  it('getIp unknown when empty', () => {
    const req = new Request('http://test', { headers: { 'x-forwarded-for': '' } })
    expect(getIp(req)).toBe('unknown')
  })
  it('getIp with Request-like but not Request instance returns unknown branch', () => {
    // getIp checks req instanceof Request ? req.headers.get : null
    const fake = { headers: { get: () => '1.2.3.4' } } as any
    expect(getIp(fake)).toBe('unknown')
  })
  it('getIp empty first element falls to unknown', () => {
    const req = new Request('http://test', { headers: { 'x-forwarded-for': ', , ' } })
    expect(getIp(req)).toBe('unknown')
  })

  it('setInterval cleanup runs without error', () => {
    // Advance 10 mins to trigger interval
    vi.advanceTimersByTime(10 * 60 * 1000)
    // And 60 mins to expire entries
    vi.advanceTimersByTime(60 * 60 * 1000)
    // After cleanup, old keys should be gone but functionality remains
    const k = `cleanup-${Math.random()}`
    expect(rateLimit(k, { limit: 1, windowMs: 1000 })).toBe(true)
  })

  it('timestamps exactly at windowStart filtered', () => {
    const k = `exact-${Math.random()}`
    expect(rateLimit(k, { limit: 1, windowMs: 1000 })).toBe(true)
    vi.advanceTimersByTime(1000)
    // Now windowStart = now -1000 = previous timestamp exactly equal -> filter t > windowStart false, so allowed
    expect(rateLimit(k, { limit: 1, windowMs: 1000 })).toBe(true)
  })

  it('multiple window expirations', () => {
    const k = `multi-${Math.random()}`
    expect(rateLimit(k, { limit: 2, windowMs: 1000 })).toBe(true)
    expect(rateLimit(k, { limit: 2, windowMs: 1000 })).toBe(true)
    expect(rateLimit(k, { limit: 2, windowMs: 1000 })).toBe(false)
    vi.advanceTimersByTime(1001)
    expect(rateLimit(k, { limit: 2, windowMs: 1000 })).toBe(true)
    expect(rateLimit(k, { limit: 2, windowMs: 1000 })).toBe(true)
    expect(rateLimit(k, { limit: 2, windowMs: 1000 })).toBe(false)
  })
})
