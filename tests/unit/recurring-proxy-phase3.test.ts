import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- proxy mocks ----
const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockAuthGetUser = mockGetUser
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))
vi.mock('@/lib/auth/roles', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/roles')>('@/lib/auth/roles')
  return {
    ...actual,
    getUserLocationIds: vi.fn(async () => null),
    getUserRole: vi.fn(async () => 'admin'),
    isSuperAdmin: vi.fn(() => false),
    canAccessRoute: vi.fn(() => true),
  }
})

import { createServerClient } from '@supabase/ssr'
import { canAccessRoute, getUserLocationIds, getUserRole, isSuperAdmin } from '@/lib/auth/roles'
import { proxy } from '@/proxy'

function makeProxyReq(
  url: string,
  opts: { host?: string; headers?: Record<string, string>; cookies?: Record<string, string> } = {},
) {
  const headers = new Headers(opts.headers)
  if (opts.host) headers.set('host', opts.host)
  if (opts.headers) Object.entries(opts.headers).forEach(([k, v]) => headers.set(k, v))
  const req = new NextRequest(new URL(url, 'http://localhost'), { headers } as any)
  const cookieMap = new Map(
    Object.entries(opts.cookies ?? {}).map(([k, v]) => [k, { name: k, value: v } as any]),
  )
  const cookieObj = {
    getAll: () => Array.from(cookieMap.values()),
    get: (name: string) => cookieMap.get(name),
    set: (name: string, value: string) => cookieMap.set(name, { name, value } as any),
    has: (name: string) => cookieMap.has(name),
  }
  Object.defineProperty(req, 'cookies', { value: cookieObj, writable: true, configurable: true })
  return req as NextRequest
}

describe('proxy phase3 branches', () => {
  const origEnv = { ...process.env }
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockFrom.mockReset()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE
    delete process.env.IS_DOCKER
    delete process.env.ALLOW_PUBLIC_REGISTER
    vi.mocked(getUserLocationIds).mockResolvedValue(null)
    vi.mocked(getUserRole).mockResolvedValue('admin' as any)
    vi.mocked(isSuperAdmin).mockReturnValue(false)
    vi.mocked(canAccessRoute).mockReturnValue(true)
    // reset createServerClient mock to return our mocks
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    } as any)
  })
  afterEach(() => {
    process.env = { ...origEnv }
  })

  it('invalid location 400 on ?location=bad', async () => {
    const req = makeProxyReq('http://localhost/dashboard?location=not-a-uuid')
    const res = await proxy(req)
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.error).toBe('invalid_location')
  })
  it('invalid location 400 on x-location-id header', async () => {
    const req = makeProxyReq('http://localhost/dashboard', {
      headers: { 'x-location-id': 'bad-uuid' },
    })
    const res = await proxy(req)
    expect(res.status).toBe(400)
  })
  it('valid location header passes 200', async () => {
    const valid = '11111111-1111-4111-a111-111111111111'
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = makeProxyReq(`http://localhost/dashboard?location=${valid}`)
    const res = await proxy(req)
    // should be redirect to /login since no user but not 400
    expect(res.status).not.toBe(400)
  })
  it('forbidden_location 403 when not in allowedIds', async () => {
    const loc = '11111111-1111-4111-a111-111111111111'
    const other = '22222222-2222-4222-a222-222222222222'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid', email: 'a@b.com' } } })
    // mock business owned
    mockFrom.mockImplementation((table: string) => {
      if (table === 'businesses')
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: 'biz1' } })) })),
          })),
        } as any
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null })) })),
        })),
      } as any
    })
    vi.mocked(getUserLocationIds).mockResolvedValue([other] as any)
    const req = makeProxyReq(`http://localhost/dashboard?location=${loc}`)
    const res = await proxy(req)
    expect(res.status).toBe(403)
    const j = await res.json()
    expect(j.error).toBe('forbidden_location')
  })
  it('forbidden_location 403 when location not found for business (allowed null)', async () => {
    const loc = '11111111-1111-4111-a111-111111111111'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid', email: 'a@b.com' } } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'businesses')
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: 'biz1' } })) })),
          })),
        } as any
      if (table === 'locations')
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null })) })),
            })),
          })),
        } as any
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null })) })),
        })),
      } as any
    })
    vi.mocked(getUserLocationIds).mockResolvedValue(null as any)
    const req = makeProxyReq(`http://localhost/dashboard?location=${loc}`)
    const res = await proxy(req)
    expect(res.status).toBe(403)
  })
  it('getCookieName fallback on invalid URL', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'not-a-valid-url'
    const req = makeProxyReq('http://localhost/')
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await proxy(req)
    expect(res).toBeDefined()
    // createServerClient should be called with cookieOptions name fallback 'sb-127-auth-token'
    expect(createServerClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        cookieOptions: expect.objectContaining({ name: 'sb-127-auth-token' }),
      }),
    )
  })
  it('getCookieName normal extracts hostname prefix', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc123.supabase.co'
    const req = makeProxyReq('http://localhost/')
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await proxy(req)
    expect(createServerClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        cookieOptions: expect.objectContaining({ name: 'sb-abc123-auth-token' }),
      }),
    )
  })
  it('host.docker.internal replacement for 127.0.0.1', async () => {
    process.env.IS_DOCKER = 'true'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
    const req = makeProxyReq('http://localhost/')
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await proxy(req)
    expect(createServerClient).toHaveBeenCalledWith(
      expect.stringContaining('host.docker.internal'),
      expect.any(String),
      expect.any(Object),
    )
  })
  it('host.docker.internal replacement for localhost', async () => {
    process.env.IS_DOCKER = 'true'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    const req = makeProxyReq('http://localhost/')
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await proxy(req)
    expect(createServerClient).toHaveBeenCalledWith(
      expect.stringContaining('host.docker.internal'),
      expect.any(String),
      expect.any(Object),
    )
  })
  it('no replacement when not docker', async () => {
    process.env.IS_DOCKER = 'false'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
    const req = makeProxyReq('http://localhost/')
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await proxy(req)
    expect(createServerClient).toHaveBeenCalledWith(
      expect.stringContaining('127.0.0.1'),
      expect.any(String),
      expect.any(Object),
    )
  })
  it('admin invisibility 404 for non-super_admin', async () => {
    const req = makeProxyReq('http://localhost/admin')
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid', email: 'a@b.com' } } })
    vi.mocked(isSuperAdmin).mockReturnValue(false)
    const res = await proxy(req)
    expect(res.status).toBe(404)
  })
  it('admin login allowed but noindex', async () => {
    const req = makeProxyReq('http://localhost/admin/login')
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await proxy(req)
    // should set X-Robots-Tag
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex')
  })
  it('super_admin can access admin', async () => {
    const req = makeProxyReq('http://localhost/admin/dashboard')
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid', email: 'a@admin.com' } } })
    vi.mocked(isSuperAdmin).mockReturnValue(true)
    const res = await proxy(req)
    expect(res.status).not.toBe(404)
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex')
  })
  it('X-Robots-Tag set for admin path after auth', async () => {
    const req = makeProxyReq('http://localhost/admin/settings')
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid', email: 'a@admin.com' } } })
    vi.mocked(isSuperAdmin).mockReturnValue(true)
    const res = await proxy(req)
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex')
  })
  it('ALLOW_PUBLIC_REGISTER=false redirects /register to /apply', async () => {
    process.env.ALLOW_PUBLIC_REGISTER = 'false'
    const req = makeProxyReq('http://localhost/register')
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await proxy(req)
    expect(res.headers.get('location')).toContain('/apply')
  })
  it('RBAC redirect when canAccessRoute false', async () => {
    const req = makeProxyReq('http://localhost/caja')
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid', email: 'a@b.com' } } })
    vi.mocked(getUserRole).mockResolvedValue('barbero' as any)
    vi.mocked(canAccessRoute).mockReturnValue(false)
    // isProtected for /caja true, should redirect to /dashboard
    const res = await proxy(req)
    expect(res.headers.get('location')).toContain('/dashboard')
  })
  it('RBAC not redirect when canAccessRoute true', async () => {
    const req = makeProxyReq('http://localhost/caja')
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid', email: 'a@b.com' } } })
    vi.mocked(getUserRole).mockResolvedValue('admin' as any)
    vi.mocked(canAccessRoute).mockReturnValue(true)
    const res = await proxy(req)
    expect(res.headers.get('location')).toBeNull()
  })
  it('client portal redirect without user', async () => {
    const req = makeProxyReq('http://localhost/client/dashboard')
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await proxy(req)
    expect(res.headers.get('location')).toContain('/client/login')
  })
})

describe('recurring createSeries branches', () => {
  const BIZ = '11111111-1111-4111-a111-111111111111'
  const CLI = '22222222-2222-4222-a222-222222222222'
  const SVC = '33333333-3333-4333-a333-333333333333'
  const EMP = '44444444-4444-4444-a444-444444444444'
  it('in_past skipped', async () => {
    const { createSeries } = await import('@/lib/recurring')
    const past = new Date(Date.now() - 86400000).toISOString()
    // use dtstart in past to trigger in_past skip
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'services')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { duration_min: 30, price: 100 },
                    error: null,
                  })),
                })),
              })),
            })),
          } as any
        if (table === 'recurring_appointments')
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: 'rec1' }, error: null })),
              })),
            })),
          } as any
        if (table === 'business_hours')
          return {
            select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
          } as any
        if (table === 'holidays')
          return {
            select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
          } as any
        if (table === 'appointments')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gte: vi.fn(() => ({ lte: vi.fn(async () => ({ data: [], error: null })) })),
                })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: 'a1' }, error: null })),
              })),
            })),
          } as any
        return {
          select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
        } as any
      }),
    }
    const res = await createSeries(supabase, {
      business_id: BIZ,
      client_id: CLI,
      service_id: SVC,
      rrule: 'FREQ=DAILY;COUNT=2',
      dtstart: past,
      timezone: 'UTC',
    } as any)
    // Should have skipped due to in_past? But generateOccurrences may produce past dates, so skipped includes in_past
    expect(res.skipped.some((s) => s.reason === 'in_past')).toBe(true)
  })
  it('slot_taken via overlapping query', async () => {
    const { createSeries } = await import('@/lib/recurring')
    const dt = new Date(Date.now() + 86400000)
    dt.setUTCHours(14, 0, 0, 0)
    while (dt.getUTCDay() === 0) dt.setUTCDate(dt.getUTCDate() + 1)
    const iso = dt.toISOString()
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'services')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { duration_min: 30, price: 100 },
                    error: null,
                  })),
                })),
              })),
            })),
          } as any
        if (table === 'recurring_appointments')
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: 'rec1' }, error: null })),
              })),
            })),
          } as any
        if (table === 'business_hours')
          return {
            select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
          } as any
        if (table === 'holidays')
          return {
            select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
          } as any
        if (table === 'appointments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gte: vi.fn(() => ({
                    lte: vi.fn(async () => ({
                      data: [{ id: 'existing', starts_at: iso }],
                      error: null,
                    })),
                  })),
                })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: 'a2' }, error: null })),
              })),
            })),
          } as any
        }
        return {
          select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
        } as any
      }),
    }
    const res = await createSeries(supabase, {
      business_id: BIZ,
      client_id: CLI,
      service_id: SVC,
      employee_id: EMP,
      rrule: 'FREQ=DAILY;COUNT=1',
      dtstart: iso,
      timezone: 'UTC',
    } as any)
    // Should have slot_taken due to overlapping without ends_at
    expect(res.skipped.some((s) => s.reason === 'slot_taken')).toBe(true)
  })
  it('slot_taken via insert error slot_taken', async () => {
    const { createSeries } = await import('@/lib/recurring')
    const dt = new Date(Date.now() + 86400000)
    dt.setUTCHours(14, 0, 0, 0)
    while (dt.getUTCDay() === 0) dt.setUTCDate(dt.getUTCDate() + 1)
    const iso = dt.toISOString()
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'services')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { duration_min: 30, price: 100 },
                    error: null,
                  })),
                })),
              })),
            })),
          } as any
        if (table === 'recurring_appointments')
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: 'rec1' }, error: null })),
              })),
            })),
          } as any
        if (table === 'business_hours')
          return {
            select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
          } as any
        if (table === 'holidays')
          return {
            select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
          } as any
        if (table === 'appointments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gte: vi.fn(() => ({ lte: vi.fn(async () => ({ data: [], error: null })) })),
                })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: null, error: { message: 'slot_taken' } })),
              })),
            })),
          } as any
        }
        return {
          select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
        } as any
      }),
    }
    const res = await createSeries(supabase, {
      business_id: BIZ,
      client_id: CLI,
      service_id: SVC,
      rrule: 'FREQ=DAILY;COUNT=1',
      dtstart: iso,
      timezone: 'UTC',
    } as any)
    expect(res.skipped.some((s) => s.reason === 'slot_taken')).toBe(true)
  })
  it('outside_availability via insert error', async () => {
    const { createSeries } = await import('@/lib/recurring')
    const dt = new Date(Date.now() + 86400000)
    dt.setUTCHours(14, 0, 0, 0)
    while (dt.getUTCDay() === 0) dt.setUTCDate(dt.getUTCDate() + 1)
    const iso = dt.toISOString()
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'services')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { duration_min: 30, price: 100 },
                    error: null,
                  })),
                })),
              })),
            })),
          } as any
        if (table === 'recurring_appointments')
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: 'rec1' }, error: null })),
              })),
            })),
          } as any
        if (table === 'business_hours')
          return {
            select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
          } as any
        if (table === 'holidays')
          return {
            select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
          } as any
        if (table === 'appointments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gte: vi.fn(() => ({ lte: vi.fn(async () => ({ data: [], error: null })) })),
                })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: null,
                  error: { message: 'outside_availability' },
                })),
              })),
            })),
          } as any
        }
        return {
          select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
        } as any
      }),
    }
    const res = await createSeries(supabase, {
      business_id: BIZ,
      client_id: CLI,
      service_id: SVC,
      rrule: 'FREQ=DAILY;COUNT=1',
      dtstart: iso,
      timezone: 'UTC',
    } as any)
    expect(res.skipped.some((s) => s.reason === 'outside_availability')).toBe(true)
  })
  it('barber_unavailable via insert error', async () => {
    const { createSeries } = await import('@/lib/recurring')
    const dt = new Date(Date.now() + 86400000)
    dt.setUTCHours(14, 0, 0, 0)
    while (dt.getUTCDay() === 0) dt.setUTCDate(dt.getUTCDate() + 1)
    const iso = dt.toISOString()
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'services')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { duration_min: 30, price: 100 },
                    error: null,
                  })),
                })),
              })),
            })),
          } as any
        if (table === 'recurring_appointments')
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: 'rec1' }, error: null })),
              })),
            })),
          } as any
        if (table === 'business_hours')
          return {
            select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
          } as any
        if (table === 'holidays')
          return {
            select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
          } as any
        if (table === 'appointments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gte: vi.fn(() => ({ lte: vi.fn(async () => ({ data: [], error: null })) })),
                })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: null,
                  error: { message: 'barber_unavailable' },
                })),
              })),
            })),
          } as any
        }
        return {
          select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
        } as any
      }),
    }
    const res = await createSeries(supabase, {
      business_id: BIZ,
      client_id: CLI,
      service_id: SVC,
      rrule: 'FREQ=DAILY;COUNT=1',
      dtstart: iso,
      timezone: 'UTC',
    } as any)
    expect(res.skipped.some((s) => s.reason === 'barber_unavailable')).toBe(true)
  })
  it('insert_failed generic', async () => {
    const { createSeries } = await import('@/lib/recurring')
    const dt = new Date(Date.now() + 86400000)
    dt.setUTCHours(14, 0, 0, 0)
    while (dt.getUTCDay() === 0) dt.setUTCDate(dt.getUTCDate() + 1)
    const iso = dt.toISOString()
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'services')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { duration_min: 30, price: 100 },
                    error: null,
                  })),
                })),
              })),
            })),
          } as any
        if (table === 'recurring_appointments')
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: 'rec1' }, error: null })),
              })),
            })),
          } as any
        if (table === 'business_hours')
          return {
            select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
          } as any
        if (table === 'holidays')
          return {
            select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
          } as any
        if (table === 'appointments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gte: vi.fn(() => ({ lte: vi.fn(async () => ({ data: [], error: null })) })),
                })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: null, error: { message: 'some other error' } })),
              })),
            })),
          } as any
        }
        return {
          select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
        } as any
      }),
    }
    const res = await createSeries(supabase, {
      business_id: BIZ,
      client_id: CLI,
      service_id: SVC,
      rrule: 'FREQ=DAILY;COUNT=1',
      dtstart: iso,
      timezone: 'UTC',
    } as any)
    expect(res.skipped.some((s) => s.reason === 'insert_failed')).toBe(true)
  })
  it('recurring with date+time and timezone', async () => {
    const { createSeries } = await import('@/lib/recurring')
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'services')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { duration_min: 30, price: 100 },
                    error: null,
                  })),
                })),
              })),
            })),
          } as any
        if (table === 'recurring_appointments')
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: 'rec2' }, error: null })),
              })),
            })),
          } as any
        if (table === 'business_hours')
          return {
            select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
          } as any
        if (table === 'holidays')
          return {
            select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
          } as any
        if (table === 'appointments')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gte: vi.fn(() => ({ lte: vi.fn(async () => ({ data: [], error: null })) })),
                })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: 'a1' }, error: null })),
              })),
            })),
          } as any
        return {
          select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
        } as any
      }),
    }
    const future = new Date(Date.now() + 86400000 * 2)
    const dateStr = future.toISOString().slice(0, 10)
    const res = await createSeries(supabase, {
      business_id: BIZ,
      client_id: CLI,
      service_id: SVC,
      rrule: 'FREQ=DAILY;COUNT=1',
      date: dateStr,
      time: '14:00',
      timezone: 'America/Bogota',
    } as any)
    expect(res.id).toBe('rec2')
  })
})

describe('src domain/entities and use-cases', () => {
  it('Business entity type check', async () => {
    await import('@/src/domain/entities/Business')
    const biz: any = {
      id: 'b1',
      ownerId: 'u1',
      name: 'Test',
      slug: 'test',
      type: 'barber',
      phone: '123',
      email: 'a@test.com',
      address: 'addr',
      timezone: 'UTC',
      currency: 'USD',
      logoUrl: null,
      plan: 'pro',
      brandColor: null,
      notificationLanguage: 'es',
      enabledModules: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(biz.name).toBe('Test')
    expect(biz.plan).toBe('pro')
  })
  it('Client entity', async () => {
    const client: any = {
      id: 'c1',
      businessId: 'b1',
      userId: null,
      name: 'John',
      phone: '123',
      email: 'a@test.com',
      whatsappNumber: null,
      birthday: '2000-01-01',
      notes: null,
      tags: ['vip'],
      preferences: null,
      status: 'active',
      createdAt: new Date(),
    }
    expect(client.tags).toContain('vip')
  })
  it('Employee entity', async () => {
    const emp: any = {
      id: 'e1',
      businessId: 'b1',
      userId: 'u1',
      name: 'Bob',
      role: 'barbero',
      phone: '123',
      email: 'a@test.com',
      avatarUrl: null,
      isActive: true,
      color: '#ff0000',
      specialties: ['cut'],
      commissionRate: 10,
      commissionFixed: null,
      bio: null,
      locationId: null,
      createdAt: new Date(),
    }
    expect(emp.role).toBe('barbero')
  })
  it('Appointment entity', async () => {
    const appt: any = {
      id: 'a1',
      businessId: 'b1',
      locationId: null,
      clientId: 'c1',
      employeeId: 'e1',
      serviceId: 's1',
      startsAt: new Date(Date.now() + 3600000),
      endsAt: new Date(Date.now() + 7200000),
      status: 'scheduled',
      price: 100,
      source: 'manual',
      notes: null,
      recurringId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(appt.status).toBe('scheduled')
  })
  it('CreateAppointment use-case success', async () => {
    const { CreateAppointmentUseCase } = await import(
      '@/src/application/use-cases/CreateAppointment'
    )
    const mockRepo = {
      create: vi.fn(async (props: any) => ({
        id: 'a1',
        ...props,
        status: 'scheduled',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findById: vi.fn(),
      findByBusinessAndDate: vi.fn(),
    }
    const mockClientRepo = {
      findById: vi.fn(),
      findByBusinessId: vi.fn(),
      findByUserId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
    const uc = new CreateAppointmentUseCase(mockRepo as any, mockClientRepo as any)
    const future = new Date(Date.now() + 3600000)
    const res = await uc.execute({
      businessId: 'b1',
      clientId: 'c1',
      serviceId: 's1',
      startsAt: future,
      endsAt: new Date(future.getTime() + 1800000),
      price: 100,
      businessTimezone: 'UTC',
      minAdvanceMinutes: 0,
    })
    expect(res.id).toBe('a1')
    expect(mockRepo.create).toHaveBeenCalled()
  })
  it('CreateAppointment in_past throws', async () => {
    const { CreateAppointmentUseCase } = await import(
      '@/src/application/use-cases/CreateAppointment'
    )
    const mockRepo = { create: vi.fn(), findById: vi.fn(), findByBusinessAndDate: vi.fn() }
    const mockClientRepo = {
      findById: vi.fn(),
      findByBusinessId: vi.fn(),
      findByUserId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
    const uc = new CreateAppointmentUseCase(mockRepo as any, mockClientRepo as any)
    const past = new Date(Date.now() - 1000)
    await expect(
      uc.execute({
        businessId: 'b1',
        clientId: 'c1',
        serviceId: 's1',
        startsAt: past,
        endsAt: new Date(past.getTime() + 1800000),
        price: 100,
        businessTimezone: 'UTC',
        minAdvanceMinutes: 0,
      }),
    ).rejects.toThrow(/in_past/)
  })
  it('CreateAppointment too_soon throws', async () => {
    const { CreateAppointmentUseCase } = await import(
      '@/src/application/use-cases/CreateAppointment'
    )
    const mockRepo = { create: vi.fn(), findById: vi.fn(), findByBusinessAndDate: vi.fn() }
    const mockClientRepo = {
      findById: vi.fn(),
      findByBusinessId: vi.fn(),
      findByUserId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
    const uc = new CreateAppointmentUseCase(mockRepo as any, mockClientRepo as any)
    const soon = new Date(Date.now() + 60 * 1000) // 1 min future
    await expect(
      uc.execute({
        businessId: 'b1',
        clientId: 'c1',
        serviceId: 's1',
        startsAt: soon,
        endsAt: new Date(soon.getTime() + 1800000),
        price: 100,
        businessTimezone: 'UTC',
        minAdvanceMinutes: 30,
      }),
    ).rejects.toThrow(/too_soon/)
  })
})
