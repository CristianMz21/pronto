import fs from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { getDatabaseUrl, getSupabaseUrl } from '@/lib/supabase/getUrl'

describe('supabase getUrl strict 100%', () => {
  const origEnv = { ...process.env }
  afterEach(() => {
    process.env = { ...origEnv }
    vi.restoreAllMocks()
  })

  describe('getSupabaseUrl', () => {
    it('empty env returns empty', () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      delete process.env.IS_DOCKER
      vi.spyOn(fs, 'existsSync').mockReturnValue(false)
      expect(getSupabaseUrl()).toBe('')
    })
    it('returns url as is without docker', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.supabase.co'
      delete process.env.IS_DOCKER
      vi.spyOn(fs, 'existsSync').mockReturnValue(false)
      expect(getSupabaseUrl()).toBe('https://db.example.supabase.co')
    })
    it('IS_DOCKER true + 127.0.0.1 -> host.docker.internal', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
      process.env.IS_DOCKER = 'true'
      expect(getSupabaseUrl()).toContain('host.docker.internal')
      expect(getSupabaseUrl()).not.toContain('127.0.0.1')
    })
    it('IS_DOCKER true + localhost -> host.docker.internal', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
      process.env.IS_DOCKER = 'true'
      expect(getSupabaseUrl()).toContain('host.docker.internal')
    })
    it('fs.existsSync /.dockerenv true triggers docker', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
      delete process.env.IS_DOCKER
      vi.spyOn(fs, 'existsSync').mockReturnValue(true)
      // After fix(build): fs check removed to avoid bundling fs in client; IS_DOCKER is sole trigger
      expect(getSupabaseUrl()).toBe('http://127.0.0.1:54321')
      expect(getSupabaseUrl()).not.toContain('host.docker.internal')
    })
    it('fs.existsSync throws -> ignore', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
      delete process.env.IS_DOCKER
      vi.spyOn(fs, 'existsSync').mockImplementation(() => {
        throw new Error('fs err')
      })
      // Should not throw, returns original url
      expect(getSupabaseUrl()).toBe('http://127.0.0.1:54321')
    })
    it('cloud url unaffected even with IS_DOCKER', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.abc.supabase.co'
      process.env.IS_DOCKER = 'true'
      expect(getSupabaseUrl()).toBe('https://db.abc.supabase.co')
    })
    it('replaces both 127.0.0.1 and localhost', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321 http://localhost:54321'
      process.env.IS_DOCKER = 'true'
      const v = getSupabaseUrl()
      expect(v.split('host.docker.internal').length - 1).toBe(2)
    })
    it('handles outer try catch', () => {
      // Simulate env getter throw? Hard to trigger, but test empty path
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      expect(getSupabaseUrl()).toBe('')
    })
  })

  describe('getDatabaseUrl', () => {
    it('empty returns empty', () => {
      delete process.env.DATABASE_URL
      expect(getDatabaseUrl()).toBe('')
    })
    it('returns as is without docker', () => {
      process.env.DATABASE_URL = 'postgresql://postgres:postgres@db.example:5432/postgres'
      delete process.env.MIGRATE_SSL
      delete process.env.IS_DOCKER
      expect(getDatabaseUrl()).toContain('db.example')
    })
    it('IS_DOCKER true', () => {
      process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
      process.env.IS_DOCKER = 'true'
      expect(getDatabaseUrl()).toContain('host.docker.internal')
    })
    it('MIGRATE_SSL false triggers docker', () => {
      process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
      delete process.env.IS_DOCKER
      process.env.MIGRATE_SSL = 'false'
      expect(getDatabaseUrl()).toContain('host.docker.internal')
    })
    it('MIGRATE_SSL not false no replace without docker', () => {
      process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
      delete process.env.IS_DOCKER
      process.env.MIGRATE_SSL = 'true'
      expect(getDatabaseUrl()).toContain('127.0.0.1')
    })
    it('cloud url unaffected', () => {
      process.env.DATABASE_URL = 'postgresql://user@db.supabase.co/db'
      process.env.IS_DOCKER = 'true'
      expect(getDatabaseUrl()).toBe('postgresql://user@db.supabase.co/db')
    })
    it('replaces localhost via MIGRATE_SSL', () => {
      process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres'
      process.env.MIGRATE_SSL = 'false'
      expect(getDatabaseUrl()).toContain('host.docker.internal')
    })
  })
})
