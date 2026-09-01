import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('isomorphic-dompurify', () => ({
  default: { sanitize: (s: string) => s.replace(/<[^>]*>/g, '') },
}))
vi.mock('@/lib/qrcode', () => ({
  generateCheckinCode: vi.fn(() => 'Chk12345'),
  toDataURL: vi.fn(async () => 'data:image/png;base64,abcd'),
}))

import { POST as CheckinPOST } from '@/app/api/client/check-in/route'
import { POST as ReviewsPOST } from '@/app/api/reviews/route'

describe('integration — reserve→checkin→staff in_service→completed→review + double review 409', () => {
  const userId = '11111111-1111-4111-a111-111111111111'
  const clientId = '22222222-2222-4111-a222-222222222222'
  const apptId = '33333333-3333-4111-a333-333333333333'
  const businessId = '44444444-4444-4111-a444-444444444444'

  beforeEach(() => vi.clearAllMocks())

  it('full flow checkin then review, second review 409', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const { createServiceClient } = await import('@/lib/supabase/service')

    // 1. Check-in: confirmed -> checked_in
    const startsSoon = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    const mockApptConfirmed = {
      id: apptId,
      client_id: clientId,
      business_id: businessId,
      status: 'confirmed',
      starts_at: startsSoon,
      checkin_code: 'Chk12345',
    }
    const mockClient = { id: clientId, user_id: userId, business_id: businessId }
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    } as unknown as never)
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'appointments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockApptConfirmed, error: null })),
              })),
            })),
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
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
      }),
    } as unknown as never)

    const checkinReq = new NextRequest('http://localhost/api/client/check-in', {
      method: 'POST',
      body: JSON.stringify({ appointment_id: apptId }),
    })
    const checkinRes = await CheckinPOST(checkinReq as unknown as never)
    expect(checkinRes.status).toBe(200)

    // 2. Simulate staff moves to completed (DB trigger would allow checked_in -> in_service -> completed; we mock completed)
    const mockApptCompleted = {
      id: apptId,
      client_id: clientId,
      business_id: businessId,
      employee_id: null,
      status: 'completed',
    }

    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn((t: string) => {
        if (t === 'appointments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockApptCompleted, error: null })),
              })),
            })),
          } as unknown as never
        }
        if (t === 'clients') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockClient, error: null })),
              })),
            })),
          } as unknown as never
        }
        if (t === 'reviews') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: 'rev-1', rating: 5 }, error: null })),
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
        } as unknown as never
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    } as unknown as never)

    const reviewReq = new NextRequest('http://localhost/api/reviews', {
      method: 'POST',
      body: JSON.stringify({
        appointment_id: apptId,
        rating: 5,
        tags: ['Atención'],
        comment: 'Excelente servicio',
      }),
    })
    const reviewRes = await ReviewsPOST(reviewReq as unknown as never)
    expect(reviewRes.status).toBe(201)

    // 3. Second review same appointment -> 409
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn((t: string) => {
        if (t === 'appointments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockApptCompleted, error: null })),
              })),
            })),
          } as unknown as never
        }
        if (t === 'clients') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockClient, error: null })),
              })),
            })),
          } as unknown as never
        }
        if (t === 'reviews') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: null,
                  error: { message: 'duplicate key', code: '23505' },
                })),
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
        } as unknown as never
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    } as unknown as never)

    const reviewReq2 = new NextRequest('http://localhost/api/reviews', {
      method: 'POST',
      body: JSON.stringify({ appointment_id: apptId, rating: 4, tags: [], comment: '' }),
    })
    const reviewRes2 = await ReviewsPOST(reviewReq2 as unknown as never)
    expect(reviewRes2.status).toBe(409)
  })
})
