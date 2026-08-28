import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/mailer', () => ({ sendMail: vi.fn().mockResolvedValue({ id: '1' }), getFromAddress: () => 'a@test.com' }))
import { sendBookingConfirmation, sendReminder, sendThankYou, sendReactivation, sendBirthday, sendLowStockAlert, formatEmailDate, formatEmailTime } from '@/lib/email'
describe('email exhaustive', () => {
  it('booking', async () => { expect(await sendBookingConfirmation({ to: 'a@test.com', clientName: '<script>', businessName: 'B', serviceName: 'S', date: 'd', time: 't' })).toBeDefined() })
  it('reminder', async () => { expect(await sendReminder({ to: 'a@test.com', clientName: 'A', businessName: 'B', serviceName: 'S', date: 'd', time: 't', isOneHour: true })).toBeDefined(); expect(await sendReminder({ to: 'a@test.com', clientName: 'A', businessName: 'B', serviceName: 'S', date: 'd', time: 't' })).toBeDefined() })
  it('thank', async () => { expect(await sendThankYou({ to: 'a@test.com', clientName: 'A', businessName: 'B', serviceName: 'S', bookingUrl: 'https://x' })).toBeDefined() })
  it('reactivation', async () => { expect(await sendReactivation({ to: 'a@test.com', clientName: 'A', businessName: 'B', bookingUrl: 'https://x' })).toBeDefined() })
  it('birthday', async () => { expect(await sendBirthday({ to: 'a@test.com', clientName: 'A', businessName: 'B' })).toBeDefined() })
  it('lowStock', async () => { expect(await sendLowStockAlert({ to: 'a@test.com', businessName: 'B', items: [{ name: 'A', quantity: 1, unit: 'u', threshold: 5 }, { name: 'B', quantity: 2, unit: 'u', threshold: 5 }] })).toBeDefined() })
  it('format', () => { expect(formatEmailDate('2026-01-15T12:00:00Z')).toContain('January'); expect(formatEmailTime('2026-01-15T12:00:00Z')).toMatch(/\d{2}:\d{2}/) })
})
