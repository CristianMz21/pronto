import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
describe('mailer — strict', () => {
  const origEnv = process.env
  beforeEach(() => { vi.resetModules(); process.env = { ...origEnv }; vi.clearAllMocks() })
  afterEach(() => { process.env = origEnv; vi.restoreAllMocks() })
  it('sanitizeBusinessName strips tags and limits', async () => {
    const { sanitizeBusinessName } = await import('@/lib/mailer')
    expect(sanitizeBusinessName('<b>John</b>')).toBe('John')
    expect(sanitizeBusinessName('a\nb\r\nc')).toBe('abc')
    expect(sanitizeBusinessName('  hello  ')).toBe('hello')
    expect(sanitizeBusinessName('a'.repeat(100))).toHaveLength(80)
    expect(sanitizeBusinessName('<script>alert(1)</script>')).not.toContain('<')
  })
  it('getFromAddress sanitizes', async () => {
    process.env.RESEND_FROM_EMAIL = 'Pronto <noreply@test.com>'
    const { getFromAddress } = await import('@/lib/mailer')
    expect(getFromAddress('<b>X</b>')).toBe('X <noreply@test.com>')
    expect(getFromAddress('   ')).toBe('Pronto <noreply@test.com>')
  })
  it('sendMail via SMTP success', async () => {
    process.env.SMTP_HOST = 'smtp.test.com'
    const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'smtp123' })
    vi.doMock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: sendMailMock }) } }))
    const { sendMail } = await import('@/lib/mailer')
    const res = await sendMail({ from: 'A <a@test.com>', to: 'b@test.com', subject: 'Hi', html: '<p>hi</p>' })
    expect(res.id).toBe('smtp123')
  })
  it('sendMail fallback', async () => {
    delete process.env.SMTP_HOST; delete process.env.RESEND_API_KEY
    vi.doMock('nodemailer', () => ({ default: { createTransport: vi.fn() } }))
    vi.doMock('resend', () => ({ Resend: class {} }))
    const { sendMail } = await import('@/lib/mailer')
    const res = await sendMail({ from: 'a@test.com', to: 'b@test.com', subject: 'Hi', html: '' })
    expect(res.id).toBe('dev-console-fallback')
  })
  it('sendMail SMTP handles string error', async () => {
    process.env.SMTP_HOST = 'h'
    vi.doMock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: () => { throw 'string err' } }) } }))
    const { sendMail } = await import('@/lib/mailer')
    const res = await sendMail({ from: 'a', to: 'b', subject: 's', html: '' })
    expect(res.error).toBe('string err')
  })
})
