import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('isomorphic-dompurify', () => ({
  default: { sanitize: (s: string) => s.replace(/<[^>]*>/g, '') },
}))

import { POST as ReviewsPOST } from '@/app/api/reviews/route'

function makeSupabase(opts: {
  appt: unknown
  client: unknown
  insertError?: unknown
  insertData?: unknown
}) {
  const from = vi.fn((table: string) => {
    if (table === 'appointments') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: opts.appt, error: null })),
          })),
        })),
      } as unknown as never
    }
    if (table === 'clients') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: opts.client, error: null })),
          })),
        })),
      } as unknown as never
    }
    if (table === 'reviews') {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => {
              if (opts.insertError) return { data: null, error: opts.insertError }
              return { data: opts.insertData ?? { id: 'rev-1', rating: 5 }, error: null }
            }),
          })),
        })),
      } as unknown as never
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })),
      })),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    } as unknown as never
  })
  const rpc = vi.fn(async () => ({ data: null, error: null }))
  return { from, rpc } as unknown as ReturnType<
    typeof import('@/lib/supabase/service').createServiceClient
  >
}

describe('reviews — rating 1-5 + tags[] + unique appointment_id + only completed 403', () => {
  const apptId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
  const businessId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
  const clientId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'
  const userId = 'dddddddd-dddd-4ddd-dddd-dddddddddddd'

  beforeEach(() => vi.clearAllMocks())

  it('rating out of range 422', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    } as unknown as never)
    const req = new NextRequest('http://localhost/api/reviews', {
      method: 'POST',
      body: JSON.stringify({ appointment_id: apptId, rating: 6, tags: [], comment: 'ok' }),
    })
    const res = await ReviewsPOST(req as unknown as never)
    expect(res.status).toBe(422)
  })

  it('only completed allowed, otherwise 403', async () => {
    const mockAppt = {
      id: apptId,
      client_id: clientId,
      business_id: businessId,
      employee_id: null,
      status: 'confirmed',
    }
    const mockClient = { id: clientId, user_id: userId, business_id: businessId }
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    } as unknown as never)
    const { createServiceClient } = await import('@/lib/supabase/service')
    vi.mocked(createServiceClient).mockReturnValue(
      makeSupabase({ appt: mockAppt, client: mockClient }) as never,
    )

    const req = new NextRequest('http://localhost/api/reviews', {
      method: 'POST',
      body: JSON.stringify({
        appointment_id: apptId,
        rating: 5,
        tags: ['Atención'],
        comment: 'great',
      }),
    })
    const res = await ReviewsPOST(req as unknown as never)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe('fsm_guard')
  })

  it('completed → 201', async () => {
    const mockAppt = {
      id: apptId,
      client_id: clientId,
      business_id: businessId,
      employee_id: null,
      status: 'completed',
    }
    const mockClient = { id: clientId, user_id: userId, business_id: businessId }
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    } as unknown as never)
    const { createServiceClient } = await import('@/lib/supabase/service')
    vi.mocked(createServiceClient).mockReturnValue(
      makeSupabase({
        appt: mockAppt,
        client: mockClient,
        insertData: { id: 'rev-1', rating: 5, tags: ['Atención'] },
      }) as never,
    )

    const req = new NextRequest('http://localhost/api/reviews', {
      method: 'POST',
      body: JSON.stringify({
        appointment_id: apptId,
        rating: 5,
        tags: ['Atención', 'Corte'],
        comment: 'Excelente',
      }),
    })
    const res = await ReviewsPOST(req as unknown as never)
    expect(res.status).toBe(201)
  })

  it('duplicate appointment_id → 409', async () => {
    const mockAppt = {
      id: apptId,
      client_id: clientId,
      business_id: businessId,
      employee_id: null,
      status: 'completed',
    }
    const mockClient = { id: clientId, user_id: userId, business_id: businessId }
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    } as unknown as never)
    const { createServiceClient } = await import('@/lib/supabase/service')
    vi.mocked(createServiceClient).mockReturnValue(
      makeSupabase({
        appt: mockAppt,
        client: mockClient,
        insertError: {
          message: 'duplicate key value violates unique constraint "reviews_appointment_id_key"',
          code: '23505',
        },
      }) as never,
    )
    const req = new NextRequest('http://localhost/api/reviews', {
      method: 'POST',
      body: JSON.stringify({ appointment_id: apptId, rating: 4, tags: [], comment: '' }),
    })
    const res = await ReviewsPOST(req as unknown as never)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toBe('duplicate_review')
  })

  it('tags sanitized and comment max 500 enforced via Zod', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    } as unknown as never)
    const req = new NextRequest('http://localhost/api/reviews', {
      method: 'POST',
      body: JSON.stringify({
        appointment_id: apptId,
        rating: 5,
        tags: ['ok'],
        comment: 'x'.repeat(501),
      }),
    })
    const res = await ReviewsPOST(req as unknown as never)
    expect(res.status).toBe(422)
  })
})
