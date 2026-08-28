import { describe, it, expect, vi } from 'vitest'
vi.mock('next/headers',()=>({headers:()=>Promise.resolve({get:()=>null,has:()=>false})}))
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:()=>Promise.resolve({data:{user:null}})}})}))
vi.mock('react',async (o)=>{const m=await o() as any;return{...m,cache:(f:any)=>f}})
import { getAuthUser } from '@/lib/auth-user'
describe('auth',()=>{it('a',async()=>{expect(await getAuthUser()).toBeNull()})})
