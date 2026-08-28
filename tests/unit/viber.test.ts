import { describe, it, expect, vi, beforeEach } from 'vitest'
global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ status: 0 }) } as any) as any
import { sendViberMessage, tplNewBooking } from '@/lib/viber'
describe('viber',()=>{
  beforeEach(()=>vi.clearAllMocks())
  it('send success',async()=>{expect(await sendViberMessage('tok','user','hi')).toBe(true)})
  it('send fail',async()=>{(global.fetch as any)=vi.fn().mockResolvedValue({json:async()=>({status:1})} as any); expect(await sendViberMessage('tok','user','hi')).toBe(false)})
  it('tpl',()=>{expect(tplNewBooking({clientName:'A',serviceName:'S',date:'d',time:'t'})).toContain('New booking')})
})
