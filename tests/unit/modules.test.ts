import { describe, it, expect } from 'vitest'

import { isModuleEnabled } from '@/lib/modules'
describe('modules', () => {
  it('a', () => {
    expect(isModuleEnabled(['pos'], 'pos')).toBe(true)
  })
})
