import { describe, it, expect, vi } from 'vitest'
global.fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({})} as any) as any
import { sendWhatsAppMessage } from '@/lib/whatsapp'
describe('whatsapp',()=>{it('a',async()=>{process.env.META_WHATSAPP_PHONE_NUMBER_ID='id';process.env.META_WHATSAPP_ACCESS_TOKEN='tok';expect(await sendWhatsAppMessage('123','hi')).toBe(true)})})
