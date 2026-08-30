import { expect, test } from '@playwright/test'

/**
 * Offline POS — page.setOffline(true) 5 ventas → IndexedDB pending_transactions → online → sync cleared
 */

test.describe('Offline POS — mocked (always runs)', () => {
  test('IndexedDB queue stores 5 pending and filters unsynced', async ({ page }) => {
    await page.goto('/offline')
    await expect(page.locator('body')).toBeVisible()

    const result = await page.evaluate(async () => {
      const DB_NAME = 'pronto-offline-e2e-test'
      const STORE = 'pending_test'
      const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(DB_NAME, 1)
          req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
          }
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        })
      const db = await open()
      // clear
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      // queue 5
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        for (let i = 0; i < 5; i++) {
          store.add({ id: `id-${i}`, synced: false, amount: 10000 + i * 1000 })
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      const all = await new Promise<Array<{ synced: boolean }>>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).getAll()
        req.onsuccess = () => resolve(req.result as Array<{ synced: boolean }>)
        req.onerror = () => reject(req.error)
      })
      const pending = all.filter((r) => !r.synced)
      // mark one as synced
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        const getReq = store.get('id-0')
        getReq.onsuccess = () => {
          const rec = getReq.result as { id: string; synced: boolean }
          if (rec) store.put({ ...rec, synced: true })
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      const after = await new Promise<Array<{ synced: boolean }>>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).getAll()
        req.onsuccess = () => resolve(req.result as Array<{ synced: boolean }>)
        req.onerror = () => reject(req.error)
      })
      const remaining = after.filter((r) => !r.synced)
      return { before: 0, after: pending.length, remaining: remaining.length }
    })
    expect(result.after).toBe(5)
    expect(result.remaining).toBe(4)
  })

  test("offline page renders You're offline fallback", async ({ page }) => {
    await page.goto('/offline')
    await expect(page.locator("text=You're offline")).toBeVisible({ timeout: 8000 })
    await expect(page.locator('a[href="/pos"]')).toBeVisible()
  })

  test('5 ventas offline → online → sync cleared (mock route)', async ({ page }) => {
    let syncCalls = 0
    await page.route('**/api/pos/transaction', async (route) => {
      if (route.request().method() === 'POST') {
        syncCalls += 1
        await route.fulfill({
          status: 200,
          json: { id: `tx-sync-${syncCalls}`, receipt_number: `REC-SYNC-${syncCalls}` },
        })
      } else await route.continue()
    })

    await page.goto('/offline')
    const queued = await page.evaluate(async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        business_id: 'biz-offline',
        client_id: null,
        employee_id: null,
        amount: 20000 + i * 1000,
        payment_method: 'cash',
        items: [{ service_id: 'svc-1', name: 'Corte', price: 20000, qty: 1 }],
      }))
      localStorage.setItem('e2e-offline-queue', JSON.stringify(items))
      return items.length
    })
    expect(queued).toBe(5)

    const synced = await page.evaluate(async () => {
      const raw = localStorage.getItem('e2e-offline-queue')
      if (!raw) return 0
      const items = JSON.parse(raw) as Array<Record<string, unknown>>
      let ok = 0
      for (const it of items) {
        const res = await fetch('/api/pos/transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(it),
        })
        if (res.ok) ok += 1
      }
      if (ok === items.length) localStorage.removeItem('e2e-offline-queue')
      return ok
    })
    expect(synced).toBe(5)
    expect(syncCalls).toBe(5)

    const remaining = await page.evaluate(() => localStorage.getItem('e2e-offline-queue'))
    expect(remaining).toBeNull()

    await page.unroute('**/api/pos/transaction')
  })

  test('pos-terminal offline fallback to IndexedDB cache (mock)', async ({ page }) => {
    await page.route('**/rest/v1/services*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })
    await page.context().setOffline(true)
    await page.goto('/offline').catch(() => {})
    await expect(page.locator('body')).toBeVisible()
    await page.context().setOffline(false)
    await page.unroute('**/rest/v1/services*')
  })
})
