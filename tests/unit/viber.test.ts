import { describe, it, expect, vi } from 'vitest'
global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ status: 0 }) } as any) as any
import { sendViberMessage, tplNewBooking, tplReminder } from '@/lib/viber'
describe('viber exhaustive', () => {
  it('send', async () => { expect(await sendViberMessage('tok','user','hi')).toBe(true); (global.fetch as any).mockResolvedValue({ json: async () => ({ status: 1 }) } as any); expect(await sendViberMessage('tok','user','hi')).toBe(false) })
  it('tpl', () => { expect(tplNewBooking({clientName:'A',serviceName:'S',date:'d',time:'t',source:'online'})).toContain('(online)'); expect(tplReminder({clientName:'A',serviceName:'S',date:'d',time:'t',isOneHour:true})).toContain('1 hour') })
})
