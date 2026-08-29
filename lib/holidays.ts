export interface Holiday {
  id?: string
  business_id: string
  location_id?: string | null
  date: string // YYYY-MM-DD
  reason?: string | null
  is_open?: boolean // false = closed (default)
}

export function isHoliday(date: string, holidays: Holiday[]): boolean {
  if (!holidays || holidays.length === 0) return false
  return holidays.some((h) => h.date === date && h.is_open === false)
}

export function getHolidaysForDate(date: string, holidays: Holiday[]): Holiday[] {
  if (!holidays || holidays.length === 0) return []
  return holidays.filter((h) => h.date === date)
}

export function isHolidayForLocation(
  date: string,
  locationId: string | null | undefined,
  holidays: Holiday[],
): boolean {
  if (!holidays || holidays.length === 0) return false
  return holidays.some((h) => {
    if (h.date !== date) return false
    if (h.is_open !== false) return false
    // null location_id means business-wide holiday (applies to all locations)
    if (!h.location_id) return true
    // location-specific holiday applies only to matching location
    return h.location_id === locationId
  })
}
