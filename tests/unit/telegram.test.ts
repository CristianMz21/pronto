import { beforeEach, describe, expect, it, vi } from 'vitest'

global.fetch = vi
  .fn()
  .mockResolvedValue({ json: async () => ({ ok: true, status: 0 }) } as any) as any

import {
  getTelegramBotInfo,
  sendTelegramMessage,
  setTelegramWebhook,
  tplBirthday,
  tplLowStock,
  tplNewBooking,
  tplReactivation,
  tplReminder,
  tplThankYou,
} from '@/lib/telegram'

describe('telegram exhaustive', () => {
  beforeEach(() => vi.clearAllMocks())
  it('send success', async () => {
    ;(global.fetch as any).mockResolvedValue({ json: async () => ({ ok: true }) } as any)
    expect(await sendTelegramMessage('tok', 'chat', 'hi')).toBe(true)
  })
  it('send fail', async () => {
    ;(global.fetch as any).mockResolvedValue({ json: async () => ({ ok: false }) } as any)
    expect(await sendTelegramMessage('tok', 'chat', 'hi')).toBe(false)
  })
  it('webhook', async () => {
    ;(global.fetch as any).mockResolvedValue({ json: async () => ({ ok: true }) } as any)
    expect((await setTelegramWebhook('tok', 'https://x')).ok).toBe(true)
  })
  it('botInfo', async () => {
    ;(global.fetch as any).mockResolvedValue({
      json: async () => ({ ok: true, result: { username: 'bot', first_name: 'Bot' } }),
    } as any)
    expect((await getTelegramBotInfo('tok')).ok).toBe(true)
  })
  it('tpl', () => {
    expect(
      tplNewBooking({ clientName: '<script>', serviceName: 'S', date: 'd', time: 't' }),
    ).not.toContain('<script>')
    expect(tplLowStock({ itemName: '<b>', quantity: 1, unit: 'pcs', threshold: 5 })).toContain(
      '&lt;b&gt;',
    )
    expect(tplThankYou({ clientName: 'A', serviceName: 'S' })).toContain('Visit completed')
    expect(
      tplReminder({ clientName: 'A', serviceName: 'S', date: 'd', time: 't', isOneHour: true }),
    ).toContain('1 hour')
    expect(tplReactivation({ clientName: 'A' })).toContain('Reactivation')
    expect(tplBirthday({ clientName: 'A' })).toContain('Birthday')
  })
})
