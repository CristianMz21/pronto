import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/mailer', () => ({
  sendMail: vi.fn().mockResolvedValue({ id: 'mock-id' }),
  getFromAddress: vi.fn((n?: string) => n ? `${n} <test@pronto.app>` : 'Pronto <noreply@trypronto.app>')
}))
import { sendBookingConfirmation, sendReminder, sendThankYou, sendReactivation, sendBirthday, sendLowStockAlert, formatEmailDate, formatEmailTime } from '@/lib/email'
import { sendMail } from '@/lib/mailer'

describe('email strict 100%', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sendBookingConfirmation basic', async () => {
    await sendBookingConfirmation({ to: 'a@test.com', clientName: 'John <script>', businessName: 'Biz & Co', serviceName: 'Cut', date: 'Jan 15', time: '10:00' })
    const call = vi.mocked(sendMail).mock.calls[0][0]
    expect(call.to).toBe('a@test.com')
    expect(call.subject).toContain('Booking confirmed')
    expect(call.html).toContain('John') // escaped firstName
    expect(call.html).not.toContain('<script>')
    expect(call.html).toContain('&amp;') // Biz & Co escaped
  })
  it('sendBookingConfirmation with employee, address, calendarUrl XSS', async () => {
    await sendBookingConfirmation({ to: 'a@test.com', clientName: 'Alice', businessName: 'B', serviceName: 'S', date: 'd', time: 't', employeeName: 'Bob<script>', address: 'Addr <b>', calendarUrl: 'https://cal.com?x="onload="alert(1)' })
    const html = vi.mocked(sendMail).mock.calls[0][0].html
    expect(html).toContain('Bob')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Addr')
    expect(html).toContain('https://cal.com')
    expect(html).toContain('&quot;') // escaped quote in url
  })
  it('sendBookingConfirmation without calendarUrl no link', async () => {
    await sendBookingConfirmation({ to: 'a@test.com', clientName: 'A', businessName: 'B', serviceName: 'S', date: 'd', time: 't' })
    const html = vi.mocked(sendMail).mock.calls[0][0].html
    expect(html).not.toContain('Add to Google Calendar') // Wait: it checks opts.calendarUrl ? ... : '' -> empty, so not contain
    // but our template includes p with link only if calendarUrl present
  })
  it('sendReminder tomorrow and isOneHour', async () => {
    await sendReminder({ to: 'a@test.com', clientName: 'Bob', businessName: 'B', serviceName: 'S', date: 'd', time: 't' })
    expect(vi.mocked(sendMail).mock.calls[0][0].subject).toContain('tomorrow')
    vi.clearAllMocks()
    await sendReminder({ to: 'a@test.com', clientName: 'Bob', businessName: 'B', serviceName: 'S', date: 'd', time: 't', isOneHour: true })
    expect(vi.mocked(sendMail).mock.calls[0][0].subject).toContain('in 1 hour')
  })
  it('sendReminder with employee and address', async () => {
    await sendReminder({ to: 'a@test.com', clientName: 'A', businessName: 'B', serviceName: 'S', date: 'd', time: 't', employeeName: 'E', address: 'Addr' })
    const html = vi.mocked(sendMail).mock.calls[0][0].html
    expect(html).toContain('E')
    expect(html).toContain('Addr')
  })
  it('sendThankYou with and without bookingUrl', async () => {
    await sendThankYou({ to: 'a@test.com', clientName: 'Alice Smith', businessName: 'B', serviceName: 'Cut' })
    let html = vi.mocked(sendMail).mock.calls[0][0].html
    expect(html).toContain('Thank you')
    expect(html).not.toContain('Book your next')
    vi.clearAllMocks()
    await sendThankYou({ to: 'a@test.com', clientName: 'Alice Smith', businessName: 'B', serviceName: 'Cut', bookingUrl: 'https://book.com/?x=`code`' })
    html = vi.mocked(sendMail).mock.calls[0][0].html
    expect(html).toContain('Book your next')
    expect(html).not.toContain('`') // escaped
  })
  it('sendReactivation', async () => {
    await sendReactivation({ to: 'a@test.com', clientName: 'John', businessName: 'B' })
    expect(vi.mocked(sendMail).mock.calls[0][0].html).toContain('We miss you')
    vi.clearAllMocks()
    await sendReactivation({ to: 'a@test.com', clientName: 'John', businessName: 'B', bookingUrl: 'https://x' })
    expect(vi.mocked(sendMail).mock.calls[0][0].html).toContain('Book now')
  })
  it('sendBirthday', async () => {
    await sendBirthday({ to: 'a@test.com', clientName: 'John Doe', businessName: 'B' })
    expect(vi.mocked(sendMail).mock.calls[0][0].subject).toContain('Happy Birthday')
    vi.clearAllMocks()
    await sendBirthday({ to: 'a@test.com', clientName: 'John', businessName: 'B', bookingUrl: 'https://x' })
    expect(vi.mocked(sendMail).mock.calls[0][0].html).toContain('Book a visit')
  })
  it('sendLowStockAlert single and multiple', async () => {
    await sendLowStockAlert({ to: 'a@test.com', businessName: 'B', items: [{ name: 'Item <b>', quantity: 1, unit: 'pcs', threshold: 5 }] })
    let html = vi.mocked(sendMail).mock.calls[0][0].html
    expect(html).toContain('Low-stock')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;b&gt;')
    vi.clearAllMocks()
    await sendLowStockAlert({ to: 'a@test.com', businessName: 'B', items: [{ name: 'A', quantity: 1, unit: 'u', threshold: 5 }, { name: 'B', quantity: 2, unit: 'u', threshold: 5 }] })
    html = vi.mocked(sendMail).mock.calls[0][0].html
    expect(html).toContain('A')
    expect(vi.mocked(sendMail).mock.calls[0][0].subject).toContain('2 items')
  })
  it('escape handling preserves layout', async () => {
    await sendBookingConfirmation({ to: 'a@test.com', clientName: '"O\'Reilly & Sons"', businessName: 'Biz "Quote"', serviceName: '<S>', date: 'd', time: 't' })
    const html = vi.mocked(sendMail).mock.calls[0][0].html
    expect(html).toContain('&quot;')
    expect(html).toContain('&#39;')
    expect(html).toContain('&lt;S&gt;')
  })
  it('formatEmailDate and Time', () => {
    expect(formatEmailDate('2026-01-15T12:00:00Z')).toContain('January')
    expect(formatEmailDate('2026-01-15T12:00:00Z', 'America/New_York')).toBeTruthy()
    expect(formatEmailTime('2026-01-15T12:00:00Z')).toMatch(/\d{2}:\d{2}/)
    expect(formatEmailTime('2026-01-15T12:00:00Z', 'UTC')).toMatch(/\d{2}:\d{2}/)
  })
  it('firstName toTitleCase branches', async () => {
    await sendThankYou({ to: 'a@test.com', clientName: '  KONSTANTIN UMNOV  ', businessName: 'B', serviceName: 'S' })
    const html = vi.mocked(sendMail).mock.calls[0][0].html
    expect(html).toContain('Konstantin') // firstName title case
  })
})
