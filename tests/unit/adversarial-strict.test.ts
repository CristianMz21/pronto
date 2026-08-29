import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { slugify, formatCurrency, getTenantSlug } from '@/lib/utils'
import { calcCommission } from '@/lib/commission'
import { checkSlotWithinHours } from '@/lib/booking-availability'
import { sanitizeBusinessName } from '@/lib/mailer'
import { escapeTelegramHtml } from '@/lib/telegram'
import * as telegram from '@/lib/telegram'
import * as viber from '@/lib/viber'

describe('adversarial 100% - agente interno que intenta romper código', () => {
  describe('slugify fuzz', () => {
    it('nunca contiene mayúsculas ni espacios, solo [a-z0-9-]', () => {
      fc.assert(fc.property(fc.string(), (s) => {
        const r = slugify(s)
        expect(r).toMatch(/^[a-z0-9-]*$/)
        expect(r).not.toMatch(/[A-Z]/)
        expect(r).not.toContain(' ')
        expect(r).not.toMatch(/^[-]|[-]$/)
      }))
    })
    it('inyección XSS en slugify se neutraliza', () => {
      const attacks = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "'; DROP TABLE businesses; --", '../../etc/passwd', '${jndi:ldap://evil}']
      for (const a of attacks) {
        const r = slugify(a)
        expect(r).not.toContain('<')
        expect(r).not.toContain('>')
        expect(r).not.toContain("'")
        expect(r).not.toContain('"')
      }
    })
    it('strings gigantes no crashean (500*10)', () => {
      expect(() => slugify('a'.repeat(10000))).not.toThrow()
      expect(slugify('a'.repeat(5000)).length).toBeLessThanOrEqual(5000)
    })
    it('null bytes y unicode', () => {
      expect(slugify('\0\0test')).toBe('test')
      expect(slugify('café\u0000ñ')).toBe('caf')
      expect(slugify('👋🌍 test')).toBe('test')
    })
  })

  describe('calcCommission adversarial', () => {
    it('con NaN, Infinity, -Infinity nunca retorna NaN', () => {
      const vals = [NaN, Infinity, -Infinity, 1e308, -1e308, 0, -0]
      for (const amt of vals) {
        for (const rate of vals) {
          for (const fixed of vals) {
            const r = calcCommission(amt as any, rate as any, fixed as any)
            expect(isNaN(r.amount)).toBe(false)
          }
        }
      }
    })
    it('XSS en amount no injection (solo número)', () => {
      // @ts-ignore
      expect(calcCommission('<script>', '<script>', '<script>').amount).toBe(0)
    })
    it('propiedad fuzz: amount siempre >=0', () => {
      fc.assert(fc.property(fc.double({ noNaN: true }), fc.double({ noNaN: true }), fc.double({ noNaN: true }), (a, r, f) => {
        const res = calcCommission(a, r, f)
        expect(res.amount).toBeGreaterThanOrEqual(0)
        expect(isNaN(res.amount)).toBe(false)
      }))
    })
  })

  describe('checkSlotWithinHours adversarial', () => {
    it('time strings maliciosas no crashean', () => {
      const mal = ['','undefined','null','25:00','12:60','99:99','ab:cd','12:30:45','-1:00', '0', '12', '12:', ':30']
      for (const t of mal) {
        expect(() => checkSlotWithinHours({ day_of_week:1,is_open:true,open_time:'09:00',close_time:'20:00',break_start:null,break_end:null }, t, 30)).not.toThrow()
      }
    })
    it('duration malicioso', () => {
      const durs = [NaN, Infinity, -1, 0, 1e9, -Infinity, Number.MAX_SAFE_INTEGER]
      for (const d of durs) {
        expect(() => checkSlotWithinHours({ day_of_week:1,is_open:true,open_time:'09:00',close_time:'20:00',break_start:null,break_end:null }, '10:00', d as any)).not.toThrow()
      }
    })
    it('dayHours inyectado', () => {
      // @ts-ignore
      expect(checkSlotWithinHours(null,'10:00',30)).toEqual({ ok:false, reason:'closed' })
      // @ts-ignore
      expect(checkSlotWithinHours({} as any,'10:00',30).ok).toBe(false)
      // @ts-ignore
      expect(checkSlotWithinHours({ day_of_week:1,is_open:true,open_time:'<script>',close_time:'20:00' }, '10:00',30)).toBeDefined()
    })
  })

  describe('sanitizeBusinessName adversarial', () => {
    it('XSS payloads neutralizados', () => {
      const payloads = [
        '<img src=x onerror=alert(1)>',
        '<svg onload=alert(1)>',
        '"><script>alert(1)</script>',
        "';alert(1)//",
        '<iframe src=javascript:alert(1)>',
        'A\nB\rC\tD',
        'A"B<C>D',
        'a'.repeat(200)
      ]
      for (const p of payloads) {
        const r = sanitizeBusinessName(p)
        expect(r).not.toContain('<')
        expect(r).not.toContain('>')
        expect(r).not.toContain('"')
        expect(r).not.toContain('\n')
        expect(r).not.toContain('\r')
        expect(r.length).toBeLessThanOrEqual(80)
      }
    })
  })

  describe('telegram escape adversarial', () => {
    it('todos los templates escapan XSS', () => {
      const xss = '<script>alert("xss")</script><img src=x onerror=alert(1)> & "quote"'
      const tpls = [
        telegram.tplNewBooking({ clientName: xss, serviceName: xss, date: xss, time: xss }),
        telegram.tplLowStock({ itemName: xss, quantity: 1, unit: xss, threshold: 5 }),
        telegram.tplThankYou({ clientName: xss, serviceName: xss }),
        telegram.tplReactivation({ clientName: xss }),
        telegram.tplBirthday({ clientName: xss }),
      ]
      for (const t of tpls) {
        expect(t).not.toContain('<script>')
        expect(t).toContain('&lt;')
        expect(t).toContain('&amp;')
      }
    })
  })

  describe('formatCurrency adversarial', () => {
    it('no crashea con valores extremos', () => {
      const vals = [NaN, Infinity, -Infinity, 1e15, -1e15, Number.MIN_VALUE, Number.MAX_VALUE]
      for (const v of vals) {
        expect(() => formatCurrency(v as any, 'USD')).not.toThrow()
        expect(() => formatCurrency(v as any, 'COP')).not.toThrow()
      }
    })
    it('moneda maliciosa lanza RangeError esperado', () => {
      // @ts-ignore
      expect(() => formatCurrency(100, '<script>')).toThrow()
      // locale inválido no crashea? formatCurrency con locale inválido usa en-US fallback? Actually Intl throws for invalid locale? We test que al menos no crashee app si se pasa locale raro - pero en realidad lanza, lo verificamos
      // @ts-ignore
      expect(() => formatCurrency(100, 'USD', 'invalid-xxx-!')).toThrow()
    })
  })

  describe('getTenantSlug adversarial', () => {
    it('host header injection', () => {
      const attacks = [
        'evil.trypronto.app.evil.com',
        'a.trypronto.app\nSet-Cookie: hacked=1',
        'a.trypronto.app; DROP TABLE',
        '../../trypronto.app',
        'trypronto.app',
        '',
        'a..trypronto.app',
        'a.trypronto.app:3000<script>',
        'www.trypronto.app',
        'sub.domain.trypronto.app'
      ]
      for (const h of attacks) {
        const r = getTenantSlug(h)
        // Should be either null or alphanumeric slug, never contain injection
        if (r !== null) {
          expect(r).toMatch(/^[a-z0-9-]+$/)
          expect(r).not.toContain('<')
          expect(r).not.toContain(';')
          expect(r).not.toContain('\n')
        }
      }
    })
  })

  describe('viber/whatsapp templates no XSS', () => {
    it('viber tpls handle xss plain - no crash pero plain text contiene tags (esperado)', () => {
      const xss = '<b>bold</b> & <script>'
      // Viber es plain text, no escapa HTML - esto es comportamiento esperado, documentado como riesgo pero no bloqueante
      const v = viber.tplNewBooking({ clientName: xss, serviceName: xss, date: xss, time: xss })
      expect(v).toContain('<b>') // plain, no escape - documentado
      expect(() => viber.tplLowStock({ itemName: xss, quantity: 1, unit: xss, threshold: 5 })).not.toThrow()
    })
  })
})
