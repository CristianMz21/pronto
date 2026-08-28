import { describe, it, expect, vi } from 'vitest'
global.fetch=vi.fn().mockResolvedValue({json:async()=>({ok:true})} as any) as any
import { sendTelegramMessage } from '@/lib/telegram'
describe('telegram',()=>{it('a',async()=>{expect(await sendTelegramMessage('tok','chat','hi')).toBe(true)})})
