import { describe, it, expect } from 'vitest'

import { canEnqueue, isExpired, isWaiting, WAITLIST_EXPIRE_MIN } from '@/lib/waitlist'

describe('waitlist helpers', () => {
  it('canEnqueue future passes', () => {
    const now = new Date('2026-08-20T10:00:00Z')
    const desired = new Date('2026-08-20T12:00:00Z').toISOString()
    expect(canEnqueue(desired, now, 30, true).ok).toBe(true)
  })
  it('past fails', () => {
    const now = new Date('2026-08-20T12:00:00Z')
    const desired = new Date('2026-08-20T10:00:00Z').toISOString()
    const r = canEnqueue(desired, now)
    expect(r.ok).toBe(false)
    expect((r as { reason: string }).reason).toBe('in_past')
  })
  it('too_soon fails with lead time', () => {
    const now = new Date('2026-08-20T10:00:00Z')
    const desired = new Date('2026-08-20T10:15:00Z').toISOString()
    const r = canEnqueue(desired, now, 30, true)
    expect(r.ok).toBe(false)
    expect((r as { reason: string }).reason).toBe('too_soon')
  })
  it('too_soon disabled when lead disabled', () => {
    const now = new Date('2026-08-20T10:00:00Z')
    const desired = new Date('2026-08-20T10:15:00Z').toISOString()
    expect(canEnqueue(desired, now, 30, false).ok).toBe(true)
  })
  it('isExpired true after 30m', () => {
    const now = new Date('2026-08-20T11:00:00Z')
    const notifiedAt = new Date('2026-08-20T10:20:00Z').toISOString()
    expect(isExpired({ status: 'notified', notified_at: notifiedAt }, now)).toBe(true)
  })
  it('isExpired false within 30m', () => {
    const now = new Date('2026-08-20T10:25:00Z')
    const notifiedAt = new Date('2026-08-20T10:10:00Z').toISOString()
    expect(isExpired({ status: 'notified', notified_at: notifiedAt }, now)).toBe(false)
  })
  it('isWaiting', () => {
    expect(isWaiting({ status: 'waiting' })).toBe(true)
    expect(isWaiting({ status: 'notified' })).toBe(false)
  })
})
