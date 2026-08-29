import { describe, it, expect, vi } from 'vitest'

// mock react cache to bypass memoization for deterministic tests
vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return { ...actual as any, cache: (fn: any) => fn }
})
vi.mock('next/headers', () => ({ headers: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { getAuthUser } from '@/lib/auth-user'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

describe('auth-user strict 100%', () => {
  it('returns id/email from x-user-id header', async () => {
    vi.mocked(headers).mockResolvedValueOnce({ has: (k: string) => k === 'x-user-id', get: (k: string) => (k === 'x-user-id' ? 'user123' : 'a@b.com') } as any)
    const u = await getAuthUser()
    expect(u).toEqual({ id: 'user123', email: 'a@b.com' })
  })
  it('returns null when x-user-id empty', async () => {
    vi.mocked(headers).mockResolvedValueOnce({ has: () => true, get: () => '' } as any)
    const u = await getAuthUser()
    expect(u).toBeNull()
  })
  it('header with null email returns null email', async () => {
    vi.mocked(headers).mockResolvedValueOnce({ has: (k:string)=>k==='x-user-id', get: (k:string)=> k==='x-user-id'?'uid':null } as any)
    const u = await getAuthUser()
    expect(u).toEqual({ id: 'uid', email: null })
  })
  it('falls back to getUser when no header - with user', async () => {
    vi.mocked(headers).mockResolvedValueOnce({ has: () => false, get: () => null } as any)
    vi.mocked(createClient).mockResolvedValueOnce({ auth: { getUser: async () => ({ data: { user: { id: 'u2', email: 'x@y.com' } } }) } } as any)
    const u = await getAuthUser()
    expect(u).toEqual({ id: 'u2', email: 'x@y.com' })
  })
  it('falls back to getUser when no header - null user', async () => {
    vi.mocked(headers).mockResolvedValueOnce({ has: () => false, get: () => null } as any)
    vi.mocked(createClient).mockResolvedValueOnce({ auth: { getUser: async () => ({ data: { user: null } }) } } as any)
    const u = await getAuthUser()
    expect(u).toBeNull()
  })
  it('fallback handles email null', async () => {
    vi.mocked(headers).mockResolvedValueOnce({ has: () => false, get: () => null } as any)
    vi.mocked(createClient).mockResolvedValueOnce({ auth: { getUser: async () => ({ data: { user: { id: 'uid', email: null } } }) } } as any)
    const u = await getAuthUser()
    expect(u).toEqual({ id: 'uid', email: null })
  })
  it('fallback handles undefined email', async () => {
    vi.mocked(headers).mockResolvedValueOnce({ has: () => false, get: () => null } as any)
    vi.mocked(createClient).mockResolvedValueOnce({ auth: { getUser: async () => ({ data: { user: { id: 'uid' } } }) } } as any)
    const u = await getAuthUser()
    expect(u).toEqual({ id: 'uid', email: null })
  })
})
