export type ClientId = string

export interface Client {
  id: ClientId
  businessId: string
  userId: string | null
  name: string
  phone: string | null
  email: string | null
  whatsappNumber: string | null
  birthday: string | null
  notes: string | null
  tags: string[]
  preferences: Record<string, unknown> | null
  status: 'active' | 'inactive' | 'vip'
  createdAt: Date
}

export interface ClientStats {
  clientId: ClientId
  businessId: string
  totalVisits: number
  totalSpent: number
  lastVisitAt: Date | null
}
