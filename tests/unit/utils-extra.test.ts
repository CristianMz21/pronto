import { describe, it, expect } from 'vitest'

import { slugify } from '@/lib/utils'
describe('slug', () => {
  it('a', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })
})
