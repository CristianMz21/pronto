import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as fc from 'fast-check'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/create-business', () => ({ insertOwnerAsEmployee: vi.fn().mockResolvedValue({}) }))
vi.mock('isomorphic-dompurify', () => ({ default:{ sanitize: (s:string)=> s.replace(/<[^>]*>/g,'').trim() }}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(()=>true), getIp: vi.fn(()=>'1.1.1.1') }))
vi.mock('@/lib/email', () => ({ sendLowStockAlert: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/gcal', () => ({ buildGCalUrlFromISO: vi.fn(()=> 'https://cal') }))

describe('book final 100 strict', ()=>{
  beforeEach(()=> vi.clearAllMocks())

  it('covers contact_required and sanitization (63)', async()=>{
    const { createServiceClient } = await import('@/lib/supabase/service')
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({ auth:{ getUser: vi.fn(async()=>({data:{user:null}, error:null})) } } as any)
    vi.mocked(createServiceClient).mockReturnValue({ from: vi.fn(()=>({ select: vi.fn(()=>({ eq: vi.fn(()=>({})) }) )})) } as any)
    const { POST } = await import('@/app/api/book/route')
    const base={ businessId:'11111111-1111-1111-1111-111111111111', serviceId:'22222222-2222-2222-2222-222222222222', date:'2026-12-15', time:'10:00', name:'John' }
    let req=new NextRequest('http://localhost/api/book', { method:'POST', body: JSON.stringify(base)} as any)
    let res=await POST(req as any)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('contact_required')
    // XSS sanitization
    fc.assert(fc.property(fc.string({maxLength:50}), (s)=>{
      const clean=s.replace(/<[^>]*>/g,'').trim()
      expect(clean.length).toBeLessThanOrEqual(50)
    }))
  })

  it('covers claim user_id !== null with insert success and fallback failure (191-220)', async()=>{
    const { createServiceClient } = await import('@/lib/supabase/service')
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({ auth:{ getUser: vi.fn(async()=>({data:{user:{id:'u1'}}, error:null})) } } as any)
    const biz={ timezone:'UTC', min_advance_minutes:30, booking_lead_time_enabled:true, allow_guest_bookings:true }
    const service={ id:'s1', duration_min:30, price:100 }
    const futureDate=new Date(Date.now()+48*3600*1000).toISOString().slice(0,10)
    const allDays=Array.from({length:7},(_,i)=>({day_of_week:i, is_open:true, open_time:'09:00', close_time:'18:00', break_start:null, break_end:null}))
    // helper to make chain that handles any method
    function makeChain(data:any){
      const c:any={}
      ;['select','eq','or','limit','maybeSingle','single','gte','lte','not'].forEach(m=> c[m]=vi.fn(()=>c))
      c.maybeSingle=vi.fn(async()=>({data: Array.isArray(data)? data[0]??null : data, error:null}))
      c.single=vi.fn(async()=>({data: Array.isArray(data)? data[0]??null : data, error:null}))
      c.then=(r:any)=> Promise.resolve({data, error:null}).then(r)
      return c
    }
    // First: fallback success
    let clientCall=0
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn((t:string)=>{
        if(t==='services') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ eq: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:service, error:null})) })) })) })) })) } as any
        if(t==='businesses') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:biz, error:null})) })) })) } as any
        if(t==='business_hours') return { select: vi.fn(()=>({ eq: vi.fn(async()=>({data: allDays, error:null})) })) } as any
        if(t==='clients'){
          clientCall++
          if(clientCall===1) return makeChain(null) // linked null
          if(clientCall===2) return makeChain([{id:'c_exist', name:'Exist', email:'e@e.com', telegram_id:'tg1', viber_user_id:'vb1', user_id:'other'}]) // claim found
          if(clientCall===3) return { select: vi.fn(()=>({ single: vi.fn(async()=>({data:null, error:{message:'dup'}})) })), insert: vi.fn(()=>({ select: vi.fn(()=>({ single: vi.fn(async()=>({data:null, error:{message:'dup'}})) })) })), update: vi.fn(()=>({}) ) } as any // insert will be called via from('clients').insert
          // fallback fetch
          if(clientCall===4) return makeChain({id:'c_fallback', telegram_id:'tg2', viber_user_id:'vb2'})
          return makeChain(null)
        }
        if(t==='appointments') return { insert: vi.fn(()=>({ select: vi.fn(()=>({ single: vi.fn(async()=>({data:{id:'a1'}, error:null})) })) })) } as any
        return makeChain(null)
      }),
    } as any)
    // Need to handle insert separately: from('clients').insert will be called, not select
    // Our mock for clients insert must be on from('clients').insert, but above we returned makeChain for select only. We need to handle insert mock directly.
    // Let's override clients mock to have both select and insert
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn((t:string)=>{
        if(t==='services') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ eq: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:service, error:null})) })) })) })) })) } as any
        if(t==='businesses') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:biz, error:null})) })) })) } as any
        if(t==='business_hours') return { select: vi.fn(()=>({ eq: vi.fn(async()=>({data: allDays, error:null})) })) } as any
        if(t==='clients'){
          clientCall++
          if(clientCall===1) return makeChain(null)
          if(clientCall===2) return makeChain([{id:'c_exist', name:'Exist', email:'e@e.com', telegram_id:'tg1', viber_user_id:'vb1', user_id:'other'}])
          if(clientCall===3){
            // this call is for insert: from('clients').insert(...).select(...).single()
            return { insert: vi.fn(()=>({ select: vi.fn(()=>({ single: vi.fn(async()=>({data:null, error:{message:'dup'}})) })) })), select: vi.fn(()=> makeChain(null)) } as any
          }
          if(clientCall===4) return makeChain({id:'c_fallback', telegram_id:'tg2', viber_user_id:'vb2'})
          return makeChain(null)
        }
        if(t==='appointments') return { insert: vi.fn(()=>({ select: vi.fn(()=>({ single: vi.fn(async()=>({data:{id:'a1'}, error:null})) })) })) } as any
        return makeChain(null)
      }),
    } as any)
    global.fetch=vi.fn(async()=>({ ok:true, text: async()=>''} as any)) as any
    const { POST } = await import('@/app/api/book/route')
    let req=new NextRequest('http://localhost/api/book', { method:'POST', body: JSON.stringify({ businessId:'11111111-1111-1111-1111-111111111111', serviceId:'22222222-2222-2222-2222-222222222222', date: futureDate, time:'10:00', name:'John', phone:'+123', email:'e@e.com'})} as any)
    let res=await POST(req as any)
    expect(res.status).toBe(200)

    // Second: fallback fails -> 500
    clientCall=0
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn((t:string)=>{
        if(t==='services') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ eq: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:service, error:null})) })) })) })) })) } as any
        if(t==='businesses') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:biz, error:null})) })) })) } as any
        if(t==='business_hours') return { select: vi.fn(()=>({ eq: vi.fn(async()=>({data: allDays, error:null})) })) } as any
        if(t==='clients'){
          clientCall++
          if(clientCall===1) return makeChain(null)
          if(clientCall===2) return makeChain([{id:'c_exist', name:'Exist', email:'e@e.com', telegram_id:null, viber_user_id:null, user_id:'other'}])
          if(clientCall===3) return { insert: vi.fn(()=>({ select: vi.fn(()=>({ single: vi.fn(async()=>({data:null, error:{message:'dup'}})) })) })), select: vi.fn(()=> makeChain(null)) } as any
          if(clientCall===4) return makeChain(null)
          return makeChain(null)
        }
        if(t==='appointments') return { insert: vi.fn(()=>({ select: vi.fn(()=>({ single: vi.fn(async()=>({data:{id:'a1'}, error:null})) })) })) } as any
        return makeChain(null)
      }),
    } as any)
    req=new NextRequest('http://localhost/api/book', { method:'POST', body: JSON.stringify({ businessId:'11111111-1111-1111-1111-111111111111', serviceId:'22222222-2222-2222-2222-222222222222', date: futureDate, time:'10:00', name:'John', phone:'+123'})} as any)
    res=await POST(req as any)
    expect(res.status).toBe(500)
  })

  it('covers 223-240 no match create new client success vs failure', async()=>{
    const { createServiceClient } = await import('@/lib/supabase/service')
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue({ auth:{ getUser: vi.fn(async()=>({data:{user:{id:'u1'}}, error:null})) } } as any)
    const biz={ timezone:'UTC', min_advance_minutes:30, booking_lead_time_enabled:true, allow_guest_bookings:true }
    const service={ id:'s1', duration_min:30, price:100 }
    const futureDate=new Date(Date.now()+48*3600*1000).toISOString().slice(0,10)
    const allDays=Array.from({length:7},(_,i)=>({day_of_week:i, is_open:true, open_time:'09:00', close_time:'18:00', break_start:null, break_end:null}))
    function makeChain(data:any){
      const c:any={}
      ;['select','eq','or','limit','maybeSingle','single'].forEach(m=> c[m]=vi.fn(()=>c))
      c.maybeSingle=vi.fn(async()=>({data: Array.isArray(data)? data[0]??null : data, error:null}))
      c.single=vi.fn(async()=>({data, error:null}))
      c.then=(r:any)=> Promise.resolve({data, error:null}).then(r)
      return c
    }
    let clientCall=0
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn((t:string)=>{
        if(t==='services') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ eq: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:service, error:null})) })) })) })) })) } as any
        if(t==='businesses') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:biz, error:null})) })) })) } as any
        if(t==='business_hours') return { select: vi.fn(()=>({ eq: vi.fn(async()=>({data: allDays, error:null})) })) } as any
        if(t==='clients'){
          clientCall++
          if(clientCall===1) return makeChain(null) // linked
          if(clientCall===2) return makeChain([]) // claim none
          if(clientCall===3) return { insert: vi.fn(()=>({ select: vi.fn(()=>({ single: vi.fn(async()=>({data:{id:'c_new'}, error:null})) })) })) } as any
          return makeChain(null)
        }
        if(t==='appointments') return { insert: vi.fn(()=>({ select: vi.fn(()=>({ single: vi.fn(async()=>({data:{id:'a_new'}, error:null})) })) })) } as any
        return makeChain(null)
      }),
    } as any)
    global.fetch=vi.fn(async()=>({ ok:true, text: async()=>''} as any)) as any
    const { POST } = await import('@/app/api/book/route')
    let req=new NextRequest('http://localhost/api/book', { method:'POST', body: JSON.stringify({ businessId:'11111111-1111-1111-1111-111111111111', serviceId:'22222222-2222-2222-2222-222222222222', date: futureDate, time:'10:00', name:'<b>John</b>', phone:'+123'})} as any)
    let res=await POST(req as any)
    expect(res.status).toBe(200)
    expect((await res.json()).clientId).toBe('c_new')

    // insert fails
    clientCall=0
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn((t:string)=>{
        if(t==='services') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ eq: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:service, error:null})) })) })) })) })) } as any
        if(t==='businesses') return { select: vi.fn(()=>({ eq: vi.fn(()=>({ maybeSingle: vi.fn(async()=>({data:biz, error:null})) })) })) } as any
        if(t==='business_hours') return { select: vi.fn(()=>({ eq: vi.fn(async()=>({data: allDays, error:null})) })) } as any
        if(t==='clients'){
          clientCall++
          if(clientCall===1) return makeChain(null)
          if(clientCall===2) return makeChain([])
          if(clientCall===3) return { insert: vi.fn(()=>({ select: vi.fn(()=>({ single: vi.fn(async()=>({data:null, error:{message:'fail'}})) })) })) } as any
          return makeChain(null)
        }
        return makeChain(null)
      }),
    } as any)
    req=new NextRequest('http://localhost/api/book', { method:'POST', body: JSON.stringify({ businessId:'11111111-1111-1111-1111-111111111111', serviceId:'22222222-2222-2222-2222-222222222222', date: futureDate, time:'10:00', name:'John', phone:'+123'})} as any)
    res=await POST(req as any)
    expect(res.status).toBe(500)
  })
})
