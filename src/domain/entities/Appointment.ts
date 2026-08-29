export type AppointmentId = string
export type AppointmentStatus = 'pending' | 'scheduled' | 'confirmed' | 'checked_in' | 'in_service' | 'completed' | 'cancelled' | 'no_show' | 'paid'
export type AppointmentSource = 'manual' | 'online' | 'telegram' | 'viber'

export interface Appointment {
  id: AppointmentId
  businessId: string
  locationId: string | null
  clientId: string | null
  employeeId: string | null
  serviceId: string | null
  startsAt: Date
  endsAt: Date
  status: AppointmentStatus
  price: number | null
  source: AppointmentSource
  notes: string | null
  recurringId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateAppointmentProps {
  businessId: string
  clientId: string
  serviceId: string
  employeeId?: string | null
  startsAt: Date
  endsAt: Date
  price: number
  source?: AppointmentSource
  notes?: string | null
}
