import { describe, it, expect, vi } from 'vitest'
import { createClient } from '@/lib/supabase/client'
describe('supabase client',()=>{it('a',()=>{process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='anon';expect(createClient()).toBeDefined()})})
