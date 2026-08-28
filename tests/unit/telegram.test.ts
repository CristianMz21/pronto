import { describe, it, expect, vi, beforeEach } from 'vitest'
global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, status: 0 }) } as any) as any
import { sendTelegramMessage, tplNewBooking, tplLowStock } from '@/lib/telegram'
describe('telegram',()=>{
  beforeEach(()=>vi.clearAllMocks())
  it('send success', async()=>{const m=vi.fn().mockResolvedValue({json:async()=>({ok:true})} as any); global.fetch=m as any; expect(await sendTelegramMessage('tok','chat','hi')).toBe(true)})
  it('send api error', async()=>{global.fetch=vi.fn().mockResolvedValue({json:async()=>({ok:false})} as any) as any; expect(await sendTelegramMessage('tok','chat','hi')).toBe(false)})
  it('tpl escapes',()=>{expect(tplNewBooking({clientName:'<script>',serviceName:'S',date:'d',time:'t'})).not.toContain('<script>'); expect(tplLowStock({itemName:'<b>',quantity:1,unit:'pcs',threshold:5})).toContain('&lt;b&gt;')})
})
