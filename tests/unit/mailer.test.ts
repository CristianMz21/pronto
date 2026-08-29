import { describe, it, expect, vi } from 'vitest'

import { sanitizeBusinessName, getFromAddress } from '@/lib/mailer'
describe('mailer comprehensive', () => {
  it('sanitize strips', () => {
    expect(sanitizeBusinessName('<b>John</b>')).toBe('John')
    expect(sanitizeBusinessName('a\nb')).toBe('ab')
    expect(sanitizeBusinessName('a'.repeat(100))).toHaveLength(80)
  })
  it('getFromAddress', () => {
    process.env.RESEND_FROM_EMAIL = 'Pronto <noreply@test.com>'
    expect(getFromAddress('<b>X</b>')).toBe('X <noreply@test.com>')
    expect(getFromAddress('   ')).toBe('Pronto <noreply@test.com>')
    expect(getFromAddress()).toBe('Pronto <noreply@test.com>')
  })
  it('sendMail fallback', async () => {
    delete process.env.SMTP_HOST
    delete process.env.RESEND_API_KEY
    const { sendMail } = await import('@/lib/mailer')
    expect(
      (await sendMail({ from: 'a@test.com', to: 'b@test.com', subject: 'Hi', html: '' })).id,
    ).toBe('dev-console-fallback')
  })
})
