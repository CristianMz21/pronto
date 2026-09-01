import { describe, expect, it } from 'vitest'

import {
  mergePreferences,
  parseNotificationPrefs,
  parsePreferences,
  preferencesToSummary,
  serializePreferences,
  validatePreferences,
  PreferencesSchema,
  NotificationPrefsSchema,
  ClientStatusSchema,
} from '@/lib/preferences'

describe('preferences — lib/preferences.ts', () => {
  it('parsePreferences defaults to {} on invalid', () => {
    expect(parsePreferences(null)).toEqual({})
    expect(parsePreferences(undefined)).toEqual({})
    expect(parsePreferences('invalid')).toEqual({})
    expect(parsePreferences({ cut: 'Low Fade', length: 'medio' })).toEqual({
      cut: 'Low Fade',
      length: 'medio',
    })
  })

  it('validatePreferences trims and rejects too long notes', () => {
    expect(
      validatePreferences({
        cut: 'Low Fade',
        clipper: '#1→#2',
        beard: '3mm',
        notes: 'Dejar volumen',
      }),
    ).toEqual(expect.objectContaining({ cut: 'Low Fade', clipper: '#1→#2', beard: '3mm' }))
    expect(() => validatePreferences({ notes: 'a'.repeat(501) })).toThrow()
    expect(validatePreferences({ cut: '' })).toEqual({})
    expect(validatePreferences({ barber_id: null })).toEqual({ barber_id: null })
  })

  it('mergePreferences shallow merge and deletes undefined', () => {
    const base = { cut: 'Low Fade', length: 'medio' } as const
    expect(mergePreferences(base, { cut: undefined })).toEqual({ length: 'medio' })
    expect(mergePreferences(base, { beard: '3mm' })).toEqual({
      cut: 'Low Fade',
      length: 'medio',
      beard: '3mm',
    })
    expect(mergePreferences({}, { notes: 'Hola' })).toEqual({ notes: 'Hola' })
  })

  it('serializePreferences removes undefined/null/empty', () => {
    expect(
      serializePreferences({
        cut: 'Low Fade',
        length: undefined,
        beard: null as unknown as string,
      }),
    ).toEqual({
      cut: 'Low Fade',
    })
    expect(serializePreferences({})).toEqual({})
  })

  it('preferencesToSummary es-CO human readable', () => {
    expect(preferencesToSummary({})).toBe('Sin preferencias guardadas')
    expect(
      preferencesToSummary({ cut: 'Low Fade', length: 'medio', clipper: '#1→#2', beard: '3mm' }),
    ).toBe('Low Fade · longitud medio · Máquina #1→#2 · Barba 3mm')
    expect(preferencesToSummary({ cut: 'Buzz', notes: 'Dejar volumen' })).toBe(
      'Buzz · — Dejar volumen',
    )
  })

  it('NotificationPrefs defaults true true true', () => {
    expect(parseNotificationPrefs(null)).toEqual({ whatsapp: true, email: true, push: true })
    expect(parseNotificationPrefs({ whatsapp: false })).toEqual({
      whatsapp: false,
      email: true,
      push: true,
    })
    expect(NotificationPrefsSchema.parse({})).toEqual({ whatsapp: true, email: true, push: true })
  })

  it('ClientStatus enum validation', () => {
    expect(ClientStatusSchema.safeParse('active').success).toBe(true)
    expect(ClientStatusSchema.safeParse('VIP').success).toBe(true)
    expect(ClientStatusSchema.safeParse('inactive').success).toBe(true)
    expect(ClientStatusSchema.safeParse('deleted').success).toBe(false)
  })

  it('COP locale not monetary but survives formatCurrency round-trip', async () => {
    const { formatCurrency } = await import('@/lib/utils')
    expect(formatCurrency(35000, 'COP')).toContain('35.000')
    // COP should use es-CO locale with dot thousands
    expect(formatCurrency(10000, 'COP', 'es-CO')).toMatch(/10\.000/)
  })

  it('PreferencesSchema validates uuid barber_id', () => {
    expect(PreferencesSchema.safeParse({ barber_id: 'not-uuid' }).success).toBe(false)
    expect(
      PreferencesSchema.safeParse({ barber_id: '11111111-1111-4111-a111-111111111111' }).success,
    ).toBe(true)
    expect(PreferencesSchema.safeParse({ barber_id: '' }).success).toBe(true)
  })
})
