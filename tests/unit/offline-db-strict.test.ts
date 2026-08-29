import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { queueTransaction, getPendingTransactions, markTransactionSynced, getPendingCount, cacheData, getCachedData } from '@/lib/offline-db'

describe('offline-db strict 100%', () => {
  // Note: we don't delete DB each time to avoid fake-indexeddb hanging.
  // Each test uses unique ids and we sync/leave data; parallel workers isolated by unique business_id
  beforeEach(async () => {
    // just ensure pending count is isolated by using unique business_id per test via Math.random
  })

  it('queue and getPending', async () => {
    const tx = await queueTransaction({ business_id: 'biz', client_id: null, employee_id: null, amount: 10, payment_method: 'cash', items: [] })
    expect(tx.id).toBeTruthy()
    expect(tx.synced).toBe(false)
    expect(tx.local_receipt).toMatch(/OFFLINE-/)
    const pending = await getPendingTransactions()
    expect(pending.length).toBe(1)
    expect(pending[0].id).toBe(tx.id)
  })

  it('queue with crypto fallback', async () => {
    const orig = (globalThis.crypto as any)?.randomUUID
    if (globalThis.crypto) (globalThis.crypto as any).randomUUID = undefined
    const tx = await queueTransaction({ business_id: 'biz', client_id: null, employee_id: null, amount: 1, payment_method: 'cash', items: [] })
    expect(tx.id).toMatch(/fallback-/)
    if (orig) (globalThis.crypto as any).randomUUID = orig
  })

  it('queue throws when indexedDB undefined', async () => {
    const orig = globalThis.indexedDB
    ;(globalThis as any).indexedDB = undefined
    await expect(queueTransaction({ business_id: 'b', client_id: null, employee_id: null, amount: 1, payment_method: 'cash', items: [] })).rejects.toThrow('IndexedDB not available')
    globalThis.indexedDB = orig
  })

  it('markTransactionSynced', async () => {
    const tx = await queueTransaction({ business_id: 'biz', client_id: null, employee_id: null, amount: 5, payment_method: 'cash', items: [] })
    await markTransactionSynced(tx.id)
    const pending = await getPendingTransactions()
    expect(pending.find(t => t.id === tx.id)).toBeUndefined()
  })

  it('markTransactionSynced non-existent id still resolves', async () => {
    await expect(markTransactionSynced('non-existent')).resolves.toBeUndefined()
  })

  it('getPendingCount returns number and handles error', async () => {
    const before = await getPendingCount()
    await queueTransaction({ business_id: `biz-${Math.random()}`, client_id: null, employee_id: null, amount: 1, payment_method: 'cash', items: [] })
    await queueTransaction({ business_id: `biz-${Math.random()}`, client_id: null, employee_id: null, amount: 2, payment_method: 'cash', items: [] })
    const after = await getPendingCount()
    expect(after).toBeGreaterThanOrEqual(before + 2)
    // error branch: mock getPendingTransactions to throw by deleting DB
    const orig = globalThis.indexedDB
    ;(globalThis as any).indexedDB = undefined
    expect(await getPendingCount()).toBe(0)
    globalThis.indexedDB = orig
  })

  it('cacheData and getCachedData services', async () => {
    await cacheData('services_cache', [{ id: 's1', name: 'Cut', price: 10, duration_min: 30, category: null }])
    const data = await getCachedData('services_cache')
    expect(data.length).toBe(1)
    expect((data[0] as any).name).toBe('Cut')
  })

  it('cacheData empty no-op', async () => {
    await cacheData('services_cache', [{ id: 's1', name: 'A', price: 10, duration_min: 30, category: null }])
    await cacheData('services_cache', [])
    const data = await getCachedData('services_cache')
    expect(data.length).toBe(1) // still previous because empty does not clear?
  })

  it('cacheData replaces', async () => {
    await cacheData('services_cache', [{ id: 's1', name: 'A', price: 10, duration_min: 30, category: null }])
    await cacheData('services_cache', [{ id: 's2', name: 'B', price: 20, duration_min: 30, category: 'cat' }])
    const data = await getCachedData('services_cache')
    expect(data.length).toBe(1)
    expect((data[0] as any).id).toBe('s2')
  })

  it('cacheData employees and clients', async () => {
    await cacheData('employees_cache', [{ id: 'e1', name: 'John' }])
    expect((await getCachedData('employees_cache')).length).toBe(1)
    await cacheData('clients_cache', [{ id: 'c1', name: 'Client', phone: '123' }])
    expect((await getCachedData('clients_cache')).length).toBe(1)
  })

  it('getCachedData returns [] when indexedDB undefined', async () => {
    const orig = globalThis.indexedDB
    ;(globalThis as any).indexedDB = undefined
    expect(await getCachedData('services_cache')).toEqual([])
    globalThis.indexedDB = orig
  })

  it('getCachedData handles openDB error', async () => {
    // Force error by making indexedDB.open throw
    const origOpen = globalThis.indexedDB.open
    // @ts-ignore
    globalThis.indexedDB.open = () => { throw new Error('open fail') }
    expect(await getCachedData('services_cache')).toEqual([])
    globalThis.indexedDB.open = origOpen
  })
})
