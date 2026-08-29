import { describe, expect, it } from 'vitest'

import { slugify } from '@/lib/utils'

describe('slug', () => {
  it('a', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })
})
