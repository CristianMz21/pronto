#!/usr/bin/env node
/**
 * Simulate 1 year of Escudería barbershop operation
 * - 120 clients, 4 barbers, 5 services
 * - ~2500 appointments over 300 working days (Mon-Sat)
 * - Transactions + commissions auto via trigger 043
 * - Run: node scripts/simulate-year.js
 */

const _crypto = require('node:crypto')

const { Client } = require('pg')

const BUSINESS_ID = '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SSL = process.env.MIGRATE_SSL !== 'false'

const FIRST_NAMES = [
  'Carlos',
  'Juan',
  'Luis',
  'Miguel',
  'Jorge',
  'Andrés',
  'Felipe',
  'Santiago',
  'Daniel',
  'Alejandro',
  'Camilo',
  'Sebastián',
  'Mateo',
  'Nicolás',
  'David',
  'Julián',
  'Fernando',
  'Ricardo',
  'Óscar',
  'Hernán',
  'Ana',
  'María',
  'Laura',
  'Sofia',
  'Valentina',
  'Camila',
  'Daniela',
  'Paola',
  'Carolina',
  'Diana',
  'Lucía',
  'Andrea',
  'Marcela',
  'Natalia',
  'Claudia',
]
const LAST_NAMES = [
  'García',
  'Rodríguez',
  'Martínez',
  'López',
  'González',
  'Pérez',
  'Sánchez',
  'Ramírez',
  'Torres',
  'Flores',
  'Rivera',
  'Gómez',
  'Díaz',
  'Reyes',
  'Morales',
  'Cruz',
  'Ortiz',
  'Gutiérrez',
  'Mendoza',
  'Vargas',
  'Castro',
  'Silva',
  'Herrera',
  'Peña',
  'Álvarez',
  'Jiménez',
  'Ruiz',
  'Aguilar',
  'Castillo',
  'Moreno',
]
const TAGS_POOL = [
  ['frecuente'],
  ['vip'],
  ['nuevo'],
  ['frecuente', 'vip'],
  [],
  [],
  [],
  ['inactivo'],
  ['frecuente'],
  ['barba'],
]
const NOTES_POOL = [
  '',
  '',
  '',
  'Prefiere corte con tijera',
  'Cliente exigente',
  'Siempre con barba',
  'Viene cada 15 días',
  'Paga en efectivo',
  '',
]

function randomPhone() {
  const prefix = [300, 301, 310, 311, 312, 313, 314, 315, 316, 320, 321, 322][
    Math.floor(Math.random() * 12)
  ]
  const num = Math.floor(1000000 + Math.random() * 9000000)
  return `+57 ${prefix} ${String(num).slice(0, 3)} ${String(num).slice(3)}`
}
function randomName() {
  const fn = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]
  const ln = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]
  return `${fn} ${ln}`
}
function randomBirthday() {
  const year = 1975 + Math.floor(Math.random() * 30)
  const month = 1 + Math.floor(Math.random() * 12)
  const day = 1 + Math.floor(Math.random() * 28)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function main() {
  const client = new Client({
    connectionString: DB_URL,
    ssl: SSL ? { rejectUnauthorized: false } : false,
  })
  await client.connect()
  console.log('Connected to', DB_URL.replace(/:[^@]+@/, ':***@'))

  // Clean previous simulation data for this business (keep business/employees/services)
  console.log('Cleaning previous simulation data...')
  await client.query(`delete from commissions where business_id=$1`, [BUSINESS_ID])
  await client.query(`delete from transactions where business_id=$1`, [BUSINESS_ID])
  await client.query(`delete from appointments where business_id=$1`, [BUSINESS_ID])
  await client.query(`delete from clients where business_id=$1`, [BUSINESS_ID])
  await client.query(`delete from cash_movements where business_id=$1`, [BUSINESS_ID])
  await client.query(`delete from cash_registers where business_id=$1`, [BUSINESS_ID])

  // Fetch employees and services
  const { rows: employees } = await client.query(
    `select id, name, specialties, commission_rate from employees where business_id=$1 and is_active=true`,
    [BUSINESS_ID],
  )
  const { rows: services } = await client.query(
    `select id, name, price, duration_min, category from services where business_id=$1 and is_active=true`,
    [BUSINESS_ID],
  )
  const { rows: empServices } = await client.query(
    `select employee_id, service_id from employee_services where employee_id = any($1)`,
    [employees.map((e) => e.id)],
  )
  const empServiceMap = new Map()
  for (const es of empServices) {
    if (!empServiceMap.has(es.employee_id)) empServiceMap.set(es.employee_id, new Set())
    empServiceMap.get(es.employee_id).add(es.service_id)
  }
  // Filter services per employee
  const employeeServices = new Map()
  for (const e of employees) {
    const sids = empServiceMap.get(e.id) || new Set()
    const filtered = services.filter((s) => sids.has(s.id))
    employeeServices.set(e.id, filtered.length ? filtered : services) // fallback to all if none
  }

  console.log(`Employees: ${employees.map((e) => e.name).join(', ')}`)
  console.log(`Services: ${services.map((s) => `${s.name}(${s.price})`).join(', ')}`)

  // Create 120 clients
  console.log('Creating 120 clients...')
  const clientIds = []
  for (let i = 0; i < 120; i++) {
    const name = randomName()
    const phone = randomPhone()
    const birthday = Math.random() < 0.3 ? randomBirthday() : null
    const tags = pick(TAGS_POOL)
    const notes = pick(NOTES_POOL) || null
    const email =
      Math.random() < 0.4 ? `${name.toLowerCase().replace(' ', '.')}${i}@gmail.com` : null
    const { rows } = await client.query(
      `insert into clients (business_id, name, phone, email, birthday, notes, tags, total_visits, total_spent) values ($1,$2,$3,$4,$5,$6,$7,0,0) returning id`,
      [BUSINESS_ID, name, phone, email, birthday, notes, tags],
    )
    clientIds.push(rows[0].id)
  }
  console.log(`Created ${clientIds.length} clients`)

  // Generate appointments for past year (2025-08-28 to 2026-08-27)
  const startDate = new Date('2025-08-28T00:00:00Z')
  const endDate = new Date('2026-08-27T00:00:00Z')
  const allAppointments = []
  const _totalAppts = 0
  let totalTransactions = 0

  // Business hours: Mon-Sat 09:00-20:00, Sun closed
  // For each day, for each employee, generate sequential appointments
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dow = d.getUTCDay() // 0 Sun
    // Convert to Bogota dow: same as UTC dow for this purpose (approx, but fine for simulation)
    // Business is closed Sunday (0) in Bogota, which is same dow in UTC for our simulation (we use UTC dates at noon)
    // Use d's Bogota conversion: we need to check business_hours is_open
    // For simulation, we treat UTC dow == Bogota dow (close enough, since we use 09-20)
    const isOpen = dow !== 0 // closed Sunday
    if (!isOpen) continue

    // Weekend has more appointments
    const basePerBarber =
      dow === 6 ? 7 + Math.floor(Math.random() * 3) : 5 + Math.floor(Math.random() * 4) // Sat 7-9, Mon-Fri 5-8

    for (const emp of employees) {
      const empServicesList = employeeServices.get(emp.id)
      // Randomize how many appointments this barber does today (some days off)
      if (Math.random() < 0.08) continue // 8% chance barber off that day

      let currentMin = 9 * 60 // 09:00
      const closeMin = 20 * 60 // 20:00
      const apptsToday = basePerBarber + (Math.floor(Math.random() * 3) - 1) // vary
      for (let i = 0; i < apptsToday; i++) {
        if (currentMin >= closeMin - 15) break
        const svc = pick(empServicesList)
        const duration = svc.duration_min
        if (currentMin + duration > closeMin) break

        // Random gap 0-10 min
        const hour = Math.floor(currentMin / 60)
        const min = currentMin % 60
        const dateStr = d.toISOString().slice(0, 10)
        const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`

        // Convert Bogota wall time to UTC
        const startsAt = wallclockToUtc(dateStr, timeStr, 'America/Bogota')
        const endsAt = new Date(startsAt.getTime() + duration * 60000)

        // Random status: 88% completed, 5% cancelled, 4% no_show, 3% pending/confirmed (future)
        // For past dates (before today), only completed/cancelled/no_show; for future (last few days), pending/confirmed
        const isFuture = startsAt > new Date()
        let status
        if (isFuture) {
          status = Math.random() < 0.7 ? 'confirmed' : 'pending'
        } else {
          const r = Math.random()
          if (r < 0.88) status = 'completed'
          else if (r < 0.93) status = 'cancelled'
          else if (r < 0.97) status = 'no_show'
          else status = 'completed'
        }

        const clientId = pick(clientIds)
        const price = svc.price

        allAppointments.push({
          business_id: BUSINESS_ID,
          client_id: clientId,
          employee_id: emp.id,
          service_id: svc.id,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          status,
          price,
          source: Math.random() < 0.3 ? 'online' : 'manual',
        })

        currentMin += duration + 5 + Math.floor(Math.random() * 10) // 5-15 min gap
      }
    }
  }

  console.log(`Generated ${allAppointments.length} appointments (Mon-Sat, 300 days)`)

  // Insert appointments in batches of 100 to avoid overwhelming DB, handling double-booking gracefully
  let insertedAppts = 0
  let skippedDouble = 0
  for (let i = 0; i < allAppointments.length; i += 100) {
    const batch = allAppointments.slice(i, i + 100)
    for (const appt of batch) {
      try {
        const { rows: apptRows } = await client.query(
          `insert into appointments (business_id, client_id, employee_id, service_id, starts_at, ends_at, status, price, source) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
          [
            appt.business_id,
            appt.client_id,
            appt.employee_id,
            appt.service_id,
            appt.starts_at,
            appt.ends_at,
            appt.status,
            appt.price,
            appt.source,
          ],
        )
        const apptId = apptRows[0].id
        insertedAppts++
        // For completed, create transaction immediately (POS)
        if (appt.status === 'completed') {
          const payMethods = ['cash', 'cash', 'cash', 'card', 'transfer'] // 60% cash
          const method = pick(payMethods)
          const amount = appt.price // no discount for simulation
          // items jsonb: single service
          const items = JSON.stringify([
            {
              service_id: appt.service_id,
              name: services.find((s) => s.id === appt.service_id).name,
              price: appt.price,
              qty: 1,
            },
          ])
          await client.query(
            `insert into transactions (business_id, appointment_id, client_id, employee_id, amount, payment_method, status, items) values ($1,$2,$3,$4,$5,$6,'completed',$7)`,
            [appt.business_id, apptId, appt.client_id, appt.employee_id, amount, method, items],
          )
          totalTransactions++
        }
      } catch (e) {
        if (e.message?.includes('slot_already_booked')) {
          skippedDouble++
        } else if (
          e.message &&
          (e.message.includes('barber_unavailable') ||
            e.message.includes('barber_not_qualified') ||
            e.message.includes('outside_availability'))
        ) {
          // Skip, expected for some edge cases
          skippedDouble++
        } else {
          console.error('Insert error:', e.message)
        }
      }
    }
    if (i % 500 === 0) console.log(`  ${insertedAppts} appts inserted...`)
  }

  console.log(
    `Inserted ${insertedAppts} appointments (skipped ${skippedDouble} double/unavailable)`,
  )
  console.log(`Created ${totalTransactions} transactions`)

  // Generate a few inventory items and movements for simulation
  console.log('Seeding inventory...')
  const inventory = [
    {
      name: 'Pomada Escudería',
      sku: 'POM-001',
      category: 'pomadas',
      quantity: 12,
      sell_price: 45000,
      cost_price: 20000,
    },
    {
      name: 'Cera Matte',
      sku: 'CER-002',
      category: 'ceras',
      quantity: 3,
      sell_price: 38000,
      cost_price: 18000,
    },
    {
      name: 'Shampoo Barba',
      sku: 'SHA-003',
      category: 'shampoo',
      quantity: 2,
      sell_price: 28000,
      cost_price: 12000,
    },
    {
      name: 'Aceite para Barba',
      sku: 'ACE-004',
      category: 'aceites',
      quantity: 8,
      sell_price: 32000,
      cost_price: 15000,
    },
    {
      name: 'Navajas Desechables x100',
      sku: 'NAV-005',
      category: 'insumos',
      quantity: 1,
      sell_price: 15000,
      cost_price: 7000,
    },
  ]
  for (const item of inventory) {
    await client.query(
      `insert into inventory_items (business_id, name, sku, category, quantity, sell_price, cost_price, low_stock_threshold) values ($1,$2,$3,$4,$5,$6,$7,5) on conflict do nothing`,
      [
        BUSINESS_ID,
        item.name,
        item.sku,
        item.category,
        item.quantity,
        item.sell_price,
        item.cost_price,
      ],
    )
    // Ensure quantity updated if exists
    await client.query(
      `update inventory_items set quantity=$1, sell_price=$2, cost_price=$3 where business_id=$4 and sku=$5`,
      [item.quantity, item.sell_price, item.cost_price, BUSINESS_ID, item.sku],
    )
  }

  // Add a couple cash registers for the year (simulate monthly closes)
  console.log('Seeding cash history...')
  const now = new Date()
  for (let m = 0; m < 6; m++) {
    const opened = new Date(now)
    opened.setMonth(now.getMonth() - m)
    opened.setDate(1)
    opened.setHours(8, 0, 0, 0)
    const closed = new Date(opened)
    closed.setDate(2)
    closed.setHours(19, 0, 0, 0)
    const opening = 150000 + Math.floor(Math.random() * 50000)
    const expected = opening + 800000 + Math.floor(Math.random() * 200000)
    const actual = expected + (Math.floor(Math.random() * 10000) - 5000)
    await client.query(
      `insert into cash_registers (business_id, opened_by, opening_cash, expected_cash, actual_cash, status, opened_at, closed_at) values ($1,$2,$3,$4,$5,'closed',$6,$7) on conflict do nothing`,
      [
        BUSINESS_ID,
        (await client.query(`select owner_id from businesses where id=$1`, [BUSINESS_ID])).rows[0]
          .owner_id,
        opening,
        expected,
        actual,
        opened.toISOString(),
        closed.toISOString(),
      ],
    )
  }

  // Verify
  const { rows: stats } = await client.query(
    `
    select 
      (select count(*) from appointments where business_id=$1) as appts,
      (select count(*) from transactions where business_id=$1) as txs,
      (select coalesce(sum(amount),0) from transactions where business_id=$1) as revenue,
      (select count(*) from clients where business_id=$1) as clients,
      (select count(*) from commissions where business_id=$1) as commissions,
      (select coalesce(sum(amount),0) from commissions where business_id=$1) as commission_sum
  `,
    [BUSINESS_ID],
  )
  console.log('STATS:', stats[0])

  const { rows: perBarber } = await client.query(
    `
    select e.name, count(a.id) as appts, count(t.id) as sales, coalesce(sum(t.amount),0) as revenue, coalesce(sum(c.amount),0) as commissions
    from employees e
    left join appointments a on a.employee_id=e.id and a.business_id=$1
    left join transactions t on t.employee_id=e.id and t.business_id=$1
    left join commissions c on c.employee_id=e.id and c.business_id=$1
    where e.business_id=$1 group by e.name order by revenue desc
  `,
    [BUSINESS_ID],
  )
  console.log('PER BARBER:')
  perBarber.forEach((r) =>
    console.log(
      `  ${r.name}: ${r.appts} citas, ${r.sales} ventas, $${Number(r.revenue).toLocaleString('es-CO')} revenue, $${Number(r.commissions).toLocaleString('es-CO')} comisión`,
    ),
  )

  await client.end()
  console.log('Done!')
}

function wallclockToUtc(date, time, tz) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(noonUtc)
  const get = (t) => parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10)
  const localNoonMs = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  )
  const offsetMs = localNoonMs - noonUtc.getTime()
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - offsetMs)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
