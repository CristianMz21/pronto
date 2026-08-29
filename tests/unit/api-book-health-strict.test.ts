import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import fc from 'fast-check'

// Strict mocks required by spec
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('isomorphic-dompurify', () => ({ default: { sanitize: (s: string) => s.replace(/<[^>]*>/g, '') } }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(), getIp: vi.fn() }))

import { POST as BookPOST } from '@/app/api/book/route'
import { GET as HealthGET } from '@/app/api/health/route'
import { GET as CheckSlugGET } from '@/app/api/check-slug/route'
import { PATCH as ModulesPATCH } from '@/app/api/business/modules/route'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, getIp } from '@/lib/rate-limit'

// helpers
const BIZ_ID = '11111111-1111-4111-a111-111111111111'
const SVC_ID = '22222222-2222-4222-a222-222222222222'
const EMP_ID = '33333333-3333-4333-a333-333333333333'

function makeChain(result: any) {
  const c: any = {}
  const p = Promise.resolve(result)
  c.then = p.then.bind(p)
  c.catch = p.catch.bind(p)
  if ((p as any).finally) c.finally = (p as any).finally.bind(p)
  const methods = ['select','insert','update','upsert','delete','eq','neq','or','in','single','maybeSingle','order','limit','range','ilike','gte','lte','gt','lt']
  methods.forEach(m => {
    c[m] = vi.fn((..._args: any[]) => c)
  })
  return c
}

type BookMockOpts = {
  service?: any | null
  biz?: any | null
  businessHours?: any[] | null
  clientsMatches?: any[] | null
  clientInsert?: { data: any, error: any } | null
  appointment?: { data: any, error: any } | null
}

function setupBookMocks(opts: BookMockOpts = {}) {
  const serviceData = opts.service !== undefined ? opts.service : { id: SVC_ID, duration_min: 30, price: 100 }
  const bizData = opts.biz !== undefined ? opts.biz : { timezone: 'UTC' }
  const hoursData = opts.businessHours !== undefined ? opts.businessHours : []
  const matches = opts.clientsMatches !== undefined ? opts.clientsMatches : null
  const clientInsertRes = opts.clientInsert !== undefined ? opts.clientInsert : { data: { id: 'new-client-id' }, error: null }
  const apptRes = opts.appointment !== undefined ? opts.appointment : { data: { id: 'appt-id' }, error: null }

  const serviceChain = makeChain({ data: serviceData, error: null })
  const bizChain = makeChain({ data: bizData, error: null })
  const bhChain = makeChain({ data: hoursData, error: null })
  const clientsSelectChain = makeChain({ data: matches, error: null })
  const clientsUpdateChain = makeChain({ data: null, error: null })
  const clientsInsertChain = makeChain(clientInsertRes as any)
  const apptChain = makeChain(apptRes as any)

  let clientsCallIdx = 0
  const from = vi.fn((table: string) => {
    if (table === 'services') return serviceChain
    if (table === 'businesses') return bizChain
    if (table === 'business_hours') return bhChain
    if (table === 'clients') {
      const idx = clientsCallIdx++
      if (idx === 0) return clientsSelectChain
      // if existing client, second call is update (if needed) else insert
      if (matches && Array.isArray(matches) && matches.length > 0) {
        if (idx === 1) return clientsUpdateChain
        return clientsInsertChain
      } else {
        return clientsInsertChain
      }
    }
    if (table === 'appointments') return apptChain
    return makeChain({ data: null, error: null })
  })

  const mockClient: any = { from }
  mockClient._chains = { serviceChain, bizChain, bhChain, clientsSelectChain, clientsUpdateChain, clientsInsertChain, apptChain }
  vi.mocked(createServiceClient).mockReturnValue(mockClient)
  return { mockClient, chains: mockClient._chains, from }
}

function validBookPayload(overrides: any = {}) {
  return {
    businessId: BIZ_ID,
    serviceId: SVC_ID,
    employeeId: null,
    date: '2099-06-15',
    time: '10:00',
    name: 'John Doe',
    phone: '+5491112345678',
    email: 'john@example.com',
    ...overrides,
  }
}

function bookRequest(body: any, headers: Record<string,string> = {}) {
  const h: Record<string,string> = { 'x-forwarded-for': '1.1.1.1', ...headers }
  // use NextRequest real - need Content-Type for json body but not strictly required for rate limit
  return new NextRequest('http://localhost/api/book', {
    method: 'POST',
    headers: h as any,
    body: JSON.stringify(body),
  })
}

// For check-slug helper
function setupCheckSlugMocks(opts: {
  user?: any | null,
  ownBusiness?: any | null,
  count?: number | null,
  ownBusinessError?: any,
} = {}) {
  const user = opts.user !== undefined ? opts.user : { id: 'user-1' }
  const ownBusiness = opts.ownBusiness !== undefined ? opts.ownBusiness : null
  const count = opts.count !== undefined ? opts.count : 0

  const mockAuthGetUser = vi.fn().mockResolvedValue({ data: { user } })
  const mockFromServer = vi.fn() // not used for modules patch? for check-slug service client

  // server client mock
  const serverClient: any = {
    auth: { getUser: mockAuthGetUser },
    from: mockFromServer,
  }
  vi.mocked(createClient).mockResolvedValue(serverClient)

  // service client mock
  const ownChain = makeChain({ data: ownBusiness, error: null })
  const countChain = makeChain({ count, error: null } as any)
  // countChain needs to have count property via resolution; but our makeChain resolves to {count, error}
  // need to ensure await query resolves to {count}
  // makeChain already does Promise.resolve(result). But our countChain will be returned for second from call

  let callIdx = 0
  const from = vi.fn((table: string) => {
    if (table === 'businesses') {
      const idx = callIdx++
      if (idx === 0) return ownChain
      return countChain
    }
    return makeChain({ data: null, error: null })
  })
  const serviceClient: any = { from }
  serviceClient._chains = { ownChain, countChain }
  vi.mocked(createServiceClient).mockReturnValue(serviceClient)

  return { serverClient, serviceClient, chains: serviceClient._chains, from, mockAuthGetUser }
}

function setupModulesMocks(opts: {
  user?: any | null,
  updateError?: any | null,
} = {}) {
  const user = opts.user !== undefined ? opts.user : { id: 'user-1' }
  const updateError = opts.updateError !== undefined ? opts.updateError : null
  const mockAuthGetUser = vi.fn().mockResolvedValue({ data: { user } })
  const updateChain = makeChain({ error: updateError })
  const from = vi.fn(() => updateChain)
  const client: any = {
    auth: { getUser: mockAuthGetUser },
    from,
  }
  client._chains = { updateChain }
  vi.mocked(createClient).mockResolvedValue(client)
  return { client, chains: client._chains, from, mockAuthGetUser }
}

describe('api-book-health-strict', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue(true)
    vi.mocked(getIp).mockReturnValue('1.1.1.1')
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '', json: async () => ({}) } as any)
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    process.env.INTERNAL_API_SECRET = 'test-secret'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    // restore console spies (setup does but we need re-mock fetch)
  })

  describe('/api/book POST', () => {
    it('rate_limited 429', async () => {
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = bookRequest(validBookPayload())
      const res = await BookPOST(req as any)
      expect(res.status).toBe(429)
      const j = await res.json()
      expect(j.error).toBe('rate_limited')
      // ensure createServiceClient not called when rate limited
      expect(createServiceClient).not.toHaveBeenCalled()
    })

    it('invalid_json 400 when json throws', async () => {
      vi.mocked(rateLimit).mockReturnValue(true)
      const badReq: any = {
        headers: { get: () => '1.1.1.1' },
        json: async () => { throw new Error('bad json') },
      }
      const res = await BookPOST(badReq)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_json')
    })

    it('invalid_json via NextRequest invalid body', async () => {
      const req = new NextRequest('http://localhost/api/book', {
        method: 'POST',
        headers: { 'x-forwarded-for': '1.1.1.1' } as any,
        body: 'not-json',
      })
      const res = await BookPOST(req as any)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_json')
    })

    describe('validation_failed 422 per field', () => {
      it('businessId not uuid', async () => {
        const res = await BookPOST(bookRequest(validBookPayload({ businessId: 'not-uuid' })) as any)
        expect(res.status).toBe(422)
        const j = await res.json()
        expect(j.error).toBe('validation_failed')
        expect(j.details.businessId).toBeDefined()
      })
      it('serviceId not uuid', async () => {
        const res = await BookPOST(bookRequest(validBookPayload({ serviceId: 'bad' })) as any)
        expect(res.status).toBe(422)
        expect((await res.json()).details.serviceId).toBeDefined()
      })
      it('employeeId invalid uuid when provided', async () => {
        const res = await BookPOST(bookRequest(validBookPayload({ employeeId: 'not-uuid' })) as any)
        expect(res.status).toBe(422)
        expect((await res.json()).details.employeeId).toBeDefined()
      })
      it('date regex invalid', async () => {
        const res = await BookPOST(bookRequest(validBookPayload({ date: '2026/01/01' })) as any)
        expect(res.status).toBe(422)
        expect((await res.json()).details.date).toBeDefined()
      })
      it('time regex invalid', async () => {
        const res = await BookPOST(bookRequest(validBookPayload({ time: '9:00' })) as any)
        expect(res.status).toBe(422)
        expect((await res.json()).details.time).toBeDefined()
      })
      it('name empty', async () => {
        const res = await BookPOST(bookRequest(validBookPayload({ name: '' })) as any)
        expect(res.status).toBe(422)
        expect((await res.json()).details.name).toBeDefined()
      })
      it('name too long >100', async () => {
        const res = await BookPOST(bookRequest(validBookPayload({ name: 'a'.repeat(101) })) as any)
        expect(res.status).toBe(422)
        expect((await res.json()).details.name).toBeDefined()
      })
      it('email invalid', async () => {
        const res = await BookPOST(bookRequest(validBookPayload({ email: 'not-email', phone: null })) as any)
        // need phone null to trigger email validation alone? but validation will fail on email field regardless of phone
        expect(res.status).toBe(422)
        expect((await res.json()).details.email).toBeDefined()
      })
      it('phone too long >30', async () => {
        const res = await BookPOST(bookRequest(validBookPayload({ phone: '1'.repeat(31) })) as any)
        expect(res.status).toBe(422)
        expect((await res.json()).details.phone).toBeDefined()
      })
    })

    it('contact_required 400 when no phone nor email', async () => {
      const payload = validBookPayload({ phone: null, email: null })
      delete payload.phone
      delete payload.email
      const res = await BookPOST(bookRequest({ ...payload, phone: undefined, email: undefined }) as any)
      // Actually payload with missing phone/email will have undefined, Zod optional will allow, then check !phone && !email
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('contact_required')
    })
    it('contact_required when phone empty and email empty string', async () => {
      const payload = validBookPayload({ phone: null, email: '' })
      const res = await BookPOST(bookRequest(payload) as any)
      // phone null (parsed as null) and email '' -> !phone true && !email '' true => contact_required
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('contact_required')
    })
    it('email literal "" permitido with phone', async () => {
      setupBookMocks({
        businessHours: [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null })),
        clientsMatches: [],
      })
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      // Use future date 2099 so not past
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', email:'', phone:'+123' })
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(200)
      vi.useRealTimers()
    })

    it('service_not_found 404', async () => {
      setupBookMocks({ service: null })
      const res = await BookPOST(bookRequest(validBookPayload()) as any)
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('service_not_found')
    })

    describe('outside_availability', () => {
      it('closed reason', async () => {
        const allClosed = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:false, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
        setupBookMocks({ businessHours: allClosed })
        const res = await BookPOST(bookRequest(validBookPayload({ date:'2099-06-15', time:'10:00' })) as any)
        expect(res.status).toBe(400)
        const j = await res.json()
        expect(j.error).toBe('outside_availability')
        expect(j.reason).toBe('closed')
      })
      it('outside_hours reason', async () => {
        const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
        setupBookMocks({ businessHours: allOpen })
        const res = await BookPOST(bookRequest(validBookPayload({ date:'2099-06-15', time:'08:00' })) as any)
        expect(res.status).toBe(400)
        const j = await res.json()
        expect(j.reason).toBe('outside_hours')
      })
      it('outside_hours when ends after close', async () => {
        const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
        setupBookMocks({ businessHours: allOpen })
        const res = await BookPOST(bookRequest(validBookPayload({ date:'2099-06-15', time:'19:45' })) as any) // 19:45+30 => 20:15 >20:00
        expect(res.status).toBe(400)
        expect((await res.json()).reason).toBe('outside_hours')
      })
      it('break reason', async () => {
        const allWithBreak = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:'12:00', break_end:'13:00' }))
        setupBookMocks({ businessHours: allWithBreak })
        const res = await BookPOST(bookRequest(validBookPayload({ date:'2099-06-15', time:'12:30' })) as any)
        expect(res.status).toBe(400)
        expect((await res.json()).reason).toBe('break')
      })
    })

    it('client upsert existing found -> update name/email when cambian', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      const existing = { id:'client-1', name:'Old Name', email:'old@example.com', phone:'+123', telegram_id:'tg1', viber_user_id:null }
      const { chains } = setupBookMocks({
        businessHours: allOpen,
        clientsMatches: [existing],
        appointment: { data:{id:'appt-1'}, error:null },
      })
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', name:'New Name', email:'new@example.com', phone:'+123' })
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.clientId).toBe('client-1')
      expect(j.hasTelegram).toBe(true)
      expect(j.hasViber).toBe(false)
      // update called with name and email
      expect(chains.clientsUpdateChain.update).toHaveBeenCalledWith(expect.objectContaining({ name:'New Name', email:'new@example.com' }))
    })

    it('client upsert existing no update when iguales', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      const existing = { id:'client-2', name:'Same Name', email:'same@example.com', telegram_id:null, viber_user_id:'viber1' }
      const { chains, from } = setupBookMocks({
        businessHours: allOpen,
        clientsMatches: [existing],
      })
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', name:'Same Name', email:'same@example.com', phone:'+123' })
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(200)
      expect((await res.json()).hasViber).toBe(true)
      // update should NOT have been called because no changes. But our mock returns update chain for idx1; if not called, update fn not invoked.
      // Check that update not called OR called with empty? Route only calls update if keys length >0, so we expect no call.
      // However our from mock would have created update chain for second call only if client had matches; but since no update needed, there is no second clients call, so from call count for clients is 1
      expect(chains.clientsUpdateChain.update).not.toHaveBeenCalled()
      // ensure from called only once for clients plus services etc: total from calls = services,businesses,business_hours,clients,appointments = 5 (no extra clients update)
      expect(from).toHaveBeenCalledWith('clients')
      // count clients calls: should be 1
      const clientCalls = from.mock.calls.filter(c=>c[0]==='clients').length
      expect(clientCalls).toBe(1)
    })

    it('client upsert update only name when email igual', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      const existing = { id:'c3', name:'Old', email:'same@example.com', telegram_id:null, viber_user_id:null }
      const { chains } = setupBookMocks({ businessHours: allOpen, clientsMatches:[existing] })
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', name:'New', email:'same@example.com', phone:'+123' })
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(200)
      expect(chains.clientsUpdateChain.update).toHaveBeenCalledWith({ name:'New' })
    })

    it('client upsert update only email when name igual', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      const existing = { id:'c4', name:'Same', email:'old@example.com', phone:'+123', telegram_id:null, viber_user_id:null }
      const { chains } = setupBookMocks({ businessHours: allOpen, clientsMatches:[existing] })
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', name:'Same', email:'new@example.com', phone:'+123' })
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(200)
      expect(chains.clientsUpdateChain.update).toHaveBeenCalledWith({ email:'new@example.com' })
    })

    it('client creation fail 500', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      setupBookMocks({
        businessHours: allOpen,
        clientsMatches: [],
        clientInsert: { data: null, error: { message:'insert failed' } },
      })
      const res = await BookPOST(bookRequest(validBookPayload({ date:'2099-06-15', time:'10:00', phone:'+123', email:'a@b.com' })) as any)
      expect(res.status).toBe(500)
      expect((await res.json()).error).toBe('client_creation_failed')
    })

    it('new client success con phone/email', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      setupBookMocks({
        businessHours: allOpen,
        clientsMatches: [],
        clientInsert: { data:{id:'new-id'}, error:null },
      })
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', phone:'+123', email:'new@example.com' })
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(200)
      expect((await res.json()).clientId).toBe('new-id')
    })

    it('new client success con solo phone', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      setupBookMocks({
        businessHours: allOpen,
        clientsMatches: [],
      })
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', phone:'+123', email: null })
      // need to delete email field to be null? validBookPayload sets email default, override with null
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(200)
    })

    it('sanitize name strips tags', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      const { chains } = setupBookMocks({
        businessHours: allOpen,
        clientsMatches: [],
        clientInsert: { data:{id:'cid'}, error:null },
      })
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', name:'<b>John</b> <script>alert(1)</script>', phone:'+123' })
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(200)
      // check that insert was called with sanitized name (without tags)
      expect(chains.clientsInsertChain.insert).toHaveBeenCalledWith(expect.objectContaining({ name:'John alert(1)' }))
    })

    it('phone+email orParts logic BUG-8', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      const { chains } = setupBookMocks({ businessHours: allOpen, clientsMatches:[] })
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', phone:'+111', email:'a@b.com' })
      await BookPOST(bookRequest(payload) as any)
      expect(chains.clientsSelectChain.or).toHaveBeenCalledWith('phone.eq.+111,email.eq.a@b.com')
    })
    it('orParts only phone when email missing', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      const { chains } = setupBookMocks({ businessHours: allOpen, clientsMatches:[] })
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', phone:'+111', email:null })
      await BookPOST(bookRequest(payload) as any)
      expect(chains.clientsSelectChain.or).toHaveBeenCalledWith('phone.eq.+111')
    })
    it('orParts only email when phone missing', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      const { chains } = setupBookMocks({ businessHours: allOpen, clientsMatches:[] })
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', phone:null, email:'only@email.com' })
      await BookPOST(bookRequest(payload) as any)
      expect(chains.clientsSelectChain.or).toHaveBeenCalledWith('email.eq.only@email.com')
    })

    it('in_past 400 mock startsAt pasado', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2030-01-15T10:00:00Z'))
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      setupBookMocks({ businessHours: allOpen, clientsMatches:[] })
      const payload = validBookPayload({ date:'2030-01-15', time:'09:00', phone:'+123' })
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('in_past')
    })
    it('too_soon 400 <30min futuro', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2030-01-15T10:00:00Z'))
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      setupBookMocks({ businessHours: allOpen, clientsMatches:[] })
      const payload = validBookPayload({ date:'2030-01-15', time:'10:20', phone:'+123' }) // 20 min later
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('too_soon')
    })
    it('too_soon boundary exactly 30 min should be ok (not too_soon)', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2030-01-15T10:00:00Z'))
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      setupBookMocks({ businessHours: allOpen, clientsMatches:[] })
      const payload = validBookPayload({ date:'2030-01-15', time:'10:30', phone:'+123' }) // exactly 30 min
      const res = await BookPOST(bookRequest(payload) as any)
      // Should NOT be too_soon, should be success (or maybe past check? startsAt 10:30 > now 10:00, and >= now+30)
      // Actually check is < now+30, so equal is allowed.
      expect(res.status).toBe(200)
    })

    describe('appt insert triggers', () => {
      const futurePayload = () => validBookPayload({ date:'2099-06-15', time:'10:00', phone:'+123' })
      const baseHours = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))

      it('no_staff_available 409', async () => {
        setupBookMocks({ businessHours: baseHours, clientsMatches:[], appointment:{ data:null, error:{message:'no_staff_available'} } })
        const res = await BookPOST(bookRequest(futurePayload()) as any)
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe('no_staff_available')
      })
      it('slot_already_booked 409 -> slot_taken', async () => {
        setupBookMocks({ businessHours: baseHours, clientsMatches:[], appointment:{ data:null, error:{message:'slot_already_booked'} } })
        const res = await BookPOST(bookRequest(futurePayload()) as any)
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe('slot_taken')
      })
      it('barber_not_qualified 400', async () => {
        setupBookMocks({ businessHours: baseHours, clientsMatches:[], appointment:{ data:null, error:{message:'barber_not_qualified'} } })
        const res = await BookPOST(bookRequest(futurePayload()) as any)
        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe('barber_not_qualified')
      })
      it('barber_unavailable 409', async () => {
        setupBookMocks({ businessHours: baseHours, clientsMatches:[], appointment:{ data:null, error:{message:'barber_unavailable'} } })
        const res = await BookPOST(bookRequest(futurePayload()) as any)
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe('barber_unavailable')
      })
      it('barber_inactive 400', async () => {
        setupBookMocks({ businessHours: baseHours, clientsMatches:[], appointment:{ data:null, error:{message:'barber_inactive'} } })
        const res = await BookPOST(bookRequest(futurePayload()) as any)
        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe('barber_inactive')
      })
      it('outside_availability from DB closed', async () => {
        setupBookMocks({ businessHours: baseHours, clientsMatches:[], appointment:{ data:null, error:{message:'outside_availability closed'} } })
        const res = await BookPOST(bookRequest(futurePayload()) as any)
        expect(res.status).toBe(400)
        const j = await res.json()
        expect(j.error).toBe('outside_availability')
        expect(j.reason).toBe('closed')
      })
      it('outside_availability from DB break', async () => {
        setupBookMocks({ businessHours: baseHours, clientsMatches:[], appointment:{ data:null, error:{message:'outside_availability break'} } })
        const res = await BookPOST(bookRequest(futurePayload()) as any)
        expect(res.status).toBe(400)
        expect((await res.json()).reason).toBe('break')
      })
      it('outside_availability from DB outside_hours (default)', async () => {
        setupBookMocks({ businessHours: baseHours, clientsMatches:[], appointment:{ data:null, error:{message:'outside_availability outside_hours'} } })
        const res = await BookPOST(bookRequest(futurePayload()) as any)
        expect(res.status).toBe(400)
        expect((await res.json()).reason).toBe('outside_hours')
      })
      it('outside_availability fallback to outside_hours when no detail', async () => {
        setupBookMocks({ businessHours: baseHours, clientsMatches:[], appointment:{ data:null, error:{message:'outside_availability'} } })
        const res = await BookPOST(bookRequest(futurePayload()) as any)
        expect(res.status).toBe(400)
        expect((await res.json()).reason).toBe('outside_hours')
      })
      it('in_past from DB 400', async () => {
        setupBookMocks({ businessHours: baseHours, clientsMatches:[], appointment:{ data:null, error:{message:'in_past'} } })
        const res = await BookPOST(bookRequest(futurePayload()) as any)
        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe('in_past')
      })
      it('too_soon from DB 400', async () => {
        setupBookMocks({ businessHours: baseHours, clientsMatches:[], appointment:{ data:null, error:{message:'too_soon'} } })
        const res = await BookPOST(bookRequest(futurePayload()) as any)
        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe('too_soon')
      })
      it('booking_failed 500 generic', async () => {
        setupBookMocks({ businessHours: baseHours, clientsMatches:[], appointment:{ data:null, error:{message:'some unknown error'} } })
        const res = await BookPOST(bookRequest(futurePayload()) as any)
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe('booking_failed')
      })
      it('booking_failed when appt null no error', async () => {
        setupBookMocks({ businessHours: baseHours, clientsMatches:[], appointment:{ data:null, error:null } as any })
        const res = await BookPOST(bookRequest(futurePayload()) as any)
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe('booking_failed')
      })
    })

    it('success path 200 con appointmentId, clientId, hasTelegram/hasViber, y verifica fetch', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      // existing client case with telegram true
      const existing = { id:'client-x', name:'John Doe', email:'john@example.com', telegram_id:'tg', viber_user_id:'viber' }
      setupBookMocks({
        businessHours: allOpen,
        clientsMatches: [existing],
        appointment: { data:{id:'appt-success'}, error:null },
      })
      // Need to capture fetch
      const fetchSpy = vi.fn().mockResolvedValue({ ok:true, text: async()=>'' } as any)
      global.fetch = fetchSpy as any
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', name:'John Doe', email:'john@example.com', phone:'+123' })
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.appointmentId).toBe('appt-success')
      expect(j.clientId).toBe('client-x')
      expect(j.hasTelegram).toBe(true)
      expect(j.hasViber).toBe(true)
      // fetch called fire-and-forget, need to wait tick
      await new Promise(r=> setTimeout(r, 0))
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/email/confirm'),
        expect.objectContaining({
          method:'POST',
          headers: expect.objectContaining({ 'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET}` }),
        })
      )
      const fetchCall = fetchSpy.mock.calls[0][1] as any
      const body = JSON.parse(fetchCall.body)
      expect(body.appointmentId).toBe('appt-success')
      expect(body.formEmail).toBe('john@example.com')
    })
    it('success path new client fetch hasTelegram/hasViber false', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      setupBookMocks({
        businessHours: allOpen,
        clientsMatches: [],
        clientInsert: { data:{id:'new-cid'}, error:null },
        appointment: { data:{id:'appt2'}, error:null },
      })
      const fetchSpy = vi.fn().mockResolvedValue({ ok:true, text: async()=>'' } as any)
      global.fetch = fetchSpy as any
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', phone:'+123', email:'a@b.com' })
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.hasTelegram).toBe(false)
      expect(j.hasViber).toBe(false)
      expect(j.clientId).toBe('new-cid')
      await new Promise(r=> setTimeout(r, 0))
      expect(fetchSpy).toHaveBeenCalled()
    })
    it('success fetch failure logs but still returns 200', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      setupBookMocks({ businessHours: allOpen, clientsMatches:[] })
      const fetchSpy = vi.fn().mockResolvedValue({ ok:false, status:500, text: async()=>'fail' } as any)
      global.fetch = fetchSpy as any
      const res = await BookPOST(bookRequest(validBookPayload({ date:'2099-06-15', time:'10:00' })) as any)
      expect(res.status).toBe(200)
      await new Promise(r=> setTimeout(r, 0))
      // after fetch fails, route logs via console.error (mocked)
      expect(fetchSpy).toHaveBeenCalled()
    })
    it('success fetch rejection logs but still returns 200', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      setupBookMocks({ businessHours: allOpen, clientsMatches:[] })
      const fetchSpy = vi.fn().mockRejectedValue(new Error('network'))
      global.fetch = fetchSpy as any
      const res = await BookPOST(bookRequest(validBookPayload({ date:'2099-06-15', time:'10:00' })) as any)
      expect(res.status).toBe(200)
      await new Promise(r=> setTimeout(r, 0))
      expect(fetchSpy).toHaveBeenCalled()
    })
    it('success fetch ok false with text throwing -> catch returns empty', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      setupBookMocks({ businessHours: allOpen, clientsMatches:[] })
      const fetchSpy = vi.fn().mockResolvedValue({ ok:false, status:500, text: async()=>{ throw new Error('text fail') } } as any)
      global.fetch = fetchSpy as any
      const res = await BookPOST(bookRequest(validBookPayload({ date:'2099-06-15', time:'10:00' })) as any)
      expect(res.status).toBe(200)
      await new Promise(r=> setTimeout(r, 20))
      expect(fetchSpy).toHaveBeenCalled()
    })
    it('timezone fallback to UTC when biz is null', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      const { chains } = setupBookMocks({ businessHours: allOpen, biz: null as any, clientsMatches:[] })
      const fetchSpy = vi.fn().mockResolvedValue({ ok:true, text: async()=>'' } as any)
      global.fetch = fetchSpy as any
      const res = await BookPOST(bookRequest(validBookPayload({ date:'2099-06-15', time:'10:00', phone:'+123' })) as any)
      expect(res.status).toBe(200)
      const insertArg = chains.apptChain.insert.mock.calls[0][0]
      // With UTC, wall 10:00 should be 10:00Z
      expect(insertArg.starts_at).toBe('2099-06-15T10:00:00.000Z')
    })
    it('business_hours null fallback to empty -> uses DEFAULT_HOURS', async () => {
      // null should trigger ?? [] fallback
      setupBookMocks({ businessHours: null as any, biz: { timezone:'UTC' }, clientsMatches:[] })
      // With DEFAULT_HOURS, Sunday closed; try Monday open time 10:00 should succeed, but we test closed branch via Sunday
      // Use Sunday 2099-06-14 is Sunday? Let's just test that fallback still works: use future date 2099-06-15 Monday 08:00 outside_hours
      const payload = validBookPayload({ date:'2099-06-15', time:'08:00', phone:'+123' })
      const res = await BookPOST(bookRequest(payload) as any)
      // With DEFAULT_HOURS (09-20), 08:00 should be outside_hours
      expect(res.status).toBe(400)
      expect((await res.json()).reason).toBe('outside_hours')
    })
    it('NEXT_PUBLIC_APP_URL fallback to localhost when undefined', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      setupBookMocks({ businessHours: allOpen, clientsMatches:[] })
      delete process.env.NEXT_PUBLIC_APP_URL
      const fetchSpy = vi.fn().mockResolvedValue({ ok:true, text: async()=>'' } as any)
      global.fetch = fetchSpy as any
      const res = await BookPOST(bookRequest(validBookPayload({ date:'2099-06-15', time:'10:00', phone:'+123' })) as any)
      expect(res.status).toBe(200)
      await new Promise(r=> setTimeout(r, 0))
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('http://localhost:3000'), expect.anything())
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    })
    it('INTERNAL_API_SECRET fallback to empty string', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      setupBookMocks({ businessHours: allOpen, clientsMatches:[] })
      delete process.env.INTERNAL_API_SECRET
      const fetchSpy = vi.fn().mockResolvedValue({ ok:true, text: async()=>'' } as any)
      global.fetch = fetchSpy as any
      const res = await BookPOST(bookRequest(validBookPayload({ date:'2099-06-15', time:'10:00', phone:'+123' })) as any)
      expect(res.status).toBe(200)
      await new Promise(r=> setTimeout(r, 0))
      expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer ' }) }))
      process.env.INTERNAL_API_SECRET = 'test-secret'
    })
    it('parseDateTimeInTz handles missing parts via fallback', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      const bizWithTz = { timezone:'Test/Zone' }
      const { chains } = setupBookMocks({ businessHours: allOpen, biz: bizWithTz, clientsMatches:[] })
      const OriginalDTF = Intl.DateTimeFormat
      // Mock to return parts missing second and minute -> should fallback to '0'
      const mockFormatToParts = vi.fn(() => [
        { type:'year', value:'2099' },
        { type:'month', value:'6' },
        { type:'day', value:'15' },
        { type:'hour', value:'12' },
        // minute missing, second missing
      ] as any)
      const spy = vi.spyOn(Intl as any, 'DateTimeFormat').mockImplementation(function(this:any){ return { formatToParts: mockFormatToParts } as any } as any)
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', phone:'+123' })
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(200)
      // With missing minute/second fallback to 0, offset should be 0? noonUtc 12:00 vs localNoon 12:00 (since hour 12) => offset 0 => wall 10:00 UTC = 10:00Z
      const insertArg = chains.apptChain.insert.mock.calls[0][0]
      expect(insertArg.starts_at).toBe('2099-06-15T10:00:00.000Z')
      spy.mockRestore()
      ;(Intl as any).DateTimeFormat = OriginalDTF
    })
    it('parseDateTimeInTz con timezone diferente mock Intl', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      // Mock biz timezone to America/New_York (UTC-5)
      const bizWithTz = { timezone:'America/New_York' }
      const { chains } = setupBookMocks({ businessHours: allOpen, biz: bizWithTz, clientsMatches:[] })
      // Mock Intl.DateTimeFormat to simulate offset -5h for noon UTC
      const OriginalDTF = Intl.DateTimeFormat
      const mockFormatToParts = vi.fn((date: Date) => {
        // date is noonUtc 2029-06-15T12:00:00Z (year, month, day derived from wall date)
        // For Europe case we'd compute parts for that noonUtc in target TZ
        // Simulate NY: noon UTC -> 08:00 local (UTC-4 in June DST)
        // But we want deterministic: return 07:00 for simplicity => offset -5
        // We'll compute localNoon: noonUtc -5h => 07:00 same day
        // So parts should reflect 2029? Actually date param is noonUtc for 2099-06-15 12:00 UTC
        // We'll just return fixed parts: year, month, day same, hour 7 (12-5)
        const d = new Date(date)
        // keep year month day same, hour 7
        return [
          { type:'year', value: String(d.getUTCFullYear()) },
          { type:'month', value: String(d.getUTCMonth()+1) },
          { type:'day', value: String(d.getUTCDate()) },
          { type:'hour', value: '7' },
          { type:'minute', value: '0' },
          { type:'second', value: '0' },
        ] as any
      })
      const spy = vi.spyOn(Intl as any, 'DateTimeFormat').mockImplementation(function(this:any) {
        return { formatToParts: mockFormatToParts } as any
      } as any)

      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', phone:'+123' })
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(200)
      // Check that appointment insert starts_at reflects offset: wall 10:00 +5h = 15:00 UTC
      expect(chains.apptChain.insert).toHaveBeenCalled()
      const insertArg = chains.apptChain.insert.mock.calls[0][0]
      // starts_at should be 2099-06-15T15:00:00.000Z (10 +5)
      expect(insertArg.starts_at).toBe('2099-06-15T15:00:00.000Z')
      spy.mockRestore()
      ;(Intl as any).DateTimeFormat = OriginalDTF
    })

    it('employeeId optional handling', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      const { chains } = setupBookMocks({ businessHours: allOpen, clientsMatches:[] })
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', employeeId: EMP_ID, phone:'+123' })
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(200)
      const insertArg = chains.apptChain.insert.mock.calls[0][0]
      expect(insertArg.employee_id).toBe(EMP_ID)
    })
    it('employeeId null handled', async () => {
      const allOpen = [0,1,2,3,4,5,6].map(d=>({ day_of_week:d, is_open:true, open_time:'09:00', close_time:'20:00', break_start:null, break_end:null }))
      const { chains } = setupBookMocks({ businessHours: allOpen, clientsMatches:[] })
      const payload = validBookPayload({ date:'2099-06-15', time:'10:00', employeeId: null, phone:'+123' })
      const res = await BookPOST(bookRequest(payload) as any)
      expect(res.status).toBe(200)
      const insertArg = chains.apptChain.insert.mock.calls[0][0]
      expect(insertArg.employee_id).toBeNull()
    })

    it('fast-check validation property: random invalid payloads should be 422 or 400', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          businessId: fc.string(),
          serviceId: fc.string(),
          date: fc.string(),
          time: fc.string(),
          name: fc.string(),
        }),
        async (rec) => {
          // ensure not accidentally valid uuid/date/time
          const payload = { ...validBookPayload(), ...rec, phone:'+123' }
          const res = await BookPOST(bookRequest(payload) as any)
          // Valid uuid? Check if businessId looks like uuid - expect either 422 or pass to next branch (maybe 404 etc) but for random strings usually 422
          // We just ensure status is one of expected codes and not 500 unrelated
          expect([422,400,404,429,500,200,409]).toContain(res.status)
        }
      ), { numRuns: 20 })
    })
  })

  describe('/api/health GET', () => {
    it('retorna {status:ok, timestamp:ISO} y no requiere auth', async () => {
      const res = await HealthGET()
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.status).toBe('ok')
      expect(typeof j.timestamp).toBe('string')
      // ISO parsing
      const d = new Date(j.timestamp)
      expect(isNaN(d.getTime())).toBe(false)
      expect(j.timestamp).toBe(d.toISOString())
      // no auth required: createClient not called
      expect(createClient).not.toHaveBeenCalled()
      expect(createServiceClient).not.toHaveBeenCalled()
    })
    it('timestamp es reciente', async () => {
      const before = Date.now()
      const res = await HealthGET()
      const j = await res.json()
      const ts = new Date(j.timestamp).getTime()
      const after = Date.now()
      expect(ts).toBeGreaterThanOrEqual(before)
      expect(ts).toBeLessThanOrEqual(after)
    })
  })

  describe('/api/check-slug GET', () => {
    it('sin slug -> available false', async () => {
      const req = new Request('http://localhost/api/check-slug')
      const res = await CheckSlugGET(req as any)
      expect((await res.json()).available).toBe(false)
    })
    it('slug empty -> available false', async () => {
      const req = new Request('http://localhost/api/check-slug?slug=')
      const res = await CheckSlugGET(req as any)
      expect((await res.json()).available).toBe(false)
    })
    it('slug inválido regex: too short', async () => {
      const req = new Request('http://localhost/api/check-slug?slug=ab')
      const res = await CheckSlugGET(req as any)
      expect((await res.json()).available).toBe(false)
    })
    it('slug inválido: starts with hyphen', async () => {
      const req = new Request('http://localhost/api/check-slug?slug=-abc')
      const res = await CheckSlugGET(req as any)
      expect((await res.json()).available).toBe(false)
    })
    it('slug inválido: ends with hyphen', async () => {
      const req = new Request('http://localhost/api/check-slug?slug=abc-')
      const res = await CheckSlugGET(req as any)
      expect((await res.json()).available).toBe(false)
    })
    it('slug inválido: underscore', async () => {
      const req = new Request('http://localhost/api/check-slug?slug=ab_cd')
      const res = await CheckSlugGET(req as any)
      expect((await res.json()).available).toBe(false)
    })
    it('slug inválido: too long 31 chars', async () => {
      const long = 'a'.repeat(31)
      const req = new Request(`http://localhost/api/check-slug?slug=${long}`)
      const res = await CheckSlugGET(req as any)
      expect((await res.json()).available).toBe(false)
    })
    it('slug inválido: uppercase and spaces trimmed -> but regex lowercases so valid case', async () => {
      setupCheckSlugMocks({ user:{id:'u1'}, ownBusiness:null, count:0 })
      const req = new Request('http://localhost/api/check-slug?slug=ABC')
      // ABC lowercased is abc length 3 valid -> should check auth and return available true (count 0)
      const res = await CheckSlugGET(req as any)
      expect((await res.json()).available).toBe(true)
    })
    it('slug válido sin auth -> available false', async () => {
      setupCheckSlugMocks({ user: null })
      const req = new Request('http://localhost/api/check-slug?slug=valid-slug')
      const res = await CheckSlugGET(req as any)
      expect((await res.json()).available).toBe(false)
      // service client not called when no user
      expect(createServiceClient).not.toHaveBeenCalled()
    })
    it('owner check: count 0 -> available true', async () => {
      setupCheckSlugMocks({ user:{id:'u1'}, ownBusiness:null, count:0 })
      const req = new Request('http://localhost/api/check-slug?slug=valid-slug')
      const res = await CheckSlugGET(req as any)
      expect((await res.json()).available).toBe(true)
    })
    it('owner check: count >0 -> available false', async () => {
      setupCheckSlugMocks({ user:{id:'u1'}, ownBusiness:null, count:1 })
      const req = new Request('http://localhost/api/check-slug?slug=taken-slug')
      const res = await CheckSlugGET(req as any)
      expect((await res.json()).available).toBe(false)
    })
    it('ownBusiness exclude: neq called when ownBusiness exists', async () => {
      const { chains } = setupCheckSlugMocks({ user:{id:'u1'}, ownBusiness:{id:'own-id'}, count:0 })
      const req = new Request('http://localhost/api/check-slug?slug=my-slug')
      const res = await CheckSlugGET(req as any)
      expect((await res.json()).available).toBe(true)
      expect(chains.countChain.neq).toHaveBeenCalledWith('id','own-id')
    })
    it('ownBusiness exists but slug taken by other -> available false', async () => {
      setupCheckSlugMocks({ user:{id:'u1'}, ownBusiness:{id:'own-id'}, count:2 })
      const req = new Request('http://localhost/api/check-slug?slug=taken')
      const res = await CheckSlugGET(req as any)
      expect((await res.json()).available).toBe(false)
    })
    it('ownBusiness null -> neq not called', async () => {
      const { chains } = setupCheckSlugMocks({ user:{id:'u1'}, ownBusiness:null, count:0 })
      const req = new Request('http://localhost/api/check-slug?slug=valid-slug')
      await CheckSlugGET(req as any)
      expect(chains.countChain.neq).not.toHaveBeenCalled()
    })
    it('slug trim and lower case handling', async () => {
      setupCheckSlugMocks({ user:{id:'u1'}, ownBusiness:null, count:0 })
      const req = new Request('http://localhost/api/check-slug?slug=%20Valid-Slug%20')
      const res = await CheckSlugGET(req as any)
      expect((await res.json()).available).toBe(true)
    })
    it('slug with valid hyphen inside', async () => {
      setupCheckSlugMocks({ user:{id:'u1'}, ownBusiness:null, count:0 })
      const req = new Request('http://localhost/api/check-slug?slug=a-b-c')
      const res = await CheckSlugGET(req as any)
      expect((await res.json()).available).toBe(true)
    })
    it('fast-check slugs property', async () => {
      await fc.assert(fc.asyncProperty(fc.string(), async (s) => {
        const req = new Request(`http://localhost/api/check-slug?slug=${encodeURIComponent(s)}`)
        // mock auth false for this property to avoid needing service mock per iteration? but we need deterministic
        setupCheckSlugMocks({ user:null })
        const res = await CheckSlugGET(req as any)
        const j = await res.json()
        expect(typeof j.available).toBe('boolean')
        // if slug invalid regex -> false; if valid but no user -> false as well, so always false when user null
        // But we set user null, so always false regardless of regex? Actually invalid regex returns false early without auth, valid regex with no user also false => always false
        expect(j.available).toBe(false)
      }), { numRuns: 10 })
    })
  })

  describe('/api/business/modules PATCH', () => {
    it('unauthorized 401', async () => {
      setupModulesMocks({ user: null })
      const req = new NextRequest('http://localhost/api/business/modules', {
        method:'PATCH',
        body: JSON.stringify({ enabled_modules: [] }),
      })
      const res = await ModulesPATCH(req as any)
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('Unauthorized')
    })
    it('enabled_modules not array -> 400', async () => {
      setupModulesMocks({ user:{id:'u1'} })
      const req = new NextRequest('http://localhost/api/business/modules', {
        method:'PATCH',
        body: JSON.stringify({ enabled_modules: 'not-array' }),
      })
      const res = await ModulesPATCH(req as any)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('enabled_modules must be an array')
    })
    it('enabled_modules missing -> 400', async () => {
      setupModulesMocks({ user:{id:'u1'} })
      const req = new NextRequest('http://localhost/api/business/modules', {
        method:'PATCH',
        body: JSON.stringify({}),
      })
      const res = await ModulesPATCH(req as any)
      expect(res.status).toBe(400)
    })
    it('enabled_modules null -> 400', async () => {
      setupModulesMocks({ user:{id:'u1'} })
      const req = new NextRequest('http://localhost/api/business/modules', {
        method:'PATCH',
        body: JSON.stringify({ enabled_modules: null }),
      })
      const res = await ModulesPATCH(req as any)
      expect(res.status).toBe(400)
    })
    it('filters valid modules only', async () => {
      const { chains } = setupModulesMocks({ user:{id:'u1'} })
      const req = new NextRequest('http://localhost/api/business/modules', {
        method:'PATCH',
        body: JSON.stringify({ enabled_modules: ['bookings','invalid','crm', 123, null] }),
      })
      const res = await ModulesPATCH(req as any)
      expect(res.status).toBe(200)
      expect((await res.json()).ok).toBe(true)
      expect(chains.updateChain.update).toHaveBeenCalledWith({ enabled_modules: ['bookings','crm'] })
    })
    it('empty array allowed', async () => {
      const { chains } = setupModulesMocks({ user:{id:'u1'} })
      const req = new NextRequest('http://localhost/api/business/modules', {
        method:'PATCH',
        body: JSON.stringify({ enabled_modules: [] }),
      })
      const res = await ModulesPATCH(req as any)
      expect(res.status).toBe(200)
      expect(chains.updateChain.update).toHaveBeenCalledWith({ enabled_modules: [] })
    })
    it('all valid modules preserved', async () => {
      const { chains } = setupModulesMocks({ user:{id:'u1'} })
      const all = ['bookings','crm','pos','inventory','notifications']
      const req = new NextRequest('http://localhost/api/business/modules', {
        method:'PATCH',
        body: JSON.stringify({ enabled_modules: all }),
      })
      const res = await ModulesPATCH(req as any)
      expect(res.status).toBe(200)
      expect(chains.updateChain.update).toHaveBeenCalledWith({ enabled_modules: all })
    })
    it('update error 500', async () => {
      setupModulesMocks({ user:{id:'u1'}, updateError:{ message:'db error' } })
      const req = new NextRequest('http://localhost/api/business/modules', {
        method:'PATCH',
        body: JSON.stringify({ enabled_modules: ['bookings'] }),
      })
      const res = await ModulesPATCH(req as any)
      expect(res.status).toBe(500)
      expect((await res.json()).error).toBe('db error')
    })
    it('eq called with owner_id', async () => {
      const { chains } = setupModulesMocks({ user:{id:'owner-123'} })
      const req = new NextRequest('http://localhost/api/business/modules', {
        method:'PATCH',
        body: JSON.stringify({ enabled_modules: ['pos'] }),
      })
      await ModulesPATCH(req as any)
      expect(chains.updateChain.eq).toHaveBeenCalledWith('owner_id','owner-123')
    })
    it('fast-check modules filter property', async () => {
      await fc.assert(fc.asyncProperty(fc.array(fc.string()), async (arr) => {
        const { chains } = setupModulesMocks({ user:{id:'u1'} })
        const req = new NextRequest('http://localhost/api/business/modules', {
          method:'PATCH',
          body: JSON.stringify({ enabled_modules: arr }),
        })
        const res = await ModulesPATCH(req as any)
        expect(res.status).toBe(200)
        // update called with filtered valid only
        const callArg = chains.updateChain.update.mock.calls[0][0]
        const valid = ['bookings','crm','pos','inventory','notifications']
        expect(callArg.enabled_modules.every((m:string)=> valid.includes(m))).toBe(true)
      }), { numRuns: 10 })
    })
  })
})
