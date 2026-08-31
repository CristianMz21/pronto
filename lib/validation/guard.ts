export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asString(value: unknown, fallback?: string): string | undefined {
  if (typeof value === 'string') {
    return value
  }
  if (value === null || value === undefined) {
    return fallback
  }
  return fallback
}

export function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function asNumber(value: unknown, fallback?: number): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

export function ensureString(value: FormDataEntryValue | null): string {
  if (typeof value === 'string') {
    return value
  }
  if (value instanceof File) {
    throw new Error('Expected string but received File')
  }
  throw new Error('Expected string FormData value')
}

export function ensureOptionalString(value: FormDataEntryValue | null): string | undefined {
  if (value === null) {
    return undefined
  }
  if (typeof value === 'string') {
    return value
  }
  if (value instanceof File) {
    throw new Error('Expected string but received File')
  }
  return undefined
}

export function getFormString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  if (value === null) {
    return undefined
  }
  if (typeof value === 'string') {
    return value
  }
  return undefined
}

export function getRequiredFormString(formData: FormData, key: string): string {
  const value = formData.get(key)
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  if (value instanceof File) {
    throw new Error(`Field "${key}" expected string but received File`)
  }
  throw new Error(`Missing required field: ${key}`)
}

export function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    if (value === 'true' || value === '1') {
      return true
    }
    if (value === 'false' || value === '0') {
      return false
    }
  }
  return fallback
}
