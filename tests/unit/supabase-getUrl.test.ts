import { describe, expect, it } from 'vitest'

import { getSupabaseUrl } from '@/lib/supabase/getUrl'

describe('getUrl', () => {
  it('a', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
    process.env.IS_DOCKER = 'true'
    expect(getSupabaseUrl()).toContain('host.docker.internal')
    delete process.env.IS_DOCKER
  })
})
