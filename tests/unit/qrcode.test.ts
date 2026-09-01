import { describe, expect, it } from 'vitest'

import {
  generateCheckinCode,
  isValidCheckinCode,
  toDataURL,
  buildCheckinUrl,
  generateCheckinQR,
} from '@/lib/qrcode'

describe('qrcode — lib/qrcode.ts', () => {
  it('generateCheckinCode 8 char alphanumeric', () => {
    const code = generateCheckinCode()
    expect(code).toMatch(/^[A-Za-z0-9]{8}$/)
    expect(isValidCheckinCode(code)).toBe(true)
    expect(generateCheckinCode(8)).toHaveLength(8)
    // Two codes should differ (probabilistic but highly likely)
    const code2 = generateCheckinCode()
    // Not strictly guaranteed but >99.9% with 62^8 space
    expect(code2).not.toBe(code) // if flaky, test still passes most runs; alternative: check pattern
  })

  it('isValidCheckinCode validation', () => {
    expect(isValidCheckinCode('Abc12345')).toBe(true)
    expect(isValidCheckinCode('abc123')).toBe(false)
    expect(isValidCheckinCode('Abc123456')).toBe(false)
    expect(isValidCheckinCode('Abc-1234')).toBe(false)
    expect(isValidCheckinCode(null)).toBe(false)
    expect(isValidCheckinCode('')).toBe(false)
  })

  it('toDataURL returns data:image/png base64 (fallback or real qrcode)', async () => {
    const url = await toDataURL('Abc12345')
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
    // Different texts produce different URLs (hash suffix)
    const url2 = await toDataURL('Zyx98765')
    expect(url2).not.toBe(url)
    await expect(toDataURL('')).rejects.toThrow(/invalid_qr_text/)
    await expect(toDataURL(null as unknown as string)).rejects.toThrow()
  })

  it('buildCheckinUrl validates and builds', () => {
    expect(buildCheckinUrl('Abc12345', 'https://escuderia.com')).toBe(
      'https://escuderia.com/checkin/Abc12345',
    )
    expect(buildCheckinUrl('Abc12345')).toContain('/checkin/Abc12345')
    expect(() => buildCheckinUrl('bad')).toThrow(/invalid_checkin_code/)
    expect(buildCheckinUrl('Abc12345', 'https://example.com/')).toBe(
      'https://example.com/checkin/Abc12345',
    )
  })

  it('generateCheckinQR convenience', async () => {
    const { code, dataURL, url } = await generateCheckinQR()
    expect(isValidCheckinCode(code)).toBe(true)
    expect(dataURL.startsWith('data:image/png;base64,')).toBe(true)
    expect(url).toContain(code)

    const withCode = await generateCheckinQR('Test1234')
    expect(withCode.code).toBe('Test1234')
    expect(withCode.url).toContain('Test1234')
  })

  it('COP locale: code generation locale-safe (no locale chars)', () => {
    for (let i = 0; i < 20; i++) {
      const c = generateCheckinCode()
      expect(c).toMatch(/^[A-Za-z0-9]+$/)
      // No es-CO special chars like ñ, á
      expect(c).not.toMatch(/[ñáéíóú]/)
    }
  })
})
