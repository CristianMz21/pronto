import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as any) as any
import { sendWhatsAppMessage, tplBookingConfirmation } from '@/lib/whatsapp'
describe('whatsapp',()=>{
  beforeEach(()=>{vi.clearAllMocks()})
  it('normalize', async()=>{const {__testNormalizePhone}=await import('@/lib/whatsapp'); expect(__testNormalizePhone('  +34 600 123-456 ')).toBe('34600123456')})
  it('send success',async()=>{process.env.META_WHATSAPP_PHONE_NUMBER_ID='id';process.env.META_WHATSAPP_ACCESS_TOKEN='tok'; (global.fetch as any)=vi.fn().mockResolvedValue({ok:true,json:async()=>({})} as any); expect(await sendWhatsAppMessage('123','hi')).toBe(true)})
  it('tpl',()=>{expect(tplBookingConfirmation({clientName:'A',serviceName:'S',date:'d',time:'t',businessName:'B'})).toContain('Booking confirmed')})
})
