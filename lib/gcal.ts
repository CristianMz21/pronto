/** Build a Google Calendar "Add to Calendar" URL from local date/time strings. */
export function buildGCalUrl(opts: {
  businessName: string
  serviceName: string
  employeeName?: string | null
  date: string // YYYY-MM-DD
  time: string // HH:mm
  durationMin: number
  timezone?: string | null
  address?: string | null
}): string {
  const [year, month, day] = opts.date.split('-') as [string, string, string]
  const [hour, minute] = opts.time.split(':') as [string, string]

  const _pad2 = (n: number) => String(n).padStart(2, '0')
  void _pad2
  const startStr = `${year}${month}${day}T${hour}${minute}00`
  const startMins = parseInt(hour!) * 60 + parseInt(minute!)
  if (!Number.isFinite(startMins) || !Number.isFinite(opts.durationMin)) {
    const endStr = `${year}${month}${day}T${hour}${minute}00`
    return assembleGCalUrl(
      opts.businessName,
      opts.serviceName,
      opts.employeeName,
      startStr,
      endStr,
      opts.timezone ?? null,
      opts.address ?? null,
    )
  }
  const y = parseInt(year!),
    m = parseInt(month!),
    d = parseInt(day!),
    h = parseInt(hour!),
    min = parseInt(minute!)
  if (![y, m, d, h, min].every(Number.isFinite)) {
    const endStr = `${year}${month}${day}T${hour}${minute}00`
    return assembleGCalUrl(
      opts.businessName,
      opts.serviceName,
      opts.employeeName,
      startStr,
      endStr,
      opts.timezone ?? null,
      opts.address ?? null,
    )
  }
  const startDate = new Date(Date.UTC(y, m - 1, d, h, min, 0))
  if (isNaN(startDate.getTime())) {
    const endStr = `${year}${month}${String(d).padStart(2, '0')}T${String(Math.floor((startMins + opts.durationMin) / 60) % 24).padStart(2, '0')}${String((startMins + opts.durationMin) % 60).padStart(2, '0')}00`
    return assembleGCalUrl(
      opts.businessName,
      opts.serviceName,
      opts.employeeName,
      startStr,
      endStr,
      opts.timezone ?? null,
      opts.address ?? null,
    )
  }
  const endDate = new Date(startDate.getTime() + opts.durationMin * 60_000)
  const endYear = String(endDate.getUTCFullYear())
  const endMonth = String(endDate.getUTCMonth() + 1).padStart(2, '0')
  const endDayStr = String(endDate.getUTCDate()).padStart(2, '0')
  const endHour = String(endDate.getUTCHours()).padStart(2, '0')
  const endMinute = String(endDate.getUTCMinutes()).padStart(2, '0')
  const endStr = `${endYear}${endMonth}${endDayStr}T${endHour}${endMinute}00`

  return assembleGCalUrl(
    opts.businessName,
    opts.serviceName,
    opts.employeeName,
    startStr,
    endStr,
    opts.timezone ?? null,
    opts.address ?? null,
  )
}

/** Build a Google Calendar URL from an ISO timestamp (server-side, with real timezone conversion). */
export function buildGCalUrlFromISO(opts: {
  businessName: string
  serviceName: string
  employeeName?: string | null
  startsAt: string // ISO datetime
  durationMin: number
  timezone: string
  address?: string | null
}): string {
  const toGCalDate = (iso: string, tz: string): string => {
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return '19700101T000000'
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(d)
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
      const h = get('hour').replace('24', '00')
      return `${get('year')}${get('month')}${get('day')}T${h}${get('minute')}${get('second')}`
    } catch {
      return '19700101T000000'
    }
  }

  const safeDuration = Number.isFinite(opts.durationMin) ? opts.durationMin : 0
  const startDate = new Date(opts.startsAt)
  const endDate = isNaN(startDate.getTime())
    ? new Date(NaN)
    : new Date(startDate.getTime() + safeDuration * 60_000)
  const startStr = toGCalDate(opts.startsAt, opts.timezone)
  const endStr = isNaN(endDate.getTime())
    ? '19700101T000000'
    : toGCalDate(endDate.toISOString(), opts.timezone)

  return assembleGCalUrl(
    opts.businessName,
    opts.serviceName,
    opts.employeeName,
    startStr,
    endStr,
    opts.timezone,
    opts.address ?? null,
  )
}

function assembleGCalUrl(
  businessName: string,
  serviceName: string,
  employeeName: string | null | undefined,
  startStr: string,
  endStr: string,
  timezone: string | null,
  address: string | null,
): string {
  const details = [
    `Service: ${serviceName}`,
    ...(employeeName ? [`With: ${employeeName}`] : []),
    `Booked via Pronto`,
  ].join('\n')

  const parts = [
    `action=TEMPLATE`,
    `text=${encodeURIComponent(`Appointment at ${businessName}`)}`,
    `dates=${startStr}/${endStr}`,
    `details=${encodeURIComponent(details)}`,
    ...(timezone ? [`ctz=${encodeURIComponent(timezone)}`] : []),
    ...(address ? [`location=${encodeURIComponent(address)}`] : []),
  ]

  return `https://calendar.google.com/calendar/render?${parts.join('&')}`
}
