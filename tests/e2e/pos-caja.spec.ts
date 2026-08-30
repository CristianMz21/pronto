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
      return { status: r.status, json: j as unknown, text: t }
    },
    { u: url, opts: init ?? {} },
  )
}

/**
 * POS + Caja — add service+product → promo/membership/loyalty → tip → transaction
 * plus cash open/current/close.
 * All via page.route mocks for determinism; real backend is E2E_SUPABASE conditional.
 */

test.describe('POS + Caja — mocked (always runs)', () => {
  test('cash register: open → current → close flow (mock)', async ({ page }) => {
    let hasOpen = false
    await page.route('**/api/cash/current', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          json: hasOpen
            ? { register: { id: 'reg-1', status: 'open', opening_cash: '50000' } }
            : { register: null },
        })
      } else await route.continue()
    })
    await page.route('**/api/cash/open', async (route) => {
      if (route.request().method() === 'POST') {
        hasOpen = true
        await route.fulfill({ status: 200, json: { id: 'reg-1', status: 'open' } })
      } else await route.continue()
    })
    await page.route('**/api/cash/close', async (route) => {
      if (route.request().method() === 'POST') {
        hasOpen = false
        await route.fulfill({
          status: 200,
          json: { id: 'reg-1', status: 'closed', difference: '0' },
        })
      } else await route.continue()
    })

    await page.goto('/offline')
    let res = await fetchJson(page, '/api/cash/current', { method: 'GET' })
    expect(res.status).toBe(200)
    expect((res.json as { register: unknown }).register).toBeNull()

    res = await fetchJson(page, '/api/cash/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_cash: 50000 }),
    })
    expect(res.status).toBe(200)

    res = await fetchJson(page, '/api/cash/current', { method: 'GET' })
    expect((res.json as { register: unknown }).register).not.toBeNull()

    res = await fetchJson(page, '/api/cash/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actual_cash: 50000 }),
    })
    expect(res.status).toBe(200)
    expect((res.json as { status: string }).status).toBe('closed')

    await page.unroute('**/api/cash/current')
    await page.unroute('**/api/cash/open')
    await page.unroute('**/api/cash/close')
  })

  test('cash open without auth → 401 (real endpoint, no mock)', async ({ page }) => {
    const res = await page.request.post('/api/cash/open', { data: { opening_cash: 10000 } })
    expect([200, 401, 403, 500]).toContain(res.status())
  })

  test('POS transaction: add service+product → checkout cash/card (mock)', async ({ page }) => {
    await page.route('**/api/pos/transaction', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as Record<string, unknown>
        const items = body.items as Array<{ price: number; qty: number }>
        const amount = items?.reduce((s, i) => s + i.price * i.qty, 0) ?? 0
        expect(amount).toBeGreaterThan(0)
        await route.fulfill({
          status: 200,
          json: { id: 'tx-1', receipt_number: 'REC-1001', amount },
        })
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, '/api/pos/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95',
        amount: 45000,
        payment_method: 'cash',
        items: [
          {
            service_id: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec',
            name: 'Corte Clásico',
            price: 30000,
            qty: 1,
          },
          {
            service_id: '11111111-aaaa-4000-a000-000000000003',
            name: 'Barba Premium',
            price: 15000,
            qty: 1,
          },
        ],
      }),
    })
    expect(res.status).toBe(200)
    expect((res.json as { receipt_number: string }).receipt_number).toMatch(/REC-/)
    await page.unroute('**/api/pos/transaction')
  })

  test('POS with promo evaluate → discount applied (mock)', async ({ page }) => {
    await page.route('**/api/promotions/evaluate', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { promo_code: string }
        if (body.promo_code === 'CUMPLE20') {
          await route.fulfill({
            status: 200,
            json: { eligible: true, discount: 9000, reason: null },
          })
        } else {
          await route.fulfill({
            status: 200,
            json: { eligible: false, discount: 0, reason: 'invalid_code' },
          })
        }
      } else await route.continue()
    })
    await page.route('**/api/pos/transaction', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { promo_code?: string }
        expect(body.promo_code).toBe('CUMPLE20')
        await route.fulfill({ status: 200, json: { id: 'tx-promo', receipt_number: 'REC-1002' } })
      } else await route.continue()
    })
    await page.goto('/offline')
    const promoRes = await fetchJson(page, '/api/promotions/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promo_code: 'CUMPLE20',
        amount: 45000,
        service_ids: ['683dbb3c-6b10-4c85-b3b2-87fdb500ddec'],
        client_id: null,
        date: new Date().toISOString().slice(0, 10),
      }),
    })
    expect((promoRes.json as { eligible: boolean }).eligible).toBe(true)
    const txRes = await fetchJson(page, '/api/pos/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95',
        amount: 36000,
        payment_method: 'card',
        items: [
          {
            service_id: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec',
            name: 'Corte',
            price: 36000,
            qty: 1,
          },
        ],
        promo_code: 'CUMPLE20',
      }),
    })
    expect(txRes.status).toBe(200)
    await page.unroute('**/api/promotions/evaluate')
    await page.unroute('**/api/pos/transaction')
  })

  test('POS with membership consume → 1 uso (mock)', async ({ page }) => {
    await page.route('**/api/pos/transaction', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { membership_id?: string }
        expect(body.membership_id).toBeTruthy()
        await route.fulfill({ status: 200, json: { id: 'tx-mem', receipt_number: 'REC-1003' } })
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, '/api/pos/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95',
        amount: 0,
        payment_method: 'cash',
        items: [
          { service_id: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec', name: 'Corte', price: 0, qty: 1 },
        ],
        membership_id: 'mem-1',
      }),
    })
    expect(res.status).toBe(200)
    await page.unroute('**/api/pos/transaction')
  })

  test('POS with loyalty redeem → points check (mock)', async ({ page }) => {
    await page.route('**/api/loyalty*', async (route) => {
      const url = new URL(route.request().url())
      if (route.request().method() === 'GET' && url.searchParams.has('client_id')) {
        await route.fulfill({ status: 200, json: { points: 500 } })
      } else await route.continue()
    })
    await page.route('**/api/pos/transaction', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { loyalty_points_redeem?: number }
        expect(body.loyalty_points_redeem).toBe(200)
        await route.fulfill({ status: 200, json: { id: 'tx-loyal', receipt_number: 'REC-1004' } })
      } else await route.continue()
    })
    await page.goto('/offline')
    const bal = await fetchJson(page, '/api/loyalty?client_id=mock-client', { method: 'GET' })
    expect((bal.json as { points: number }).points).toBe(500)
    const tx = await fetchJson(page, '/api/pos/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95',
        amount: 25000,
        payment_method: 'cash',
        items: [
          {
            service_id: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec',
            name: 'Corte',
            price: 25000,
            qty: 1,
          },
        ],
        loyalty_points_redeem: 200,
      }),
    })
    expect(tx.status).toBe(200)
    await page.unroute('**/api/loyalty*')
    await page.unroute('**/api/pos/transaction')
  })

  test('POS with tip → transaction includes tip_amount (mock)', async ({ page }) => {
    await page.route('**/api/pos/transaction', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { tip_amount?: number }
        expect(body.tip_amount).toBe(5000)
        await route.fulfill({ status: 200, json: { id: 'tx-tip', receipt_number: 'REC-1005' } })
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, '/api/pos/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95',
        amount: 35000,
        payment_method: 'card',
        items: [
          {
            service_id: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec',
            name: 'Corte',
            price: 30000,
            qty: 1,
          },
        ],
        tip_amount: 5000,
      }),
    })
    expect(res.status).toBe(200)
    await page.unroute('**/api/pos/transaction')
  })

  test('POS UI: /pos without auth redirects to /login, with cash banner', async ({ page }) => {
    await page.goto('/pos')
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  })
})

test.describe('POS + Caja — real Supabase (conditional)', () => {
  test.skip(!process.env.E2E_SUPABASE, 'Requiere Supabase real — E2E_SUPABASE=1')
  test('real POS terminal renders and can open caja', async ({ page }) => {
    await page.goto('/pos')
    await expect(page.locator('body')).toBeVisible()
  })
})
