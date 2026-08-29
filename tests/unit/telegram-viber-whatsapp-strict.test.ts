import { describe, it, expect, vi, beforeEach } from 'vitest'

import * as telegram from '@/lib/telegram'
import * as viber from '@/lib/viber'
import * as whatsapp from '@/lib/whatsapp'

describe('messaging strict 100%', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('telegram', () => {
    it('send success ok true', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as any) as any
      expect(await telegram.sendTelegramMessage('tok', 'chat', 'hi')).toBe(true)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.telegram.org/bot'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
    it('send returns false when json.ok false', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({ ok: false, description: 'err' }),
        } as any) as any
      expect(await telegram.sendTelegramMessage('tok', 'chat', 'hi')).toBe(false)
    })
    it('send returns false on fetch exception', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('net')) as any
      expect(await telegram.sendTelegramMessage('tok', 'chat', 'hi')).toBe(false)
    })
    it('send with Markdown', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as any) as any
      expect(await telegram.sendTelegramMessage('tok', 'chat', 'hi', 'Markdown')).toBe(true)
    })
    it('setWebhook success', async () => {
      global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) } as any) as any
      expect((await telegram.setTelegramWebhook('tok', 'https://x')).ok).toBe(true)
    })
    it('setWebhook exception', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('fail')) as any
      expect((await telegram.setTelegramWebhook('tok', 'https://x')).ok).toBe(false)
    })
    it('getBotInfo success', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue({
          json: async () => ({ ok: true, result: { username: 'bot', first_name: 'Bot' } }),
        } as any) as any
      const r = await telegram.getTelegramBotInfo('tok')
      expect(r.ok).toBe(true)
      expect(r.result?.username).toBe('bot')
    })
    it('getBotInfo exception returns ok false', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('net')) as any
      expect((await telegram.getTelegramBotInfo('tok')).ok).toBe(false)
    })
    it('escapeTelegramHtml', () => {
      expect(telegram.escapeTelegramHtml('<&">')).toBe('&lt;&amp;&quot;&gt;')
      expect(telegram.escapeTelegramHtml('hello')).toBe('hello')
    })
    it('all template branches', () => {
      expect(
        telegram.tplNewBooking({ clientName: '<a>', serviceName: '<b>', date: 'd', time: 't' }),
      ).toContain('&lt;a&gt;')
      expect(
        telegram.tplNewBooking({
          clientName: 'A',
          serviceName: 'S',
          date: 'd',
          time: 't',
          employeeName: 'E',
          source: 'online',
        }),
      ).toContain('online')
      expect(
        telegram.tplNewBooking({ clientName: 'A', serviceName: 'S', date: 'd', time: 't' }),
      ).not.toContain('online')
      expect(
        telegram.tplReminder({
          clientName: 'A',
          serviceName: 'S',
          date: 'd',
          time: 't',
          isOneHour: true,
        }),
      ).toContain('1 hour')
      expect(
        telegram.tplReminder({ clientName: 'A', serviceName: 'S', date: 'd', time: 't' }),
      ).toContain('tomorrow')
      expect(
        telegram.tplLowStock({ itemName: '<x>', quantity: 1, unit: '<u>', threshold: 5 }),
      ).toContain('&lt;x&gt;')
      expect(telegram.tplThankYou({ clientName: 'A', serviceName: 'S' })).toContain(
        'Visit completed',
      )
      expect(telegram.tplReactivation({ clientName: 'A' })).toContain('Reactivation')
      expect(telegram.tplBirthday({ clientName: 'A' })).toContain('Birthday')
      expect(
        telegram.tplReminderClient({
          clientName: 'A',
          serviceName: 'S',
          date: 'd',
          time: 't',
          businessName: 'B',
          isOneHour: true,
        }),
      ).toContain('1 hour')
      expect(
        telegram.tplReminderClient({
          clientName: 'A',
          serviceName: 'S',
          date: 'd',
          time: 't',
          businessName: 'B',
          address: 'Addr',
        }),
      ).toContain('Addr')
      expect(
        telegram.tplThankYouClient({ clientName: 'A', serviceName: 'S', businessName: 'B' }),
      ).toContain('Thank you')
      expect(
        telegram.tplThankYouClient({
          clientName: 'A',
          serviceName: 'S',
          businessName: 'B',
          bookingUrl: 'https://x',
        }),
      ).toContain('https://x')
      expect(telegram.tplReactivationClient({ clientName: 'A', businessName: 'B' })).toContain(
        'Come back',
      )
      expect(
        telegram.tplReactivationClient({
          clientName: 'A',
          businessName: 'B',
          bookingUrl: 'https://x',
        }),
      ).toContain('https://x')
      expect(telegram.tplBirthdayClient({ clientName: 'A', businessName: 'B' })).toContain(
        'Happy Birthday',
      )
      expect(
        telegram.tplBirthdayClient({ clientName: 'A', businessName: 'B', bookingUrl: 'https://x' }),
      ).toContain('https://x')
    })
    it('XSS escapes in all templates', () => {
      const xss = '<script>alert(1)</script>'
      expect(
        telegram.tplNewBooking({ clientName: xss, serviceName: xss, date: xss, time: xss }),
      ).not.toContain('<script>')
      expect(telegram.tplBirthday({ clientName: xss })).not.toContain('<script>')
    })
  })

  describe('viber', () => {
    it('send success status 0', async () => {
      global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ status: 0 }) } as any) as any
      expect(await viber.sendViberMessage('tok', 'user', 'hi')).toBe(true)
    })
    it('send fail status !=0', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue({
          json: async () => ({ status: 1, status_message: 'fail' }),
        } as any) as any
      expect(await viber.sendViberMessage('tok', 'user', 'hi')).toBe(false)
    })
    it('send exception', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('net')) as any
      expect(await viber.sendViberMessage('tok', 'user', 'hi')).toBe(false)
    })
    it('setWebhook success', async () => {
      global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ status: 0 }) } as any) as any
      expect((await viber.setViberWebhook('tok', 'https://x')).ok).toBe(true)
    })
    it('setWebhook fail status', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue({
          json: async () => ({ status: 1, status_message: 'err' }),
        } as any) as any
      expect((await viber.setViberWebhook('tok', 'https://x')).ok).toBe(false)
    })
    it('setWebhook exception', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('net')) as any
      expect((await viber.setViberWebhook('tok', 'https://x')).ok).toBe(false)
    })
    it('getBotInfo success', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue({
          json: async () => ({ status: 0, name: 'Bot', uri: 'uri' }),
        } as any) as any
      const r = await viber.getViberBotInfo('tok')
      expect(r.ok).toBe(true)
      expect(r.name).toBe('Bot')
    })
    it('getBotInfo fail status', async () => {
      global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ status: 1 }) } as any) as any
      expect((await viber.getViberBotInfo('tok')).ok).toBe(false)
    })
    it('getBotInfo exception', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('net')) as any
      expect((await viber.getViberBotInfo('tok')).ok).toBe(false)
    })
    it('templates', () => {
      expect(
        viber.tplNewBooking({ clientName: 'A', serviceName: 'S', date: 'd', time: 't' }),
      ).toContain('New booking')
      expect(
        viber.tplNewBooking({
          clientName: 'A',
          serviceName: 'S',
          date: 'd',
          time: 't',
          employeeName: 'E',
          source: 'online',
        }),
      ).toContain('online')
      expect(
        viber.tplReminder({
          clientName: 'A',
          serviceName: 'S',
          date: 'd',
          time: 't',
          isOneHour: true,
        }),
      ).toContain('1 hour')
      expect(
        viber.tplReminder({ clientName: 'A', serviceName: 'S', date: 'd', time: 't' }),
      ).toContain('tomorrow')
      expect(viber.tplLowStock({ itemName: 'I', quantity: 1, unit: 'u', threshold: 5 })).toContain(
        'Low stock',
      )
      expect(viber.tplThankYou({ clientName: 'A', serviceName: 'S' })).toContain('Visit completed')
      expect(
        viber.tplReminderClient({
          clientName: 'A',
          serviceName: 'S',
          date: 'd',
          time: 't',
          businessName: 'B',
        }),
      ).toContain('Напоминание')
      expect(
        viber.tplReminderClient({
          clientName: 'A',
          serviceName: 'S',
          date: 'd',
          time: 't',
          businessName: 'B',
          address: 'Addr',
        }),
      ).toContain('Addr')
      expect(
        viber.tplThankYouClient({ clientName: 'A', serviceName: 'S', businessName: 'B' }),
      ).toContain('Спасибо')
      expect(
        viber.tplThankYouClient({
          clientName: 'A',
          serviceName: 'S',
          businessName: 'B',
          bookingUrl: 'https://x',
        }),
      ).toContain('https://x')
      expect(viber.tplReactivation({ clientName: 'A', businessName: 'B' })).toContain('давно')
      expect(viber.tplBirthday({ clientName: 'A', businessName: 'B' })).toContain('днём рождения')
    })
  })

  describe('whatsapp', () => {
    it('normalizePhone via send', async () => {
      expect(whatsapp.__testNormalizePhone('+7 900 123-45-67')).toBe('79001234567')
      expect(whatsapp.__testNormalizePhone('(123) 456-7890')).toBe('1234567890')
      expect(whatsapp.__testNormalizePhone('  +1 (555) 123-4567  ')).toBe('15551234567')
    })
    it('send missing credentials returns false', async () => {
      delete process.env.META_WHATSAPP_PHONE_NUMBER_ID
      delete process.env.META_WHATSAPP_ACCESS_TOKEN
      expect(await whatsapp.sendWhatsAppMessage('123', 'hi')).toBe(false)
    })
    it('send with credentials but empty normalized returns false', async () => {
      expect(
        await whatsapp.sendWhatsAppMessage('   ', 'hi', {
          phoneNumberId: 'id',
          accessToken: 'tok',
        }),
      ).toBe(false)
      expect(
        await whatsapp.sendWhatsAppMessage('', 'hi', { phoneNumberId: 'id', accessToken: 'tok' }),
      ).toBe(false)
    })
    it('send success', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as any) as any
      expect(
        await whatsapp.sendWhatsAppMessage('79001234567', 'hi', {
          phoneNumberId: 'id',
          accessToken: 'tok',
        }),
      ).toBe(true)
    })
    it('send via env success', async () => {
      process.env.META_WHATSAPP_PHONE_NUMBER_ID = 'envId'
      process.env.META_WHATSAPP_ACCESS_TOKEN = 'envTok'
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as any) as any
      expect(await whatsapp.sendWhatsAppMessage('123', 'hi')).toBe(true)
      delete process.env.META_WHATSAPP_PHONE_NUMBER_ID
      delete process.env.META_WHATSAPP_ACCESS_TOKEN
    })
    it('send returns false when res.ok false', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue({
          ok: false,
          json: async () => ({ error: { message: 'err' } }),
        } as any) as any
      expect(
        await whatsapp.sendWhatsAppMessage('123', 'hi', {
          phoneNumberId: 'id',
          accessToken: 'tok',
        }),
      ).toBe(false)
    })
    it('send exception', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('net')) as any
      expect(
        await whatsapp.sendWhatsAppMessage('123', 'hi', {
          phoneNumberId: 'id',
          accessToken: 'tok',
        }),
      ).toBe(false)
    })
    it('templates all branches', () => {
      expect(
        whatsapp.tplBookingConfirmation({
          clientName: 'A',
          serviceName: 'S',
          date: 'd',
          time: 't',
          businessName: 'B',
        }),
      ).toContain('Booking confirmed')
      expect(
        whatsapp.tplBookingConfirmation({
          clientName: 'A',
          serviceName: 'S',
          date: 'd',
          time: 't',
          businessName: 'B',
          employeeName: 'E',
          address: 'Addr',
        }),
      ).toContain('Specialist')
      expect(
        whatsapp.tplReminder({
          clientName: 'A',
          serviceName: 'S',
          date: 'd',
          time: 't',
          businessName: 'B',
          isOneHour: true,
        }),
      ).toContain('1 hour')
      expect(
        whatsapp.tplReminder({
          clientName: 'A',
          serviceName: 'S',
          date: 'd',
          time: 't',
          businessName: 'B',
        }),
      ).toContain('tomorrow')
      expect(
        whatsapp.tplThankYou({ clientName: 'A', serviceName: 'S', businessName: 'B' }),
      ).toContain('Thank you')
      expect(
        whatsapp.tplThankYou({
          clientName: 'A',
          serviceName: 'S',
          businessName: 'B',
          bookingUrl: 'https://x',
        }),
      ).toContain('https://x')
      expect(whatsapp.tplReactivation({ clientName: 'A', businessName: 'B' })).toContain(
        'We miss you',
      )
      expect(
        whatsapp.tplReactivation({ clientName: 'A', businessName: 'B', bookingUrl: 'https://x' }),
      ).toContain('https://x')
      expect(whatsapp.tplBirthday({ clientName: 'A', businessName: 'B' })).toContain(
        'Happy Birthday',
      )
      expect(
        whatsapp.tplBirthday({ clientName: 'A', businessName: 'B', bookingUrl: 'https://x' }),
      ).toContain('https://x')
      expect(
        whatsapp.tplLowStock({ itemName: 'I', quantity: 1, unit: 'u', threshold: 5 }),
      ).toContain('Low stock')
    })
  })
})
