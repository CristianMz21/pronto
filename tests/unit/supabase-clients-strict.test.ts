import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({ from: () => ({}) })),
  createServerClient: vi.fn(() => ({ auth: { getUser: async () => ({ data: { user: null } }) }, from: () => ({}) }))
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: () => ({ select: () => ({}) }), auth: {} }))
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [{ name: 'a', value: '1' }],
    set: vi.fn()
  }))
}))

describe('supabase clients strict', () => {
  it('client creates browser client', async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const c = createClient()
    expect(c).toBeTruthy()
    const { createBrowserClient } = await import('@supabase/ssr')
    expect(createBrowserClient).toHaveBeenCalled()
  })
  it('server creates server client with cookies', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const c = await createClient()
    expect(c).toBeTruthy()
    const { createServerClient } = await import('@supabase/ssr')
    expect(createServerClient).toHaveBeenCalled()
  })
  it('server handles saas domain', async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = 'saas'
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'trypronto.app'
    const { createClient } = await import('@/lib/supabase/server')
    const c = await createClient()
    expect(c).toBeTruthy()
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN
  })
  it('server catch branch setAll in Server Component', async () => {
    const mod = await import('@/lib/supabase/server')
    // Simulate cookies set throwing by mocking cookies().set to throw
    const { cookies } = await import('next/headers')
    vi.mocked(cookies).mockResolvedValueOnce({
      getAll: () => [],
      set: () => { throw new Error('Server Component') }
    } as any)
    const c = await mod.createClient()
    // call setAll which should catch
    const client = c as any
    // The internal setAll is inside createServerClient options, we need to invoke it via retrieved call
    const { createServerClient } = await import('@supabase/ssr')
    const callArgs = vi.mocked(createServerClient).mock.calls.at(-1) as any
    const opts = callArgs?.[2]
    expect(() => opts.cookies.setAll([{ name: 'x', value: '1', options: {} }])).not.toThrow()
  })
  it('service creates service client with fetch no-store', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    const { createServiceClient } = await import('@/lib/supabase/service')
    const c = createServiceClient()
    expect(c).toBeTruthy()
    const { createClient } = await import('@supabase/supabase-js')
    expect(createClient).toHaveBeenCalled()
    const call = vi.mocked(createClient).mock.calls.at(-1) as any
    const opts = call?.[2]
    // test global.fetch wrapper
    const origFetch = global.fetch
    const mockFetch = vi.fn().mockResolvedValue({ ok: true } as any)
    global.fetch = mockFetch as any
    await opts.global.fetch('http://test', {})
    expect(mockFetch).toHaveBeenCalledWith('http://test', expect.objectContaining({ cache: 'no-store' }))
    global.fetch = origFetch
  })
})
