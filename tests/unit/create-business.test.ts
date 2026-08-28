import { describe, it, expect, vi } from 'vitest'
import { insertOwnerAsEmployee } from '@/lib/create-business'
describe('create-business',()=>{it('a',async()=>{const insert=vi.fn().mockResolvedValue({error:null});const from=vi.fn().mockReturnValue({insert});await insertOwnerAsEmployee({from} as any,'biz',{email:'a@b.com',user_metadata:{full_name:'Test'}});expect(insert).toHaveBeenCalled()})})
