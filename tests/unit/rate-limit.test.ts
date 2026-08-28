import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { rateLimit, getIp } from '@/lib/rate-limit'
describe('rateLimit',()=>{beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))});afterEach(()=>vi.useRealTimers());it('allows',()=>{const k=`a-${Math.random()}`;expect(rateLimit(k,{limit:2,windowMs:60000})).toBe(true)})})
