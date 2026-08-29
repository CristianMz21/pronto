/**
 * Report helpers for dashboard KPIs — pure functions testable via vitest (T041)
 */

export interface TxLike { amount: number; employee_id?: string | null; client_id?: string | null; created_at?: string }
export interface ApptLike { id: string; status: string }

export function calcAvgTicket(transactions: TxLike[]): number {
  if (!transactions || transactions.length === 0) return 0
  const sum = transactions.reduce((acc, t) => acc + Number(t.amount ?? 0), 0)
  return Math.round((sum / transactions.length) * 100) / 100
}

export function getTopBarbers(transactions: TxLike[], limit = 5): { employee_id: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>()
  for (const tx of transactions) {
    const id = tx.employee_id ?? '__unassigned'
    const entry = map.get(id) ?? { total: 0, count: 0 }
    entry.total += Number(tx.amount ?? 0)
    entry.count += 1
    map.set(id, entry)
  }
  return Array.from(map.entries())
    .filter(([id]) => id !== '__unassigned')
    .map(([employee_id, v]) => ({ employee_id, total: Math.round(v.total * 100) / 100, count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

export function newVsReturning(clientStats: { id: string; total_visits: number }[]): { newCount: number; returningCount: number } {
  let newCount = 0
  let returningCount = 0
  for (const c of clientStats) {
    if ((c.total_visits ?? 0) < 3) newCount++
    else returningCount++
  }
  return { newCount, returningCount }
}

export function reportSalesByBarber(transactions: TxLike[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const tx of transactions) {
    const id = tx.employee_id ?? 'unassigned'
    out[id] = (out[id] ?? 0) + Number(tx.amount ?? 0)
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 100) / 100
  return out
}

export function reportCommissions(commissions: { employee_id: string; amount: number }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of commissions) out[c.employee_id] = (out[c.employee_id] ?? 0) + Number(c.amount ?? 0)
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 100) / 100
  return out
}
