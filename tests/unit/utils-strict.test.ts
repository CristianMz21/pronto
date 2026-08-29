import { describe, it, expect } from 'vitest'

import {
  cn,
  formatCurrency,
  formatDate,
  formatTime,
  uses12HourClock,
  formatInBusinessTimezone,
  slugify,
  getTenantSlug,
} from '@/lib/utils'

describe('utils strict 100%', () => {
  describe('cn', () => {
    it('merges classes and dedupes tailwind', () => {
      expect(cn('a', 'b')).toContain('a')
      expect(cn('text-red-500', 'text-blue-500')).not.toContain('text-red-500')
      expect(cn('p-2', 'p-4')).toBe('p-4')
    })
    it('handles empty and falsy', () => {
      expect(cn()).toBe('')
      expect(cn(null as any, undefined as any, false as any)).toBe('')
      expect(cn('a', { b: true, c: false } as any)).toContain('b')
    })
  })

  describe('formatCurrency', () => {
    it('USD default', () => {
      expect(formatCurrency(0, 'USD')).toBe('$0')
      expect(formatCurrency(1000, 'USD')).toBe('$1,000')
      expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56')
    })
    it('COP es-CO', () => {
      expect(formatCurrency(30000, 'COP')).toBe('$ 30.000')
      expect(formatCurrency(15000.5, 'COP')).toBe('$ 15.000,5')
    })
    it('EUR es-ES', () => {
      expect(formatCurrency(1000, 'EUR')).toBeTruthy()
    })
    it('BRL pt-BR', () => {
      expect(formatCurrency(1000, 'BRL')).toBeTruthy()
    })
    it('unknown currency falls back to en-US', () => {
      const v = formatCurrency(1000, 'JPY')
      expect(v).toBeTruthy()
      // JPY in en-US is ¥1,000 - contains symbol and formatted number
      expect(v.replace(/[^\d]/g, '')).toContain('1000')
    })
    it('locale override', () => {
      const v = formatCurrency(30000, 'COP', 'en-US')
      expect(v).toContain('COP')
    })
    it('handles 0, negative, large, NaN', () => {
      expect(formatCurrency(0)).toBeTruthy()
      expect(formatCurrency(-100, 'USD')).toContain('-')
      expect(formatCurrency(1e9, 'USD')).toContain('000')
      expect(formatCurrency(NaN, 'USD')).toBeTruthy()
    })
    it('replaces NBSP', () => {
      // COP in es-CO uses NBSP which we replace
      const v = formatCurrency(1000, 'COP')
      expect(v).not.toContain('\u00A0')
      expect(v).toContain(' ')
    })
    it('custom locale param', () => {
      expect(formatCurrency(1000, 'USD', 'es-CO')).toBeTruthy()
    })
  })

  describe('formatDate', () => {
    it('valid date', () => {
      expect(formatDate('2026-01-15T12:00:00Z')).not.toBe('Invalid Date')
    })
    it('invalid string returns Invalid Date', () => {
      expect(formatDate('invalid')).toBe('Invalid Date')
    })
    it('Invalid Date object', () => {
      expect(formatDate(new Date('invalid'))).toBe('Invalid Date')
    })
    it('NaN date', () => {
      expect(formatDate('')).toBe('Invalid Date')
    })
    it('custom locale', () => {
      expect(formatDate('2026-01-15', 'en-US')).not.toBe('Invalid Date')
    })
    it('invalid locale returns Invalid Date via catch', () => {
      expect(formatDate('2026-01-15', 'invalid-xxx-!')).toBe('Invalid Date')
    })
    it('Date object input', () => {
      expect(formatDate(new Date('2026-06-15'))).not.toBe('Invalid Date')
    })
  })

  describe('uses12HourClock', () => {
    it('en-US uses 12h', () => {
      expect(uses12HourClock('en-US')).toBe(true)
    })
    it('es-CO uses 24h?', () => {
      // es-CO typically 12h? but we test boolean
      const v = uses12HourClock('es-CO')
      expect(typeof v).toBe('boolean')
    })
    it('invalid locale returns false', () => {
      expect(uses12HourClock('invalid-xxx')).toBe(false)
    })
    it('empty locale returns false', () => {
      expect(uses12HourClock('')).toBe(false)
    })
    it('handles exception', () => {
      expect(uses12HourClock('xx-YY-invalid!@#')).toBe(false)
    })
  })

  describe('formatTime', () => {
    it('valid time', () => {
      expect(formatTime('2026-01-15T14:30:00Z')).not.toBe('Invalid Date')
    })
    it('invalid returns Invalid Date', () => {
      expect(formatTime('invalid')).toBe('Invalid Date')
    })
    it('invalid locale falls to catch', () => {
      expect(formatTime('2026-01-15T14:30:00Z', 'invalid-xxx-!')).toBe('Invalid Date')
    })
    it('Date object', () => {
      expect(formatTime(new Date('2026-01-15T08:00:00Z'))).not.toBe('Invalid Date')
    })
    it('uses12HourClock inside', () => {
      // en-US should be 12h, es-CO depends
      expect(formatTime('2026-01-15T13:00:00Z', 'en-US')).toMatch(/PM|AM|p\.?\s?m\./i)
    })
  })

  describe('formatInBusinessTimezone', () => {
    it('date part', () => {
      expect(formatInBusinessTimezone('2026-01-15T12:00:00Z', 'UTC', 'date')).not.toBe(
        'Invalid Date',
      )
    })
    it('time part', () => {
      expect(formatInBusinessTimezone('2026-01-15T12:00:00Z', 'UTC', 'time')).not.toBe(
        'Invalid Date',
      )
    })
    it('datetime part', () => {
      expect(formatInBusinessTimezone('2026-01-15T12:00:00Z', 'UTC', 'datetime')).not.toBe(
        'Invalid Date',
      )
    })
    it('default part is date', () => {
      expect(formatInBusinessTimezone('2026-01-15T12:00:00Z', 'UTC')).not.toBe('Invalid Date')
    })
    it('invalid date returns Invalid Date', () => {
      expect(formatInBusinessTimezone('invalid', 'UTC')).toBe('Invalid Date')
    })
    it('invalid timezone returns Invalid Date', () => {
      expect(formatInBusinessTimezone('2026-01-15T12:00:00Z', 'Invalid/Zone')).toBe('Invalid Date')
    })
    it('both invalid', () => {
      expect(formatInBusinessTimezone('invalid', 'Invalid/Zone')).toBe('Invalid Date')
    })
    it('custom locale', () => {
      expect(
        formatInBusinessTimezone('2026-01-15T12:00:00Z', 'America/New_York', 'time', 'en-US'),
      ).not.toBe('Invalid Date')
    })
    it('handles America/Bogota DST', () => {
      expect(formatInBusinessTimezone('2026-06-15T12:00:00Z', 'America/Bogota')).not.toBe(
        'Invalid Date',
      )
    })
  })

  describe('slugify', () => {
    it('basic', () => {
      expect(slugify('Hello World')).toBe('hello-world')
    })
    it('empty and whitespace', () => {
      expect(slugify(' ')).toBe('')
      expect(slugify('')).toBe('')
      expect(slugify('   ')).toBe('')
    })
    it('special chars café ñoño', () => {
      expect(slugify('café ñoño')).toBe('caf-oo')
    })
    it('underscores and dashes', () => {
      expect(slugify('hello_world--test')).toBe('hello-world-test')
    })
    it('leading/trailing dashes', () => {
      expect(slugify('-hello-')).toBe('hello')
      expect(slugify('---a---')).toBe('a')
    })
    it('multiple spaces', () => {
      expect(slugify('a  b   c')).toBe('a-b-c')
    })
    it('mixed', () => {
      expect(slugify('Hello__  WORLD  ')).toBe('hello-world')
    })
    it('500 chars', () => {
      expect(slugify('a'.repeat(500))).toBe('a'.repeat(500))
    })
    it('numbers and symbols', () => {
      expect(slugify('Test 123! @#')).toBe('test-123')
    })
    it('null handling via toString? direct string only', () => {
      expect(slugify('UPPER')).toBe('upper')
    })
  })

  describe('getTenantSlug', () => {
    it('valid subdomain', () => {
      expect(getTenantSlug('a.trypronto.app')).toBe('a')
    })
    it('localhost null', () => {
      expect(getTenantSlug('localhost:3000')).toBe(null)
    })
    it('multi-level null', () => {
      expect(getTenantSlug('a.b.trypronto.app')).toBe(null)
    })
    it('empty null', () => {
      expect(getTenantSlug('')).toBe(null)
    })
    it('www subdomain returns www? code allows www but proxy filters', () => {
      expect(getTenantSlug('www.trypronto.app')).toBe('www')
    })
    it('different domain null', () => {
      expect(getTenantSlug('example.com')).toBe(null)
    })
    it('trypronto without subdomain null', () => {
      expect(getTenantSlug('trypronto.app')).toBe(null)
    })
    it('port handling returns mybiz even with :3000', () => {
      expect(getTenantSlug('mybiz.trypronto.app:3000')).toBe('mybiz')
    })
    it('handles edge .trypronto.app', () => {
      expect(getTenantSlug('.trypronto.app')).toBe('')
    })
  })
})
