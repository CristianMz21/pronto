import { describe, it, expect } from 'vitest'
import { checkClientLimit, checkEmployeeLimit, checkBookingLimit, checkProductLimit, checkNotificationChannel } from '@/lib/plan-limits'

describe('plan-limits strict 100%', () => {
  it('checkClientLimit always allowed self-hosted', async () => {
    const r = await checkClientLimit(null, 'biz', 'self')
    expect(r).toEqual({ allowed: true, limit: Infinity, current: 0, plan: 'self-hosted' })
  })
  it('checkClientLimit with null biz', async () => {
    const r = await checkClientLimit(null, null as any, 'self')
    expect(r.allowed).toBe(true)
  })
  it('checkClientLimit with any args', async () => {
    expect((await checkClientLimit({} as any, 'a', 'pro')).allowed).toBe(true)
    expect((await checkClientLimit(undefined as any, '', '')).limit).toBe(Infinity)
  })
  it('checkEmployeeLimit', async () => {
    expect((await checkEmployeeLimit(null, 'b', 'x')).allowed).toBe(true)
    expect((await checkEmployeeLimit(null, 'b', 'x')).limit).toBe(Infinity)
    expect((await checkEmployeeLimit('supabase' as any, 'b2', 'enterprise')).current).toBe(0)
  })
  it('checkBookingLimit', async () => {
    expect((await checkBookingLimit(null, 'b', 'x')).allowed).toBe(true)
    expect((await checkBookingLimit(null, 'biz', 'free')).plan).toBe('self-hosted')
  })
  it('checkProductLimit', async () => {
    expect((await checkProductLimit(null, 'biz', 'any')).allowed).toBe(true)
  })
  it('checkNotificationChannel always true', () => {
    expect(checkNotificationChannel('free', 'telegram')).toBe(true)
    expect(checkNotificationChannel('self', 'whatsapp')).toBe(true)
    expect(checkNotificationChannel('', '')).toBe(true)
    expect(checkNotificationChannel('enterprise', 'email')).toBe(true)
  })
})
