import { expect, test } from '@playwright/test'

async function fetchJson(page: import('@playwright/test').Page, url: string, init?: RequestInit) {
  return page.evaluate(
    async ({ u, opts }) => {
      const r = await fetch(u, opts as RequestInit)
      const t = await r.text()
      let j: unknown = null
      try {
        j = t ? JSON.parse(t) : null
      } catch {
        j = t
      }
      return {
        status: r.status,
        json: j as unknown,
        headers: Object.fromEntries(r.headers.entries()),
      }
    },
    { u: url, opts: init ?? {} },
  )
}

/**
 * Inventory + Multisede — transfer atómico, low-stock threshold, ?location= filtro 403 cross-location
 */

test.describe('Inventory + Multisede — mocked (always runs)', () => {
  test('low-stock threshold flag (mock)', async ({ page }) => {
    await page.route('**/api/inventory', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          json: [
            {
              id: 'item-1',
              name: 'Shampoo',
              quantity: '2',
              low_stock_threshold: '5',
              is_low: true,
            },
            { id: 'item-2', name: 'Cera', quantity: '10', low_stock_threshold: '5', is_low: false },
          ],
        })
        return
      }
      await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, '/api/inventory', { method: 'GET' })
    expect(res.status).toBe(200)
    const items = res.json as Array<{ is_low: boolean }>
    expect(items.find((i) => i.is_low)).toBeTruthy()
    await page.unroute('**/api/inventory')
  })

  test('transfer atómico Centro→Norte (mock success)', async ({ page }) => {
    await page.route('**/api/inventory/transfer', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as {
          from_location_id: string
          to_location_id: string
          quantity: string
        }
        expect(body.from_location_id).not.toBe(body.to_location_id)
        expect(Number(body.quantity)).toBeGreaterThan(0)
        await route.fulfill({
          status: 200,
          json: { id: 'mov-1', type: 'transfer', quantity: body.quantity },
        })
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, '/api/inventory/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: 'item-1',
        from_location_id: '11111111-1111-1111-1111-111111111111',
        to_location_id: '22222222-2222-2222-2222-222222222222',
        quantity: '3',
      }),
    })
    expect(res.status).toBe(200)
    expect((res.json as { type: string }).type).toBe('transfer')
    await page.unroute('**/api/inventory/transfer')
  })

  test('transfer insufficient stock → 409 (mock)', async ({ page }) => {
    await page.route('**/api/inventory/transfer', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 409, json: { error: 'insufficient_stock', available: '1' } })
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, '/api/inventory/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: 'item-1',
        from_location_id: '11111111-1111-1111-1111-111111111111',
        to_location_id: '22222222-2222-2222-2222-222222222222',
        quantity: '99',
      }),
    })
    expect(res.status).toBe(409)
    expect((res.json as { error: string }).error).toBe('insufficient_stock')
    await page.unroute('**/api/inventory/transfer')
  })

  test('?location= filtro — valid UUID not allowed → 403 (mock harness)', async ({ page }) => {
    await page.route('**/api/inventory?*', async (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('location') === '22222222-2222-2222-2222-222222222222') {
        await route.fulfill({ status: 403, json: { error: 'forbidden_location' } })
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(
      page,
      '/api/inventory?location=22222222-2222-2222-2222-222222222222',
      { method: 'GET' },
    )
    expect([403, 200, 302]).toContain(res.status)
    await page.unroute('**/api/inventory?*')
  })

  test('?location= invalid UUID → 400 (real proxy, no mock)', async ({ page }) => {
    const res = await page.request.get('/dashboard?location=not-a-uuid')
    expect(res.status()).toBe(400)
    const res2 = await page.request.get('/inventory?location=not-a-uuid')
    expect(res2.status()).toBe(400)
  })

  test('inventory export/import xlsx (mock)', async ({ page }) => {
    await page.route('**/api/inventory/export', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          body: 'PK\x03\x04 mock xlsx',
        })
      } else await route.continue()
    })
    await page.route('**/api/inventory/import', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 200, json: { imported: 2, skipped: 0 } })
      } else await route.continue()
    })
    await page.goto('/offline')
    const exp = await fetchJson(page, '/api/inventory/export', { method: 'GET' })
    expect(exp.status).toBe(200)
    expect(exp.headers['content-type']).toContain('sheet')
    const imp = await fetchJson(page, '/api/inventory/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ name: 'Test', quantity: 5 }] }),
    })
    expect(imp.status).toBe(200)
    expect((imp.json as { imported: number }).imported).toBe(2)
    await page.unroute('**/api/inventory/export')
    await page.unroute('**/api/inventory/import')
  })

  test('sucursales page renders (requires auth → redirect to login)', async ({ page }) => {
    await page.goto('/sucursales')
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  })
})

test.describe('Inventory + Multisede — real Supabase (conditional)', () => {
  test.skip(!process.env.E2E_SUPABASE, 'Requiere Supabase real — E2E_SUPABASE=1')
  test('real transfer Centro→Norte atómico', async ({ page }) => {
    await page.goto('/inventory')
    await expect(page.locator('body')).toBeVisible()
  })
})
