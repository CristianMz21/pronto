import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/mailer',()=>({sendMail:vi.fn().mockResolvedValue({id:'1'}),getFromAddress:()=>'a@test.com'}))
import { sendBookingConfirmation } from '@/lib/email'
describe('email',()=>{it('a',async()=>{expect(await sendBookingConfirmation({to:'a@test.com',clientName:'A',businessName:'B',serviceName:'S',date:'d',time:'t'})).toBeDefined()})})
