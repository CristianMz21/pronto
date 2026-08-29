import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendLowStockAlert: vi.fn().mockResolvedValue({}),
  sendBookingConfirmation: vi.fn().mockResolvedValue({}),
  sendReminder: vi.fn().mockResolvedValue({}),
  sendThankYou: vi.fn().mockResolvedValue({}),
  sendReactivation: vi.fn().mockResolvedValue({}),
  sendBirthday: vi.fn().mockResolvedValue({}),
  formatEmailDate: vi.fn(()=> 'Jan 15'),
  formatEmailTime: vi.fn(()=> '10:00'),
}))
vi.mock('@/lib/telegram', () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(true),
  tplNewBooking: vi.fn(()=> 'new'),
  tplLowStock: vi.fn(()=> 'low'),
  setTelegramWebhook: vi.fn().mockResolvedValue({ok:true}),
  getTelegramBotInfo: vi.fn().mockResolvedValue({ok:true, result:{username:'bot'}}),
  tplThankYou: vi.fn(()=> 'thank'),
  tplReactivation: vi.fn(()=> 'react'),
  tplBirthday: vi.fn(()=> 'bday'),
  tplReminderClient: vi.fn(()=> 'rem'),
}))
vi.mock('@/lib/viber', () => ({
  sendViberMessage: vi.fn().mockResolvedValue(true),
  tplLowStock: vi.fn(()=> 'v low'),
  setViberWebhook: vi.fn().mockResolvedValue({ok:true}),
  getViberBotInfo: vi.fn().mockResolvedValue({ok:true, name:'bot'}),
}))
vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(true),
  tplLowStock: vi.fn(()=> 'wa low'),
  tplBookingConfirmation: vi.fn(()=> 'conf'),
  tplReminder: vi.fn(()=> 'rem'),
  tplThankYou: vi.fn(()=> 'thank'),
  tplReactivation: vi.fn(()=> 'react'),
  tplBirthday: vi.fn(()=> 'bday'),
}))
vi.mock('@/lib/gcal', () => ({ buildGCalUrlFromISO: vi.fn(()=> 'https://cal.com') }))
vi.mock('isomorphic-dompurify', () => ({ default: { sanitize: (s:string)=> s.replace(/<[^>]*>/g,'').trim() } }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(()=>true), getIp: vi.fn(()=>'1.1.1.1') }))

describe('push 95', () => {
  beforeEach(()=> vi.clearAllMocks())

  it('email confirm covers no biz and no client', async () => {
    process.env.INTERNAL_API_SECRET='s3cret'
    const supa = await import('@supabase/supabase-js')
    ;(supa.createClient as any).mockReturnValue({
      from: vi.fn((table:string)=>{
        if(table==='appointments') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ single: vi.fn(async()=>({data:{ id:'a1', starts_at:'2026-01-15T10:00:00Z', business_id:'b1', source:null, services:null, employees:null, clients:null }, error:null})) })) })) } as any
        if(table==='businesses') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ single: vi.fn(async()=>({data:null, error:null})) })) })) } as any
        if(table==='notification_log') return {
          select: vi.fn(()=>({ eq: vi.fn(()=>({ eq: vi.fn(()=>({ eq: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:null, error:null})) })) })) })) })) })),
          insert: vi.fn(async()=>({error:null})),
        } as any
        return { select: vi.fn(()=>({})) } as any
      }),
    } as any)
    const { POST } = await import('@/app/api/email/confirm/route')
    const req = new NextRequest('http://localhost/api/email/confirm', { method:'POST', headers:{ authorization:'Bearer s3cret' }, body: JSON.stringify({appointmentId:'a1', formEmail:'test@test.com'}) } as any)
    const res = await POST(req as any)
    expect(res.status).toBe(200)
  })

  it('email confirm covers apptErr and biz null', async () => {
    process.env.INTERNAL_API_SECRET='s3cret'
    const supa = await import('@supabase/supabase-js')
    ;(supa.createClient as any).mockReturnValue({
      from: vi.fn((table:string)=>{
        if(table==='appointments') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ single: vi.fn(async()=>({data:null, error:{message:'fetch fail'}})) })) })) } as any
        if(table==='businesses') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ single: vi.fn(async()=>({data:null, error:null})) })) })) } as any
        return { select: vi.fn(()=>({})) } as any
      }),
    } as any)
    const { POST } = await import('@/app/api/email/confirm/route')
    const req = new NextRequest('http://localhost/api/email/confirm', { method:'POST', headers:{ authorization:'Bearer s3cret' }, body: JSON.stringify({appointmentId:'a1'}) } as any)
    const res = await POST(req as any)
    expect(res.status).toBe(404)
  })

  it('cron covers thankyou with no biz slug and reactivation with no biz', async () => {
    process.env.CRON_SECRET='secret'
    const { createClient } = await import('@supabase/supabase-js')
    const now = new Date()
    const bizNoSlug = { name:'Biz', slug:null, telegram_bot_token:null, telegram_chat_id:null, viber_bot_token:null, viber_chat_id:null, meta_whatsapp_phone_number_id:null, meta_whatsapp_access_token:null }
    const completed = { id:'a1', business_id:'b1', services:{name:'Cut'}, clients:{name:'Client', email:'c@test.com', whatsapp_number:null, viber_user_id:null, telegram_id:null} }
    const dormant = { id:'c1', name:'Dormant', email:'d@test.com', whatsapp_number:null, viber_user_id:null, telegram_id:null, business_id:'b1', last_visit_at: new Date(now.getTime()-30*24*3600*1000).toISOString() }
    let apptCall=0
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn((table:string)=>{
        if(table==='appointments'){
          apptCall++
          if(apptCall<=2){
            const c:any={}; ['select','gte','lte','eq','not'].forEach(m=> c[m]=vi.fn(()=>c)); c.then=(r:any)=> Promise.resolve({data:[], error:null}).then(r); return c
          } else {
            const c:any={}; ['select','eq','gte','lte','not'].forEach(m=> c[m]=vi.fn(()=>c)); c.then=(r:any)=> Promise.resolve({data:[completed], error:null}).then(r); return c
          }
        }
        if(table==='clients'){
          const c:any={}; ['select','gte','lte','not','eq'].forEach(m=> c[m]=vi.fn(()=>c)); c.then=(r:any)=> Promise.resolve({data:[dormant], error:null}).then(r); return c
        }
        if(table==='businesses'){
          return { select: vi.fn(()=>({ eq: vi.fn(()=>({ single: vi.fn(async()=>({data: bizNoSlug, error:null})) })) })) } as any
        }
        if(table==='notification_log'){
          return { insert: vi.fn(async()=>({error:null})) } as any
        }
        const c:any={}; ['select','gte','lte','eq','not'].forEach(m=> c[m]=vi.fn(()=>c)); c.then=(r:any)=> Promise.resolve({data:[], error:null}).then(r); return c
      }),
    } as any)
    const { GET } = await import('@/app/api/cron/notify/route')
    const req = new NextRequest('http://localhost/api/cron/notify', { headers:{ authorization:'Bearer secret'} } as any)
    const res = await GET(req as any)
    expect(res.status).toBe(200)
  })

  it('telegram webhook covers all branches', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const biz = { id:'b1', name:'Biz', telegram_bot_token:'tok', telegram_chat_id:'tc' }
    // Test biz without token
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn(()=>({ select: vi.fn(()=>({ eq: vi.fn(()=>({ single: vi.fn(async()=>({data:{id:'b1', telegram_bot_token:null}, error:null})) })) })) })),
    } as any)
    let { POST } = await import('@/app/api/telegram/webhook/route')
    let body = { message:{ chat:{id:'1'}, text:'hello', from:{first_name:'John'} } }
    let req = new NextRequest('http://localhost/api/telegram/webhook?bid=b1', { method:'POST', body: JSON.stringify(body)} as any)
    let res = await POST(req as any)
    expect(res.status).toBe(200)

    // Test with token and various messages
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn((table:string)=>{
        if(table==='businesses') return {
          select: vi.fn(()=>({ eq: vi.fn(()=>({ single: vi.fn(async()=>({data: biz, error:null})) })) })),
          update: vi.fn(()=>({ eq: vi.fn(async()=>({error:null})) })),
        } as any
        if(table==='clients') return {
          select: vi.fn(()=>({ eq: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:null, error:null})) })) })) })),
          update: vi.fn(()=>({ eq: vi.fn(()=>({ eq: vi.fn(async()=>({data:null, error:null})) })) })),
        } as any
        if(table==='appointments') return {
          select: vi.fn(()=>({ eq: vi.fn(()=>({ gte: vi.fn(()=>({ lte: vi.fn(()=>({ order: vi.fn(async()=>({data:[], error:null})) })) })) })) })),
        } as any
        return { select: vi.fn(()=>({})) } as any
      })
    } as any)
    const cases = [
      { text:'/start', chat:{id:'1'} },
      { text:'/link', chat:{id:'1'} },
      { text:'/today', chat:{id:'1'} },
      { text:'/help', chat:{id:'1'} },
      { text:'unknown', chat:{id:'1'} },
      { text:'hello', chat:{id:'999'} }, // fallback with biz_chat_id !== chat
    ]
    for(const c of cases){
      const b = { message:{ chat:c.chat, text:c.text, from:{first_name:'John'} } }
      const r = new NextRequest('http://localhost/api/telegram/webhook?bid=b1', { method:'POST', body: JSON.stringify(b)} as any)
      const resp = await POST(r as any)
      expect(resp.status).toBe(200)
    }
  })

  it('register covers slug collision 3 times', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const { createClient: createAdmin } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockResolvedValue({
      auth:{ signUp: vi.fn().mockResolvedValue({data:{user:{id:'u1', email:'a@b.com', user_metadata:{full_name:'John'}}, session:{access_token:'tok'}}, error:null}) }
    } as any)
    let slugAttempt=0
    vi.mocked(createAdmin).mockReturnValue({
      from: vi.fn(()=>({
        select: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>{
          if(slugAttempt++ < 3) return {data:{id:'existing'}, error:null}
          return {data:null, error:null}
        }) })) })),
        insert: vi.fn(()=>({ select: vi.fn(()=>({ single: vi.fn(async()=>({data:{id:'b1'}, error:null})) })) })),
      }))
    } as any)
    const { register } = await import('@/app/(auth)/register/actions')
    const fd = new FormData(); fd.set('email','a@b.com'); fd.set('password','12345678'); fd.set('business_name','Test Biz')
    await expect(register(fd)).rejects.toThrow('NEXT_REDIRECT')
  })
})
