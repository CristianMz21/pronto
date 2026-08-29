import { db } from '@/lib/db'
import {
  businesses,
  locations,
  services,
  employees,
  businessHours,
  employeeServices,
  businessSettings,
} from '@/drizzle/schema'
import { eq } from 'drizzle-orm'

const ESCUDERIA_ID = '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
const OWNER_ID = 'b8f773b2-11e7-40d0-8f52-929b480d42b8'
const CENTRO_ID = '11111111-1111-1111-1111-111111111111'

async function seedBusiness() {
  const existing = await db.query.businesses.findFirst({
    where: eq(businesses.slug, 'escuderia'),
  })
  if (!existing) {
    await db
      .insert(businesses)
      .values({
        id: ESCUDERIA_ID,
        ownerId: OWNER_ID,
        name: 'Escudería',
        slug: 'escuderia',
        type: 'barbershop',
        phone: '+57 300 123 4567',
        address: 'Colombia',
        timezone: 'America/Bogota',
        currency: 'COP',
        brandColor: '#0A0A0A',
      })
      .onConflictDoNothing()
    console.log('Created Escudería')
  } else {
    console.log('Escudería already exists, skipping business insert')
  }
  // Ensure business_settings row (3FN split) — upsert
  await db
    .insert(businessSettings)
    .values({
      businessId: ESCUDERIA_ID,
      timezone: 'America/Bogota',
      currency: 'COP',
      brandColor: '#0A0A0A',
      notificationLanguage: 'es',
      enabledModules: ['bookings', 'pos', 'crm', 'inventory', 'notifications'],
    })
    .onConflictDoNothing()
}

async function seedLocation() {
  await db
    .insert(locations)
    .values({
      id: CENTRO_ID,
      businessId: ESCUDERIA_ID,
      name: 'Escudería Centro',
      slug: 'centro',
      address: 'Colombia',
      phone: '+57 300 123 4567',
      isActive: true,
    })
    .onConflictDoNothing()
  console.log('Seeded location Centro')
}

async function seedBusinessHours() {
  const hours = [
    { day: 1, open: true },
    { day: 2, open: true },
    { day: 3, open: true },
    { day: 4, open: true },
    { day: 5, open: true },
    { day: 6, open: true },
    { day: 0, open: false },
  ]
  for (const h of hours) {
    await db
      .insert(businessHours)
      .values({
        businessId: ESCUDERIA_ID,
        dayOfWeek: h.day,
        isOpen: h.open,
        openTime: '09:00',
        closeTime: '20:00',
      })
      .onConflictDoNothing()
  }
  console.log('Seeded business_hours')
}

async function seedServices() {
  const svc = [
    {
      id: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec',
      name: 'Corte Clásico',
      description: 'Corte moderno con acabado profesional',
      price: '30000',
      durationMin: 30,
      category: 'corte',
    },
    {
      id: '0730db42-332f-46d9-851d-e036c66fb8d6',
      name: 'Corte + Barba',
      description: 'Combo completo corte y barba con toalla caliente',
      price: '45000',
      durationMin: 50,
      category: 'combo',
    },
    {
      id: 'b06e02ba-d274-4c83-9f22-bfbc992b6f03',
      name: 'Barba y Perfilado',
      description: 'Afeitado y perfilado con navaja',
      price: '20000',
      durationMin: 20,
      category: 'barba',
    },
    {
      id: 'cf73968f-4475-463c-933c-1bc678ed1ee9',
      name: 'Afeitado Clásico',
      description: 'Afeitado clásico con navaja y toalla caliente',
      price: '25000',
      durationMin: 30,
      category: 'afeitado',
    },
    {
      id: '48d9363a-a97b-49ce-b24a-db424141beea',
      name: 'Diseño de Cejas',
      description: 'Perfilado y diseño de cejas',
      price: '15000',
      durationMin: 15,
      category: 'cejas',
    },
  ]
  for (const s of svc) {
    await db
      .insert(services)
      .values({
        id: s.id,
        businessId: ESCUDERIA_ID,
        name: s.name,
        description: s.description,
        price: s.price as unknown as string,
        durationMin: s.durationMin,
        category: s.category,
        isActive: true,
        capacity: 1,
      })
      .onConflictDoNothing()
  }
  console.log('Seeded services')
}

async function seedEmployees() {
  const emps = [
    {
      id: 'f822de0d-ca09-42dd-bea1-76b2ca334d7e',
      name: 'Escudería Owner',
      role: 'admin',
      phone: '+57 300 123 4567',
      email: 'test@barber.local',
      color: '#1a1a1a',
      specialties: ['corte', 'barba', 'combo'],
      commissionRate: '50.00' as unknown as string,
    },
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'Ana Escudería',
      role: 'barbero',
      color: '#ec4899',
      specialties: ['barba', 'cejas'],
      commissionRate: '50.00' as unknown as string,
      commissionFixed: '10000' as unknown as string,
    },
    {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      name: 'Luis Escudería',
      role: 'barbero',
      phone: '+57 310 555 0101',
      email: 'luis@escuderia.com',
      color: '#0ea5e9',
      specialties: ['corte', 'combo', 'afeitado'],
      commissionRate: '45.00' as unknown as string,
    },
    {
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      name: 'Miguel Escudería',
      role: 'barbero',
      phone: '+57 311 555 0102',
      email: 'miguel@escuderia.com',
      color: '#f59e0b',
      specialties: ['corte', 'barba', 'cejas'],
      commissionRate: '50.00' as unknown as string,
    },
  ]
  for (const e of emps) {
    await db
      .insert(employees)
      .values({
        id: e.id,
        businessId: ESCUDERIA_ID,
        name: e.name,
        role: e.role,
        phone: (e as { phone?: string }).phone ?? null,
        email: (e as { email?: string }).email ?? null,
        color: e.color,
        specialties: e.specialties,
        commissionRate: (e.commissionRate as unknown as string) ?? null,
        commissionFixed: (e as { commissionFixed?: string }).commissionFixed ?? null,
        isActive: true,
      })
      .onConflictDoNothing()
  }
  console.log('Seeded employees')

  const mappings: Array<{ employeeId: string; serviceId: string }> = [
    { employeeId: 'f822de0d-ca09-42dd-bea1-76b2ca334d7e', serviceId: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec' },
    { employeeId: 'f822de0d-ca09-42dd-bea1-76b2ca334d7e', serviceId: '0730db42-332f-46d9-851d-e036c66fb8d6' },
    { employeeId: 'f822de0d-ca09-42dd-bea1-76b2ca334d7e', serviceId: 'b06e02ba-d274-4c83-9f22-bfbc992b6f03' },
    { employeeId: 'f822de0d-ca09-42dd-bea1-76b2ca334d7e', serviceId: 'cf73968f-4475-463c-933c-1bc678ed1ee9' },
    { employeeId: 'f822de0d-ca09-42dd-bea1-76b2ca334d7e', serviceId: '48d9363a-a97b-49ce-b24a-db424141beea' },
    { employeeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', serviceId: '48d9363a-a97b-49ce-b24a-db424141beea' },
    { employeeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', serviceId: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec' },
    { employeeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', serviceId: '0730db42-332f-46d9-851d-e036c66fb8d6' },
    { employeeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', serviceId: 'cf73968f-4475-463c-933c-1bc678ed1ee9' },
    { employeeId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', serviceId: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec' },
    { employeeId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', serviceId: '0730db42-332f-46d9-851d-e036c66fb8d6' },
    { employeeId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', serviceId: 'b06e02ba-d274-4c83-9f22-bfbc992b6f03' },
    { employeeId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', serviceId: '48d9363a-a97b-49ce-b24a-db424141beea' },
  ]
  for (const m of mappings) {
    await db.insert(employeeServices).values(m).onConflictDoNothing()
  }
  console.log('Seeded employee_services')
}

async function seed() {
  console.log('Seeding Escudería 3FN...')
  const start = Date.now()
  await seedBusiness()
  await seedLocation()
  await seedBusinessHours()
  await seedServices()
  await seedEmployees()
  const elapsed = ((Date.now() - start) / 1000).toFixed(2)
  console.log(`Seed done in ${elapsed}s`)
  process.exit(0)
}

seed().catch((e) => {
  console.error(e)
  process.exit(1)
})
