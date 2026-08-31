import { z } from 'zod'

export const LoginFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  redirectTo: z.string().optional(),
})

export type LoginFormInput = z.infer<typeof LoginFormSchema>

export const BookingSchema = z.object({
  businessId: z.string().uuid(),
  serviceId: z.string().uuid(),
  employeeId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  notes: z.string().max(500).optional(),
})

export type BookingInput = z.infer<typeof BookingSchema>

export const HeadersSchema = z.object({
  'x-location-id': z.string().uuid().optional(),
  'x-pathname': z.string().optional(),
  'x-user-id': z.string().uuid().optional(),
  'x-user-email': z.string().email().optional(),
  'x-user-role': z.string().optional(),
})

export type HeadersInput = z.infer<typeof HeadersSchema>

export const UuidSchema = z.string().uuid()

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type PaginationInput = z.infer<typeof PaginationSchema>

/**
 * Parse unknown data with a Zod schema or throw with a typed error.
 * Use at ALL borders: FormData, JSON bodies, headers, query params.
 */
export function parseOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(message || 'Validation failed')
  }
  return result.data
}
