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
      return { status: r.status, json: j as unknown }
    },
    { u: url, opts: init ?? {} },
  )
}

/**
 * Memberships + Loyalty + Promos — consume advisory lock, evaluate percent/fixed/combo, earn/redeem
 */

test.describe('Memberships + Loyalty + Promos — mocked (always runs)', () => {
  test('membership consume uses advisory lock → concurrent 409 (mock)', async ({ page }) => {
    let consumed = false
    await page.route('**/api/memberships/*/consume', async (route) => {
      if (route.request().method() === 'POST') {
        if (!consumed) {
          consumed = true
          await route.fulfill({ status: 200, json: { remaining: 3, status: 'active' } })
        } else {
          await route.fulfill({
            status: 409,
            json: { error: 'advisory_lock_failed', message: 'Concurrent consume' },
          })
        }
      } else await route.continue()
    })
    await page.goto('/offline')
    const id = '11111111-aaaa-4000-a000-000000000001'
    const results = await page.evaluate(async (mid) => {
      const mk = () =>
        fetch(`/api/memberships/${mid}/consume`, { method: 'POST' }).then((r) => r.status)
      const [a, b] = await Promise.all([mk(), mk()])
      return [a, b]
    }, id)
    expect(results.sort()).toEqual([200, 409])
    await page.unroute('**/api/memberships/*/consume')
  })

  test('promo evaluate percent → discount computed (mock)', async ({ page }) => {
    await page.route('**/api/promotions/evaluate', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { promo_code: string; amount: number }
        if (body.promo_code === 'PERCENT20') {
          await route.fulfill({
            status: 200,
            json: {
              eligible: true,
              discount: Math.round(body.amount * 0.2),
              reason: null,
              type: 'percent',
              value: 20,
            },
          })
        } else await route.continue()
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, '/api/promotions/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promo_code: 'PERCENT20',
        amount: 50000,
        service_ids: [],
        client_id: null,
        date: '2026-08-31',
      }),
    })
    expect(res.status).toBe(200)
    expect((res.json as { discount: number }).discount).toBe(10000)
    await page.unroute('**/api/promotions/evaluate')
  })

  test('promo evaluate fixed → discount (mock)', async ({ page }) => {
    await page.route('**/api/promotions/evaluate', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { promo_code: string }
        if (body.promo_code === 'FIXED5000') {
          await route.fulfill({
            status: 200,
            json: { eligible: true, discount: 5000, type: 'fixed', value: 5000 },
          })
        } else await route.continue()
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, '/api/promotions/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promo_code: 'FIXED5000',
        amount: 30000,
        service_ids: [],
        client_id: null,
        date: '2026-08-31',
      }),
    })
    expect((res.json as { discount: number }).discount).toBe(5000)
    await page.unroute('**/api/promotions/evaluate')
  })

  test('promo evaluate combo → requires multiple services (mock)', async ({ page }) => {
    await page.route('**/api/promotions/evaluate', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { promo_code: string; service_ids: string[] }
        if (body.promo_code === 'COMBO50') {
          if (body.service_ids.length >= 2) {
            await route.fulfill({
              status: 200,
              json: { eligible: true, discount: 15000, type: 'combo' },
            })
          } else {
            await route.fulfill({
              status: 200,
              json: { eligible: false, discount: 0, reason: 'combo_requires_2_services' },
            })
          }
        } else await route.continue()
      } else await route.continue()
    })
    await page.goto('/offline')
    const fail = await fetchJson(page, '/api/promotions/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promo_code: 'COMBO50',
        amount: 60000,
        service_ids: ['svc-1'],
        client_id: null,
        date: '2026-08-31',
      }),
    })
    expect((fail.json as { eligible: boolean }).eligible).toBe(false)
    const ok = await fetchJson(page, '/api/promotions/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promo_code: 'COMBO50',
        amount: 60000,
        service_ids: ['svc-1', 'svc-2'],
        client_id: null,
        date: '2026-08-31',
      }),
    })
    expect((ok.json as { eligible: boolean }).eligible).toBe(true)
    await page.unroute('**/api/promotions/evaluate')
  })

  test('loyalty earn → points via transaction (mock)', async ({ page }) => {
    await page.route('**/api/pos/transaction', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          json: { id: 'tx-loyal-earn', loyalty_points_earned: 30 },
        })
      } else await route.continue()
    })
    await page.route('**/api/loyalty*', async (route) => {
      const url = new URL(route.request().url())
      if (route.request().method() === 'GET' && url.searchParams.has('client_id')) {
        await route.fulfill({ status: 200, json: { points: 130 } })
      } else await route.continue()
    })
    await page.goto('/offline')
    const tx = await fetchJson(page, '/api/pos/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: 'biz',
        amount: 30000,
        payment_method: 'cash',
        items: [{ service_id: 'svc', name: 'Corte', price: 30000, qty: 1 }],
      }),
    })
    expect((tx.json as { loyalty_points_earned: number }).loyalty_points_earned).toBe(30)
    const bal = await fetchJson(page, '/api/loyalty?client_id=c1', { method: 'GET' })
    expect((bal.json as { points: number }).points).toBe(130)
    await page.unroute('**/api/pos/transaction')
    await page.unroute('**/api/loyalty*')
  })

  test('loyalty redeem → deduct points (mock) and insufficient → 409', async ({ page }) => {
    await page.route('**/api/loyalty/redeem', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { points: number }
        if (body.points > 100) {
          await route.fulfill({ status: 409, json: { error: 'insufficient_points', balance: 100 } })
        } else {
          await route.fulfill({ status: 200, json: { remaining: 100 - body.points } })
        }
      } else await route.continue()
    })
    await page.goto('/offline')
    const ok = await fetchJson(page, '/api/loyalty/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'c1', points: 50 }),
    })
    expect(ok.status).toBe(200)
    const fail = await fetchJson(page, '/api/loyalty/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'c1', points: 200 }),
    })
    expect(fail.status).toBe(409)
    expect((fail.json as { error: string }).error).toBe('insufficient_points')
    await page.unroute('**/api/loyalty/redeem')
  })

  test('promo_stack_guard: membership + promo + loyalty only one allowed (mock via /api/book)', async ({
    page,
  }) => {
    await page.route('**/api/book', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as {
          membership_id?: string
          promo_code?: string
          loyalty_redeem_points?: number
        }
        const count = [body.membership_id, body.promo_code, body.loyalty_redeem_points].filter(
          Boolean,
        ).length
        if (count > 1) {
          await route.fulfill({ status: 409, json: { error: 'promo_stack_guard' } })
        } else {
          await route.fulfill({ status: 200, json: { appointmentId: 'ok' } })
        }
      } else await route.continue()
    })
    await page.goto('/offline')
    const fail = await fetchJson(page, '/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId: '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95',
        serviceId: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec',
        date: '2026-09-01',
        time: '10:00',
        name: 'Stack',
        phone: '+573001112233',
        membership_id: 'mem-1',
        promo_code: 'PERCENT20',
      }),
    })
    expect(fail.status).toBe(409)
    expect((fail.json as { error: string }).error).toBe('promo_stack_guard')
    const ok = await fetchJson(page, '/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId: '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95',
        serviceId: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec',
        date: '2026-09-01',
        time: '11:00',
        name: 'Single',
        phone: '+573001112233',
        promo_code: 'PERCENT20',
      }),
    })
    expect(ok.status).toBe(200)
    await page.unroute('**/api/book')
  })
})
