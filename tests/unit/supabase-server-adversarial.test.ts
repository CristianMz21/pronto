import { describe, it, expect, vi } from 'vitest'

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn(() => ({ auth: {} })) }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

describe('supabase server adversarial - getCookieName and cookieDomain branches', () => {
  it('getCookieName fallback when URL invalid', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'not-a-url'
    vi.resetModules()
    const { cookies } = await import('next/headers')
    vi.mocked(cookies).mockResolvedValue({ getAll: () => [], set: vi.fn() } as any)
    const { createClient } = await import('@/lib/supabase/server')
    const c = await createClient()
    expect(c).toBeTruthy()
    const { createServerClient } = await import('@supabase/ssr')
    const call = vi.mocked(createServerClient).mock.calls.at(-1) as any
    // cookieOptions.name should be fallback 'sb-127-auth-token' when URL invalid
    expect(call[2].cookieOptions.name).toBe('sb-127-auth-token')
  })

  it('getCookieName with valid URL', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.abc.supabase.co'
    vi.resetModules()
    const { cookies } = await import('next/headers')
    vi.mocked(cookies).mockResolvedValue({ getAll: () => [], set: vi.fn() } as any)
    const { createClient } = await import('@/lib/supabase/server')
    await createClient()
    const { createServerClient } = await import('@supabase/ssr')
    const call = vi.mocked(createServerClient).mock.calls.at(-1) as any
    expect(call[2].cookieOptions.name).toBe('sb-db-auth-token')
  })

  it('cookieDomain saas with root domain', async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = 'saas'
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'trypronto.app'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.abc.supabase.co'
    vi.resetModules()
    const { cookies } = await import('next/headers')
    const mockSet = vi.fn()
    vi.mocked(cookies).mockResolvedValue({ getAll: () => [], set: mockSet } as any)
    const { createClient } = await import('@/lib/supabase/server')
    const c = await createClient()
    expect(c).toBeTruthy()
    const { createServerClient } = await import('@supabase/ssr')
    const call = vi.mocked(createServerClient).mock.calls.at(-1) as any
    // Trigger setAll to cover domain branch
    const domainOpts = call[2].cookies.setAll([{ name: 'x', value: '1', options: {} }])
    // The setAll should have been called with domain
    // We can't directly check, but ensure no throw and that cookies.set was called with domain
    // Actually setAll is the function we just invoked? Wait we invoked the mock's setAll? The real setAll is inside server's createClient options, which calls cookieStore.set with domain
    // We need to invoke the server's setAll manually: call[2].cookies.setAll(...)
    call[2].cookies.setAll([{ name: 'test', value: 'val', options: {} }])
    expect(mockSet).toHaveBeenCalledWith('test', 'val', expect.objectContaining({ domain: '.trypronto.app' }))
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN
  })

  it('setAll catch branch when cookieStore.set throws', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.abc.supabase.co'
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE
    vi.resetModules()
    const { cookies } = await import('next/headers')
    vi.mocked(cookies).mockResolvedValue({ getAll: () => [], set: () => { throw new Error('Server Component') } } as any)
    const { createClient } = await import('@/lib/supabase/server')
    await createClient()
    const { createServerClient } = await import('@supabase/ssr')
    const call = vi.mocked(createServerClient).mock.calls.at(-1) as any
    expect(() => call[2].cookies.setAll([{ name: 'x', value: '1', options: {} }])).not.toThrow()
  })
})
