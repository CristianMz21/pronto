import { describe, it, expect, vi } from 'vitest'
global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as any) as any
import { sendWhatsAppMessage, __testNormalizePhone, tplBookingConfirmation, tplReminder } from '@/lib/whatsapp'
describe('whatsapp exhaustive', () => {
  it('normalize', () => { expect(__testNormalizePhone('  +34 600 123-456 ')).toBe('34600123456') })
  it('send', async () => { process.env.META_WHATSAPP_PHONE_NUMBER_ID='id'; process.env.META_WHATSAPP_ACCESS_TOKEN='tok'; expect(await sendWhatsAppMessage('123','hi',{phoneNumberId:'id',accessToken:'tok'})).toBe(true); expect(await sendWhatsAppMessage('123','hi')).toBe(true) })
  it('tpl', () => { expect(tplBookingConfirmation({clientName:'A',serviceName:'S',date:'d',time:'t',businessName:'B',employeeName:'E',address:'Addr'})).toContain('Specialist: E'); expect(tplReminder({clientName:'A',serviceName:'S',date:'d',time:'t',businessName:'B',isOneHour:true})).toContain('1 hour') })
})
