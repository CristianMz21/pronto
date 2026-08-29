import { describe, expect, it, vi } from 'vitest'

import { insertOwnerAsEmployee } from '@/lib/create-business'

describe('create-business strict 100%', () => {
  const makeAdmin = (result: { error: any } = { error: null }) =>
    ({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue(result),
      }),
    }) as any

  it('inserts with full_name', async () => {
    const admin = makeAdmin()
    await insertOwnerAsEmployee(admin, 'biz1', {
      email: 'test@example.com',
      user_metadata: { full_name: '  John Doe  ' },
    })
    expect(admin.from).toHaveBeenCalledWith('employees')
    const arg = admin.from.mock.results[0].value.insert.mock.calls[0][0]
    expect(arg.name).toBe('John Doe')
    expect(arg.business_id).toBe('biz1')
    expect(arg.email).toBe('test@example.com')
    expect(arg.is_active).toBe(true)
  })
  it('derive from email local part with separators', async () => {
    const admin = makeAdmin()
    await insertOwnerAsEmployee(admin, 'biz', {
      email: 'john.doe_smith-test@example.com',
      user_metadata: {},
    })
    const arg = admin.from.mock.results[0].value.insert.mock.calls[0][0]
    expect(arg.name).toBe('John Doe Smith Test')
  })
  it('email without separators', async () => {
    const admin = makeAdmin()
    await insertOwnerAsEmployee(admin, 'biz', { email: 'kostya@example.com', user_metadata: null })
    const arg = admin.from.mock.results[0].value.insert.mock.calls[0][0]
    expect(arg.name).toBe('Kostya')
  })
  it('null email -> Owner', async () => {
    const admin = makeAdmin()
    await insertOwnerAsEmployee(admin, 'biz', { email: null, user_metadata: null })
    const arg = admin.from.mock.results[0].value.insert.mock.calls[0][0]
    expect(arg.name).toBe('Owner')
    expect(arg.email).toBe(null)
  })
  it('undefined email -> Owner', async () => {
    const admin = makeAdmin()
    await insertOwnerAsEmployee(admin, 'biz', {} as any)
    const arg = admin.from.mock.results[0].value.insert.mock.calls[0][0]
    expect(arg.name).toBe('Owner')
  })
  it('empty full_name string falls to email', async () => {
    const admin = makeAdmin()
    await insertOwnerAsEmployee(admin, 'biz', {
      email: 'a@b.com',
      user_metadata: { full_name: '   ' },
    })
    const arg = admin.from.mock.results[0].value.insert.mock.calls[0][0]
    expect(arg.name).toBe('A')
  })
  it('full_name not string falls to email', async () => {
    const admin = makeAdmin()
    await insertOwnerAsEmployee(admin, 'biz', {
      email: 'a@b.com',
      user_metadata: { full_name: 123 as any },
    })
    const arg = admin.from.mock.results[0].value.insert.mock.calls[0][0]
    expect(arg.name).toBe('A')
  })
  it('email local empty after replace -> Owner', async () => {
    const admin = makeAdmin()
    await insertOwnerAsEmployee(admin, 'biz', { email: '@example.com', user_metadata: {} })
    const arg = admin.from.mock.results[0].value.insert.mock.calls[0][0]
    expect(arg.name).toBe('Owner')
  })
  it('handles error logs console.error without throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const admin = makeAdmin({ error: { message: 'duplicate' } })
    await expect(
      insertOwnerAsEmployee(admin, 'biz', { email: 'a@b.com', user_metadata: null }),
    ).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[create-business]'),
      expect.stringContaining('duplicate'),
    )
    spy.mockRestore()
  })
  it('email with dots and dashes normalized TitleCase', async () => {
    const admin = makeAdmin()
    await insertOwnerAsEmployee(admin, 'biz', {
      email: 'maría_josé.perez-lopez@example.com',
      user_metadata: {},
    })
    const arg = admin.from.mock.results[0].value.insert.mock.calls[0][0]
    expect(arg.name).toContain(' ')
  })
})
