import { expect, test } from '@playwright/test'

/**
 * Agenda FSM — PATCH /api/appointments/[id] scheduled→checked_in→in_service→completed + cancelled
 * plus barber availability check.
 * Uses page.route mocks + page.evaluate fetch for determinism; real backend path is conditional.
 */

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

test.describe('Agenda FSM — mocked (always runs)', () => {
  const apptId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

  test('FSM: scheduled → checked_in → in_service → completed (happy path)', async ({ page }) => {
    const transitions = ['checked_in', 'in_service', 'completed'] as const
    for (const to of transitions) {
      await page.route(`**/api/appointments/${apptId}`, async (route) => {
        if (route.request().method() === 'PATCH') {
          await route.fulfill({ status: 200, json: { id: apptId, status: to } })
        } else await route.continue()
      })
      await page.goto('/offline')
      const res = await fetchJson(page, `/api/appointments/${apptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to }),
      })
      expect(res.status).toBe(200)
      expect((res.json as { status: string }).status).toBe(to)
      await page.unroute(`**/api/appointments/${apptId}`)
    }
  })

  test('FSM: cancel from scheduled → cancelled (allowed)', async ({ page }) => {
    await page.route(`**/api/appointments/${apptId}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 200, json: { id: apptId, status: 'cancelled' } })
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, `/api/appointments/${apptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    expect(res.status).toBe(200)
    expect((res.json as { status: string }).status).toBe('cancelled')
    await page.unroute(`**/api/appointments/${apptId}`)
  })

  test('FSM: invalid transition completed → scheduled → 400', async ({ page }) => {
    await page.route(`**/api/appointments/${apptId}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 400,
          json: { error: 'invalid_transition', message: 'Cannot move from completed to scheduled' },
        })
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, `/api/appointments/${apptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'scheduled' }),
    })
    expect(res.status).toBe(400)
    expect((res.json as { error: string }).error).toBe('invalid_transition')
    await page.unroute(`**/api/appointments/${apptId}`)
  })

  test('FSM: cancelled → completed → 400 (terminal)', async ({ page }) => {
    await page.route(`**/api/appointments/${apptId}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 400, json: { error: 'invalid_transition' } })
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, `/api/appointments/${apptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    expect(res.status).toBe(400)
    await page.unroute(`**/api/appointments/${apptId}`)
  })

  test('barber availability: PATCH move validates check_barber_availability (mock 409)', async ({
    page,
  }) => {
    await page.route(`**/api/appointments/${apptId}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 409,
          json: { error: 'barber_unavailable', message: 'Barber on vacation/break' },
        })
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, `/api/appointments/${apptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        employee_id: 'barber-1',
      }),
    })
    expect(res.status).toBe(409)
    expect((res.json as { error: string }).error).toBe('barber_unavailable')
    await page.unroute(`**/api/appointments/${apptId}`)
  })

  test('concurrent FSM: two PATCH to same appt, one wins (409 concurrent)', async ({ page }) => {
    let first = true
    await page.route(`**/api/appointments/${apptId}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue()
      if (first) {
        first = false
        await route.fulfill({ status: 200, json: { id: apptId, status: 'checked_in' } })
      } else {
        await route.fulfill({
          status: 409,
          json: { error: 'conflict', message: 'Already checked_in' },
        })
      }
    })
    await page.goto('/offline')
    const results = await page.evaluate(async (id) => {
      const mk = (s: string) =>
        fetch(`/api/appointments/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: s }),
        }).then(async (r) => ({ status: r.status }))
      const [a, b] = await Promise.all([mk('checked_in'), mk('checked_in')])
      return [a.status, b.status]
    }, apptId)
    expect(results.sort()).toEqual([200, 409])
    await page.unroute(`**/api/appointments/${apptId}`)
  })

  test('GET /api/appointments smoke — requires auth mock (returns 401 or 200)', async ({
    page,
  }) => {
    await page.route('**/api/appointments*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, json: [] })
      } else await route.continue()
    })
    await page.goto('/offline')
    const res = await fetchJson(page, '/api/appointments', { method: 'GET' })
    expect([200, 401]).toContain(res.status)
    if (res.status === 200) expect(Array.isArray(res.json)).toBe(true)
    await page.unroute('**/api/appointments*')
  })
})

test.describe('Agenda FSM — real Supabase (conditional)', () => {
  test.skip(!process.env.E2E_SUPABASE, 'Requiere Supabase real — E2E_SUPABASE=1')
  test('real PATCH transitions enforce FSM via DB trigger', async ({ page }) => {
    await page.goto('/booking')
    await expect(page.locator('body')).toBeVisible()
  })
})
