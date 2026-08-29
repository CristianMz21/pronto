import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSendMail = vi.fn()
const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }))

const mockResendSend = vi.fn()

// Must be hoisted before vi.mock calls
vi.mock('nodemailer', () => ({
  default: { createTransport: (...args: any[]) => mockCreateTransport(...args) }
}))

vi.mock('resend', () => ({
  Resend: class MockResend {
    emails: any
    constructor(_key: string) {
      this.emails = { send: mockResendSend }
    }
  }
}))

describe('mailer strict 100%', () => {
  const origEnv = { ...process.env }
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMail.mockReset()
    mockResendSend.mockReset()
  })
  afterEach(() => {
    process.env = { ...origEnv }
  })

  it('sanitizeBusinessName strips html and newlines and truncates', async () => {
    const { sanitizeBusinessName } = await import('@/lib/mailer')
    expect(sanitizeBusinessName('<script>alert(1)</script>')).not.toContain('<')
    expect(sanitizeBusinessName('a\nb\rc\nd')).toBe('abcd')
    expect(sanitizeBusinessName('a"b<c>d')).not.toContain('"')
    expect(sanitizeBusinessName('').trim()).toBe('')
    expect(sanitizeBusinessName('a'.repeat(100))).toHaveLength(80)
    expect(sanitizeBusinessName('<b>John</b>')).toBe('John')
    expect(sanitizeBusinessName('  hello  ')).toBe('hello')
  })

  it('getFromAddress with env and businessName', async () => {
    const { getFromAddress } = await import('@/lib/mailer')
    process.env.RESEND_FROM_EMAIL = 'Pronto <noreply@test.com>'
    delete process.env.SMTP_FROM
    expect(getFromAddress('My Biz')).toBe('My Biz <noreply@test.com>')
    expect(getFromAddress('<b>X</b>')).toBe('X <noreply@test.com>')
    expect(getFromAddress('   ')).toBe('Pronto <noreply@test.com>')
    expect(getFromAddress()).toBe('Pronto <noreply@test.com>')
    expect(getFromAddress('<script>')).toBe('Pronto <noreply@test.com>') // sanitize removes tag completely -> empty -> fallback
    expect(getFromAddress('Hello<script>')).toBe('Hello <noreply@test.com>')
  })

  it('getFromAddress uses SMTP_FROM fallback', async () => {
    delete process.env.RESEND_FROM_EMAIL
    process.env.SMTP_FROM = 'Biz <smtp@test.com>'
    const { getFromAddress } = await import('@/lib/mailer')
    expect(getFromAddress('Hello')).toBe('Hello <smtp@test.com>')
    expect(getFromAddress()).toBe('Biz <smtp@test.com>')
  })

  it('getFromAddress default when no env', async () => {
    delete process.env.RESEND_FROM_EMAIL
    delete process.env.SMTP_FROM
    const { getFromAddress } = await import('@/lib/mailer')
    expect(getFromAddress()).toBe('Pronto <noreply@trypronto.app>')
  })

  it('sendMail via SMTP success', async () => {
    process.env.SMTP_HOST = 'smtp.test.com'
    delete process.env.RESEND_API_KEY
    mockSendMail.mockResolvedValue({ messageId: '<123@test>' })
    const { sendMail } = await import('@/lib/mailer')
    const r = await sendMail({ from: 'a@test.com', to: 'b@test.com', subject: 'Hi', html: '<p>hi</p>' })
    expect(r.id).toBe('<123@test>')
    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.test.com' }))
  })

  it('sendMail SMTP with custom port 465 secure true and auth', async () => {
    process.env.SMTP_HOST = 'smtp.test.com'
    process.env.SMTP_PORT = '465'
    process.env.SMTP_USER = 'user'
    process.env.SMTP_PASS = 'pass'
    delete process.env.RESEND_API_KEY
    mockSendMail.mockResolvedValue({ messageId: 'id465' })
    const { sendMail } = await import('@/lib/mailer')
    const r = await sendMail({ from: 'a@test.com', to: 'b@test.com', subject: 'Hi', html: '' })
    expect(r.id).toBe('id465')
    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true, auth: { user: 'user', pass: 'pass' } }))
    delete process.env.SMTP_PORT
    delete process.env.SMTP_USER
  })

  it('sendMail SMTP error returns error', async () => {
    process.env.SMTP_HOST = 'smtp.test.com'
    mockSendMail.mockRejectedValue(new Error('smtp fail'))
    const { sendMail } = await import('@/lib/mailer')
    const r = await sendMail({ from: 'a@test.com', to: 'b@test.com', subject: 'Hi', html: '' })
    expect(r.error).toBe('smtp fail')
  })

  it('sendMail SMTP error with non-Error', async () => {
    process.env.SMTP_HOST = 'smtp.test.com'
    mockSendMail.mockRejectedValue('string error')
    const { sendMail } = await import('@/lib/mailer')
    const r = await sendMail({ from: 'a@test.com', to: 'b@test.com', subject: 'Hi', html: '' })
    expect(r.error).toBe('string error')
  })

  it('sendMail via Resend success', async () => {
    delete process.env.SMTP_HOST
    process.env.RESEND_API_KEY = 're_test'
    mockResendSend.mockResolvedValue({ data: { id: 'resend-id' }, error: null })
    const { sendMail } = await import('@/lib/mailer')
    const r = await sendMail({ from: 'a@test.com', to: 'b@test.com', subject: 'Hi', html: '' })
    expect(r.id).toBe('resend-id')
  })

  it('sendMail Resend returns error when error object', async () => {
    delete process.env.SMTP_HOST
    process.env.RESEND_API_KEY = 're_test'
    mockResendSend.mockResolvedValue({ data: null, error: { message: 'resend error' } })
    const { sendMail } = await import('@/lib/mailer')
    const r = await sendMail({ from: 'a@test.com', to: 'b@test.com', subject: 'Hi', html: '' })
    expect(r.error).toBe('resend error')
  })

  it('sendMail Resend exception returns error', async () => {
    delete process.env.SMTP_HOST
    process.env.RESEND_API_KEY = 're_test'
    mockResendSend.mockRejectedValue(new Error('resend throw'))
    const { sendMail } = await import('@/lib/mailer')
    const r = await sendMail({ from: 'a@test.com', to: 'b@test.com', subject: 'Hi', html: '' })
    expect(r.error).toBe('resend throw')
  })

  it('sendMail Resend exception non-Error', async () => {
    delete process.env.SMTP_HOST
    process.env.RESEND_API_KEY = 're_test'
    mockResendSend.mockRejectedValue('oops')
    const { sendMail } = await import('@/lib/mailer')
    const r = await sendMail({ from: 'a@test.com', to: 'b@test.com', subject: 'Hi', html: '' })
    expect(r.error).toBe('oops')
  })

  it('sendMail fallback console when no provider', async () => {
    delete process.env.SMTP_HOST
    delete process.env.RESEND_API_KEY
    const { sendMail } = await import('@/lib/mailer')
    const r = await sendMail({ from: 'a@test.com', to: 'b@test.com', subject: 'Hi', html: '' })
    expect(r.id).toBe('dev-console-fallback')
  })
})
