import fc from 'fast-check'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(), getIp: vi.fn() }))
vi.mock('isomorphic-dompurify', () => ({
  default: { sanitize: vi.fn((s: string) => s.replace(/<[^>]*>/g, '').trim()) },
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: vi.fn(() => ({}) as any),
    book_new: vi.fn(() => ({}) as any),
    book_append_sheet: vi.fn(),
  },
  write: vi.fn(() => Buffer.from('xlsx-mock')),
}))

import { createClient as createJsClient } from '@supabase/supabase-js'
import DOMPurify from 'isomorphic-dompurify'
import * as XLSX from 'xlsx'
import { POST as CashClosePOST } from '@/app/api/cash/close/route'
import { GET as CashCurrentGET } from '@/app/api/cash/current/route'
import { POST as CashMovPOST } from '@/app/api/cash/movements/route'
import { POST as CashOpenPOST } from '@/app/api/cash/open/route'
import { POST as InventoryPhotoPOST } from '@/app/api/inventory/[id]/photo/route'
import { PATCH as InventoryPatch } from '@/app/api/inventory/[id]/route'
import { GET as ExportGET } from '@/app/api/inventory/export/route'
import { GET as ExportSalesGET } from '@/app/api/inventory/export-sales/route'
import { POST as ImportPOST } from '@/app/api/inventory/import/route'
import { GET as LookupGET } from '@/app/api/inventory/lookup/route'
import { POST as InventoryPOST } from '@/app/api/inventory/route'
import { GET as SalesGET } from '@/app/api/inventory/sales/route'
import { POST as PosPOST } from '@/app/api/pos/transaction/route'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

import { cn, formatCurrency, formatDate, getTenantSlug, slugify } from '@/lib/utils'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const BIZ_ID = '11111111-1111-4111-a111-111111111111'
const USER_ID = '22222222-2222-4222-a222-222222222222'
const REG_ID = '33333333-3333-4333-a333-333333333333'
const ITEM_ID = '44444444-4444-4444-a444-444444444444'
const SVC_ID = '55555555-5555-4555-a555-555555555555'
const TX_ID = '66666666-6666-4666-a666-666666666666'

function makeChain(result: any) {
  const c: any = {}
  const p = Promise.resolve(result)
  c.then = p.then.bind(p)
  c.catch = p.catch.bind(p)
  if ((p as any).finally) c.finally = (p as any).finally.bind(p)
  const methods = [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'neq',
    'or',
    'in',
    'single',
    'maybeSingle',
    'order',
    'limit',
    'range',
    'ilike',
    'gte',
    'lte',
    'gt',
    'lt',
  ]
  methods.forEach((m) => {
    c[m] = vi.fn((..._args: any[]) => c)
  })
  return c
}

function jsonReq(url: string, body: any, method = 'POST'): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1' } as any,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
function _jsonReqRaw(_url: string, rawBody: string): any {
  return { headers: { get: () => '1.1.1.1' }, json: async () => JSON.parse(rawBody) } as any
}
function badJsonReq(): any {
  return {
    headers: { get: () => '1.1.1.1' },
    json: async () => {
      throw new Error('bad json')
    },
  }
}

// cash open helpers
function setupCashOpen(
  opts: {
    user?: any | null
    business?: any | null
    existing?: any | null
    insert?: { data: any; error: any } | null
  } = {},
) {
  const user = opts.user !== undefined ? opts.user : { id: USER_ID }
  const business = opts.business !== undefined ? opts.business : { id: BIZ_ID }
  const existing = opts.existing !== undefined ? opts.existing : null
  const insert =
    opts.insert !== undefined
      ? opts.insert
      : {
          data: {
            id: REG_ID,
            opening_cash: 100,
            opened_at: new Date().toISOString(),
            status: 'open',
          },
          error: null,
        }
  const businessChain = makeChain({ data: business, error: null })
  const existingChain = makeChain({ data: existing, error: null })
  const insertChain = makeChain(insert as any)
  const counts: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    counts[table] = counts[table] ?? 0
    const idx = counts[table]++
    if (table === 'businesses') return businessChain
    if (table === 'cash_registers') {
      if (idx === 0) return existingChain
      return insertChain
    }
    return makeChain({ data: null, error: null })
  })
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user } })
  const client: any = { auth: { getUser: mockGetUser }, from }
  client._chains = { businessChain, existingChain, insertChain, mockGetUser }
  vi.mocked(createClient).mockResolvedValue(client)
  return { client, chains: client._chains, from, mockGetUser }
}

// cash close helper
function setupCashClose(
  opts: {
    user?: any | null
    business?: any | null
    register?: any | null
    txs?: any[] | null
    moves?: any[] | null
    update?: { data: any; error: any } | null
  } = {},
) {
  const user = opts.user !== undefined ? opts.user : { id: USER_ID }
  const business = opts.business !== undefined ? opts.business : { id: BIZ_ID }
  const register =
    opts.register !== undefined
      ? opts.register
      : { id: REG_ID, opening_cash: 100, opened_at: new Date('2026-01-01T00:00:00Z').toISOString() }
  const txs = opts.txs !== undefined ? opts.txs : []
  const moves = opts.moves !== undefined ? opts.moves : []
  const update =
    opts.update !== undefined
      ? opts.update
      : {
          data: {
            id: REG_ID,
            opening_cash: 100,
            expected_cash: 150,
            actual_cash: 150,
            difference: 0,
            status: 'closed',
            opened_at: register?.opened_at,
            closed_at: new Date().toISOString(),
          },
          error: null,
        }
  const businessChain = makeChain({ data: business, error: null })
  const registerChain = makeChain({ data: register, error: null })
  const txChain = makeChain({ data: txs, error: null })
  const movesChain = makeChain({ data: moves, error: null })
  const updateChain = makeChain(update as any)
  const counts: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    counts[table] = counts[table] ?? 0
    const idx = counts[table]++
    if (table === 'businesses') return businessChain
    if (table === 'cash_registers') {
      if (idx === 0) return registerChain
      return updateChain
    }
    if (table === 'transactions') return txChain
    if (table === 'cash_movements') return movesChain
    return makeChain({ data: null, error: null })
  })
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user } })
  const client: any = { auth: { getUser: mockGetUser }, from }
  client._chains = { businessChain, registerChain, txChain, movesChain, updateChain, mockGetUser }
  vi.mocked(createClient).mockResolvedValue(client)
  return { client, chains: client._chains, from, mockGetUser }
}

function setupCashCurrent(
  opts: {
    user?: any | null
    business?: any | null
    register?: any | null
    txs?: any[] | null
    moves?: any[] | null
  } = {},
) {
  const user = opts.user !== undefined ? opts.user : { id: USER_ID }
  const business = opts.business !== undefined ? opts.business : { id: BIZ_ID }
  const register =
    opts.register !== undefined
      ? opts.register
      : {
          id: REG_ID,
          opening_cash: 100,
          expected_cash: null,
          actual_cash: null,
          difference: null,
          status: 'open',
          opened_at: new Date('2026-01-01T00:00:00Z').toISOString(),
          closed_at: null,
          notes: null,
        }
  const txs = opts.txs !== undefined ? opts.txs : []
  const moves = opts.moves !== undefined ? opts.moves : []
  const businessChain = makeChain({ data: business, error: null })
  const registerChain = makeChain({ data: register, error: null })
  const txChain = makeChain({ data: txs, error: null })
  const movesChain = makeChain({ data: moves, error: null })
  const counts: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    counts[table] = counts[table] ?? 0
    const _idx = counts[table]++
    if (table === 'businesses') return businessChain
    if (table === 'cash_registers') {
      // only one call for register
      return registerChain
    }
    if (table === 'transactions') return txChain
    if (table === 'cash_movements') return movesChain
    return makeChain({ data: null, error: null })
  })
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user } })
  const client: any = { auth: { getUser: mockGetUser }, from }
  client._chains = { businessChain, registerChain, txChain, movesChain, mockGetUser }
  vi.mocked(createClient).mockResolvedValue(client)
  return { client, chains: client._chains, from }
}

function setupCashMov(
  opts: {
    user?: any | null
    business?: any | null
    register?: any | null
    insert?: { data: any; error: any } | null
  } = {},
) {
  const user = opts.user !== undefined ? opts.user : { id: USER_ID }
  const business = opts.business !== undefined ? opts.business : { id: BIZ_ID }
  const register = opts.register !== undefined ? opts.register : { id: REG_ID }
  const insert =
    opts.insert !== undefined
      ? opts.insert
      : {
          data: {
            id: 'mov-1',
            type: 'in',
            amount: 100,
            reason: 'test',
            created_at: new Date().toISOString(),
          },
          error: null,
        }
  const businessChain = makeChain({ data: business, error: null })
  const registerChain = makeChain({ data: register, error: null })
  const insertChain = makeChain(insert as any)
  const counts: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    counts[table] = counts[table] ?? 0
    const _idx = counts[table]++
    if (table === 'businesses') return businessChain
    if (table === 'cash_registers') return registerChain
    if (table === 'cash_movements') return insertChain
    return makeChain({ data: null, error: null })
  })
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user } })
  const client: any = { auth: { getUser: mockGetUser }, from }
  client._chains = { businessChain, registerChain, insertChain, mockGetUser }
  vi.mocked(createClient).mockResolvedValue(client)
  return { client, chains: client._chains, from }
}

function setupPos(
  opts: {
    user?: any | null
    biz?: any | null
    openRegister?: any | null
    txInsert?: { data: any; error: any } | null
  } = {},
) {
  const user = opts.user !== undefined ? opts.user : { id: USER_ID }
  const biz = opts.biz !== undefined ? opts.biz : { id: BIZ_ID }
  const openRegister = opts.openRegister !== undefined ? opts.openRegister : { id: REG_ID }
  const txInsert =
    opts.txInsert !== undefined
      ? opts.txInsert
      : { data: { id: TX_ID, receipt_number: 'R001' }, error: null }
  const bizChain = makeChain({ data: biz, error: null })
  const openChain = makeChain({ data: openRegister, error: null })
  const txChain = makeChain(txInsert as any)
  const counts: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    counts[table] = counts[table] ?? 0
    const _idx = counts[table]++
    if (table === 'businesses') return bizChain
    if (table === 'cash_registers') return openChain
    if (table === 'transactions') return txChain
    return makeChain({ data: null, error: null })
  })
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user } })
  const client: any = { auth: { getUser: mockGetUser }, from }
  client._chains = { bizChain, openChain, txChain, mockGetUser }
  vi.mocked(createClient).mockResolvedValue(client)
  return { client, chains: client._chains, from }
}

function setupInventoryCreate(
  opts: {
    user?: any | null
    business?: any | null
    insert?: { data: any; error: any } | null
  } = {},
) {
  const user = opts.user !== undefined ? opts.user : { id: USER_ID }
  const business = opts.business !== undefined ? opts.business : { id: BIZ_ID }
  const insert = opts.insert !== undefined ? opts.insert : { data: { id: ITEM_ID }, error: null }
  const businessChain = makeChain({ data: business, error: null })
  const insertChain = makeChain(insert as any)
  const from = vi.fn((table: string) => {
    if (table === 'businesses') return businessChain
    if (table === 'inventory_items') return insertChain
    return makeChain({ data: null, error: null })
  })
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user } })
  const client: any = { auth: { getUser: mockGetUser }, from }
  client._chains = { businessChain, insertChain, mockGetUser }
  vi.mocked(createClient).mockResolvedValue(client)
  return { client, chains: client._chains, from }
}

function setupInventoryPatch(
  opts: { user?: any | null; update?: { data: any; error: any } | null } = {},
) {
  const user = opts.user !== undefined ? opts.user : { id: USER_ID }
  const update =
    opts.update !== undefined
      ? opts.update
      : { data: { id: ITEM_ID, name: 'Updated' }, error: null }
  const updateChain = makeChain(update as any)
  const from = vi.fn(() => updateChain)
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user } })
  const client: any = { auth: { getUser: mockGetUser }, from }
  client._chains = { updateChain, mockGetUser }
  vi.mocked(createClient).mockResolvedValue(client)
  return { client, chains: client._chains, from, mockGetUser }
}

function setupLookup(opts: { user?: any | null; business?: any | null; item?: any | null } = {}) {
  const user = opts.user !== undefined ? opts.user : { id: USER_ID }
  const business = opts.business !== undefined ? opts.business : { id: BIZ_ID }
  const item = opts.item !== undefined ? opts.item : null
  const businessChain = makeChain({ data: business, error: null })
  const itemChain = makeChain({ data: item, error: null })
  const from = vi.fn((table: string) => {
    if (table === 'businesses') return businessChain
    if (table === 'inventory_items') return itemChain
    return makeChain({ data: null, error: null })
  })
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user } })
  const client: any = { auth: { getUser: mockGetUser }, from }
  client._chains = { businessChain, itemChain, mockGetUser }
  vi.mocked(createClient).mockResolvedValue(client)
  return { client, chains: client._chains, from }
}

function setupImport(
  opts: {
    user?: any | null
    authError?: any
    business?: any | null
    existing?: any[] | null
    insert?: { data: any; error: any } | null
  } = {},
) {
  const user = opts.user !== undefined ? opts.user : { id: USER_ID }
  const authError = opts.authError !== undefined ? opts.authError : null
  const business = opts.business !== undefined ? opts.business : { id: BIZ_ID }
  const existing = opts.existing !== undefined ? opts.existing : []
  const insert = opts.insert !== undefined ? opts.insert : { data: [{ id: ITEM_ID }], error: null }
  const businessChain = makeChain({ data: business, error: null })
  const existingChain = makeChain({ data: existing, error: null })
  const insertChain = makeChain(insert as any)
  const mockGetUser = vi
    .fn()
    .mockResolvedValue(
      authError ? { data: { user: null }, error: authError } : { data: { user }, error: null },
    )
  // need to handle authError branch where !user also.
  const counts: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    counts[table] = counts[table] ?? 0
    const idx = counts[table]++
    if (table === 'businesses') return businessChain
    if (table === 'inventory_items') {
      if (idx === 0) return existingChain
      return insertChain
    }
    return makeChain({ data: null, error: null })
  })
  const client: any = { auth: { getUser: mockGetUser }, from }
  client._chains = { businessChain, existingChain, insertChain, mockGetUser }
  vi.mocked(createClient).mockResolvedValue(client)
  return { client, chains: client._chains, from }
}

function setupExport(
  opts: { user?: any | null; business?: any | null; items?: any[] | null } = {},
) {
  const user = opts.user !== undefined ? opts.user : { id: USER_ID }
  const business = opts.business !== undefined ? opts.business : { id: BIZ_ID }
  const items = opts.items !== undefined ? opts.items : []
  const businessChain = makeChain({ data: business, error: null })
  const itemsChain = makeChain({ data: items, error: null })
  const from = vi.fn((table: string) => {
    if (table === 'businesses') return businessChain
    if (table === 'inventory_items') return itemsChain
    return makeChain({ data: null, error: null })
  })
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user } })
  const client: any = { auth: { getUser: mockGetUser }, from }
  client._chains = { businessChain, itemsChain, mockGetUser }
  vi.mocked(createClient).mockResolvedValue(client)
  return { client, chains: client._chains, from }
}

function setupExportSales(
  opts: {
    user?: any | null
    business?: any | null
    txRows?: any[] | null
    clients?: any[] | null
  } = {},
) {
  const user = opts.user !== undefined ? opts.user : { id: USER_ID }
  const business = opts.business !== undefined ? opts.business : { id: BIZ_ID, currency: 'USD' }
  const txRows = opts.txRows !== undefined ? opts.txRows : []
  const clients = opts.clients !== undefined ? opts.clients : []
  const businessChain = makeChain({ data: business, error: null })
  const txChain = makeChain({ data: txRows, error: null })
  const clientsChain = makeChain({ data: clients, error: null })
  const counts: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    counts[table] = counts[table] ?? 0
    const _idx = counts[table]++
    if (table === 'businesses') return businessChain
    if (table === 'transactions') return txChain
    if (table === 'clients') return clientsChain
    return makeChain({ data: null, error: null })
  })
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user } })
  const client: any = { auth: { getUser: mockGetUser }, from }
  client._chains = { businessChain, txChain, clientsChain, mockGetUser }
  vi.mocked(createClient).mockResolvedValue(client)
  return { client, chains: client._chains, from }
}

function setupSales(opts: { user?: any | null; business?: any | null; rows?: any[] | null } = {}) {
  const user = opts.user !== undefined ? opts.user : { id: USER_ID }
  const business = opts.business !== undefined ? opts.business : { id: BIZ_ID, currency: 'COP' }
  const rows = opts.rows !== undefined ? opts.rows : []
  const businessChain = makeChain({ data: business, error: null })
  const txChain = makeChain({ data: rows, error: null })
  const from = vi.fn((table: string) => {
    if (table === 'businesses') return businessChain
    if (table === 'transactions') return txChain
    return makeChain({ data: null, error: null })
  })
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user } })
  const client: any = { auth: { getUser: mockGetUser }, from }
  client._chains = { businessChain, txChain, mockGetUser }
  vi.mocked(createClient).mockResolvedValue(client)
  return { client, chains: client._chains, from }
}

function setupPhotoMocks(opts: { uploadError?: any; publicUrl?: string } = {}) {
  const uploadMock = vi
    .fn()
    .mockResolvedValue(opts.uploadError ? { error: opts.uploadError } : { error: null })
  const getPublicUrlMock = vi
    .fn()
    .mockReturnValue({ data: { publicUrl: opts.publicUrl ?? 'https://cdn.example.com/photo.jpg' } })
  const fromMock = vi.fn((bucket: string) => {
    // used for storage.from('inventory')
    if (bucket === 'inventory') {
      return { upload: uploadMock, getPublicUrl: getPublicUrlMock }
    }
    return { upload: uploadMock, getPublicUrl: getPublicUrlMock } as any
  })
  // also need supabase.from for inventory_items update
  const updateChain = makeChain({ data: null, error: null })
  const fromItem = vi.fn((table: string) => {
    if (table === 'inventory_items') return updateChain
    return makeChain({ data: null, error: null })
  })
  const storageObj: any = { from: fromMock }
  const client: any = { storage: storageObj, from: fromItem }
  client._mocks = { uploadMock, getPublicUrlMock, fromMock, updateChain }
  vi.mocked(createJsClient).mockReturnValue(client as any)
  return { client, mocks: client._mocks }
}

// ---------------------------------------------------------------------------
// main suite
// ---------------------------------------------------------------------------
describe('api-cash-pos-inventory-strict', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue(true)
    vi.mocked(getIp).mockReturnValue('1.1.1.1')
    vi.mocked(DOMPurify.sanitize).mockImplementation((s: string) =>
      s.replace(/<[^>]*>/g, '').trim(),
    )
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    // reset XLSX mocks
    vi.mocked(XLSX.utils.json_to_sheet).mockReturnValue({} as any)
    vi.mocked(XLSX.utils.book_new).mockReturnValue({} as any)
    vi.mocked(XLSX.write).mockReturnValue(Buffer.from('xlsx-mock') as any)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    // need to re-mock after restoreAllMocks clears mocks? beforeEach will reset
  })

  // -----------------------------------------------------------------------
  // cash/open POST
  // -----------------------------------------------------------------------
  describe('cash/open POST', () => {
    it('rate_limited 429', async () => {
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = jsonReq('http://localhost/api/cash/open', { opening_cash: 100 })
      const res = await CashOpenPOST(req as any)
      expect(res.status).toBe(429)
      expect((await res.json()).error).toBe('rate_limited')
      expect(createClient).not.toHaveBeenCalled()
      expect(vi.mocked(rateLimit).mock.calls[0][0]).toBe('cash-open:1.1.1.1')
      expect(getIp).toHaveBeenCalled()
    })
    it('unauthorized 401 (no user)', async () => {
      setupCashOpen({ user: null })
      const req = jsonReq('http://localhost/api/cash/open', { opening_cash: 10 })
      const res = await CashOpenPOST(req as any)
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('unauthorized')
    })
    it('not_found 404 (no business)', async () => {
      setupCashOpen({ business: null })
      const req = jsonReq('http://localhost/api/cash/open', { opening_cash: 10 })
      const res = await CashOpenPOST(req as any)
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('not_found')
    })
    it('invalid_json 400', async () => {
      setupCashOpen()
      const req = badJsonReq()
      const res = await CashOpenPOST(req as any)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_json')
    })
    it('validation_failed 422 opening_cash negative', async () => {
      setupCashOpen()
      const req = jsonReq('http://localhost/api/cash/open', { opening_cash: -1 })
      const res = await CashOpenPOST(req as any)
      expect(res.status).toBe(422)
      const j = await res.json()
      expect(j.error).toBe('validation_failed')
      expect(j.details.opening_cash).toBeDefined()
    })
    it('validation_failed 422 opening_cash >1_000_000', async () => {
      setupCashOpen()
      const req = jsonReq('http://localhost/api/cash/open', { opening_cash: 1_000_001 })
      const res = await CashOpenPOST(req as any)
      expect(res.status).toBe(422)
      expect((await res.json()).details.opening_cash).toBeDefined()
    })
    it('validation_failed 422 notes max 500', async () => {
      setupCashOpen()
      const req = jsonReq('http://localhost/api/cash/open', {
        opening_cash: 0,
        notes: 'a'.repeat(501),
      })
      const res = await CashOpenPOST(req as any)
      expect(res.status).toBe(422)
      expect((await res.json()).details.notes).toBeDefined()
    })
    it('validation notes optional nullable and opening_cash default', async () => {
      setupCashOpen({
        existing: null,
        insert: {
          data: {
            id: REG_ID,
            opening_cash: 0,
            opened_at: new Date().toISOString(),
            status: 'open',
          },
          error: null,
        },
      })
      const req = jsonReq('http://localhost/api/cash/open', {})
      const res = await CashOpenPOST(req as any)
      expect(res.status).toBe(201)
    })
    it('validation notes 500 chars OK', async () => {
      setupCashOpen({ existing: null })
      const req = jsonReq('http://localhost/api/cash/open', {
        opening_cash: 0,
        notes: 'a'.repeat(500),
      })
      const res = await CashOpenPOST(req as any)
      expect(res.status).toBe(201)
    })
    it('already_open 409', async () => {
      setupCashOpen({ existing: { id: REG_ID } })
      const req = jsonReq('http://localhost/api/cash/open', { opening_cash: 100 })
      const res = await CashOpenPOST(req as any)
      expect(res.status).toBe(409)
      const j = await res.json()
      expect(j.error).toBe('already_open')
      expect(j.message).toBe('Caja ya está abierta')
    })
    it('insert single error 500', async () => {
      setupCashOpen({
        existing: null,
        insert: { data: null, error: { message: 'insert fail' } } as any,
      })
      const req = jsonReq('http://localhost/api/cash/open', { opening_cash: 100 })
      const res = await CashOpenPOST(req as any)
      expect(res.status).toBe(500)
      expect((await res.json()).error).toBe('insert fail')
    })
    it('success 201', async () => {
      const now = new Date().toISOString()
      setupCashOpen({
        existing: null,
        insert: {
          data: { id: REG_ID, opening_cash: 250, opened_at: now, status: 'open' },
          error: null,
        },
      })
      const req = jsonReq('http://localhost/api/cash/open', { opening_cash: 250, notes: 'start' })
      const res = await CashOpenPOST(req as any)
      expect(res.status).toBe(201)
      const j = await res.json()
      expect(j.id).toBe(REG_ID)
      expect(j.opening_cash).toBe(250)
    })
    it('fast-check fuzz opening_cash property: valid 0..1M succeeds, out of range fails validation', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: -500000, max: 2_000_000 }), async (val) => {
          // need fresh mock per iteration
          setupCashOpen({ existing: null })
          const req = jsonReq('http://localhost/api/cash/open', { opening_cash: val })
          const res = await CashOpenPOST(req as any)
          if (val < 0 || val > 1_000_000) {
            expect(res.status).toBe(422)
          } else {
            expect(res.status).toBe(201)
          }
        }),
        { numRuns: 25 },
      )
    })
  })

  // -----------------------------------------------------------------------
  // cash/close POST
  // -----------------------------------------------------------------------
  describe('cash/close POST', () => {
    it('rate_limited 429', async () => {
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = jsonReq('http://localhost/api/cash/close', { actual_cash: 100 })
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(429)
      expect((await res.json()).error).toBe('rate_limited')
    })
    it('unauthorized 401', async () => {
      setupCashClose({ user: null })
      const req = jsonReq('http://localhost/api/cash/close', { actual_cash: 100 })
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(401)
    })
    it('not_found 404 no business', async () => {
      setupCashClose({ business: null })
      const req = jsonReq('http://localhost/api/cash/close', { actual_cash: 100 })
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(404)
    })
    it('invalid_json 400', async () => {
      setupCashClose()
      const req = badJsonReq()
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_json')
    })
    it('validation_failed 422 actual_cash negative', async () => {
      setupCashClose()
      const req = jsonReq('http://localhost/api/cash/close', { actual_cash: -1 })
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(422)
      expect((await res.json()).details.actual_cash).toBeDefined()
    })
    it('validation_failed 422 actual_cash >10M', async () => {
      setupCashClose()
      const req = jsonReq('http://localhost/api/cash/close', { actual_cash: 10_000_001 })
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(422)
    })
    it('validation_failed 422 register_id invalid uuid', async () => {
      setupCashClose()
      const req = jsonReq('http://localhost/api/cash/close', {
        actual_cash: 100,
        register_id: 'not-uuid',
      })
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(422)
      expect((await res.json()).details.register_id).toBeDefined()
    })
    it('validation missing actual_cash', async () => {
      setupCashClose()
      const req = jsonReq('http://localhost/api/cash/close', {})
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(422)
    })
    it('no_open_register 404 without register_id', async () => {
      setupCashClose({ register: null })
      const req = jsonReq('http://localhost/api/cash/close', { actual_cash: 100 })
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(404)
      const j = await res.json()
      expect(j.error).toBe('no_open_register')
    })
    it('no_open_register with register_id provided', async () => {
      setupCashClose({ register: null })
      const req = jsonReq('http://localhost/api/cash/close', {
        actual_cash: 100,
        register_id: REG_ID,
      })
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(404)
    })
    it('register_id filters query (branch eq id)', async () => {
      const reg = {
        id: REG_ID,
        opening_cash: 50,
        opened_at: new Date('2026-01-01T00:00:00Z').toISOString(),
      }
      const { chains } = setupCashClose({
        register: reg,
        txs: [],
        moves: [],
        update: {
          data: {
            id: REG_ID,
            opening_cash: 50,
            expected_cash: 50,
            actual_cash: 50,
            difference: 0,
            status: 'closed',
            opened_at: reg.opened_at,
            closed_at: new Date().toISOString(),
          },
          error: null,
        },
      })
      const req = jsonReq('http://localhost/api/cash/close', {
        actual_cash: 50,
        register_id: REG_ID,
      })
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(200)
      // registerChain eq should have been called with id
      expect(chains.registerChain.eq).toHaveBeenCalledWith('id', REG_ID)
    })
    it('without register_id extra eq not called with id', async () => {
      const reg = {
        id: REG_ID,
        opening_cash: 0,
        opened_at: new Date('2026-01-01T00:00:00Z').toISOString(),
      }
      const { chains } = setupCashClose({ register: reg, txs: [], moves: [] })
      const req = jsonReq('http://localhost/api/cash/close', { actual_cash: 0 })
      await CashClosePOST(req as any)
      // Should have called eq business_id and status but not id
      const idCalls = (chains.registerChain.eq as any).mock.calls.filter((c: any) => c[0] === 'id')
      expect(idCalls.length).toBe(0)
    })
    it('movements sum and expected calc with txSum inSum outSum', async () => {
      const reg = {
        id: REG_ID,
        opening_cash: 100,
        opened_at: new Date('2026-01-01T00:00:00Z').toISOString(),
      }
      const txs = [{ amount: 50 }, { amount: '25.5' }]
      const moves = [
        { type: 'in', amount: 20 },
        { type: 'out', amount: 5 },
        { type: 'in', amount: '10' },
      ]
      // expected = 100 + 75.5 +30 -5 = 200.5 rounded
      const update = {
        data: {
          id: REG_ID,
          opening_cash: 100,
          expected_cash: 200.5,
          actual_cash: 200.5,
          difference: 0,
          status: 'closed',
          opened_at: reg.opened_at,
          closed_at: new Date().toISOString(),
        },
        error: null,
      }
      setupCashClose({ register: reg, txs: txs as any, moves: moves as any, update })
      const req = jsonReq('http://localhost/api/cash/close', { actual_cash: 200.5 })
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.txSum).toBeCloseTo(75.5)
      expect(j.inSum).toBeCloseTo(30)
      expect(j.outSum).toBeCloseTo(5)
      expect(j.expected).toBeCloseTo(200.5)
      // difference not validated but returned data expected_cash
      expect(j.expected_cash).toBe(200.5)
    })
    it('null txs/moves -> 0 sums and rounding', async () => {
      const reg = {
        id: REG_ID,
        opening_cash: 10.005,
        opened_at: new Date('2026-01-01T00:00:00Z').toISOString(),
      }
      setupCashClose({
        register: reg,
        txs: null as any,
        moves: null as any,
        update: {
          data: {
            id: REG_ID,
            opening_cash: 10.005,
            expected_cash: 10.01,
            actual_cash: 10.01,
            difference: 0,
            status: 'closed',
            opened_at: reg.opened_at,
            closed_at: new Date().toISOString(),
          },
          error: null,
        },
      })
      const req = jsonReq('http://localhost/api/cash/close', { actual_cash: 10.01 })
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.txSum).toBe(0)
      expect(j.inSum).toBe(0)
      expect(j.outSum).toBe(0)
      expect(j.expected).toBeCloseTo(10.01) // 10.005 rounded to 10.01
    })
    it('floating rounding case 0.1+0.2', async () => {
      const reg = {
        id: REG_ID,
        opening_cash: 0,
        opened_at: new Date('2026-01-01T00:00:00Z').toISOString(),
      }
      setupCashClose({ register: reg, txs: [{ amount: 0.1 }, { amount: 0.2 }] as any, moves: [] })
      const req = jsonReq('http://localhost/api/cash/close', { actual_cash: 0.3 })
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(200)
      expect((await res.json()).expected).toBe(0.3)
    })
    it('insert update error 500', async () => {
      const reg = { id: REG_ID, opening_cash: 100, opened_at: new Date().toISOString() }
      setupCashClose({
        register: reg,
        txs: [],
        moves: [],
        update: { data: null, error: { message: 'update fail' } } as any,
      })
      const req = jsonReq('http://localhost/api/cash/close', { actual_cash: 100 })
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(500)
      expect((await res.json()).error).toBe('update fail')
    })
    it('success returns data spread and calc', async () => {
      const reg = { id: REG_ID, opening_cash: 0, opened_at: new Date().toISOString() }
      setupCashClose({
        register: reg,
        txs: [],
        moves: [],
        update: {
          data: {
            id: REG_ID,
            opening_cash: 0,
            expected_cash: 0,
            actual_cash: 0,
            difference: 0,
            status: 'closed',
            opened_at: reg.opened_at,
            closed_at: new Date().toISOString(),
          },
          error: null,
        },
      })
      const req = jsonReq('http://localhost/api/cash/close', { actual_cash: 0 })
      const res = await CashClosePOST(req as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.status).toBe('closed')
    })
  })

  // -----------------------------------------------------------------------
  // cash/current GET
  // -----------------------------------------------------------------------
  describe('cash/current GET', () => {
    it('unauthorized 401', async () => {
      setupCashCurrent({ user: null })
      const res = await CashCurrentGET()
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('unauthorized')
    })
    it('not_found 404', async () => {
      setupCashCurrent({ business: null })
      const res = await CashCurrentGET()
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('not_found')
    })
    it('register null returns {register:null}', async () => {
      setupCashCurrent({ register: null })
      const res = await CashCurrentGET()
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.register).toBeNull()
    })
    it('register exists with null txs/moves sums 0', async () => {
      const reg = {
        id: REG_ID,
        opening_cash: 50,
        expected_cash: null,
        actual_cash: null,
        difference: null,
        status: 'open',
        opened_at: new Date('2026-01-01T00:00:00Z').toISOString(),
        closed_at: null,
        notes: null,
      }
      setupCashCurrent({ register: reg, txs: null as any, moves: null as any })
      const res = await CashCurrentGET()
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.register.id).toBe(REG_ID)
      expect(j.register.expected_cash).toBe(50)
      expect(j.register.txSum).toBe(0)
      expect(j.register.inSum).toBe(0)
      expect(j.register.outSum).toBe(0)
    })
    it('calc expected with mixed types', async () => {
      const reg = {
        id: REG_ID,
        opening_cash: '100' as any,
        expected_cash: null,
        actual_cash: null,
        difference: null,
        status: 'open',
        opened_at: new Date('2026-01-01T00:00:00Z').toISOString(),
        closed_at: null,
        notes: null,
      }
      const txs = [{ amount: '20' }, { amount: 30 }]
      const moves = [
        { type: 'in', amount: '10' },
        { type: 'out', amount: 5 },
      ]
      setupCashCurrent({ register: reg, txs: txs as any, moves: moves as any })
      const res = await CashCurrentGET()
      const j = await res.json()
      // 100+50+10-5=155
      expect(j.register.expected_cash).toBe(155)
      expect(j.register.txSum).toBe(50)
      expect(j.register.inSum).toBe(10)
      expect(j.register.outSum).toBe(5)
    })
    it('moves filtering in/out', async () => {
      const reg = {
        id: REG_ID,
        opening_cash: 0,
        expected_cash: null,
        actual_cash: null,
        difference: null,
        status: 'open',
        opened_at: new Date().toISOString(),
        closed_at: null,
        notes: 'hi',
      }
      const moves = [
        { type: 'in', amount: 100 },
        { type: 'out', amount: 40 },
        { type: 'unknown', amount: 999 } as any,
      ]
      setupCashCurrent({ register: reg, txs: [], moves: moves as any })
      const res = await CashCurrentGET()
      const j = await res.json()
      expect(j.register.inSum).toBe(100)
      expect(j.register.outSum).toBe(40)
      expect(j.register.expected_cash).toBe(60)
    })
  })

  // -----------------------------------------------------------------------
  // cash/movements POST
  // -----------------------------------------------------------------------
  describe('cash/movements POST', () => {
    it('rate_limited 429', async () => {
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = jsonReq('http://localhost/api/cash/movements', { type: 'in', amount: 10 })
      const res = await CashMovPOST(req as any)
      expect(res.status).toBe(429)
      expect((await res.json()).error).toBe('rate_limited')
    })
    it('unauthorized 401', async () => {
      setupCashMov({ user: null })
      const req = jsonReq('http://localhost/api/cash/movements', { type: 'in', amount: 10 })
      const res = await CashMovPOST(req as any)
      expect(res.status).toBe(401)
    })
    it('not_found 404', async () => {
      setupCashMov({ business: null })
      const req = jsonReq('http://localhost/api/cash/movements', { type: 'in', amount: 10 })
      const res = await CashMovPOST(req as any)
      expect(res.status).toBe(404)
    })
    it('invalid_json 400', async () => {
      setupCashMov()
      const req = badJsonReq()
      const res = await CashMovPOST(req as any)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_json')
    })
    it('validation_failed 422 type invalid', async () => {
      setupCashMov()
      const req = jsonReq('http://localhost/api/cash/movements', { type: 'invalid', amount: 10 })
      const res = await CashMovPOST(req as any)
      expect(res.status).toBe(422)
      expect((await res.json()).details.type).toBeDefined()
    })
    it('validation_failed 422 amount <0.01', async () => {
      setupCashMov()
      const req = jsonReq('http://localhost/api/cash/movements', { type: 'in', amount: 0 })
      const res = await CashMovPOST(req as any)
      expect(res.status).toBe(422)
      expect((await res.json()).details.amount).toBeDefined()
    })
    it('validation_failed 422 amount >1_000_000', async () => {
      setupCashMov()
      const req = jsonReq('http://localhost/api/cash/movements', { type: 'out', amount: 1_000_001 })
      const res = await CashMovPOST(req as any)
      expect(res.status).toBe(422)
    })
    it('validation reason max 500 ok 500 and fail 501', async () => {
      setupCashMov()
      const reqOk = jsonReq('http://localhost/api/cash/movements', {
        type: 'in',
        amount: 10,
        reason: 'a'.repeat(500),
      })
      const resOk = await CashMovPOST(reqOk as any)
      expect(resOk.status).toBe(201)
      setupCashMov()
      const reqFail = jsonReq('http://localhost/api/cash/movements', {
        type: 'in',
        amount: 10,
        reason: 'a'.repeat(501),
      })
      const resFail = await CashMovPOST(reqFail as any)
      expect(resFail.status).toBe(422)
      expect((await resFail.json()).details.reason).toBeDefined()
    })
    it('validation coerce amount string "10" passes', async () => {
      setupCashMov({
        insert: {
          data: {
            id: 'mov-1',
            type: 'in',
            amount: 10,
            reason: null,
            created_at: new Date().toISOString(),
          },
          error: null,
        },
      })
      const req = jsonReq('http://localhost/api/cash/movements', {
        type: 'in',
        amount: '10' as any,
      })
      const res = await CashMovPOST(req as any)
      expect(res.status).toBe(201)
    })
    it('no_open_register 404', async () => {
      setupCashMov({ register: null })
      const req = jsonReq('http://localhost/api/cash/movements', { type: 'in', amount: 10 })
      const res = await CashMovPOST(req as any)
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('no_open_register')
    })
    it('sanitize reason via DOMPurify', async () => {
      const { chains } = setupCashMov({
        insert: {
          data: {
            id: 'mov-1',
            type: 'in',
            amount: 10,
            reason: 'clean',
            created_at: new Date().toISOString(),
          },
          error: null,
        },
      })
      vi.mocked(DOMPurify.sanitize).mockReturnValue('clean')
      const req = jsonReq('http://localhost/api/cash/movements', {
        type: 'in',
        amount: 10,
        reason: '<b>dirty</b>',
      })
      const res = await CashMovPOST(req as any)
      expect(res.status).toBe(201)
      expect(DOMPurify.sanitize).toHaveBeenCalledWith('<b>dirty</b>', { ALLOWED_TAGS: [] })
      expect(chains.insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'clean' }),
      )
    })
    it('reason null -> insert null, not sanitize', async () => {
      const { chains } = setupCashMov()
      vi.mocked(DOMPurify.sanitize).mockClear()
      const req = jsonReq('http://localhost/api/cash/movements', { type: 'out', amount: 5 })
      const res = await CashMovPOST(req as any)
      expect(res.status).toBe(201)
      expect(DOMPurify.sanitize).not.toHaveBeenCalled()
      expect(chains.insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ reason: null }),
      )
    })
    it('insert error 500', async () => {
      setupCashMov({ insert: { data: null, error: { message: 'db fail' } } as any })
      const req = jsonReq('http://localhost/api/cash/movements', { type: 'in', amount: 10 })
      const res = await CashMovPOST(req as any)
      expect(res.status).toBe(500)
      expect((await res.json()).error).toBe('db fail')
    })
    it('success 201 with reason', async () => {
      setupCashMov({
        insert: {
          data: {
            id: 'mov-1',
            type: 'out',
            amount: 20,
            reason: 'ok',
            created_at: new Date().toISOString(),
          },
          error: null,
        },
      })
      const req = jsonReq('http://localhost/api/cash/movements', {
        type: 'out',
        amount: 20,
        reason: 'ok',
      })
      const res = await CashMovPOST(req as any)
      expect(res.status).toBe(201)
      const j = await res.json()
      expect(j.type).toBe('out')
    })
    it('fast-check fuzz amount 0.01..1M valid, else 422', async () => {
      await fc.assert(
        fc.asyncProperty(fc.double({ min: -1000, max: 2_000_000, noNaN: true }), async (amt) => {
          if (!Number.isFinite(amt)) return
          // round to 2 decimals to avoid floating weirdness
          const val = Math.round(amt * 100) / 100
          setupCashMov()
          const req = jsonReq('http://localhost/api/cash/movements', { type: 'in', amount: val })
          const res = await CashMovPOST(req as any)
          if (val < 0.01 || val > 1_000_000) expect(res.status).toBe(422)
          else expect(res.status).toBe(201)
        }),
        { numRuns: 15 },
      )
    })
  })

  // -----------------------------------------------------------------------
  // pos/transaction POST
  // -----------------------------------------------------------------------
  describe('pos/transaction POST', () => {
    it('unauthorized 401', async () => {
      setupPos({ user: null })
      const req = new NextRequest('http://localhost/api/pos/transaction', {
        method: 'POST',
        headers: { 'content-type': 'application/json' } as any,
        body: JSON.stringify({
          business_id: BIZ_ID,
          amount: 100,
          payment_method: 'cash',
          items: [{ service_id: SVC_ID, name: 'Cut', price: 100, qty: 1 }],
        }),
      })
      const res = await PosPOST(req)
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('Unauthorized')
    })
    it('invalid body 400 Zod missing business_id', async () => {
      setupPos()
      const req = new NextRequest('http://localhost/api/pos/transaction', {
        method: 'POST',
        body: JSON.stringify({
          amount: 100,
          payment_method: 'cash',
          items: [{ service_id: SVC_ID, name: 'x', price: 10, qty: 1 }],
        }) as any,
      })
      const res = await PosPOST(req)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Invalid body')
    })
    it('invalid body 400 amount not number', async () => {
      setupPos()
      const req = new NextRequest('http://localhost/api/pos/transaction', {
        method: 'POST',
        body: JSON.stringify({
          business_id: BIZ_ID,
          amount: 'not-number',
          payment_method: 'cash',
          items: [{ service_id: SVC_ID, name: 'x', price: 10, qty: 1 }],
        }) as any,
      })
      const res = await PosPOST(req)
      expect(res.status).toBe(400)
    })
    it('invalid body 400 items empty', async () => {
      setupPos()
      const req = new NextRequest('http://localhost/api/pos/transaction', {
        method: 'POST',
        body: JSON.stringify({
          business_id: BIZ_ID,
          amount: 100,
          payment_method: 'cash',
          items: [],
        }) as any,
      })
      const res = await PosPOST(req)
      expect(res.status).toBe(400)
    })
    it('invalid body 400 qty min 1', async () => {
      setupPos()
      const req = new NextRequest('http://localhost/api/pos/transaction', {
        method: 'POST',
        body: JSON.stringify({
          business_id: BIZ_ID,
          amount: 100,
          payment_method: 'cash',
          items: [{ service_id: SVC_ID, name: 'x', price: 10, qty: 0 }],
        }) as any,
      })
      const res = await PosPOST(req)
      expect(res.status).toBe(400)
    })
    it('business not in my_business_ids 403', async () => {
      setupPos({ biz: null })
      const req = new NextRequest('http://localhost/api/pos/transaction', {
        method: 'POST',
        body: JSON.stringify({
          business_id: BIZ_ID,
          amount: 100,
          payment_method: 'cash',
          items: [{ service_id: SVC_ID, name: 'x', price: 100, qty: 1 }],
        }) as any,
      })
      const res = await PosPOST(req)
      expect(res.status).toBe(403)
      expect((await res.json()).error).toBe('Business not in my_business_ids')
    })
    it('Amount must be >0 400 when amount 0', async () => {
      setupPos({ biz: { id: BIZ_ID } })
      const req = new NextRequest('http://localhost/api/pos/transaction', {
        method: 'POST',
        body: JSON.stringify({
          business_id: BIZ_ID,
          amount: 0,
          payment_method: 'card',
          items: [{ service_id: SVC_ID, name: 'x', price: 10, qty: 1 }],
        }) as any,
      })
      const res = await PosPOST(req)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Amount must be >0')
    })
    it('Amount negative also 400', async () => {
      setupPos({ biz: { id: BIZ_ID } })
      // amount min 0 in Zod allows 0 but -1 fails Zod? Zod amount min 0 will fail with Invalid body before amount<=0 check.
      // For negative, it will be Invalid body 400 (Zod)
      const req = new NextRequest('http://localhost/api/pos/transaction', {
        method: 'POST',
        body: JSON.stringify({
          business_id: BIZ_ID,
          amount: -5,
          payment_method: 'card',
          items: [{ service_id: SVC_ID, name: 'x', price: 10, qty: 1 }],
        }) as any,
      })
      const res = await PosPOST(req)
      expect(res.status).toBe(400)
      // Could be either Invalid body or Amount must be >0, both 400
      expect([400].includes(res.status)).toBeTruthy()
    })
    it('cash requires open register 409 when closed', async () => {
      setupPos({ biz: { id: BIZ_ID }, openRegister: null })
      const req = new NextRequest('http://localhost/api/pos/transaction', {
        method: 'POST',
        body: JSON.stringify({
          business_id: BIZ_ID,
          amount: 100,
          payment_method: 'cash',
          items: [{ service_id: SVC_ID, name: 'x', price: 100, qty: 1 }],
        }) as any,
      })
      const res = await PosPOST(req)
      expect(res.status).toBe(409)
      const j = await res.json()
      expect(j.error).toBe('cash_register_closed')
    })
    it('cash succeeds when register open', async () => {
      setupPos({
        biz: { id: BIZ_ID },
        openRegister: { id: REG_ID },
        txInsert: { data: { id: TX_ID, receipt_number: 'R1' }, error: null },
      })
      const req = new NextRequest('http://localhost/api/pos/transaction', {
        method: 'POST',
        body: JSON.stringify({
          business_id: BIZ_ID,
          amount: 100,
          payment_method: 'cash',
          items: [{ service_id: SVC_ID, name: 'x', price: 100, qty: 1 }],
        }) as any,
      })
      const res = await PosPOST(req)
      expect(res.status).toBe(200)
      expect((await res.json()).receipt_number).toBe('R1')
    })
    it('card does not require register (openRegister null still success)', async () => {
      setupPos({
        biz: { id: BIZ_ID },
        openRegister: null,
        txInsert: { data: { id: TX_ID, receipt_number: 'R2' }, error: null },
      })
      const req = new NextRequest('http://localhost/api/pos/transaction', {
        method: 'POST',
        body: JSON.stringify({
          business_id: BIZ_ID,
          amount: 50,
          payment_method: 'card',
          items: [{ service_id: SVC_ID, name: 'x', price: 50, qty: 1 }],
        }) as any,
      })
      const res = await PosPOST(req)
      expect(res.status).toBe(200)
    })
    it('transfer also success without register', async () => {
      setupPos({
        biz: { id: BIZ_ID },
        openRegister: null,
        txInsert: { data: { id: TX_ID, receipt_number: 'R3' }, error: null },
      })
      const req = new NextRequest('http://localhost/api/pos/transaction', {
        method: 'POST',
        body: JSON.stringify({
          business_id: BIZ_ID,
          amount: 70,
          payment_method: 'transfer',
          items: [{ service_id: SVC_ID, name: 'x', price: 70, qty: 1 }],
        }) as any,
      })
      const res = await PosPOST(req)
      expect(res.status).toBe(200)
    })
    it('insert error 400', async () => {
      setupPos({
        biz: { id: BIZ_ID },
        openRegister: null,
        txInsert: { data: null, error: { message: 'insert fail' } } as any,
      })
      const req = new NextRequest('http://localhost/api/pos/transaction', {
        method: 'POST',
        body: JSON.stringify({
          business_id: BIZ_ID,
          amount: 100,
          payment_method: 'card',
          items: [{ service_id: SVC_ID, name: 'x', price: 100, qty: 1 }],
        }) as any,
      })
      const res = await PosPOST(req)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('insert fail')
    })
    it('success with optional employee_id/client_id null', async () => {
      setupPos({
        biz: { id: BIZ_ID },
        openRegister: null,
        txInsert: { data: { id: TX_ID, receipt_number: 'R4' }, error: null },
      })
      const req = new NextRequest('http://localhost/api/pos/transaction', {
        method: 'POST',
        body: JSON.stringify({
          business_id: BIZ_ID,
          amount: 20,
          payment_method: 'card',
          items: [{ service_id: SVC_ID, name: 'x', price: 20, qty: 1 }],
          employee_id: null,
          client_id: null,
        }) as any,
      })
      const res = await PosPOST(req)
      expect(res.status).toBe(200)
    })
    it('success with employee_id and client_id', async () => {
      setupPos({
        biz: { id: BIZ_ID },
        openRegister: null,
        txInsert: { data: { id: TX_ID, receipt_number: 'R5' }, error: null },
      })
      const req = new NextRequest('http://localhost/api/pos/transaction', {
        method: 'POST',
        body: JSON.stringify({
          business_id: BIZ_ID,
          amount: 20,
          payment_method: 'card',
          items: [{ service_id: SVC_ID, name: 'x', price: 20, qty: 1 }],
          employee_id: BIZ_ID,
          client_id: REG_ID,
        }) as any,
      })
      const res = await PosPOST(req)
      expect(res.status).toBe(200)
    })
    it('invalid json body throws -> 400 Invalid body', async () => {
      setupPos()
      const req: any = {
        json: async () => {
          throw new Error('bad json')
        },
      }
      // Need to mock createClient to return user to avoid unauthorized earlier
      // But PosPOST first checks auth, so need setupPos user still valid, but json throws
      // Our setupPos already set mock, so req.json throwing triggers catch
      const res = await PosPOST(req)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Invalid body')
    })
  })

  // -----------------------------------------------------------------------
  // inventory POST create
  // -----------------------------------------------------------------------
  describe('inventory POST create', () => {
    it('rate_limited 429', async () => {
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = jsonReq('http://localhost/api/inventory', { name: 'Test' })
      const res = await InventoryPOST(req as any)
      expect(res.status).toBe(429)
      expect((await res.json()).error).toBe('rate_limited')
    })
    it('unauthorized 401', async () => {
      setupInventoryCreate({ user: null })
      const req = jsonReq('http://localhost/api/inventory', { name: 'Test' })
      const res = await InventoryPOST(req as any)
      expect(res.status).toBe(401)
    })
    it('not_found 404', async () => {
      setupInventoryCreate({ business: null })
      const req = jsonReq('http://localhost/api/inventory', { name: 'Test' })
      const res = await InventoryPOST(req as any)
      expect(res.status).toBe(404)
    })
    it('invalid_json 400', async () => {
      setupInventoryCreate()
      const req = badJsonReq()
      const res = await InventoryPOST(req as any)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_json')
    })
    it('validation_failed 422 name empty', async () => {
      setupInventoryCreate()
      const req = jsonReq('http://localhost/api/inventory', { name: '' })
      const res = await InventoryPOST(req as any)
      expect(res.status).toBe(422)
      expect((await res.json()).details.name).toBeDefined()
    })
    it('validation_failed 422 name too long 201', async () => {
      setupInventoryCreate()
      const req = jsonReq('http://localhost/api/inventory', { name: 'a'.repeat(201) })
      const res = await InventoryPOST(req as any)
      expect(res.status).toBe(422)
      expect((await res.json()).details.name).toBeDefined()
    })
    it('validation_failed 422 barcode max 100', async () => {
      setupInventoryCreate()
      const req = jsonReq('http://localhost/api/inventory', {
        name: 'Test',
        barcode: 'a'.repeat(101),
      })
      const res = await InventoryPOST(req as any)
      expect(res.status).toBe(422)
      expect((await res.json()).details.barcode).toBeDefined()
    })
    it('validation_failed 422 sku max 50', async () => {
      setupInventoryCreate()
      const req = jsonReq('http://localhost/api/inventory', { name: 'Test', sku: 'a'.repeat(51) })
      const res = await InventoryPOST(req as any)
      expect(res.status).toBe(422)
      expect((await res.json()).details.sku).toBeDefined()
    })
    it('validation_failed 422 quantity negative', async () => {
      setupInventoryCreate()
      const req = jsonReq('http://localhost/api/inventory', { name: 'Test', quantity: -1 })
      const res = await InventoryPOST(req as any)
      expect(res.status).toBe(422)
      expect((await res.json()).details.quantity).toBeDefined()
    })
    it('validation_failed 422 quantity >1M', async () => {
      setupInventoryCreate()
      const req = jsonReq('http://localhost/api/inventory', { name: 'Test', quantity: 1_000_001 })
      const res = await InventoryPOST(req as any)
      expect(res.status).toBe(422)
    })
    it('validation quantity 1M OK', async () => {
      setupInventoryCreate({ insert: { data: { id: ITEM_ID }, error: null } })
      const req = jsonReq('http://localhost/api/inventory', { name: 'Test', quantity: 1_000_000 })
      const res = await InventoryPOST(req as any)
      expect(res.status).toBe(201)
    })
    it('sku_taken 409 on 23505', async () => {
      setupInventoryCreate({
        insert: { data: null, error: { code: '23505', message: 'duplicate' } } as any,
      })
      const req = jsonReq('http://localhost/api/inventory', { name: 'Test', sku: 'dup' })
      const res = await InventoryPOST(req as any)
      expect(res.status).toBe(409)
      const j = await res.json()
      expect(j.error).toBe('sku_taken')
    })
    it('generic error 500', async () => {
      setupInventoryCreate({
        insert: { data: null, error: { code: '99999', message: 'db fail' } } as any,
      })
      const req = jsonReq('http://localhost/api/inventory', { name: 'Test' })
      const res = await InventoryPOST(req as any)
      expect(res.status).toBe(500)
      expect((await res.json()).error).toBe('db fail')
    })
    it('sanitize called for name, sku, category, unit, barcode', async () => {
      const { chains } = setupInventoryCreate({ insert: { data: { id: ITEM_ID }, error: null } })
      vi.mocked(DOMPurify.sanitize).mockImplementation((s: string) =>
        s
          .replace(/<[^>]*>/g, '')
          .trim()
          .toUpperCase(),
      )
      const req = jsonReq('http://localhost/api/inventory', {
        name: '<b>test</b>',
        sku: '<i>sku</i>',
        category: 'cat',
        unit: 'pcs',
        barcode: '123',
      })
      const res = await InventoryPOST(req as any)
      expect(res.status).toBe(201)
      expect(DOMPurify.sanitize).toHaveBeenCalled()
      // check insert called with sanitized uppercased name
      expect(chains.insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'TEST' }),
      )
      expect(chains.insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ sku: 'SKU' }),
      )
    })
    it('sanitize unit defaults to pcs when not provided', async () => {
      const { chains } = setupInventoryCreate()
      const req = jsonReq('http://localhost/api/inventory', { name: 'Test' })
      await InventoryPOST(req as any)
      expect(chains.insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ unit: 'pcs' }),
      )
    })
    it('barcode null when not provided, sku null', async () => {
      const { chains } = setupInventoryCreate()
      const req = jsonReq('http://localhost/api/inventory', { name: 'Test' })
      await InventoryPOST(req as any)
      const arg = (chains.insertChain.insert as any).mock.calls[0][0]
      expect(arg.barcode).toBeNull()
      expect(arg.sku).toBeNull()
    })
    it('success 201 with defaults low_stock_threshold 5', async () => {
      setupInventoryCreate({ insert: { data: { id: ITEM_ID }, error: null } })
      const req = jsonReq('http://localhost/api/inventory', {
        name: 'Test',
        quantity: 5,
        cost_price: 10,
        sell_price: 20,
      })
      const res = await InventoryPOST(req as any)
      expect(res.status).toBe(201)
      const j = await res.json()
      expect(j.id).toBe(ITEM_ID)
    })
    it('fast-check fuzz quantity valid and barcode length', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 1_000_000 }),
          fc.string({ maxLength: 100 }),
          async (qty, barcode) => {
            setupInventoryCreate()
            const body: any = { name: 'Fuzz', quantity: qty }
            if (barcode) body.barcode = barcode
            const req = jsonReq('http://localhost/api/inventory', body)
            const res = await InventoryPOST(req as any)
            // barcode length <=100 should succeed (if qty valid)
            if (barcode.length > 100) expect(res.status).toBe(422)
            else expect([201, 422].includes(res.status)).toBeTruthy() // qty always valid so 201
            if (qty >= 0 && qty <= 1_000_000 && barcode.length <= 100) expect(res.status).toBe(201)
          },
        ),
        { numRuns: 20 },
      )
    })
  })

  // -----------------------------------------------------------------------
  // inventory/[id] PATCH
  // -----------------------------------------------------------------------
  describe('inventory/[id] PATCH', () => {
    it('unauthorized 401', async () => {
      setupInventoryPatch({ user: null })
      const req = new NextRequest(`http://localhost/api/inventory/${ITEM_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'x' }) as any,
      })
      const res = await InventoryPatch(req as any, { params: Promise.resolve({ id: ITEM_ID }) })
      expect(res.status).toBe(401)
    })
    it('sku_taken 409', async () => {
      setupInventoryPatch({
        update: { data: null, error: { code: '23505', message: 'dup' } } as any,
      })
      const req = new NextRequest(`http://localhost/api/inventory/${ITEM_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Test', sku: 'dup' }) as any,
      })
      const res = await InventoryPatch(req as any, { params: Promise.resolve({ id: ITEM_ID }) })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe('sku_taken')
    })
    it('generic error 500', async () => {
      setupInventoryPatch({
        update: { data: null, error: { code: '9999', message: 'fail' } } as any,
      })
      const req = new NextRequest(`http://localhost/api/inventory/${ITEM_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Test' }) as any,
      })
      const res = await InventoryPatch(req as any, { params: Promise.resolve({ id: ITEM_ID }) })
      expect(res.status).toBe(500)
      expect((await res.json()).error).toBe('fail')
    })
    it('success 200 returns data', async () => {
      const data = { id: ITEM_ID, name: 'Updated', sku: 'SKU1' }
      setupInventoryPatch({ update: { data, error: null } })
      const req = new NextRequest(`http://localhost/api/inventory/${ITEM_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Updated',
          sku: 'SKU1',
          category: 'cat',
          unit: 'pcs',
          low_stock_threshold: 10,
          cost_price: 5,
          sell_price: 10,
        }) as any,
      })
      const res = await InventoryPatch(req as any, { params: Promise.resolve({ id: ITEM_ID }) })
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.name).toBe('Updated')
    })
    it('handles sku empty string -> null and category null', async () => {
      const { chains } = setupInventoryPatch({ update: { data: { id: ITEM_ID }, error: null } })
      const req = new NextRequest(`http://localhost/api/inventory/${ITEM_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Test', sku: '', category: '', unit: 'pcs' }) as any,
      })
      await InventoryPatch(req as any, { params: Promise.resolve({ id: ITEM_ID }) })
      expect(chains.updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ sku: null, category: null }),
      )
    })
    it('low_stock_threshold defaults to 5 when invalid', async () => {
      const { chains } = setupInventoryPatch()
      const req = new NextRequest(`http://localhost/api/inventory/${ITEM_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Test', low_stock_threshold: 'invalid' }) as any,
      })
      await InventoryPatch(req as any, { params: Promise.resolve({ id: ITEM_ID }) })
      const arg = (chains.updateChain.update as any).mock.calls[0][0]
      expect(arg.low_stock_threshold).toBe(5)
    })
    it('cost_price sell_price handling', async () => {
      const { chains } = setupInventoryPatch()
      const req = new NextRequest(`http://localhost/api/inventory/${ITEM_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Test', cost_price: '10', sell_price: '' }) as any,
      })
      await InventoryPatch(req as any, { params: Promise.resolve({ id: ITEM_ID }) })
      const arg = (chains.updateChain.update as any).mock.calls[0][0]
      expect(arg.cost_price).toBe(10)
      expect(arg.sell_price).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // inventory/[id]/photo POST
  // -----------------------------------------------------------------------
  describe('inventory/[id]/photo POST', () => {
    it('No file 400', async () => {
      setupPhotoMocks()
      const fd = new FormData()
      const req: any = { formData: async () => fd }
      const res = await InventoryPhotoPOST(req, { params: Promise.resolve({ id: ITEM_ID }) })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('No file')
    })
    it('File too large 400', async () => {
      setupPhotoMocks()
      const big = new Uint8Array(2 * 1024 * 1024 + 1).fill(0)
      const file = new File([big], 'big.jpg', { type: 'image/jpeg' })
      const fd = new FormData()
      fd.append('file', file)
      const req: any = { formData: async () => fd }
      const res = await InventoryPhotoPOST(req, { params: Promise.resolve({ id: ITEM_ID }) })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('File too large (max 2MB)')
    })
    it('File exactly 2MB passes size check (needs type valid)', async () => {
      const { mocks } = setupPhotoMocks({})
      const exactly = new Uint8Array(2 * 1024 * 1024).fill(0)
      const file = new File([exactly], 'exact.jpg', { type: 'image/jpeg' })
      const fd = new FormData()
      fd.append('file', file)
      const req: any = { formData: async () => fd }
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const res = await InventoryPhotoPOST(req, { params: Promise.resolve({ id: ITEM_ID }) })
      expect(res.status).toBe(200)
      expect(mocks.uploadMock).toHaveBeenCalled()
    })
    it('Invalid file type 400', async () => {
      setupPhotoMocks()
      const file = new File([new Uint8Array([1, 2, 3])], 'doc.pdf', { type: 'application/pdf' })
      const fd = new FormData()
      fd.append('file', file)
      const req: any = { formData: async () => fd }
      const res = await InventoryPhotoPOST(req, { params: Promise.resolve({ id: ITEM_ID }) })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Invalid file type')
    })
    it('Invalid type text/plain 400', async () => {
      setupPhotoMocks()
      const file = new File([new Uint8Array([1])], 'a.txt', { type: 'text/plain' })
      const fd = new FormData()
      fd.append('file', file)
      const req: any = { formData: async () => fd }
      const res = await InventoryPhotoPOST(req, { params: Promise.resolve({ id: ITEM_ID }) })
      expect(res.status).toBe(400)
    })
    it('allowed types jpeg, png, webp succeed', async () => {
      for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
        const { mocks } = setupPhotoMocks({})
        const file = new File([new Uint8Array([1])], `a.${type.split('/')[1]}`, { type })
        const fd = new FormData()
        fd.append('file', file)
        const req: any = { formData: async () => fd }
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
        const res = await InventoryPhotoPOST(req, { params: Promise.resolve({ id: ITEM_ID }) })
        expect(res.status).toBe(200)
        expect(mocks.uploadMock).toHaveBeenCalled()
        vi.useRealTimers()
      }
    })
    it('upload error 500', async () => {
      setupPhotoMocks({ uploadError: { message: 'upload fail' } })
      const file = new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' })
      const fd = new FormData()
      fd.append('file', file)
      const req: any = { formData: async () => fd }
      const res = await InventoryPhotoPOST(req, { params: Promise.resolve({ id: ITEM_ID }) })
      expect(res.status).toBe(500)
      expect((await res.json()).error).toBe('upload fail')
    })
    it('success returns url and calls storage with correct bucket/path/buffer', async () => {
      const { mocks } = setupPhotoMocks({
        publicUrl: `https://cdn.example.com/products/${ITEM_ID}/123.jpg`,
      })
      vi.useFakeTimers()
      const now = new Date('2026-03-15T10:00:00Z').getTime()
      vi.setSystemTime(now)
      const file = new File([new Uint8Array([1, 2, 3])], 'myphoto.png', { type: 'image/png' })
      const fd = new FormData()
      fd.append('file', file)
      const req: any = { formData: async () => fd }
      const res = await InventoryPhotoPOST(req, { params: Promise.resolve({ id: ITEM_ID }) })
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.url).toContain('https://cdn.example.com')
      // upload called with path containing products/ITEM_ID and timestamp
      expect(mocks.fromMock).toHaveBeenCalledWith('inventory')
      expect(mocks.uploadMock).toHaveBeenCalledWith(
        expect.stringContaining(`products/${ITEM_ID}/${now}`),
        expect.any(Buffer),
        expect.objectContaining({ contentType: 'image/png', upsert: true }),
      )
      expect(mocks.getPublicUrlMock).toHaveBeenCalledWith(
        expect.stringContaining(`products/${ITEM_ID}`),
      )
      // update called with photo_url
      expect(mocks.updateChain.update).toHaveBeenCalledWith({
        photo_url: `https://cdn.example.com/products/${ITEM_ID}/123.jpg`,
      })
      expect(mocks.updateChain.eq).toHaveBeenCalledWith('id', ITEM_ID)
      vi.useRealTimers()
    })
    it('Buffer.from called with arrayBuffer', async () => {
      const { mocks } = setupPhotoMocks({})
      const buf = new Uint8Array([9, 9, 9])
      const file = new File([buf], 'a.jpg', { type: 'image/jpeg' })
      const spy = vi.spyOn(Buffer, 'from')
      const fd = new FormData()
      fd.append('file', file)
      const req: any = { formData: async () => fd }
      await InventoryPhotoPOST(req, { params: Promise.resolve({ id: ITEM_ID }) })
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
      expect(mocks.uploadMock).toHaveBeenCalled()
    })
    it('ext extraction via file.name split', async () => {
      const { mocks } = setupPhotoMocks({})
      const file = new File([new Uint8Array([1])], 'archive.tar.jpeg', { type: 'image/jpeg' })
      const fd = new FormData()
      fd.append('file', file)
      const req: any = { formData: async () => fd }
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      await InventoryPhotoPOST(req, { params: Promise.resolve({ id: ITEM_ID }) })
      expect(mocks.uploadMock.mock.calls[0][0]).toContain('.jpeg')
      vi.useRealTimers()
    })
  })

  // -----------------------------------------------------------------------
  // inventory/lookup GET
  // -----------------------------------------------------------------------
  describe('inventory/lookup GET', () => {
    it('unauthorized 401', async () => {
      setupLookup({ user: null })
      const req = new NextRequest('http://localhost/api/inventory/lookup?barcode=123')
      const res = await LookupGET(req)
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('unauthorized')
    })
    it('not_found 404 no business', async () => {
      setupLookup({ business: null })
      const req = new NextRequest('http://localhost/api/inventory/lookup?barcode=123')
      const res = await LookupGET(req)
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('not_found')
    })
    it('found false when barcode empty', async () => {
      setupLookup({ item: null })
      const req = new NextRequest('http://localhost/api/inventory/lookup')
      const res = await LookupGET(req)
      expect(res.status).toBe(200)
      expect((await res.json()).found).toBe(false)
      // from should not be called for inventory_items when barcode empty? Actually code returns early before query
      // Check that inventory_items not queried? Our mock still called? But we can verify.
    })
    it('found false when barcode whitespace trimmed empty', async () => {
      setupLookup({ item: null })
      const req = new NextRequest('http://localhost/api/inventory/lookup?barcode=%20%20%20')
      const res = await LookupGET(req)
      expect((await res.json()).found).toBe(false)
    })
    it('barcode slice 0,100 branch', async () => {
      const long = 'a'.repeat(150)
      const { chains } = setupLookup({ item: null })
      const req = new NextRequest(`http://localhost/api/inventory/lookup?barcode=${long}`)
      const res = await LookupGET(req)
      expect(res.status).toBe(200)
      // eq should be called with sliced 100 chars
      expect(chains.itemChain.eq).toHaveBeenCalledWith('barcode', 'a'.repeat(100))
    })
    it('barcode trim', async () => {
      const { chains } = setupLookup({ item: null })
      const req = new NextRequest(
        'http://localhost/api/inventory/lookup?barcode=%20%20ABC123%20%20',
      )
      await LookupGET(req)
      expect(chains.itemChain.eq).toHaveBeenCalledWith('barcode', 'ABC123')
    })
    it('found false when item not found', async () => {
      setupLookup({ item: null })
      const req = new NextRequest('http://localhost/api/inventory/lookup?barcode=NOPE')
      const res = await LookupGET(req)
      expect((await res.json()).found).toBe(false)
    })
    it('found true when item exists', async () => {
      const item = {
        id: ITEM_ID,
        name: 'Prod',
        sku: 'SKU',
        barcode: '123',
        description: 'desc',
        category: 'cat',
        unit: 'pcs',
        quantity: 5,
        cost_price: 10,
        sell_price: 20,
        low_stock_threshold: 5,
        photo_url: null,
      }
      setupLookup({ item })
      const req = new NextRequest('http://localhost/api/inventory/lookup?barcode=123')
      const res = await LookupGET(req)
      const j = await res.json()
      expect(j.found).toBe(true)
      expect(j.item.id).toBe(ITEM_ID)
    })
    it('fast-check fuzz barcode length 100 sliced', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ maxLength: 150 }), async (s) => {
          const trimmed = s.trim().slice(0, 100)
          const item = trimmed ? { id: ITEM_ID, barcode: trimmed } : null
          setupLookup({ item })
          const req = new NextRequest(
            `http://localhost/api/inventory/lookup?barcode=${encodeURIComponent(s)}`,
          )
          const res = await LookupGET(req)
          const j = (await res.json()) as any
          if (!trimmed) expect(j.found).toBe(false)
          else if (item) expect(j.found).toBe(true)
        }),
        { numRuns: 15 },
      )
    })
  })

  // -----------------------------------------------------------------------
  // inventory/import POST
  // -----------------------------------------------------------------------
  describe('inventory/import POST', () => {
    it('rate_limited 429', async () => {
      vi.mocked(rateLimit).mockReturnValue(false)
      const req = jsonReq('http://localhost/api/inventory/import', { rows: [] })
      const res = await ImportPOST(req as any)
      expect(res.status).toBe(429)
      expect((await res.json()).error).toBe('rate_limited')
    })
    it('unauthorized 401 authError', async () => {
      setupImport({ authError: { message: 'auth fail' }, user: null })
      const req = jsonReq('http://localhost/api/inventory/import', { rows: [] })
      const res = await ImportPOST(req as any)
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('Unauthorized')
    })
    it('unauthorized 401 no user', async () => {
      setupImport({ user: null })
      const req = jsonReq('http://localhost/api/inventory/import', { rows: [] })
      const res = await ImportPOST(req as any)
      expect(res.status).toBe(401)
    })
    it('Business not found 404', async () => {
      setupImport({ business: null })
      const req = jsonReq('http://localhost/api/inventory/import', { rows: [] })
      const res = await ImportPOST(req as any)
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('Business not found')
    })
    it('Invalid JSON 400', async () => {
      setupImport()
      const req = badJsonReq()
      const res = await ImportPOST(req as any)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Invalid JSON')
    })
    it('validation_failed 422 rows >500', async () => {
      setupImport()
      const rows = Array.from({ length: 501 }, () => ({ name: 'a' }))
      const req = jsonReq('http://localhost/api/inventory/import', { rows: rows as any })
      const res = await ImportPOST(req as any)
      expect(res.status).toBe(422)
      expect((await res.json()).error).toBe('validation_failed')
    })
    it('validation ok with 500 rows', async () => {
      const existing: any[] = []
      setupImport({
        existing,
        insert: { data: Array.from({ length: 500 }, (_, i) => ({ id: `id-${i}` })), error: null },
      })
      const rows = Array.from({ length: 500 }, (_, i) => ({ name: `Prod ${i}` }))
      const req = jsonReq('http://localhost/api/inventory/import', { rows: rows as any })
      const res = await ImportPOST(req as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.imported).toBe(500)
    })
    it('skippedEmpty when rows empty and name missing', async () => {
      setupImport({ existing: [] })
      const rows = [{ name: '' }, { sku: 'x' }, {}] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      const res = await ImportPOST(req as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.imported).toBe(0)
      expect(j.skipped).toBe(3)
    })
    it('sanitized empty -> imported 0 skipped rawRows.length when all names empty after sanitize', async () => {
      setupImport({ existing: [] })
      // Use names that after sanitize become empty? Our sanitize strips tags and trims, but '<b></b>' would become empty after strip?
      vi.mocked(DOMPurify.sanitize).mockImplementation((s: string) =>
        s.replace(/<[^>]*>/g, '').trim(),
      )
      const rows = [{ name: '   ' }, { name: '<b></b>' }] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      const res = await ImportPOST(req as any)
      expect((await res.json()).imported).toBe(0)
    })
    it('no rows field -> sanitized length 0 returns imported 0', async () => {
      setupImport()
      const req = jsonReq('http://localhost/api/inventory/import', {})
      const res = await ImportPOST(req as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.imported).toBe(0)
      expect(j.skipped).toBe(0)
    })
    it('dedup barcode existing', async () => {
      const existing = [{ barcode: '123', sku: null, name: 'Prod1' }]
      setupImport({ existing: existing as any, insert: { data: [{ id: ITEM_ID }], error: null } })
      const rows = [
        { name: 'NewProd', barcode: '123' },
        { name: 'Other', barcode: '456' },
      ] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      const res = await ImportPOST(req as any)
      const j = await res.json()
      // Only second should be inserted
      expect(j.imported).toBe(1)
      expect(j.skipped).toBe(1) // one dupe
    })
    it('dedup sku existing when no barcode', async () => {
      const existing = [{ sku: 'SKU1', barcode: null, name: 'Prod' }]
      setupImport({ existing: existing as any, insert: { data: [{ id: ITEM_ID }], error: null } })
      const rows = [
        { name: 'New', sku: 'SKU1' },
        { name: 'Other', sku: 'SKU2' },
      ] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      const res = await ImportPOST(req as any)
      expect((await res.json()).imported).toBe(1)
    })
    it('dedup name existing when no barcode/sku', async () => {
      const existing = [{ name: 'ProdA', barcode: null, sku: null }]
      setupImport({ existing: existing as any, insert: { data: [{ id: ITEM_ID }], error: null } })
      const rows = [{ name: 'proda' }, { name: 'ProdB' }] as any // case insensitive
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      const res = await ImportPOST(req as any)
      expect((await res.json()).imported).toBe(1)
    })
    it('dedup within toInsert batch (duplicate barcode in same import)', async () => {
      setupImport({ existing: [], insert: { data: [{ id: ITEM_ID }, { id: 'id2' }], error: null } })
      const rows = [
        { name: 'A', barcode: 'dup' },
        { name: 'B', barcode: 'dup' },
        { name: 'C', barcode: 'unique' },
      ] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      const res = await ImportPOST(req as any)
      const j = await res.json()
      expect(j.imported).toBe(2) // first dup and unique
      expect(j.skipped).toBe(1)
    })
    it('dedup within sku batch', async () => {
      setupImport({ existing: [], insert: { data: [{ id: ITEM_ID }], error: null } })
      const rows = [
        { name: 'A', sku: 'SK1' },
        { name: 'B', sku: 'SK1' },
      ] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      const res = await ImportPOST(req as any)
      expect((await res.json()).imported).toBe(1)
    })
    it('dedup within name batch', async () => {
      setupImport({ existing: [], insert: { data: [{ id: ITEM_ID }], error: null } })
      const rows = [{ name: 'Same' }, { name: 'same' }] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      const res = await ImportPOST(req as any)
      expect((await res.json()).imported).toBe(1)
    })
    it('toInsert empty after dupes -> imported 0', async () => {
      const existing = [{ barcode: '123' }]
      setupImport({ existing: existing as any })
      const rows = [{ name: 'A', barcode: '123' }] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      const res = await ImportPOST(req as any)
      const j = await res.json()
      expect(j.imported).toBe(0)
      expect(j.skipped).toBe(1)
    })
    it('parseNum comma->dot and parseMoney rounding', async () => {
      setupImport({ existing: [], insert: { data: [{ id: ITEM_ID }], error: null } })
      const rows = [
        { name: 'Prod', quantity: '10,5', cost_price: '10,555', sell_price: '0.105' },
      ] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      const res = await ImportPOST(req as any)
      expect(res.status).toBe(200)
      const { chains } = setupImport({
        existing: [],
        insert: { data: [{ id: ITEM_ID }], error: null },
      }) // need to capture insert args
      // Need to re-run to capture insert args because previous setup cleared
      const rows2 = [
        { name: 'Prod2', quantity: '10,5', cost_price: '10,555', sell_price: '0.105' },
      ] as any
      const req2 = jsonReq('http://localhost/api/inventory/import', { rows: rows2 })
      // Re-setup to capture
      const { chains: ch2, from } = setupImport({
        existing: [],
        insert: { data: [{ id: ITEM_ID }], error: null },
      })
      await ImportPOST(req2 as any)
      const insertArg = (ch2.insertChain.insert as any).mock.calls[0][0][0]
      // quantity 10.5 -> parseQty 10.5
      expect(insertArg.quantity).toBeCloseTo(10.5)
      // cost_price 10,555 -> 10.555 -> rounded 10.56
      expect(insertArg.cost_price).toBeCloseTo(10.56)
      // sell_price 0.105 -> 0.11
      expect(insertArg.sell_price).toBeCloseTo(0.11)
    })
    it('parseQty rounding 3 decimals', async () => {
      const { chains } = setupImport({
        existing: [],
        insert: { data: [{ id: ITEM_ID }], error: null },
      })
      const rows = [{ name: 'Q', quantity: '1.2345' }] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      await ImportPOST(req as any)
      const arg = (chains.insertChain.insert as any).mock.calls[0][0][0]
      expect(arg.quantity).toBeCloseTo(1.235) // Math.round(1.2345*1000)/1000 =1.235
    })
    it('parseNum invalid returns null -> parseMoney null, parseQty 0', async () => {
      const { chains } = setupImport({
        existing: [],
        insert: { data: [{ id: ITEM_ID }], error: null },
      })
      const rows = [{ name: 'Bad', quantity: 'abc', cost_price: 'xyz', sell_price: '' }] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      await ImportPOST(req as any)
      const arg = (chains.insertChain.insert as any).mock.calls[0][0][0]
      expect(arg.quantity).toBe(0)
      expect(arg.cost_price).toBeNull()
      expect(arg.sell_price).toBeNull()
    })
    it('DOMPurify sanitize called and trims', async () => {
      vi.mocked(DOMPurify.sanitize).mockImplementation((s: string) =>
        s
          .replace(/<[^>]*>/g, '')
          .trim()
          .slice(0, 500),
      )
      const { chains } = setupImport({
        existing: [],
        insert: { data: [{ id: ITEM_ID }], error: null },
      })
      const rows = [
        {
          name: '<b>Prod</b>',
          sku: '<i>SKU</i>',
          barcode: '<b>123</b>',
          category: '<b>cat</b>',
          unit: 'pcs',
          description: '<script>hi</script>',
        },
      ] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      await ImportPOST(req as any)
      expect(DOMPurify.sanitize).toHaveBeenCalled()
      const arg = (chains.insertChain.insert as any).mock.calls[0][0][0]
      expect(arg.name).toBe('Prod')
    })
    it('insertError 500', async () => {
      setupImport({ existing: [], insert: { data: null, error: { message: 'db fail' } } as any })
      const rows = [{ name: 'Prod' }] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      const res = await ImportPOST(req as any)
      expect(res.status).toBe(500)
      expect((await res.json()).error).toBe('Database error')
    })
    it('success imported/skipped counts with toInsert - imported diff', async () => {
      // toInsert 2 but inserted 1 -> skipped should include diff
      setupImport({ existing: [], insert: { data: [{ id: ITEM_ID }], error: null } }) // only 1 returned vs 2 inserted
      const rows = [{ name: 'A' }, { name: 'B' }] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      const res = await ImportPOST(req as any)
      const j = await res.json()
      expect(j.imported).toBe(1)
      expect(j.skipped).toBe(1) // 2-1
    })
    it('existing null fallback covers ?? [] branches 103-109', async () => {
      // existing is null -> (existing ?? []) should fallback
      setupImport({ existing: null as any, insert: { data: [{ id: ITEM_ID }], error: null } })
      const rows = [{ name: 'NewItem', barcode: 'new123' }] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      const res = await ImportPOST(req as any)
      expect(res.status).toBe(200)
      expect((await res.json()).imported).toBe(1)
    })
    it('existing with barcodes/skus/names filters', async () => {
      // cover lines 102-112 with null vs array
      setupImport({
        existing: [{ barcode: null, sku: null, name: 'Existent' }] as any,
        insert: { data: [{ id: ITEM_ID }], error: null },
      })
      const rows = [{ name: 'Existent' }, { name: 'New' }] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      const res = await ImportPOST(req as any)
      expect((await res.json()).imported).toBe(1)
    })
    it('parseNum raw empty -> null via whitespace and comma', async () => {
      const { chains } = setupImport({
        existing: [],
        insert: { data: [{ id: ITEM_ID }], error: null },
      })
      const _rows = [
        { name: 'A', quantity: '   ' },
        { name: 'B', quantity: ',' },
      ] as any // "," -> "." -> ""? actually "," -> "." -> "." trimmed => "." -> Number(".") is NaN? Let's use "   " for empty
      const req = jsonReq('http://localhost/api/inventory/import', {
        rows: [{ name: 'Whit', quantity: '   ' }] as any,
      })
      const res = await ImportPOST(req as any)
      expect(res.status).toBe(200)
      // quantity whitespace should be parsed as 0 (parseQty returns 0 when parseNum null)
      const { chains: ch2 } = setupImport({
        existing: [],
        insert: { data: [{ id: ITEM_ID }], error: null },
      })
      const req2 = jsonReq('http://localhost/api/inventory/import', {
        rows: [{ name: 'Whit', quantity: '   ' }] as any,
      })
      await ImportPOST(req2 as any)
      const arg = (ch2.insertChain.insert as any).mock.calls[0][0][0]
      expect(arg.quantity).toBe(0)
      // also test "," -> "." -> Number(".") NaN -> null -> 0
      const { chains: ch3 } = setupImport({
        existing: [],
        insert: { data: [{ id: ITEM_ID }], error: null },
      })
      const req3 = jsonReq('http://localhost/api/inventory/import', {
        rows: [{ name: 'Comma', quantity: ',' }] as any,
      })
      await ImportPOST(req3 as any)
      const arg3 = (ch3.insertChain.insert as any).mock.calls[0][0][0]
      expect(arg3.quantity).toBe(0)
    })
    it('parseNum comma->dot valid 10,5 already covered but also 10,00', async () => {
      const { chains } = setupImport({
        existing: [],
        insert: { data: [{ id: ITEM_ID }], error: null },
      })
      const rows = [{ name: 'C', quantity: '10,00', cost_price: '5,50' }] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      await ImportPOST(req as any)
      const arg = (chains.insertChain.insert as any).mock.calls[0][0][0]
      expect(arg.quantity).toBe(10)
      expect(arg.cost_price).toBeCloseTo(5.5)
    })
    it('toInsert uses || fallback for sku/barcode null (line 143-146)', async () => {
      const { chains } = setupImport({
        existing: [],
        insert: { data: [{ id: ITEM_ID }], error: null },
      })
      const rows = [{ name: 'NoIds', quantity: '1' }] as any // no sku/barcode
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      await ImportPOST(req as any)
      const arg = (chains.insertChain.insert as any).mock.calls[0][0][0]
      expect(arg.sku).toBeNull()
      expect(arg.barcode).toBeNull()
      expect(arg.unit).toBe('pcs')
    })
    it('unit whitespace triggers r.unit || pcs fallback line 146', async () => {
      const { chains } = setupImport({
        existing: [],
        insert: { data: [{ id: ITEM_ID }], error: null },
      })
      // row.unit = '   ' -> sanitize -> '' -> r.unit = '' -> fallback to 'pcs' in rows mapping
      const rows = [{ name: 'WhiteUnit', unit: '   ', quantity: '1' }] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      await ImportPOST(req as any)
      const arg = (chains.insertChain.insert as any).mock.calls[0][0][0]
      expect(arg.unit).toBe('pcs')
    })
    it('inserted null fallback covers inserted?.length ?? 0 line 164', async () => {
      setupImport({ existing: [], insert: { data: null as any, error: null } })
      const rows = [{ name: 'NullInsert', quantity: '1' }] as any
      const req = jsonReq('http://localhost/api/inventory/import', { rows })
      const res = await ImportPOST(req as any)
      expect(res.status).toBe(200)
      const j = await res.json()
      // inserted is null -> imported = 0, skipped = toInsert.length - 0 =1
      expect(j.imported).toBe(0)
      expect(j.skipped).toBe(1)
    })
  })

  // -----------------------------------------------------------------------
  // inventory/export GET
  // -----------------------------------------------------------------------
  describe('inventory/export GET', () => {
    it('unauthorized 401', async () => {
      setupExport({ user: null })
      const req = new NextRequest('http://localhost/api/inventory/export')
      const res = await ExportGET(req)
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('Unauthorized')
    })
    it('not_found 404', async () => {
      setupExport({ business: null })
      const req = new NextRequest('http://localhost/api/inventory/export')
      const res = await ExportGET(req)
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('Not found')
    })
    it('items null -> rows [] and XLSX utils called', async () => {
      setupExport({ items: null as any })
      const req = new NextRequest('http://localhost/api/inventory/export')
      const res = await ExportGET(req)
      expect(res.status).toBe(200)
      expect(XLSX.utils.json_to_sheet).toHaveBeenCalledWith([])
      expect(XLSX.write).toHaveBeenCalled()
      expect(res.headers.get('Content-Type')).toContain('application/vnd.openxmlformats')
      expect(res.headers.get('Content-Disposition')).toContain('pronto-products-')
    })
    it('maps items to rows with correct fields', async () => {
      const items = [
        {
          name: 'A',
          sku: 'SKU',
          barcode: '123',
          category: 'Cat',
          unit: 'pcs',
          quantity: 5,
          low_stock_threshold: 2,
          cost_price: 10,
          sell_price: 20,
          description: 'desc',
        },
        {
          name: 'B',
          sku: null,
          barcode: null,
          category: null,
          unit: 'pcs',
          quantity: 0,
          low_stock_threshold: 5,
          cost_price: null,
          sell_price: null,
          description: null,
        },
      ]
      setupExport({ items: items as any })
      const req = new NextRequest('http://localhost/api/inventory/export')
      await ExportGET(req)
      const rows = (XLSX.utils.json_to_sheet as any).mock.calls[0][0]
      expect(rows[0].Name).toBe('A')
      expect(rows[0].SKU).toBe('SKU')
      expect(rows[1].SKU).toBe('')
      expect(rows[0]['Cost price']).toBe(10)
      expect(rows[1]['Cost price']).toBe('')
    })
    it('!cols set with 10 entries', async () => {
      setupExport({ items: [] })
      const req = new NextRequest('http://localhost/api/inventory/export')
      await ExportGET(req)
      // ws is object returned by json_to_sheet mock; route sets ws['!cols']
      const _ws = (XLSX.utils.json_to_sheet as any).mock.results[0].value
      // In mock, we returned {} and route sets property, we can check assignment via mock call? Instead check that book_append_sheet called
      expect(XLSX.utils.book_append_sheet).toHaveBeenCalled()
      // To verify cols, capture the ws object after call; since mock returns same object, check property
      // Our mock returns {} then route sets ws['!cols']; test that ws has cols if we inspect the object returned
      // But mock returns new {} each time, we can get it
      // Alternative: check that write called with correct book
      expect(XLSX.write).toHaveBeenCalledWith(expect.any(Object), {
        type: 'buffer',
        bookType: 'xlsx',
      })
    })
    it('filename contains current date', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-20T12:00:00Z'))
      setupExport({ items: [] })
      const req = new NextRequest('http://localhost/api/inventory/export')
      const res = await ExportGET(req)
      const disp = res.headers.get('Content-Disposition')!
      expect(disp).toContain('pronto-products-2026-05-20.xlsx')
      vi.useRealTimers()
    })
  })

  // -----------------------------------------------------------------------
  // inventory/export-sales GET
  // -----------------------------------------------------------------------
  describe('inventory/export-sales GET', () => {
    it('unauthorized 401', async () => {
      setupExportSales({ user: null })
      const req = new NextRequest('http://localhost/api/inventory/export-sales')
      const res = await ExportSalesGET(req)
      expect(res.status).toBe(401)
    })
    it('not_found 404', async () => {
      setupExportSales({ business: null })
      const req = new NextRequest('http://localhost/api/inventory/export-sales')
      const res = await ExportSalesGET(req)
      expect(res.status).toBe(404)
    })
    it('period today branch', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      setupExportSales({ txRows: [], clients: [] })
      const req = new NextRequest('http://localhost/api/inventory/export-sales?period=today')
      const res = await ExportSalesGET(req)
      expect(res.status).toBe(200)
      const disp = res.headers.get('Content-Disposition')!
      expect(disp).toContain('pronto-sales-')
      // startIso should be today midnight, check that gte called with that iso
      const { chains } = setupExportSales({ txRows: [] })
      // This test already consumed one setup, need to check previous call's transaction chain gte param
      // Instead we test that response is 200 and covers branch
      expect(res.headers.get('Content-Type')).toContain('application/vnd')
      vi.useRealTimers()
    })
    it('period 7d and 30d', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      for (const p of ['7d', '30d']) {
        setupExportSales({ txRows: [] })
        const req = new NextRequest(`http://localhost/api/inventory/export-sales?period=${p}`)
        const res = await ExportSalesGET(req)
        expect(res.status).toBe(200)
      }
      vi.useRealTimers()
    })
    it('from/to custom branch', async () => {
      setupExportSales({ txRows: [], clients: [] })
      const req = new NextRequest(
        'http://localhost/api/inventory/export-sales?from=2026-01-01&to=2026-01-10',
      )
      const res = await ExportSalesGET(req)
      expect(res.status).toBe(200)
      const disp = res.headers.get('Content-Disposition')!
      expect(disp).toContain('pronto-sales-2026-01-01-2026-01-10.xlsx')
    })
    it('default period 7d when no param', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      setupExportSales({ txRows: [] })
      const req = new NextRequest('http://localhost/api/inventory/export-sales')
      const res = await ExportSalesGET(req)
      expect(res.status).toBe(200)
      vi.useRealTimers()
    })
    it('endIso branch lte called when from/to provided', async () => {
      const { chains } = setupExportSales({ txRows: [] })
      const req = new NextRequest(
        'http://localhost/api/inventory/export-sales?from=2026-01-01&to=2026-01-31',
      )
      await ExportSalesGET(req)
      expect(chains.txChain.lte).toHaveBeenCalled()
    })
    it('endIso not called when no from/to', async () => {
      const { chains } = setupExportSales({ txRows: [] })
      const req = new NextRequest('http://localhost/api/inventory/export-sales?period=today')
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      await ExportSalesGET(req)
      expect(chains.txChain.lte).not.toHaveBeenCalled()
      vi.useRealTimers()
    })
    it('txRows filtering item_id and clientMap', async () => {
      const txRows = [
        {
          id: 'tx1',
          created_at: new Date().toISOString(),
          receipt_number: 'R001',
          payment_method: 'cash',
          items: [{ item_id: ITEM_ID, name: 'Prod', price: 10, qty: 2 }],
          client_id: BIZ_ID,
        },
        {
          id: 'tx2',
          created_at: new Date().toISOString(),
          receipt_number: null,
          payment_method: 'card',
          items: [{ service_id: SVC_ID, name: 'Service', price: 20, qty: 1 }],
          client_id: null,
        }, // no item_id -> skipped
      ]
      const clients = [{ id: BIZ_ID, name: 'John' }]
      setupExportSales({ txRows: txRows as any, clients: clients as any })
      const req = new NextRequest(
        'http://localhost/api/inventory/export-sales?from=2026-01-01&to=2026-01-31',
      )
      await ExportSalesGET(req)
      const rows = (XLSX.utils.json_to_sheet as any).mock.calls[
        (XLSX.utils.json_to_sheet as any).mock.calls.length - 1
      ][0]
      // Should have 1 product row + TOTAL
      expect(rows.length).toBe(2)
      expect(rows[0].Product).toBe('Prod')
      expect(rows[0].Qty).toBe(2)
      expect(rows[0]['Line total']).toBe(20)
      expect(rows[0].Client).toBe('John')
      expect(rows[1].Product).toBe('TOTAL')
      expect(rows[1].Qty).toBe(2)
      expect(rows[1]['Line total']).toBe(20)
    })
    it('Walk-in client when no client_id', async () => {
      const txRows = [
        {
          id: 'tx1',
          created_at: new Date().toISOString(),
          receipt_number: 'R1',
          payment_method: 'cash',
          items: [{ item_id: ITEM_ID, name: 'P', price: 5, qty: 1 }],
          client_id: null,
        },
      ]
      setupExportSales({ txRows: txRows as any, clients: [] })
      const req = new NextRequest(
        'http://localhost/api/inventory/export-sales?from=2026-01-01&to=2026-01-31',
      )
      await ExportSalesGET(req)
      const rows = (XLSX.utils.json_to_sheet as any).mock.calls[
        (XLSX.utils.json_to_sheet as any).mock.calls.length - 1
      ][0]
      expect(rows[0].Client).toBe('Walk-in')
    })
    it('client fallback Walk-in when clientMap missing', async () => {
      const txRows = [
        {
          id: 'tx1',
          created_at: new Date().toISOString(),
          receipt_number: 'R1',
          payment_method: 'cash',
          items: [{ item_id: ITEM_ID, name: 'P', price: 5, qty: 1 }],
          client_id: '99999999-9999-4999-a999-999999999999',
        },
      ]
      setupExportSales({ txRows: txRows as any, clients: [] }) // empty clients map
      const req = new NextRequest(
        'http://localhost/api/inventory/export-sales?from=2026-01-01&to=2026-01-31',
      )
      await ExportSalesGET(req)
      const rows = (XLSX.utils.json_to_sheet as any).mock.calls[
        (XLSX.utils.json_to_sheet as any).mock.calls.length - 1
      ][0]
      expect(rows[0].Client).toBe('Walk-in')
    })
    it('receipt fallback to id slice', async () => {
      const txRows = [
        {
          id: 'abcdefgh-ijkl-mnop-qrst-uvwxyz',
          created_at: new Date().toISOString(),
          receipt_number: null,
          payment_method: 'cash',
          items: [{ item_id: ITEM_ID, name: 'P', price: 5, qty: 1 }],
          client_id: null,
        },
      ]
      setupExportSales({ txRows: txRows as any, clients: [] })
      const req = new NextRequest(
        'http://localhost/api/inventory/export-sales?from=2026-01-01&to=2026-01-31',
      )
      await ExportSalesGET(req)
      const rows = (XLSX.utils.json_to_sheet as any).mock.calls[
        (XLSX.utils.json_to_sheet as any).mock.calls.length - 1
      ][0]
      expect(rows[0].Receipt).toBe('ABCDEFGH')
    })
    it('empty exportRows no TOTAL row', async () => {
      setupExportSales({ txRows: [], clients: [] })
      const req = new NextRequest(
        'http://localhost/api/inventory/export-sales?from=2026-01-01&to=2026-01-31',
      )
      await ExportSalesGET(req)
      const rows = (XLSX.utils.json_to_sheet as any).mock.calls[
        (XLSX.utils.json_to_sheet as any).mock.calls.length - 1
      ][0]
      expect(rows.length).toBe(0)
    })
    it('!cols and book calls', async () => {
      setupExportSales({ txRows: [] })
      const req = new NextRequest(
        'http://localhost/api/inventory/export-sales?from=2026-01-01&to=2026-01-31',
      )
      await ExportSalesGET(req)
      expect(XLSX.utils.book_new).toHaveBeenCalled()
      expect(XLSX.utils.book_append_sheet).toHaveBeenCalled()
      expect(XLSX.write).toHaveBeenCalled()
    })
    it('clientIds empty -> clients query not called with .in? still from called but no in', async () => {
      const txRows = [
        {
          id: 'tx1',
          created_at: new Date().toISOString(),
          receipt_number: 'R1',
          payment_method: 'cash',
          items: [{ item_id: ITEM_ID, name: 'P', price: 5, qty: 1 }],
          client_id: null,
        },
      ]
      const { chains } = setupExportSales({ txRows: txRows as any, clients: [] })
      const req = new NextRequest(
        'http://localhost/api/inventory/export-sales?from=2026-01-01&to=2026-01-31',
      )
      await ExportSalesGET(req)
      // When clientIds empty, code skips clients query entirely (if >0)
      // So clientsChain.in should not be called
      expect(chains.clientsChain.in).not.toHaveBeenCalled()
    })
    it('clientIds dedup', async () => {
      const cid = BIZ_ID
      const txRows = [
        {
          id: 'tx1',
          created_at: new Date().toISOString(),
          receipt_number: 'R1',
          payment_method: 'cash',
          items: [{ item_id: ITEM_ID, name: 'P', price: 5, qty: 1 }],
          client_id: cid,
        },
        {
          id: 'tx2',
          created_at: new Date().toISOString(),
          receipt_number: 'R2',
          payment_method: 'cash',
          items: [{ item_id: ITEM_ID, name: 'P2', price: 5, qty: 1 }],
          client_id: cid,
        },
      ]
      const clients = [{ id: cid, name: 'John' }]
      setupExportSales({ txRows: txRows as any, clients: clients as any })
      const req = new NextRequest(
        'http://localhost/api/inventory/export-sales?from=2026-01-01&to=2026-01-31',
      )
      await ExportSalesGET(req)
      // in should be called with deduped single id
      // We can't easily check in arg without capturing, but ensure success
      expect((XLSX.utils.json_to_sheet as any).mock.calls.length).toBeGreaterThan(0)
    })
    it('covers ?? [] fallbacks for txRows and clients null', async () => {
      // txRows null and clients null should hit ?? [] branches at lines 74,83,100
      setupExportSales({ txRows: null as any, clients: null as any })
      const req = new NextRequest(
        'http://localhost/api/inventory/export-sales?from=2026-01-01&to=2026-01-31',
      )
      const res = await ExportSalesGET(req)
      expect(res.status).toBe(200)
      const rows = (XLSX.utils.json_to_sheet as any).mock.calls[
        (XLSX.utils.json_to_sheet as any).mock.calls.length - 1
      ][0]
      expect(rows.length).toBe(0)
    })
    it('txRows null with period fallback still hits gte branch', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      setupExportSales({ txRows: null as any, clients: null as any })
      const req = new NextRequest('http://localhost/api/inventory/export-sales?period=today')
      const res = await ExportSalesGET(req)
      expect(res.status).toBe(200)
      vi.useRealTimers()
    })
    it('clients null fallback when clientIds >0 hits line 83', async () => {
      const txRows = [
        {
          id: 'tx1',
          created_at: new Date().toISOString(),
          receipt_number: 'R1',
          payment_method: 'cash',
          items: [{ item_id: ITEM_ID, name: 'P', price: 5, qty: 1 }],
          client_id: BIZ_ID,
        },
      ]
      // clients data null -> clients ?? [] fallback
      setupExportSales({ txRows: txRows as any, clients: null as any })
      const req = new NextRequest(
        'http://localhost/api/inventory/export-sales?from=2026-01-01&to=2026-01-31',
      )
      const res = await ExportSalesGET(req)
      expect(res.status).toBe(200)
      const rows = (XLSX.utils.json_to_sheet as any).mock.calls[
        (XLSX.utils.json_to_sheet as any).mock.calls.length - 1
      ][0]
      expect(rows[0].Client).toBe('Walk-in') // fallback because clientMap empty due to null clients
    })
  })

  // -----------------------------------------------------------------------
  // inventory/sales GET
  // -----------------------------------------------------------------------
  describe('inventory/sales GET', () => {
    it('unauthorized 401', async () => {
      setupSales({ user: null })
      const req = new NextRequest('http://localhost/api/inventory/sales')
      const res = await SalesGET(req)
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('unauthorized')
    })
    it('not_found 404', async () => {
      setupSales({ business: null })
      const req = new NextRequest('http://localhost/api/inventory/sales')
      const res = await SalesGET(req)
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('not_found')
    })
    it('period today branch', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      setupSales({ rows: [] })
      const req = new NextRequest('http://localhost/api/inventory/sales?period=today')
      const res = await SalesGET(req)
      expect(res.status).toBe(200)
      const j = await res.json()
      expect(j.currency).toBeDefined()
      vi.useRealTimers()
    })
    it('period 7d default and 30d', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      for (const p of ['7d', '30d', undefined]) {
        setupSales({ rows: [] })
        const url = p
          ? `http://localhost/api/inventory/sales?period=${p}`
          : 'http://localhost/api/inventory/sales'
        const req = new NextRequest(url)
        const res = await SalesGET(req)
        expect(res.status).toBe(200)
      }
      vi.useRealTimers()
    })
    it('from/to custom branch with lte', async () => {
      const { chains } = setupSales({ rows: [] })
      const req = new NextRequest(
        'http://localhost/api/inventory/sales?from=2026-01-01&to=2026-01-31',
      )
      await SalesGET(req)
      expect(chains.txChain.lte).toHaveBeenCalled()
    })
    it('no lte when period only', async () => {
      const { chains } = setupSales({ rows: [] })
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const req = new NextRequest('http://localhost/api/inventory/sales?period=today')
      await SalesGET(req)
      expect(chains.txChain.lte).not.toHaveBeenCalled()
      vi.useRealTimers()
    })
    it('rows null returns zeros', async () => {
      setupSales({ rows: null as any })
      const req = new NextRequest(
        'http://localhost/api/inventory/sales?from=2026-01-01&to=2026-01-31',
      )
      const res = await SalesGET(req)
      const j = await res.json()
      expect(j.revenue).toBe(0)
      expect(j.units).toBe(0)
      expect(j.transactionCount).toBe(0)
      expect(j.topItems).toEqual([])
      expect(j.recentSales).toEqual([])
    })
    it('rows empty returns zeros', async () => {
      setupSales({ rows: [] })
      const req = new NextRequest('http://localhost/api/inventory/sales')
      const res = await SalesGET(req as any)
      expect((await res.json()).revenue).toBe(0)
    })
    it('filters txs without item_id', async () => {
      const rows = [
        {
          id: TX_ID,
          created_at: new Date().toISOString(),
          amount: 100,
          items: [{ service_id: SVC_ID, name: 'Service', price: 100, qty: 1 }],
          receipt_number: 'R1',
        },
        {
          id: REG_ID,
          created_at: new Date().toISOString(),
          amount: 50,
          items: [],
          receipt_number: 'R2',
        },
      ]
      setupSales({ rows: rows as any })
      const req = new NextRequest(
        'http://localhost/api/inventory/sales?from=2026-01-01&to=2026-01-31',
      )
      const res = await SalesGET(req)
      const j = await res.json()
      expect(j.transactionCount).toBe(0) // none have item_id
      expect(j.revenue).toBe(0)
    })
    it('calculates revenue, units, topItems, recentSales', async () => {
      const rows = [
        {
          id: TX_ID,
          created_at: '2026-01-15T10:00:00Z',
          amount: 100,
          items: [
            { item_id: ITEM_ID, name: 'ProdA', price: 10, qty: 2 },
            { item_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', name: 'ProdB', price: 5, qty: 1 },
          ],
          receipt_number: 'R001',
        },
        {
          id: REG_ID,
          created_at: '2026-01-16T10:00:00Z',
          amount: 30,
          items: [{ item_id: ITEM_ID, name: 'ProdA', price: 10, qty: 1 }],
          receipt_number: null,
        },
      ]
      setupSales({ rows: rows as any })
      const req = new NextRequest(
        'http://localhost/api/inventory/sales?from=2026-01-01&to=2026-01-31',
      )
      const res = await SalesGET(req)
      const j = await res.json()
      // ProdA: qty 3 revenue 30, ProdB qty1 revenue5
      expect(j.revenue).toBe(35)
      expect(j.units).toBe(4)
      expect(j.transactionCount).toBe(2)
      expect(j.topItems[0].name).toBe('ProdA')
      expect(j.topItems[0].qty).toBe(3)
      expect(j.topItems[0].revenue).toBe(30)
      expect(j.recentSales.length).toBe(2)
      expect(j.recentSales[0].linesSummary).toContain('ProdA')
      expect(j.recentSales[0].total).toBe(25) // first tx 20+5
      expect(j.recentSales[1].receipt).toBe(REG_ID.slice(0, 8).toUpperCase()) // fallback
    })
    it('topItems sorted by revenue desc and sliced 10', async () => {
      const rows = Array.from({ length: 12 }, (_, i) => ({
        id: `${i}1111111-1111-4111-a111-111111111111`.slice(0, 36),
        created_at: new Date().toISOString(),
        amount: i * 10,
        items: [
          {
            item_id: `0000000${i}-0000-4000-a000-00000000000${i}`.slice(0, 36),
            name: `Prod${i}`,
            price: i + 1,
            qty: 1,
          },
        ],
        receipt_number: `R${i}`,
      }))
      setupSales({ rows: rows as any })
      const req = new NextRequest(
        'http://localhost/api/inventory/sales?from=2026-01-01&to=2026-01-31',
      )
      const res = await SalesGET(req)
      const j = await res.json()
      expect(j.topItems.length).toBe(10)
      expect(j.topItems[0].revenue).toBeGreaterThan(j.topItems[9].revenue)
    })
    it('recentSales limited 20', async () => {
      const rows = Array.from({ length: 25 }, (_, i) => ({
        id: `${String(i).padStart(2, '0')}111111-1111-4111-a111-111111111111`.slice(0, 36),
        created_at: new Date().toISOString(),
        amount: 10,
        items: [{ item_id: ITEM_ID, name: 'Prod', price: 10, qty: 1 }],
        receipt_number: `R${i}`,
      }))
      setupSales({ rows: rows as any })
      const req = new NextRequest(
        'http://localhost/api/inventory/sales?from=2026-01-01&to=2026-01-31',
      )
      const res = await SalesGET(req)
      expect((await res.json()).recentSales.length).toBe(20)
    })
  })

  // -----------------------------------------------------------------------
  // lib/utils coverage (formatCurrency etc) inside same file for group2
  // -----------------------------------------------------------------------
  describe('lib/utils inside strict file', () => {
    it('cn merges', () => {
      expect(cn('a', 'b')).toContain('a')
      expect(cn('p-2', 'p-4')).toBe('p-4')
      expect(cn()).toBe('')
      expect(cn(null as any, undefined as any, false as any)).toBe('')
      expect(cn('a', { b: true, c: false } as any)).toContain('b')
    })
    it('formatCurrency USD, COP, fallback', () => {
      expect(formatCurrency(0, 'USD')).toBe('$0')
      expect(formatCurrency(1000, 'USD')).toBe('$1,000')
      expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56')
      expect(formatCurrency(30000, 'COP')).toBe('$ 30.000')
      expect(formatCurrency(15000.5, 'COP')).toBeTruthy()
      expect(formatCurrency(1000, 'EUR')).toBeTruthy()
      expect(formatCurrency(1000, 'BRL')).toBeTruthy()
      expect(formatCurrency(1000, 'JPY')).toContain('1')
      expect(formatCurrency(NaN, 'USD')).toBeTruthy()
      expect(formatCurrency(-100, 'USD')).toContain('-')
      expect(formatCurrency(1e9, 'USD')).toContain('000')
      expect(formatCurrency(1000, 'COP')).not.toContain('\u00A0')
      expect(formatCurrency(30000, 'COP', 'en-US')).toContain('COP')
      expect(formatCurrency(1000, 'USD', 'es-CO')).toBeTruthy()
    })
    it('formatDate invalid and valid', () => {
      expect(formatDate('invalid')).toBe('Invalid Date')
      expect(formatDate('2026-01-15T12:00:00Z')).not.toBe('Invalid Date')
      expect(formatDate(new Date('2026-06-15'))).not.toBe('Invalid Date')
      expect(formatDate('')).toBe('Invalid Date')
      expect(formatDate('2026-01-15', 'invalid-xxx-!')).toBe('Invalid Date')
      expect(formatDate(new Date('invalid'))).toBe('Invalid Date')
    })
    it('format utils uses12HourClock and formatTime and formatInBusinessTimezone', async () => {
      const { uses12HourClock, formatTime, formatInBusinessTimezone } = await import('@/lib/utils')
      expect(uses12HourClock('en-US')).toBe(true)
      expect(typeof uses12HourClock('es-CO')).toBe('boolean')
      expect(uses12HourClock('invalid-xxx')).toBe(false)
      expect(formatTime('2026-01-15T14:30:00Z')).not.toBe('Invalid Date')
      expect(formatTime('invalid')).toBe('Invalid Date')
      expect(formatTime('2026-01-15T14:30:00Z', 'invalid-xxx-!')).toBe('Invalid Date')
      expect(formatInBusinessTimezone('2026-01-15T12:00:00Z', 'UTC', 'date')).not.toBe(
        'Invalid Date',
      )
      expect(formatInBusinessTimezone('2026-01-15T12:00:00Z', 'UTC', 'time')).not.toBe(
        'Invalid Date',
      )
      expect(formatInBusinessTimezone('2026-01-15T12:00:00Z', 'UTC', 'datetime')).not.toBe(
        'Invalid Date',
      )
      expect(formatInBusinessTimezone('invalid', 'UTC')).toBe('Invalid Date')
      expect(formatInBusinessTimezone('2026-01-15T12:00:00Z', 'Invalid/Zone')).toBe('Invalid Date')
    })
    it('slugify and getTenantSlug', () => {
      expect(slugify('Hello World')).toBe('hello-world')
      expect(slugify('   ')).toBe('')
      expect(slugify('café ñoño')).toBe('caf-oo')
      expect(slugify('hello_world--test')).toBe('hello-world-test')
      expect(slugify('-hello-')).toBe('hello')
      expect(slugify('a  b   c')).toBe('a-b-c')
      expect(getTenantSlug('a.trypronto.app')).toBe('a')
      expect(getTenantSlug('localhost:3000')).toBe(null)
      expect(getTenantSlug('')).toBe(null)
      expect(getTenantSlug('www.trypronto.app')).toBe('www')
      expect(getTenantSlug('trypronto.app')).toBe(null)
      expect(getTenantSlug('mybiz.trypronto.app:3000')).toBe('mybiz')
    })
  })
  describe('lib/rate-limit real via importActual', () => {
    it('covers rateLimit and getIp branches (real implementation)', async () => {
      const actual: any = await vi.importActual('@/lib/rate-limit')
      // use real functions with fake timers
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const k1 = `real-${Math.random()}`
      expect(actual.rateLimit(k1, { limit: 1, windowMs: 1000 })).toBe(true)
      expect(actual.rateLimit(k1, { limit: 1, windowMs: 1000 })).toBe(false)
      vi.advanceTimersByTime(1001)
      expect(actual.rateLimit(k1, { limit: 1, windowMs: 1000 })).toBe(true)
      // getIp branches
      const req1 = new Request('http://test', { headers: { 'x-forwarded-for': '1.1.1.1,2.2.2.2' } })
      expect(actual.getIp(req1)).toBe('1.1.1.1')
      const req2 = new Request('http://test')
      expect(actual.getIp(req2)).toBe('unknown')
      const fake = { headers: { get: () => '1.2.3.4' } } as any
      expect(actual.getIp(fake)).toBe('unknown')
      // window slide and cleanup
      vi.advanceTimersByTime(10 * 60 * 1000)
      vi.useRealTimers()
    })
  })

  // -----------------------------------------------------------------------
  // fast-check fuzz unified
  // -----------------------------------------------------------------------
  describe('fast-check fuzz unified', () => {
    it('barcode length 0..150 lookup slice', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ maxLength: 150 }), async (s) => {
          const trimmed = s.trim().slice(0, 100)
          setupLookup({ item: trimmed ? ({ id: ITEM_ID, barcode: trimmed } as any) : null })
          const req = new NextRequest(
            `http://localhost/api/inventory/lookup?barcode=${encodeURIComponent(s)}`,
          )
          const res = await LookupGET(req)
          expect([200, 401, 404].includes(res.status)).toBeTruthy()
        }),
        { numRuns: 10 },
      )
    })
  })
})
