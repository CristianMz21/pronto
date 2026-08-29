import type { ClientRepository } from '@/src/application/ports/ClientRepository'
import type { Appointment, CreateAppointmentProps } from '@/src/domain/entities/Appointment'

export interface AppointmentRepository {
  create(props: CreateAppointmentProps): Promise<Appointment>
  findById(id: string): Promise<Appointment | null>
  findByBusinessAndDate(businessId: string, start: Date, end: Date): Promise<Appointment[]>
}

export class CreateAppointmentUseCase {
  constructor(
    private readonly appointmentRepo: AppointmentRepository,
    private readonly clientRepo: ClientRepository,
  ) {}

  async execute(
    props: CreateAppointmentProps & { businessTimezone: string; minAdvanceMinutes: number },
  ): Promise<Appointment> {
    // Business rule: no past
    if (props.startsAt <= new Date()) {
      throw new Error('in_past: cannot book in the past')
    }
    // Business rule: lead time
    const leadMs = props.minAdvanceMinutes * 60 * 1000
    if (props.startsAt.getTime() < Date.now() + leadMs) {
      throw new Error('too_soon: need ' + props.minAdvanceMinutes + ' minutes lead')
    }
    return this.appointmentRepo.create(props)
  }
}
