import type { Client, ClientId } from '@/src/domain/entities/Client'

export interface ClientRepository {
  findById(id: ClientId): Promise<Client | null>
  findByBusinessId(businessId: string, opts?: { q?: string; tag?: string; limit?: number }): Promise<Client[]>
  findByUserId(userId: string, businessId: string): Promise<Client | null>
  create(client: Omit<Client, 'id' | 'createdAt'>): Promise<Client>
  update(id: ClientId, data: Partial<Client>): Promise<Client>
  delete(id: ClientId): Promise<void>
}
