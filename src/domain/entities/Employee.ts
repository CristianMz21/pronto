export type EmployeeId = string
export type EmployeeRole = 'admin' | 'staff' | 'barbero'

export interface Employee {
  id: EmployeeId
  businessId: string
  userId: string | null
  name: string
  role: EmployeeRole
  phone: string | null
  email: string | null
  avatarUrl: string | null
  isActive: boolean
  color: string | null
  specialties: string[]
  commissionRate: number | null
  commissionFixed: number | null
  bio: string | null
  locationId: string | null
  createdAt: Date
}
