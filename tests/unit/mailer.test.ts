import { describe, it, expect, vi } from 'vitest'
import { sanitizeBusinessName } from '@/lib/mailer'
describe('mailer',()=>{it('a',()=>{expect(sanitizeBusinessName('<b>John</b>')).toBe('John')})})
