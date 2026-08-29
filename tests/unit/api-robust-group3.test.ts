import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Mocks
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendBookingConfirmation: vi.fn().mockResolvedValue({ id: '1' }),
  sendReminder: vi.fn().mockResolvedValue({}),
  sendThankYou: vi.fn().mockResolvedValue({}),
  sendReactivation: vi.fn().mockResolvedValue({}),
  sendBirthday: vi.fn().mockResolvedValue({}),
  formatEmailDate: vi.fn(() => 'Jan 15'),
  formatEmailTime: vi.fn(() => '10:00'),
}))
vi.mock('@/lib/telegram', () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(true),
  tplNewBooking: vi.fn((o:any)=>`New ${o.clientName}`),
  tplReminderClient: vi.fn(()=> 'reminder'),
  tplThankYou: vi.fn(()=> 'thank'),
  tplReactivation: vi.fn(()=> 'react'),
  tplBirthday: vi.fn(()=> 'bday'),
  tplThankYouClient: vi.fn(()=> 'thank client'),
  tplReactivationClient: vi.fn(()=> 'react client'),
  tplBirthdayClient: vi.fn(()=> 'bday client'),
}))
vi.mock('@/lib/viber', () => ({
  sendViberMessage: vi.fn().mockResolvedValue(true),
  tplNewBooking: vi.fn(()=> 'viber new'),
  tplReminderClient: vi.fn(()=> 'viber reminder'),
  tplThankYou: vi.fn(()=> 'viber thank'),
  tplReactivation: vi.fn(()=> 'viber react'),
  tplBirthday: vi.fn(()=> 'viber bday'),
  tplThankYouClient: vi.fn(()=> 'viber thank client'),
  tplBirthdayClient: vi.fn(()=> 'viber bday client'),
}))
vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(true),
  tplBookingConfirmation: vi.fn(()=> 'wa confirm'),
  tplReminder: vi.fn(()=> 'wa reminder'),
  tplThankYou: vi.fn(()=> 'wa thank'),
  tplReactivation: vi.fn(()=> 'wa react'),
  tplBirthday: vi.fn(()=> 'wa bday'),
}))
vi.mock('@/lib/gcal', () => ({ buildGCalUrlFromISO: vi.fn(()=> 'https://cal.com') }))
vi.mock('isomorphic-dompurify', () => ({ default: { sanitize: (s:string)=> s.replace(/<[^>]*>/g,'').trim() } }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(()=>true), getIp: vi.fn(()=>'1.1.1.1') }))

function mockChain(data:any, error:any=null){
  const chain:any = {}
  const methods = ['select','eq','maybeSingle','single','insert','update','gte','lte','not','filter','or','limit','order']
  methods.forEach(m=> chain[m]=vi.fn(()=>chain))
  chain.select = vi.fn(()=>chain)
  chain.eq = vi.fn(()=>chain)
  chain.maybeSingle = vi.fn(async()=>({data, error}))
  chain.single = vi.fn(async()=>({data, error}))
  chain.insert = vi.fn(()=>chain)
  chain.update = vi.fn(()=>chain)
  chain.gte = vi.fn(()=>chain)
  chain.lte = vi.fn(()=>chain)
  chain.not = vi.fn(()=>chain)
  chain.filter = vi.fn(()=>chain)
  chain.or = vi.fn(()=>chain)
  chain.limit = vi.fn(()=>chain)
  chain.order = vi.fn(()=>chain)
  // make thenable for await supabase.from(...).select...
  chain.then = undefined
  return chain
}

describe('api robust group3', () => {
  beforeEach(()=> vi.clearAllMocks())

  describe('email/confirm', () => {
    it('401 cuando secret no coincide', async () => {
      process.env.INTERNAL_API_SECRET='secret123'
      const { POST } = await import('@/app/api/email/confirm/route')
      const req = new NextRequest('http://localhost/api/email/confirm', { method:'POST', headers:{ authorization:'Bearer wrong' }, body: JSON.stringify({appointmentId:'id'}) } as any)
      const res = await POST(req as any)
      expect(res.status).toBe(401)
    })
    it('400 missing appointmentId', async () => {
      process.env.INTERNAL_API_SECRET='secret123'
      const { POST } = await import('@/app/api/email/confirm/route')
      const req = new NextRequest('http://localhost/api/email/confirm', { method:'POST', headers:{ authorization:'Bearer secret123' }, body: JSON.stringify({}) } as any)
      const res = await POST(req as any)
      expect(res.status).toBe(400)
    })
    it('404 cuando appointment no existe', async () => {
      process.env.INTERNAL_API_SECRET='secret123'
      process.env.NEXT_PUBLIC_SUPABASE_URL='http://localhost:54321'
      process.env.SUPABASE_SERVICE_ROLE_KEY='key'
      const { createClient } = await import('@supabase/supabase-js')
      const mockFrom = vi.fn((table:string)=>{
        if(table==='appointments') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ single: vi.fn(async()=>({data:null, error:{message:'not found'}})) })) })) } as any
        return mockChain(null) as any
      })
      vi.mocked(createClient).mockReturnValue({ from: mockFrom } as any)
      const { POST } = await import('@/app/api/email/confirm/route')
      const req = new NextRequest('http://localhost/api/email/confirm', { method:'POST', headers:{ authorization:'Bearer secret123' }, body: JSON.stringify({appointmentId:'uuid-1'}) } as any)
      const res = await POST(req as any)
      expect(res.status).toBe(404)
      delete process.env.INTERNAL_API_SECRET
    })
    it('skipped: no client email', async () => {
      process.env.INTERNAL_API_SECRET='test'
      process.env.NEXT_PUBLIC_SUPABASE_URL='http://localhost:54321'
      process.env.SUPABASE_SERVICE_ROLE_KEY='key'
      const { createClient } = await import('@supabase/supabase-js')
      const appt = { id:'a1', starts_at:'2026-01-15T10:00:00Z', business_id:'b1', source:'online', services:{name:'Cut', duration_min:30}, employees:{name:'John'}, clients:{name:'Client', email:null, whatsapp_number:null, telegram_id:null, viber_user_id:null} }
      const biz = { id:'b1', name:'Biz', address:'Addr', slug:'biz', timezone:'UTC', telegram_bot_token:null, telegram_chat_id:null, viber_bot_token:null, viber_chat_id:null, meta_whatsapp_phone_number_id:null, meta_whatsapp_access_token:null }
      const mockFrom = vi.fn((table:string)=>{
        if(table==='appointments') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ single: vi.fn(async()=>({data: appt, error:null})) })) })) } as any
        if(table==='businesses') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ single: vi.fn(async()=>({data: biz, error:null})) })) })) } as any
        return mockChain(null) as any
      })
      vi.mocked(createClient).mockReturnValue({ from: mockFrom } as any)
      const { POST } = await import('@/app/api/email/confirm/route')
      const req = new NextRequest('http://localhost/api/email/confirm', { method:'POST', headers:{ authorization:'Bearer test' }, body: JSON.stringify({appointmentId:'a1', formEmail:null}) } as any)
      const res = await POST(req as any)
      const j = await res.json()
      expect(j.sent).toBe(true)
      expect(j.email).toContain('skipped')
      delete process.env.INTERNAL_API_SECRET
    })
    it('500 internal catch', async () => {
      const { POST } = await import('@/app/api/email/confirm/route')
      const req = { headers: { get: ()=> 'Bearer test'}, json: async()=>{ throw new Error('boom') } } as any
      process.env.INTERNAL_API_SECRET='test'
      const res = await POST(req)
      expect(res.status).toBe(500)
      delete process.env.INTERNAL_API_SECRET
    })
  })

  describe('user/locale', () => {
    it('400 invalid locale', async () => {
      const { POST } = await import('@/app/api/user/locale/route')
      const req = new NextRequest('http://localhost/api/user/locale', { method:'POST', body: JSON.stringify({locale:'xx'}) } as any)
      const res = await POST(req as any)
      expect(res.status).toBe(400)
    })
    it('200 valid locale sets cookie', async () => {
      const { POST } = await import('@/app/api/user/locale/route')
      for(const loc of ['en','es','it','pt']){
        const req = new NextRequest('http://localhost/api/user/locale', { method:'POST', body: JSON.stringify({locale: loc}) } as any)
        const res = await POST(req as any)
        expect(res.status).toBe(200)
        expect(res.cookies.get('dashboard_locale')?.value).toBe(loc)
      }
    })
    it('handles missing body gracefully', async () => {
      const { POST } = await import('@/app/api/user/locale/route')
      const req = { json: async()=> ({} ) } as any
      const res = await POST(req)
      expect(res.status).toBe(400)
    })
  })

  describe('clients/import', () => {
    it('429 rate limited', async () => {
      const { rateLimit } = await import('@/lib/rate-limit')
      vi.mocked(rateLimit).mockReturnValueOnce(false)
      const { POST } = await import('@/app/api/clients/import/route')
      const req = new NextRequest('http://localhost/api/clients/import', { method:'POST', body: JSON.stringify({clients:[]}) } as any)
      const res = await POST(req as any)
      expect(res.status).toBe(429)
    })
    it('401 unauthorized', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({ auth:{ getUser: async()=>({data:{user:null}, error:{message:'no'}}) }, from: vi.fn() } as any)
      const { POST } = await import('@/app/api/clients/import/route')
      const req = new NextRequest('http://localhost/api/clients/import', { method:'POST', body: JSON.stringify({clients:[]}) } as any)
      const res = await POST(req as any)
      expect(res.status).toBe(401)
    })
    it('400 invalid json', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({ 
        auth:{ getUser: async()=>({data:{user:{id:'u1'}}, error:null}) },
        from: vi.fn((table:string)=> {
          if(table==='businesses') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:{id:'b1'}, error:null})) })) })) } as any
          return mockChain(null) as any
        })
      } as any)
      const { POST } = await import('@/app/api/clients/import/route')
      const req = { headers:{ get:()=>'1.1.1.1'}, json: async()=>{ throw new Error('bad') } } as any
      const res = await POST(req as any)
      expect(res.status).toBe(400)
    })
    it('422 validation failed max 500', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({ 
        auth:{ getUser: async()=>({data:{user:{id:'u1'}}, error:null}) },
        from: vi.fn((table:string)=> {
          if(table==='businesses') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:{id:'b1'}, error:null})) })) })) } as any
          return mockChain(null) as any
        })
      } as any)
      const { POST } = await import('@/app/api/clients/import/route')
      const many = Array.from({length:501}, (_,i)=>({name:`A${i}`}))
      const req = new NextRequest('http://localhost/api/clients/import', { method:'POST', body: JSON.stringify({clients: many}) } as any)
      const res = await POST(req as any)
      expect(res.status).toBe(422)
    })
    it('0 imported when all names empty', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({ 
        auth:{ getUser: async()=>({data:{user:{id:'u1'}}, error:null}) },
        from: vi.fn((table:string)=> {
          if(table==='businesses') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:{id:'b1'}, error:null})) })) })) } as any
          return mockChain(null) as any
        })
      } as any)
      const { POST } = await import('@/app/api/clients/import/route')
      const req = new NextRequest('http://localhost/api/clients/import', { method:'POST', body: JSON.stringify({clients: [{name:''},{name:'   '} ]}) } as any)
      const res = await POST(req as any)
      const j = await res.json()
      expect(j.imported).toBe(0)
    })
    it('imports withPhone and withoutPhone', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockUpsert = vi.fn(()=>({ select: vi.fn(async()=>({data:[{id:'c1'},{id:'c2'}], error:null})) }))
      const mockInsert = vi.fn(()=>({ select: vi.fn(async()=>({data:[{id:'c3'}], error:null})) }))
      vi.mocked(createClient).mockResolvedValue({ 
        auth:{ getUser: async()=>({data:{user:{id:'u1'}}, error:null}) },
        from: vi.fn((table:string)=> {
          if(table==='businesses') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:{id:'b1'}, error:null})) })) })) } as any
          if(table==='clients') return { upsert: mockUpsert, insert: mockInsert } as any
          return mockChain(null) as any
        })
      } as any)
      const { POST } = await import('@/app/api/clients/import/route')
      const req = new NextRequest('http://localhost/api/clients/import', { method:'POST', body: JSON.stringify({clients: [{name:'Alice', phone:'123', email:'a@b.com'}, {name:'Bob', email:'b@c.com'}]}) } as any)
      const res = await POST(req as any)
      const j = await res.json()
      expect(j.imported).toBe(3)
    })
  })

  describe('telegram webhook', () => {
    it('400 sin bid', async () => {
      const { POST } = await import('@/app/api/telegram/webhook/route')
      const req = new NextRequest('http://localhost/api/telegram/webhook', { method:'POST', body: JSON.stringify({}) } as any)
      const res = await POST(req as any)
      expect(res.status).toBe(400)
    })
    it('ok true sin message', async () => {
      const { POST } = await import('@/app/api/telegram/webhook/route')
      const req = new NextRequest('http://localhost/api/telegram/webhook?bid=biz1', { method:'POST', body: JSON.stringify({}) } as any)
      const res = await POST(req as any)
      const j = await res.json()
      expect(j.ok).toBe(true)
    })
    it('500 catch', async () => {
      const { POST } = await import('@/app/api/telegram/webhook/route')
      const req = { nextUrl:{ searchParams:{ get:()=>'biz1'} }, json: async()=>{ throw new Error('boom') } } as any
      const res = await POST(req)
      expect(res.status).toBe(500)
    })
    it('/start vincula owner', async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const biz = { id:'biz1', name:'Biz', telegram_bot_token:'tok', telegram_chat_id:null }
      vi.mocked(createClient).mockReturnValue({
        from: vi.fn((table:string)=>{
          if(table==='businesses') return {
            select: vi.fn(()=>({ eq: vi.fn(()=>({ single: vi.fn(async()=>({data:biz, error:null})) })) })),
            update: vi.fn(()=>({ eq: vi.fn(async()=>({data:null, error:null})) }))
          } as any
          return mockChain(null) as any
        })
      } as any)
      const { POST } = await import('@/app/api/telegram/webhook/route')
      const body = { message:{ chat:{id:'123'}, text:'/start', from:{first_name:'John'} } }
      const req = new NextRequest('http://localhost/api/telegram/webhook?bid=biz1', { method:'POST', body: JSON.stringify(body)} as any)
      const res = await POST(req as any)
      expect(res.status).toBe(200)
    })
  })

  describe('cron notify', () => {
    it('401 sin secret', async () => {
      delete process.env.CRON_SECRET
      const { GET } = await import('@/app/api/cron/notify/route')
      const req = new NextRequest('http://localhost/api/cron/notify', { headers:{ authorization:'Bearer wrong'} } as any)
      const res = await GET(req as any)
      expect(res.status).toBe(401)
    })
    it('401 sin auth header', async () => {
      process.env.CRON_SECRET='mysecret'
      const { GET } = await import('@/app/api/cron/notify/route')
      const req = new NextRequest('http://localhost/api/cron/notify' as any)
      const res = await GET(req as any)
      expect(res.status).toBe(401)
    })
    it('200 con secret correcto y sin datos', async () => {
      process.env.CRON_SECRET='mysecret'
      process.env.NEXT_PUBLIC_SUPABASE_URL='http://localhost:54321'
      process.env.SUPABASE_SERVICE_ROLE_KEY='key'
      const { createClient } = await import('@supabase/supabase-js')
      const makeChain = (data:any=[])=>{
        const chain:any={}
        const methods=['select','eq','gte','lte','not','is','single','insert','from','order']
        methods.forEach(m=> chain[m]=vi.fn(()=>chain))
        chain.single = vi.fn(async()=>({data:null, error:null}))
        chain.then = (res:any)=> Promise.resolve({data, error:null}).then(res)
        chain.catch = (res:any)=> Promise.resolve({data, error:null}).catch(res)
        return chain
      }
      const mockFrom = vi.fn(()=>makeChain([]))
      // Override for specific single that needs data null
      vi.mocked(createClient).mockReturnValue({ from: mockFrom } as any)
      const { GET } = await import('@/app/api/cron/notify/route')
      const req = new NextRequest('http://localhost/api/cron/notify', { headers:{ authorization:'Bearer mysecret'} } as any)
      const res = await GET(req as any)
      const j = await res.json()
      expect(j.ok).toBe(true)
    })
  })

  describe('sitemap', () => {
    it('genera sitemap con rutas', async () => {
      const sitemap = await import('@/app/sitemap')
      const result = sitemap.default()
      expect(Array.isArray(result)).toBe(true)
      // Debe contener al menos / y /login etc
      const urls = result.map((r:any)=>r.url)
      expect(urls.some((u:string)=>u.includes('trypronto.app'))).toBe(true)
    })
    it('filtra rutas excluidas', async () => {
      const sitemap = await import('@/app/sitemap')
      const result = sitemap.default()
      const urls = result.map((r:any)=>r.url)
      expect(urls.some((u:string)=>u.includes('/api'))).toBe(false)
      expect(urls.some((u:string)=>u.includes('/dashboard'))).toBe(false)
    })
  })
})
