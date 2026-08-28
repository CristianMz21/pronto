import { describe, it, expect, vi } from 'vitest'
global.fetch=vi.fn().mockResolvedValue({json:async()=>({status:0})} as any) as any
import { sendViberMessage } from '@/lib/viber'
describe('viber',()=>{it('a',async()=>{expect(await sendViberMessage('tok','user','hi')).toBe(true)})})
