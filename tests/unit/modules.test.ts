import { describe, expect, it } from 'vitest'

import { isModuleEnabled } from '@/lib/modules'

describe('modules', () => {
  it('a', () => {
    expect(isModuleEnabled(['pos'], 'pos')).toBe(true)
  })
})
