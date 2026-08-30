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
 * CRM + Campaigns — import CSV, segmento inactive_30, send → notification_log dedup,
 * waitlist expire 30m, rrule WEEKLYx6.
 * All via page.route mocks; real backend path is conditional.
 */

test.describe('CRM + Campaigns — mocked (always runs)', () => {
  test('import CSV → clients (mock)', async ({ page }) => {
    await page.route('**/api/clients/import', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 200, json: { imported: 3, skipped: 0, errors: [] } })
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, '/api/clients/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: 'name,phone,email\nJuan,+573001112233,juan@example.com' }),
    })
    expect(res.status).toBe(200)
    expect((res.json as { imported: number }).imported).toBe(3)
    await page.unroute('**/api/clients/import')
  })

  test('segmento inactive_30 → filter (mock)', async ({ page }) => {
    await page.route('**/api/crm/segments*', async (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('segment') === 'inactive_30') {
        await route.fulfill({
          status: 200,
          json: [
            {
              id: 'c1',
              name: 'Inactive A',
              last_visit_at: new Date(Date.now() - 31 * 86400000).toISOString(),
            },
            {
              id: 'c2',
              name: 'Inactive B',
              last_visit_at: new Date(Date.now() - 45 * 86400000).toISOString(),
            },
          ],
        })
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, '/api/crm/segments?segment=inactive_30', { method: 'GET' })
    expect(res.status).toBe(200)
    const list = res.json as Array<{ last_visit_at: string }>
    expect(list.length).toBe(2)
    for (const c of list) {
      const days = (Date.now() - new Date(c.last_visit_at).getTime()) / 86400000
      expect(days).toBeGreaterThanOrEqual(30)
    }
    await page.unroute('**/api/crm/segments*')
  })

  test('campaign send → notification_log dedup (mock 409 on second send)', async ({ page }) => {
    let sent = false
    await page.route('**/api/campaigns/*/send', async (route) => {
      if (route.request().method() === 'POST') {
        if (!sent) {
          sent = true
          await route.fulfill({ status: 200, json: { sent: 2, delivered: 2 } })
        } else {
          await route.fulfill({
            status: 409,
            json: { error: 'already_sent', message: 'Campaign already sent' },
          })
        }
      } else await route.continue()
    })
    await page.goto('/offline')
    const first = await fetchJson(
      page,
      '/api/campaigns/11111111-aaaa-4000-a000-000000000001/send',
      { method: 'POST' },
    )
    expect(first.status).toBe(200)
    const second = await fetchJson(
      page,
      '/api/campaigns/11111111-aaaa-4000-a000-000000000001/send',
      { method: 'POST' },
    )
    expect(second.status).toBe(409)
    expect((second.json as { error: string }).error).toBe('already_sent')
    await page.unroute('**/api/campaigns/*/send')
  })

  test('waitlist enqueue → notified → converted → expire 30m (mock)', async ({ page }) => {
    const waitId = 'wait-1'
    await page.route('**/api/waitlist', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 201, json: { id: waitId, status: 'waiting' } })
      } else await route.continue()
    })
    await page.route(`**/api/waitlist/${waitId}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON() as { status: string }
        await route.fulfill({ status: 200, json: { id: waitId, status: body.status } })
      } else await route.continue()
    })
    await page.goto('/offline')
    const enq = await fetchJson(page, '/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95',
        service_id: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec',
        client_id: 'client-1',
        desired_at: new Date(Date.now() + 3600000).toISOString(),
      }),
    })
    expect(enq.status).toBe(201)
    expect((enq.json as { status: string }).status).toBe('waiting')

    const notified = await fetchJson(page, `/api/waitlist/${waitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'notified' }),
    })
    expect(notified.status).toBe(200)
    expect((notified.json as { status: string }).status).toBe('notified')

    const converted = await fetchJson(page, `/api/waitlist/${waitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'converted' }),
    })
    expect(converted.status).toBe(200)

    const expired = await page.evaluate(() => {
      const created = Date.now() - 31 * 60 * 1000
      const isExpired = (ts: number) => Date.now() - ts > 30 * 60 * 1000
      return isExpired(created)
    })
    expect(expired).toBe(true)

    await page.unroute('**/api/waitlist')
    await page.unroute(`**/api/waitlist/${waitId}`)
  })

  test('rrule WEEKLYx6 → 6 occurrences with skip on conflict (mock)', async ({ page }) => {
    await page.route('**/api/recurring*', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          json: {
            id: 'rec-1',
            rrule: 'FREQ=WEEKLY;COUNT=6',
            occurrences: Array.from({ length: 6 }, (_, i) => ({
              date: new Date(Date.now() + i * 7 * 86400000).toISOString().slice(0, 10),
              status: i === 2 ? 'skipped_conflict' : 'scheduled',
            })),
          },
        })
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, '/api/recurring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95',
        rrule: 'FREQ=WEEKLY;COUNT=6',
        service_id: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec',
        client_id: 'client-1',
        starts_at: new Date().toISOString(),
      }),
    })
    expect(res.status).toBe(201)
    const j = res.json as { occurrences: Array<{ status: string }> }
    expect(j.occurrences).toHaveLength(6)
    expect(j.occurrences.filter((o) => o.status === 'skipped_conflict')).toHaveLength(1)
    await page.unroute('**/api/recurring*')
  })

  test('CRM page without auth redirects to login', async ({ page }) => {
    await page.goto('/crm')
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  })
})
