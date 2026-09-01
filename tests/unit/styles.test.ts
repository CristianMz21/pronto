import { describe, expect, it } from 'vitest'

import {
  validatePhotoFile,
  photoPathForUpload,
  isAllowedMime,
  ClientStyleSchema,
  MAX_PHOTO_BYTES,
} from '@/lib/styles'

describe('styles — lib/styles.ts', () => {
  it('isAllowedMime checks', () => {
    expect(isAllowedMime('image/jpeg')).toBe(true)
    expect(isAllowedMime('image/png')).toBe(true)
    expect(isAllowedMime('image/webp')).toBe(true)
    expect(isAllowedMime('image/avif')).toBe(true)
    expect(isAllowedMime('image/gif')).toBe(false)
    expect(isAllowedMime('application/pdf')).toBe(false)
  })

  it('validatePhotoFile 5MB pass, 6MB fail', () => {
    expect(
      validatePhotoFile({ name: 'photo.jpg', type: 'image/jpeg', size: 5 * 1024 * 1024 }),
    ).toEqual({ ok: true })
    expect(
      validatePhotoFile({ name: 'photo.jpg', type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }),
    ).toEqual({
      ok: false,
      reason: 'file_too_large',
    })
    expect(validatePhotoFile({ name: 'photo.jpg', type: 'image/gif', size: 1000 })).toEqual({
      ok: false,
      reason: 'invalid_mime',
    })
    expect(validatePhotoFile({ name: 'photo.bmp', type: 'image/jpeg', size: 1000 })).toEqual({
      ok: false,
      reason: 'invalid_extension',
    })
    expect(validatePhotoFile({ name: 'photo.png', type: 'image/png', size: 100 })).toEqual({
      ok: true,
    })
  })

  it('photoPathForUpload sanitizes and includes ids', () => {
    const p = photoPathForUpload({
      businessId: '11111111-1111-4111-a111-111111111111',
      clientId: '22222222-2222-4111-a222-222222222222',
      filename: 'my photo.jpg',
    })
    expect(p).toContain('11111111-1111-4111-a111-111111111111')
    expect(p).toContain('22222222-2222-4111-a222-222222222222')
    expect(p).not.toContain(' ')
    expect(p).toMatch(/\.jpg$/)
  })

  it('ClientStyleSchema validates', () => {
    const base = {
      client_id: '11111111-1111-4111-a111-111111111111',
      business_id: '22222222-2222-4111-a222-222222222222',
      photo_url: 'https://example.com/photo.jpg',
      is_favorite: false,
    }
    expect(ClientStyleSchema.safeParse(base).success).toBe(true)
    expect(ClientStyleSchema.safeParse({ ...base, photo_url: 'not-url' }).success).toBe(false)
    expect(ClientStyleSchema.safeParse({ ...base, client_id: 'bad' }).success).toBe(false)
  })

  it('MAX_PHOTO_BYTES is 5MB', () => {
    expect(MAX_PHOTO_BYTES).toBe(5 * 1024 * 1024)
  })

  it('COP locale: photo validation independent of locale', () => {
    // filename with es-CO chars should be sanitized
    const p = photoPathForUpload({
      businessId: '11111111-1111-4111-a111-111111111111',
      clientId: '22222222-2222-4111-a222-222222222222',
      filename: 'corte año.jpg',
    })
    expect(p).not.toContain('ñ')
  })
})
