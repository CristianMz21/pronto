import { describe, expect, it } from 'vitest'

import 'fake-indexeddb/auto'
import { queueTransaction } from '@/lib/offline-db'

describe('offline', () => {
  it('a', async () => {
    const tx = await queueTransaction({
      business_id: 'biz',
      client_id: null,
      employee_id: null,
      amount: 10,
      payment_method: 'cash',
      items: [],
    })
    expect(tx.id).toBeTruthy()
  })
})
