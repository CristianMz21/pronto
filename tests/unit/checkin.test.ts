import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/qrcode', () => ({
  generateCheckinCode: vi.fn(() => 'Abc12345'),
  toDataURL: vi.fn(
    async (code: string) => `data:image/png;base64,${Buffer.from(code).toString('base64')}`,
  ),
}))

import { GET as CheckinGET, POST as CheckinPOST } from '@/app/api/client/check-in/route'

function makeSupabase(mockAppt: unknown, mockClient: unknown) {
  const from = vi.fn((table: string) => {
    if (table === 'appointments') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: mockAppt, error: null })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      } as unknown as never
    }
    if (table === 'clients') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: mockClient, error: null })),
          })),
        })),
      } as unknown as never
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
      })),
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    } as unknown as never
  })
  return { from } as unknown as ReturnType<
    typeof import('@/lib/supabase/service').createServiceClient
  >
}

describe('check-in — POST confirmed→checked_in ok, fsm_guard 409, window ±2h', () => {
  const apptId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
  const userId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
  const clientId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'

  beforeEach(() => vi.clearAllMocks())

  it('confirmed→checked_in ok', async () => {
    const starts = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10min ahead
    const mockAppt = {
      id: apptId,
      client_id: clientId,
      business_id: 'biz-1',
      status: 'confirmed',
      starts_at: starts,
      checkin_code: null,
    }
    const mockClient = { id: clientId, user_id: userId }
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    } as unknown as never)
    const { createServiceClient } = await import('@/lib/supabase/service')
    vi.mocked(createServiceClient).mockReturnValue(makeSupabase(mockAppt, mockClient) as never)

    const req = new NextRequest('http://localhost/api/client/check-in', {
      method: 'POST',
      body: JSON.stringify({ appointment_id: apptId }),
    })
    const res = await CheckinPOST(req as unknown as never)
    expect(res.status).toBe(200)
    const j = (await res.json()) as { status: string }
    expect(j.status).toBe('checked_in')
  })

  it('completed→checked_in 409 fsm_guard', async () => {
    const starts = new Date(Date.now() - 60_000).toISOString()
    const mockAppt = {
      id: apptId,
      client_id: clientId,
      business_id: 'biz-1',
      status: 'completed',
      starts_at: starts,
      checkin_code: 'Abc12345',
    }
    const mockClient = { id: clientId, user_id: userId }
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    } as unknown as never)
    const { createServiceClient } = await import('@/lib/supabase/service')
    vi.mocked(createServiceClient).mockReturnValue(makeSupabase(mockAppt, mockClient) as never)

    const req = new NextRequest('http://localhost/api/client/check-in', {
      method: 'POST',
      body: JSON.stringify({ appointment_id: apptId }),
    })
    const res = await CheckinPOST(req as unknown as never)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toBe('fsm_guard')
  })

  it('outside window 400', async () => {
    const starts = new Date(Date.now() + 5 * 3600000).toISOString() // 5h ahead >2h
    const mockAppt = {
      id: apptId,
      client_id: clientId,
      business_id: 'biz-1',
      status: 'confirmed',
      starts_at: starts,
      checkin_code: null,
    }
    const mockClient = { id: clientId, user_id: userId }
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    } as unknown as never)
    const { createServiceClient } = await import('@/lib/supabase/service')
    vi.mocked(createServiceClient).mockReturnValue(makeSupabase(mockAppt, mockClient) as never)

    const req = new NextRequest('http://localhost/api/client/check-in', {
      method: 'POST',
      body: JSON.stringify({ appointment_id: apptId }),
    })
    const res = await CheckinPOST(req as unknown as never)
    expect(res.status).toBe(400)
  })

  it('GET returns dataURL', async () => {
    const mockAppt = {
      id: apptId,
      client_id: clientId,
      business_id: 'biz-1',
      status: 'confirmed',
      checkin_code: 'Abc12345',
    }
    const mockClient = { id: clientId, user_id: userId }
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    } as unknown as never)
    const { createServiceClient } = await import('@/lib/supabase/service')
    vi.mocked(createServiceClient).mockReturnValue(makeSupabase(mockAppt, mockClient) as never)
    const req = new NextRequest(`http://localhost/api/client/check-in?appointment_id=${apptId}`, {
      method: 'GET',
    })
    const res = await CheckinGET(req as unknown as never)
    expect(res.status).toBe(200)
    const j = (await res.json()) as { dataURL: string }
    expect(j.dataURL.startsWith('data:image/png;base64,')).toBe(true)
  })
})
