/**
 * drizzle/seed-ultra.ts — Escudería ultra realistic ORM seed (2000 clients, 8000 appointments, 2426 transactions)
 * Pure Drizzle ORM, no SQL files. Deterministic seed 0.42, America/Bogota, batched inserts.
 * Usage: DATABASE_URL=... npx tsx drizzle/seed-ultra.ts
 * Also via npm run db:seed / db:seed:ultra
 */
import 'dotenv/config'
import { eq, sql, count } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  businesses,
  businessSettings,
  locations,
  businessHours,
  employees,
  services,
  serviceCategories,
  employeeServices,
  tags,
  inventoryItems,
  inventoryMovements,
  holidays,
  promotions,
  serviceCombos,
  memberships,
  clients,
  clientTags,
  loyaltyAccounts,
  loyaltyMovements,
  clientMemberships,
  recurringAppointments,
  appointments,
  transactions,
  transactionItems,
  tips,
  waitlist,
  cashRegisters,
  employeeUnavailability,
} from '@/drizzle/schema'

void businessHours
void transactionItems
void tips

// ─────────────────────────────────────────────
// Constants — fixed UUIDs matching SQL seeds
// ─────────────────────────────────────────────
const BID = '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95'
const OWNER_ID = 'b8f773b2-11e7-40d0-8f52-929b480d42b8'
const SECOND_OWNER_ID = 'ceccb7fb-36de-46ca-b539-573ce8421e5e'
const CENTRO_ID = '11111111-1111-1111-1111-111111111111'
const NORTE_ID = '22222222-2222-2222-2222-222222222222'

// ─────────────────────────────────────────────
// Deterministic RNG — mulberry32 seed 0.42
// ─────────────────────────────────────────────
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(Math.floor(0.42 * 4294967296)) // ~1803886264
const rnd = () => rng()
const rndInt = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min
void rndInt
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!
const shuffle = <T>(arr: T[]) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const tmp = a[i]!
    a[i] = a[j]!
    a[j] = tmp
  }
  return a
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const pad = (n: number, len: number) => String(n).padStart(len, '0')
const uuidFor = (prefix: string, idx: number) =>
  `${prefix}${pad(idx, 7)}-0000-4000-a000-${pad(idx, 12)}` as string
const invUuid = (idx: number) => `30000000-0000-4000-a000-${pad(idx, 12)}` as string
const holUuid = (idx: number) => `40000000-0000-4000-a000-${pad(idx, 12)}` as string

async function batchInsert<T extends Record<string, unknown>>(
  table: any,
  rows: T[],
  chunkSize = 500
) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    if (chunk.length) {
      // eslint-disable-next-line no-await-in-loop
      await db.insert(table).values(chunk as any).onConflictDoNothing()
    }
  }
}

async function getCount(table: any, businessId: string): Promise<number> {
  const res = await db
    .select({ cnt: count() })
    .from(table)
    .where(eq(table.businessId, businessId))
  // drizzle returns array with object
  // @ts-ignore
  return Number(res[0]?.cnt ?? 0)
}

// For tables without businessId (like tags, maybe)
async function getTotalCount(table: any): Promise<number> {
  const res = await db.select({ cnt: count() }).from(table)
  // @ts-ignore
  return Number(res[0]?.cnt ?? 0)
}

void getTotalCount

// ─────────────────────────────────────────────
// 0) Ensure auth.users (FK for businesses.owner_id)
// ─────────────────────────────────────────────
async function ensureAuthUsers() {
  // Insert via raw SQL into auth schema (bypassing drizzle public.users)
  // ON CONFLICT DO NOTHING for idempotency
  // We use db.execute with sql.raw
  const q1 = sql.raw(`
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous)
    VALUES ('00000000-0000-0000-0000-000000000000', '${OWNER_ID}', 'authenticated', 'authenticated', 'test@barber.local', '$2a$10$irT.ajxrLkYjZxzatHv3xuM4oqBR7hJCs7Cly4cH1BxuBR8.JZ15y', now(), '', NULL, '', NULL, '', '', NULL, NULL, '{"provider":"email","providers":["email"]}', '{}', false, now(), now(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false)
    ON CONFLICT (id) DO NOTHING
  `)
  const q2 = sql.raw(`
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous)
    VALUES ('00000000-0000-0000-0000-000000000000', '${SECOND_OWNER_ID}', 'authenticated', 'authenticated', 'zaidarellano21@gmail.com', '$2a$10$pBaWRRgqvGVzQHZpb2G0yOXqc9zzSxbByoQ3DiYWvUpgLE8GfgwfW', now(), '', NULL, '', NULL, '', '', NULL, NULL, '{"provider":"email","providers":["email"]}', '{}', false, now(), now(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false)
    ON CONFLICT (id) DO NOTHING
  `)
  try {
    await db.execute(q1)
    await db.execute(q2)
    console.log('Ensured auth.users (2)')
  } catch (e) {
    console.warn('auth.users ensure skipped (maybe no auth schema permission):', (e as Error).message)
  }
  // Also ensure public.users (for drizzle FK) — if table exists after drizzle push, FK will point there
  try {
    await db.execute(sql.raw(`INSERT INTO public.users (id) VALUES ('${OWNER_ID}') ON CONFLICT (id) DO NOTHING`))
    await db.execute(sql.raw(`INSERT INTO public.users (id) VALUES ('${SECOND_OWNER_ID}') ON CONFLICT (id) DO NOTHING`))
    console.log('Ensured public.users (2)')
  } catch (e) {
    // public.users may not exist after supabase reset (FK to auth.users) — ignore
    // console.debug('public.users ensure skipped', (e as Error).message)
  }
  // Ensure identities for auth.users (required for Supabase auth)
  try {
    const qi = sql.raw(`
      INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES ('test@barber.local', '${OWNER_ID}', '{"sub":"${OWNER_ID}","email":"test@barber.local"}', 'email', now(), now(), now())
      ON CONFLICT (provider, provider_id) DO NOTHING
    `)
    const qi2 = sql.raw(`
      INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES ('zaidarellano21@gmail.com', '${SECOND_OWNER_ID}', '{"sub":"${SECOND_OWNER_ID}","email":"zaidarellano21@gmail.com"}', 'email', now(), now(), now())
      ON CONFLICT (provider, provider_id) DO NOTHING
    `)
    await db.execute(qi)
    await db.execute(qi2)
  } catch {
    // ignore if identities table not present or permission
  }
}

// ─────────────────────────────────────────────
// 1) Business + Settings + Locations
// ─────────────────────────────────────────────
async function seedBusinessAndLocations() {
  // business
  const existing = await db.query.businesses.findFirst({ where: eq(businesses.slug, 'escuderia') })
  if (!existing) {
    await db
      .insert(businesses)
      .values({
        id: BID,
        ownerId: OWNER_ID,
        name: 'Escudería',
        slug: 'escuderia',
        type: 'barbershop',
        phone: '+57 300 123 4567',
        address: 'Colombia',
        timezone: 'America/Bogota',
        currency: 'COP',
        brandColor: '#0A0A0A',
      } as any)
      .onConflictDoNothing()
    console.log('Created business Escudería')
  } else {
    // ensure timezone/currency correct
    await db.execute(sql.raw(`UPDATE public.businesses SET timezone='America/Bogota', currency='COP', brand_color=COALESCE(brand_color,'#0A0A0A') WHERE id='${BID}'`))
    console.log('Business exists, updated timezone/currency')
  }

  await db
    .insert(businessSettings)
    .values({
      businessId: BID,
      timezone: 'America/Bogota',
      currency: 'COP',
      brandColor: '#0A0A0A',
      notificationLanguage: 'es',
      enabledModules: ['bookings', 'pos', 'crm', 'inventory', 'notifications'],
      paymentMethods: ['cash', 'card', 'transfer'],
      taxRate: '0',
      cancelLeadTime: 60,
      loyaltyEarnRate: 1000,
      loyaltyRedeemRate: 100,
      loyaltyRedeemValue: 10000,
    } as any)
    .onConflictDoNothing()

  // locations
  await db
    .insert(locations)
    .values({
      id: CENTRO_ID,
      businessId: BID,
      name: 'Escudería Centro',
      slug: 'centro',
      address: 'Cra 7 # 12-34, Bogotá',
      phone: '+57 300 123 4567',
      isActive: true,
    } as any)
    .onConflictDoNothing()
  await db
    .insert(locations)
    .values({
      id: NORTE_ID,
      businessId: BID,
      name: 'Escudería Norte',
      slug: 'norte',
      address: 'Cl 100 # 15-20, Bogotá',
      phone: '+57 301 987 6543',
      isActive: true,
    } as any)
    .onConflictDoNothing()
  // Handle unique(business_id, slug) conflict -> update via raw SQL
  try {
    await db.execute(
      sql.raw(
        `INSERT INTO public.locations (id, business_id, name, slug, address, phone, is_active) VALUES ('${CENTRO_ID}','${BID}','Escudería Centro','centro','Cra 7 # 12-34, Bogotá','+57 300 123 4567',true) ON CONFLICT (business_id, slug) DO UPDATE SET name=EXCLUDED.name, phone=EXCLUDED.phone, is_active=true`
      )
    )
    await db.execute(
      sql.raw(
        `INSERT INTO public.locations (id, business_id, name, slug, address, phone, is_active) VALUES ('${NORTE_ID}','${BID}','Escudería Norte','norte','Cl 100 # 15-20, Bogotá','+57 301 987 6543',true) ON CONFLICT (business_id, slug) DO UPDATE SET name=EXCLUDED.name, phone=EXCLUDED.phone, is_active=true`
      )
    )
  } catch {}
  console.log('Seeded locations (2)')
}

// ─────────────────────────────────────────────
// 2) Business hours — Mon-Sat 09-20 with break 13-14, Sun closed
// ─────────────────────────────────────────────
async function seedBusinessHours() {
  const hours = [
    { day: 1, open: true, openTime: '09:00', closeTime: '20:00', breakStart: '13:00', breakEnd: '14:00' },
    { day: 2, open: true, openTime: '09:00', closeTime: '20:00', breakStart: '13:00', breakEnd: '14:00' },
    { day: 3, open: true, openTime: '09:00', closeTime: '20:00', breakStart: '13:00', breakEnd: '14:00' },
    { day: 4, open: true, openTime: '09:00', closeTime: '20:00', breakStart: '13:00', breakEnd: '14:00' },
    { day: 5, open: true, openTime: '09:00', closeTime: '20:00', breakStart: '13:00', breakEnd: '14:00' },
    { day: 6, open: true, openTime: '09:00', closeTime: '20:00', breakStart: null, breakEnd: null },
    { day: 0, open: false, openTime: '09:00', closeTime: '20:00', breakStart: null, breakEnd: null },
  ]
  for (const h of hours) {
    // use raw SQL for upsert to handle unique(business_id, day_of_week)
    await db.execute(
      sql.raw(
        `INSERT INTO public.business_hours (business_id, day_of_week, is_open, open_time, close_time, break_start, break_end) VALUES ('${BID}', ${h.day}, ${h.open}, '${h.openTime}', '${h.closeTime}', ${h.breakStart ? `'${h.breakStart}'` : 'NULL'}, ${h.breakEnd ? `'${h.breakEnd}'` : 'NULL'}) ON CONFLICT (business_id, day_of_week) DO UPDATE SET is_open=EXCLUDED.is_open, open_time=EXCLUDED.open_time, close_time=EXCLUDED.close_time, break_start=EXCLUDED.break_start, break_end=EXCLUDED.break_end`
      )
    )
  }
  console.log('Seeded business_hours (7)')
}

// ─────────────────────────────────────────────
// 3) Employees — 10
// ─────────────────────────────────────────────
async function seedEmployees() {
  const emps = [
    { id: 'f822de0d-ca09-42dd-bea1-76b2ca334d7e', name: 'Escudería Owner', role: 'admin', phone: '+57 300 123 4567', email: 'test@barber.local', color: '#1a1a1a', specialties: ['corte', 'barba', 'combo'], commissionRate: '50.00', commissionFixed: null, locationId: CENTRO_ID },
    { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Ana Escudería', role: 'barbero', phone: null as any, email: null as any, color: '#ec4899', specialties: ['barba', 'cejas'], commissionRate: '50.00', commissionFixed: '10000.00', locationId: CENTRO_ID },
    { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Luis Escudería', role: 'barbero', phone: '+57 310 555 0101', email: 'luis@escuderia.com', color: '#0ea5e9', specialties: ['corte', 'combo', 'afeitado'], commissionRate: '45.00', commissionFixed: null, locationId: CENTRO_ID },
    { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', name: 'Miguel Escudería', role: 'barbero', phone: '+57 311 555 0102', email: 'miguel@escuderia.com', color: '#f59e0b', specialties: ['corte', 'barba', 'cejas'], commissionRate: '50.00', commissionFixed: null, locationId: NORTE_ID },
    { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', name: 'Sofía Morales', role: 'barbero', phone: '+57 312 444 0103', email: 'sofia@escuderia.com', color: '#a855f7', specialties: ['corte', 'color', 'cejas'], commissionRate: '48.00', commissionFixed: null, locationId: NORTE_ID },
    { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', name: 'Carlos Rivera', role: 'barbero', phone: '+57 313 555 0104', email: 'carlos@escuderia.com', color: '#14b8a6', specialties: ['corte', 'afeitado', 'combo'], commissionRate: '50.00', commissionFixed: null, locationId: CENTRO_ID },
    { id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', name: 'Diana Torres', role: 'staff', phone: '+57 314 666 0105', email: 'diana@escuderia.com', color: '#f43f5e', specialties: ['cejas', 'tratamiento'], commissionRate: '30.00', commissionFixed: '5000.00', locationId: CENTRO_ID },
    { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Jorge Herrera', role: 'barbero', phone: '+57 315 777 0106', email: 'jorge@escuderia.com', color: '#6366f1', specialties: ['barba', 'afeitado', 'corte'], commissionRate: '45.00', commissionFixed: null, locationId: NORTE_ID },
    { id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', name: 'Valentina Ríos', role: 'admin', phone: '+57 316 888 0107', email: 'valentina@escuderia.com', color: '#0a0a0a', specialties: ['corte', 'combo'], commissionRate: '50.00', commissionFixed: null, locationId: CENTRO_ID },
    { id: 'cccccccc-dddd-eeee-ffff-111111111111', name: 'Andrés Gómez', role: 'barbero', phone: '+57 317 999 0108', email: 'andres@escuderia.com', color: '#84cc16', specialties: ['corte', 'barba', 'color'], commissionRate: '42.00', commissionFixed: null, locationId: NORTE_ID },
  ]
  const rows = emps.map((e) => ({
    id: e.id,
    businessId: BID,
    name: e.name,
    role: e.role,
    phone: e.phone ?? null,
    email: e.email ?? null,
    color: e.color,
    specialties: e.specialties,
    commissionRate: e.commissionRate ?? null,
    commissionFixed: e.commissionFixed ?? null,
    isActive: true,
    locationId: e.locationId,
  }))
  await batchInsert(employees, rows as any)
  // ensure updates for existing ones (owner etc) via raw upsert
  for (const e of emps.slice(0, 4)) {
    await db.execute(
      sql.raw(
        `INSERT INTO public.employees (id, business_id, name, role, phone, email, color, specialties, commission_rate, commission_fixed, is_active, location_id) VALUES ('${e.id}','${BID}','${e.name}','${e.role}',${e.phone ? `'${e.phone}'` : 'NULL'},${e.email ? `'${e.email}'` : 'NULL'},'${e.color}','{${e.specialties.join(',')}}',${e.commissionRate},${e.commissionFixed ?? 'NULL'},true,'${e.locationId}') ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, role=EXCLUDED.role, location_id=COALESCE(employees.location_id, EXCLUDED.location_id)`
      )
    )
  }
  console.log('Seeded employees (10)')
}

// ─────────────────────────────────────────────
// 4) Service categories
// ─────────────────────────────────────────────
async function seedServiceCategories() {
  const cats = [
    { id: '10000000-0000-4000-a000-000000000001', name: 'corte' },
    { id: '10000000-0000-4000-a000-000000000002', name: 'barba' },
    { id: '10000000-0000-4000-a000-000000000003', name: 'combo' },
    { id: '10000000-0000-4000-a000-000000000004', name: 'afeitado' },
    { id: '10000000-0000-4000-a000-000000000005', name: 'cejas' },
    { id: '10000000-0000-4000-a000-000000000006', name: 'color' },
    { id: '10000000-0000-4000-a000-000000000007', name: 'tratamiento' },
  ]
  await batchInsert(serviceCategories, cats.map((c) => ({ id: c.id, businessId: BID, name: c.name })) as any)
  console.log('Seeded service_categories (7)')
}

// ─────────────────────────────────────────────
// 5) Services — 15
// ─────────────────────────────────────────────
async function seedServices() {
  const svc = [
    { id: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec', name: 'Corte Clásico', description: 'Corte moderno con acabado profesional', price: '30000', durationMin: 30, category: 'corte', color: '#0ea5e9', cost: '5000' },
    { id: '0730db42-332f-46d9-851d-e036c66fb8d6', name: 'Corte + Barba', description: 'Combo completo corte y barba con toalla caliente', price: '45000', durationMin: 50, category: 'combo', color: '#8b5cf6', cost: '7000' },
    { id: 'b06e02ba-d274-4c83-9f22-bfbc992b6f03', name: 'Barba y Perfilado', description: 'Afeitado y perfilado con navaja', price: '20000', durationMin: 20, category: 'barba', color: '#f59e0b', cost: '3000' },
    { id: 'cf73968f-4475-463c-933c-1bc678ed1ee9', name: 'Afeitado Clásico', description: 'Afeitado clásico con navaja y toalla caliente', price: '25000', durationMin: 30, category: 'afeitado', color: '#14b8a6', cost: '4000' },
    { id: '48d9363a-a97b-49ce-b24a-db424141beea', name: 'Diseño de Cejas', description: 'Perfilado y diseño de cejas', price: '15000', durationMin: 15, category: 'cejas', color: '#ec4899', cost: '2000' },
    { id: '11111111-aaaa-4000-a000-000000000001', name: 'Corte Fade', description: 'Degradado moderno con detalles', price: '35000', durationMin: 40, category: 'corte', color: '#3b82f6', cost: '6000' },
    { id: '11111111-aaaa-4000-a000-000000000002', name: 'Corte Infantil', description: 'Corte para niños con estilo', price: '25000', durationMin: 30, category: 'corte', color: '#10b981', cost: '4000' },
    { id: '11111111-aaaa-4000-a000-000000000003', name: 'Barba Premium', description: 'Arreglo barba + aceites + toalla', price: '30000', durationMin: 35, category: 'barba', color: '#f59e0b', cost: '5000' },
    { id: '11111111-aaaa-4000-a000-000000000004', name: 'Combo VIP', description: 'Corte + barba + cejas + bebida', price: '70000', durationMin: 75, category: 'combo', color: '#8b5cf6', cost: '12000' },
    { id: '11111111-aaaa-4000-a000-000000000005', name: 'Color Cabello', description: 'Tinte completo con matizado', price: '80000', durationMin: 90, category: 'color', color: '#ec4899', cost: '25000' },
    { id: '11111111-aaaa-4000-a000-000000000006', name: 'Mechas / Iluminación', description: 'Mechas con gorro o papel', price: '75000', durationMin: 85, category: 'color', color: '#a855f7', cost: '20000' },
    { id: '11111111-aaaa-4000-a000-000000000007', name: 'Tratamiento Capilar', description: 'Hidratación profunda + masaje', price: '60000', durationMin: 45, category: 'tratamiento', color: '#06b6d4', cost: '8000' },
    { id: '11111111-aaaa-4000-a000-000000000008', name: 'Afeitado Premium', description: 'Navaja + vapor + after shave', price: '28000', durationMin: 30, category: 'afeitado', color: '#14b8a6', cost: '4000' },
    { id: '11111111-aaaa-4000-a000-000000000009', name: 'Perfilado Cejas Pro', description: 'Diseño + perfilado + sombreado', price: '18000', durationMin: 20, category: 'cejas', color: '#ec4899', cost: '2500' },
    { id: '11111111-aaaa-4000-a000-00000000000a', name: 'Corte + Color', description: 'Combo corte degradado + color', price: '65000', durationMin: 60, category: 'combo', color: '#f43f5e', cost: '15000' },
  ]
  const rows = svc.map((s) => ({
    id: s.id,
    businessId: BID,
    name: s.name,
    description: s.description,
    price: s.price,
    durationMin: s.durationMin,
    category: s.category,
    isActive: true,
    capacity: 1,
    cost: s.cost,
    color: s.color,
    isFeatured: s.name === 'Corte Fade' || s.name === 'Combo VIP' || s.name === 'Corte + Color',
  }))
  await batchInsert(services, rows as any)
  // ensure colors for existing
  for (const s of svc.slice(0, 5)) {
    await db.execute(sql.raw(`UPDATE public.services SET color=COALESCE(color,'${s.color}'), category=COALESCE(category,'${s.category}') WHERE id='${s.id}'`))
  }
  console.log('Seeded services (15)')
}

// ─────────────────────────────────────────────
// 6) Employee ↔ Services
// ─────────────────────────────────────────────
async function seedEmployeeServices() {
  const mappings: Array<{ employeeId: string; serviceId: string }> = [
    { employeeId: 'f822de0d-ca09-42dd-bea1-76b2ca334d7e', serviceId: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec' },
    { employeeId: 'f822de0d-ca09-42dd-bea1-76b2ca334d7e', serviceId: '0730db42-332f-46d9-851d-e036c66fb8d6' },
    { employeeId: 'f822de0d-ca09-42dd-bea1-76b2ca334d7e', serviceId: 'b06e02ba-d274-4c83-9f22-bfbc992b6f03' },
    { employeeId: 'f822de0d-ca09-42dd-bea1-76b2ca334d7e', serviceId: 'cf73968f-4475-463c-933c-1bc678ed1ee9' },
    { employeeId: 'f822de0d-ca09-42dd-bea1-76b2ca334d7e', serviceId: '48d9363a-a97b-49ce-b24a-db424141beea' },
    { employeeId: 'f822de0d-ca09-42dd-bea1-76b2ca334d7e', serviceId: '11111111-aaaa-4000-a000-000000000004' },
    { employeeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', serviceId: '48d9363a-a97b-49ce-b24a-db424141beea' },
    { employeeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', serviceId: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec' },
    { employeeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', serviceId: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec' },
    { employeeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', serviceId: '0730db42-332f-46d9-851d-e036c66fb8d6' },
    { employeeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', serviceId: 'cf73968f-4475-463c-933c-1bc678ed1ee9' },
    { employeeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', serviceId: 'b06e02ba-d274-4c83-9f22-bfbc992b6f03' },
    { employeeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', serviceId: '11111111-aaaa-4000-a000-000000000001' },
    { employeeId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', serviceId: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec' },
    { employeeId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', serviceId: '0730db42-332f-46d9-851d-e036c66fb8d6' },
    { employeeId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', serviceId: 'b06e02ba-d274-4c83-9f22-bfbc992b6f03' },
    { employeeId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', serviceId: '48d9363a-a97b-49ce-b24a-db424141beea' },
    { employeeId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', serviceId: '11111111-aaaa-4000-a000-000000000003' },
    { employeeId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', serviceId: '11111111-aaaa-4000-a000-000000000001' },
    { employeeId: 'dddddddd-dddd-dddd-dddd-dddddddddddd', serviceId: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec' },
    { employeeId: 'dddddddd-dddd-dddd-dddd-dddddddddddd', serviceId: '48d9363a-a97b-49ce-b24a-db424141beea' },
    { employeeId: 'dddddddd-dddd-dddd-dddd-dddddddddddd', serviceId: '11111111-aaaa-4000-a000-000000000005' },
    { employeeId: 'dddddddd-dddd-dddd-dddd-dddddddddddd', serviceId: '11111111-aaaa-4000-a000-000000000006' },
    { employeeId: 'dddddddd-dddd-dddd-dddd-dddddddddddd', serviceId: '11111111-aaaa-4000-a000-000000000009' },
    { employeeId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', serviceId: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec' },
    { employeeId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', serviceId: '0730db42-332f-46d9-851d-e036c66fb8d6' },
    { employeeId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', serviceId: 'cf73968f-4475-463c-933c-1bc678ed1ee9' },
    { employeeId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', serviceId: '11111111-aaaa-4000-a000-000000000001' },
    { employeeId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', serviceId: '11111111-aaaa-4000-a000-000000000008' },
    { employeeId: 'ffffffff-ffff-ffff-ffff-ffffffffffff', serviceId: '48d9363a-a97b-49ce-b24a-db424141beea' },
    { employeeId: 'ffffffff-ffff-ffff-ffff-ffffffffffff', serviceId: '11111111-aaaa-4000-a000-000000000007' },
    { employeeId: 'ffffffff-ffff-ffff-ffff-ffffffffffff', serviceId: '11111111-aaaa-4000-a000-000000000009' },
    { employeeId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', serviceId: 'b06e02ba-d274-4c83-9f22-bfbc992b6f03' },
    { employeeId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', serviceId: 'cf73968f-4475-463c-933c-1bc678ed1ee9' },
    { employeeId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', serviceId: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec' },
    { employeeId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', serviceId: '11111111-aaaa-4000-a000-000000000003' },
    { employeeId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', serviceId: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec' },
    { employeeId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', serviceId: '0730db42-332f-46d9-851d-e036c66fb8d6' },
    { employeeId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', serviceId: '11111111-aaaa-4000-a000-000000000004' },
    { employeeId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', serviceId: '11111111-aaaa-4000-a000-00000000000a' },
    { employeeId: 'cccccccc-dddd-eeee-ffff-111111111111', serviceId: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec' },
    { employeeId: 'cccccccc-dddd-eeee-ffff-111111111111', serviceId: 'b06e02ba-d274-4c83-9f22-bfbc992b6f03' },
    { employeeId: 'cccccccc-dddd-eeee-ffff-111111111111', serviceId: '11111111-aaaa-4000-a000-000000000005' },
    { employeeId: 'cccccccc-dddd-eeee-ffff-111111111111', serviceId: '11111111-aaaa-4000-a000-000000000001' },
  ]
  await batchInsert(employeeServices, mappings as any)
  console.log('Seeded employee_services')
}

// ─────────────────────────────────────────────
// 7) Tags
// ─────────────────────────────────────────────
async function seedTags() {
  const tgs = [
    { id: '20000000-0000-4000-a000-000000000001', name: 'vip' },
    { id: '20000000-0000-4000-a000-000000000002', name: 'frecuente' },
    { id: '20000000-0000-4000-a000-000000000003', name: 'nuevo' },
    { id: '20000000-0000-4000-a000-000000000004', name: 'moroso' },
    { id: '20000000-0000-4000-a000-000000000005', name: 'cumpleañero' },
    { id: '20000000-0000-4000-a000-000000000006', name: 'barba' },
    { id: '20000000-0000-4000-a000-000000000007', name: 'color' },
  ]
  await batchInsert(tags, tgs as any)
  // handle onConflict name unique
  for (const t of tgs) {
    await db.execute(sql.raw(`INSERT INTO public.tags (id, name) VALUES ('${t.id}','${t.name}') ON CONFLICT (name) DO NOTHING`))
  }
  console.log('Seeded tags (7)')
}

// ─────────────────────────────────────────────
// 8) Inventory — 100 items (SQL had 50, we expand to 100 for ultra)
// ─────────────────────────────────────────────
async function seedInventory() {
  const cnt = await getCount(inventoryItems, BID)
  if (cnt >= 80) {
    console.log(`Inventory already ${cnt}, skipping`)
    return
  }
  const baseProducts: Array<[number, string, string, string]> = [
    [1, 'Máquina Wahl Cordless', 'herramientas', 'pcs'],
    [2, 'Tijera Profesional 6"', 'herramientas', 'pcs'],
    [3, 'Capa de Corte Negra', 'herramientas', 'pcs'],
    [4, 'Navaja Clásica', 'herramientas', 'pcs'],
    [5, 'Peine Carbono', 'herramientas', 'pcs'],
    [6, 'Cera Mate Extra Fuerte', 'producto', 'pcs'],
    [7, 'Pomada Brillante', 'producto', 'pcs'],
    [8, 'Gel Fijador', 'producto', 'pcs'],
    [9, 'Aceite para Barba', 'barba', 'ml'],
    [10, 'Bálsamo After Shave', 'barba', 'ml'],
    [11, 'Espuma Afeitado', 'barba', 'ml'],
    [12, 'Tónico Capilar', 'tratamiento', 'ml'],
    [13, 'Shampoo Anticaspa', 'tratamiento', 'ml'],
    [14, 'Acondicionador Hidratante', 'tratamiento', 'ml'],
    [15, 'Tinte Negro 60ml', 'color', 'pcs'],
    [16, 'Tinte Castaño 60ml', 'color', 'pcs'],
    [17, 'Decolorante 500g', 'color', 'pcs'],
    [18, 'Papel Aluminio Rollo', 'color', 'pcs'],
    [19, 'Guantes Nitrilo M', 'herramientas', 'box'],
    [20, 'Cepillo Fade', 'herramientas', 'pcs'],
    [21, 'Secador Profesional', 'herramientas', 'pcs'],
    [22, 'Plancha Mini', 'herramientas', 'pcs'],
    [23, 'Loción Astringente', 'barba', 'ml'],
    [24, 'Crema Hidratante', 'tratamiento', 'ml'],
    [25, 'Serum Reparador', 'tratamiento', 'ml'],
    [26, 'Cuchillas Repuesto x10', 'herramientas', 'box'],
    [27, 'Toallas Desechables', 'herramientas', 'pack'],
    [28, 'Pulverizador', 'herramientas', 'pcs'],
    [29, 'Brocha Barba', 'barba', 'pcs'],
    [30, 'Bowl Acero', 'barba', 'pcs'],
    [31, 'Shampoo Matizador', 'color', 'ml'],
    [32, 'Oxigenada 20vol', 'color', 'ml'],
    [33, 'Oxigenada 30vol', 'color', 'ml'],
    [34, 'Mascarilla Capilar', 'tratamiento', 'ml'],
    [35, 'Cera en Barra', 'producto', 'pcs'],
    [36, 'Fijador Spray', 'producto', 'ml'],
    [37, 'Polvo Texturizador', 'producto', 'pcs'],
    [38, 'Toalla Caliente Pack', 'tratamiento', 'pack'],
    [39, 'Desinfectante Jarra', 'herramientas', 'ml'],
    [40, 'Barbicide 500ml', 'herramientas', 'ml'],
    [41, 'Peinilla Cola', 'herramientas', 'pcs'],
    [42, 'Rizador', 'herramientas', 'pcs'],
    [43, 'Tinte Rubio 60ml', 'color', 'pcs'],
    [44, 'Tinte Gris Plata', 'color', 'pcs'],
    [45, 'Borlas Algodón', 'herramientas', 'pack'],
    [46, 'Espejo Mano', 'herramientas', 'pcs'],
    [47, 'Silla Hidráulica Repuesto', 'herramientas', 'pcs'],
    [48, 'Aceite Máquina', 'herramientas', 'ml'],
    [49, 'Loción Mentolada', 'barba', 'ml'],
    [50, 'Exfoliante Facial', 'tratamiento', 'ml'],
  ]
  const total = 100
  const rows: any[] = []
  for (let gs = 1; gs <= total; gs++) {
    const baseIdx = ((gs - 1) % 50)
    const base = baseProducts[baseIdx]
    if (!base) continue
    const suffix = gs > 50 ? ` ${Math.ceil(gs / 50)}` : ''
    const name = base[1]! + suffix
    const cat = base[2]!
    const unit = base[3]!
    const qty = gs % 7 === 0 ? 1 + Math.floor(rnd() * 3) : gs % 5 === 0 ? 5 + Math.floor(rnd() * 6) : 15 + Math.floor(rnd() * 26)
    const low = cat === 'herramientas' ? 2 : cat === 'color' ? 8 : 5
    const cost = String(3000 + Math.floor(rnd() * 20000))
    const sell = String(8000 + Math.floor(rnd() * 35000))
    const loc = gs % 2 === 0 ? CENTRO_ID : NORTE_ID
    rows.push({
      id: invUuid(gs),
      businessId: BID,
      name,
      sku: `SKU-${pad(gs, 5)}`,
      category: cat,
      unit,
      quantity: String(qty),
      lowStockThreshold: String(low),
      costPrice: cost,
      sellPrice: sell,
      locationId: loc,
      description: name + ' profesional para barbería',
      barcode: `770${pad(100000000 + gs * 37, 10)}`,
    })
  }
  await batchInsert(inventoryItems, rows)
  // movements
  const invIds = rows.map((r) => r.id)
  const movIn = invIds.map((id, i) => ({
    businessId: BID,
    itemId: id,
    type: 'in' as const,
    quantity: rows[i].quantity,
    note: 'Stock inicial seed-ultra ORM',
  }))
  await batchInsert(inventoryMovements, movIn as any)
  const movOut = invIds
    .filter(() => rnd() < 0.35)
    .map((id) => ({
      businessId: BID,
      itemId: id,
      type: 'out' as const,
      quantity: String(1 + Math.floor(rnd() * 3)),
      note: 'Consumo simulado mes',
    }))
  if (movOut.length) await batchInsert(inventoryMovements, movOut as any)
  const prodBarbaIds = rows.filter((r) => r.category === 'producto' || r.category === 'barba').slice(0, 6).map((r) => r.id)
  const movTrans = prodBarbaIds.map((id) => ({
    businessId: BID,
    itemId: id,
    type: 'transfer' as const,
    quantity: '2',
    note: 'Transfer Centro → Norte',
    fromLocationId: CENTRO_ID,
    toLocationId: NORTE_ID,
  }))
  if (movTrans.length) await batchInsert(inventoryMovements, movTrans as any)
  console.log(`Seeded inventory_items (${total}) + movements`)
}

// ─────────────────────────────────────────────
// 9) Holidays 2026 Colombia — 18
// ─────────────────────────────────────────────
async function seedHolidays() {
  const hols = [
    ['2026-01-01', 'Año Nuevo'],
    ['2026-01-12', 'Reyes Magos (trasladado)'],
    ['2026-03-23', 'San José (trasladado)'],
    ['2026-04-02', 'Jueves Santo'],
    ['2026-04-03', 'Viernes Santo'],
    ['2026-05-01', 'Día del Trabajo'],
    ['2026-05-18', 'Ascensión (trasladado)'],
    ['2026-06-08', 'Corpus Christi (trasladado)'],
    ['2026-06-15', 'Sagrado Corazón (trasladado)'],
    ['2026-06-29', 'San Pedro y San Pablo'],
    ['2026-07-20', 'Grito de Independencia'],
    ['2026-08-07', 'Batalla de Boyacá'],
    ['2026-08-17', 'Asunción (trasladado)'],
    ['2026-10-12', 'Día de la Raza (trasladado)'],
    ['2026-11-02', 'Todos los Santos (trasladado)'],
    ['2026-11-16', 'Independencia de Cartagena (trasladado)'],
    ['2026-12-08', 'Inmaculada Concepción'],
    ['2026-12-25', 'Navidad'],
  ]
  const rows = hols.map((h, i) => ({
    id: holUuid(i + 1),
    businessId: BID,
    locationId: null,
    date: h[0],
    reason: h[1],
    isOpen: false,
  }))
  await batchInsert(holidays, rows as any)
  console.log('Seeded holidays (18)')
}

// ─────────────────────────────────────────────
// 10) Promotions & Combos & Memberships
// ─────────────────────────────────────────────
async function seedPromotionsAndMemberships() {
  const promos = [
    { id: '50000000-0000-4000-a000-000000000001', name: 'Descuento Bienvenida 10%', type: 'percent', value: '10', promoCode: 'BIENVENIDA10', validFrom: new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString(), validTo: new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString(), isActive: true, rules: { min_amount: 20000 } },
    { id: '50000000-0000-4000-a000-000000000002', name: 'Combo Lunes 15%', type: 'percent', value: '15', promoCode: 'LUNES15', validFrom: new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString(), validTo: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(), isActive: true, rules: { weekday: 1 } },
    { id: '50000000-0000-4000-a000-000000000003', name: '$5k Off Barba', type: 'fixed', value: '5000', promoCode: 'BARBA5K', validFrom: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(), validTo: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(), isActive: true, rules: { category: 'barba' } },
  ]
  await batchInsert(promotions, promos.map((p) => ({ id: p.id, businessId: BID, name: p.name, type: p.type, value: p.value, promoCode: p.promoCode, validFrom: p.validFrom, validTo: p.validTo, isActive: p.isActive, rules: p.rules })) as any)
  // verano 20% without fixed id
  await db.execute(
    sql.raw(
      `INSERT INTO public.promotions (business_id, name, type, value, promo_code, valid_from, valid_to, is_active) VALUES ('${BID}','Verano 20%','percent',20,'VERANO20', now() - interval '1 month', now() + interval '2 months', true) ON CONFLICT (business_id, promo_code) DO NOTHING`
    )
  )
  const combos = [
    { id: '60000000-0000-4000-a000-000000000001', name: 'Combo Corte+Barba Ahorro', serviceIds: ['683dbb3c-6b10-4c85-b3b2-87fdb500ddec', 'b06e02ba-d274-4c83-9f22-bfbc992b6f03'], price: 40000, durationMin: 50 },
    { id: '60000000-0000-4000-a000-000000000002', name: 'Pack Mensual 4 Cortes', serviceIds: ['683dbb3c-6b10-4c85-b3b2-87fdb500ddec'], price: 100000, durationMin: 120 },
  ]
  await batchInsert(serviceCombos, combos.map((c) => ({ id: c.id, businessId: BID, name: c.name, serviceIds: c.serviceIds, price: c.price, durationMin: c.durationMin, isActive: true })) as any)
  const mems = [
    { id: '70000000-0000-4000-a000-000000000001', name: 'Membresía Mensual 8 Cortes', price: 90000, durationDays: 30, benefits: { services: 4, discount_percent: 10 } },
    { id: '70000000-0000-4000-a000-000000000002', name: 'Membresía Trimestral VIP', price: 240000, durationDays: 90, benefits: { services: 12, discount_percent: 15 } },
  ]
  await batchInsert(memberships, mems.map((m) => ({ id: m.id, businessId: BID, name: m.name, price: m.price, durationDays: m.durationDays, benefits: m.benefits, isActive: true })) as any)
  console.log('Seeded promotions/combos/memberships')
}

// ─────────────────────────────────────────────
// 11) Clients — 2000
// ─────────────────────────────────────────────
const firstNames = ['Juan','Carlos','Luis','Andrés','Felipe','Jorge','Miguel','Santiago','Daniel','Alejandro','David','Mateo','Sebastián','Samuel','Nicolás','Juan Pablo','Camilo','Diego','Oscar','Fernando','Sofía','Valentina','Mariana','Gabriela','Camila','Daniela','Alejandra','Natalia','Laura','Paula','Ana','María','Sara','Juliana','Isabella','Lucía','Manuela','Carolina','Andrea','Diana']
const lastNames = ['García','Rodríguez','Martínez','López','González','Pérez','Sánchez','Ramírez','Torres','Rivera','Gómez','Díaz','Reyes','Morales','Cruz','Herrera','Jiménez','Mendoza','Vargas','Ortega','Silva','Rojas','Muñoz','Álvarez','Romero','Suárez','Castillo','Marín','Moreno','Ramos']
async function seedClients() {
  const cnt = await getCount(clients, BID)
  if (cnt >= 1500) {
    console.log(`Clients already ${cnt}, skipping`)
    return
  }
  const rows: any[] = []
  for (let gs = 1; gs <= 2000; gs++) {
    const first = firstNames[(gs * 7) % 40]
    const last = lastNames[(gs * 13) % 30]
    const second = gs % 3 === 0 ? lastNames[(gs * 11) % 10] : ''
    const name = `${first} ${last}${second ? ' ' + second : ''}`.trim()
    const phone = `+57 3${pad((100000000 + gs * 97) % 1000000000, 9)}`
    const email = gs % 7 !== 0 ? `cliente${gs}@escuderia.test` : null
    let tagsArr: string[]
    if (gs % 20 === 0) tagsArr = ['vip', 'frecuente']
    else if (gs % 10 === 0) tagsArr = ['vip']
    else if (gs % 7 === 0) tagsArr = ['frecuente']
    else if (gs % 13 === 0) tagsArr = ['nuevo']
    else if (gs % 17 === 0) tagsArr = ['barba']
    else if (gs % 19 === 0) tagsArr = ['color']
    else tagsArr = ['nuevo']
    const birthday = gs % 10 === 0 ? null : (() => {
      const base = new Date('1990-01-01')
      base.setDate(base.getDate() + ((gs * 37) % 13000))
      return base.toISOString().slice(0, 10)
    })()
    let notes: string | null = null
    if (gs % 25 === 0) notes = 'Prefiere barbero Luis. Alergia a fragancia.'
    else if (gs % 33 === 0) notes = 'Cliente exigente, puntual.'
    else if (gs % 50 === 0) notes = 'VIP — cortesía bebida'
    const whatsapp = gs % 4 !== 0 ? phone : null
    const createdAt = new Date(Date.now() - Math.floor(rnd() * 365) * 24 * 3600 * 1000 - Math.floor(rnd() * 11) * 3600 * 1000).toISOString()
    const locationId = gs % 2 === 0 ? CENTRO_ID : NORTE_ID
    rows.push({
      id: uuidFor('c', gs),
      businessId: BID,
      name,
      phone,
      email,
      tags: tagsArr,
      birthday,
      notes,
      whatsappNumber: whatsapp,
      createdAt,
      locationId,
      totalVisits: 0,
      totalSpent: '0',
      lastVisitAt: null,
    })
  }
  await batchInsert(clients, rows)
  console.log('Seeded clients (2000)')

  // client_tags M2M
  const vipTagId = '20000000-0000-4000-a000-000000000001'
  const freqTagId = '20000000-0000-4000-a000-000000000002'
  // need to insert after clients exist, query clients with tags
  // Instead of DB query, we can derive from rows
  const vipRows = rows.filter((r) => r.tags.includes('vip')).map((r) => ({ clientId: r.id, tagId: vipTagId }))
  const freqRows = rows.filter((r) => r.tags.includes('frecuente')).map((r) => ({ clientId: r.id, tagId: freqTagId }))
  await batchInsert(clientTags, [...vipRows, ...freqRows] as any)
  console.log('Seeded client_tags')
}

// ─────────────────────────────────────────────
// 12) Loyalty
// ─────────────────────────────────────────────
async function seedLoyalty(allClientIds: string[]) {
  const cnt = await getCount(loyaltyAccounts, BID)
  if (cnt >= 500) {
    console.log(`Loyalty already ${cnt}, skipping`)
    return
  }
  // pick 300 random clients
  const shuffled = shuffle(allClientIds)
  const chosen = shuffled.slice(0, 300)
  const accRows = chosen.map((id) => ({ clientId: id, businessId: BID, points: Math.floor(rnd() * 800) }))
  // filter out 0 points? SQL did where points <>0 for movements but accounts with 0 still inserted? We keep as is but movements filter.
  await batchInsert(loyaltyAccounts, accRows.filter((r) => r.points > 0) as any) // avoid 0 to avoid violation? but 0 allowed check points>=0, but loyalty_movements requires points<>0
  // also insert zero points accounts? Insert all but movements only for >0
  const zeroRows = accRows.filter((r) => r.points === 0)
  if (zeroRows.length) await batchInsert(loyaltyAccounts, zeroRows as any)

  const earnRows = accRows
    .filter((r) => r.points > 0)
    .map((r) => ({ businessId: BID, clientId: r.clientId, type: 'earn' as const, points: r.points, reference: `seed earn ${r.clientId}` }))
  await batchInsert(loyaltyMovements, earnRows as any)

  const redeemCandidates = accRows.filter((r) => r.points > 200)
  const redeemChosen = shuffle(redeemCandidates).slice(0, 80)
  const redeemRows = redeemChosen.map((r) => ({ businessId: BID, clientId: r.clientId, type: 'redeem' as const, points: -(50 + Math.floor(rnd() * 100)), reference: 'seed redeem' }))
  if (redeemRows.length) await batchInsert(loyaltyMovements, redeemRows as any)
  console.log('Seeded loyalty')
}

// ─────────────────────────────────────────────
// 13) Client memberships
// ─────────────────────────────────────────────
async function seedClientMemberships(allClientIds: string[]) {
  const cnt = await getCount(clientMemberships, BID)
  if (cnt >= 80) {
    console.log(`Client memberships already ${cnt}, skipping`)
    return
  }
  const mem1 = '70000000-0000-4000-a000-000000000001'
  const mem2 = '70000000-0000-4000-a000-000000000002'
  const chosen = shuffle(allClientIds).slice(0, 80)
  const rows = chosen.map((id, idx) => {
    const gs = idx + 1
    const membershipId = gs % 3 === 0 ? mem2 : mem1
    const startsAt = new Date(Date.now() - (gs % 60) * 24 * 3600 * 1000).toISOString()
    const expiresAt = new Date(Date.now() + (30 + (gs % 60)) * 24 * 3600 * 1000).toISOString()
    const remaining = Math.floor(rnd() * 6) + 1
    let status: string
    if (gs % 7 === 0) status = 'expired'
    else if (gs % 11 === 0) status = 'cancelled'
    else status = 'active'
    return { businessId: BID, clientId: id, membershipId, startsAt, expiresAt, remaining, status }
  })
  await batchInsert(clientMemberships, rows as any)
  console.log('Seeded client_memberships (80)')
}

// ─────────────────────────────────────────────
// 14) Recurring appointments
// ─────────────────────────────────────────────
async function seedRecurring(allClientIds: string[]) {
  const cnt = await getCount(recurringAppointments, BID)
  if (cnt >= 10) {
    console.log(`Recurring already ${cnt}, skipping`)
    return
  }
  const svcId = '683dbb3c-6b10-4c85-b3b2-87fdb500ddec'
  const empId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  const chosen = shuffle(allClientIds).slice(0, 15)
  const rows = chosen.map((id, idx) => {
    const gs = idx + 1
    const loc = gs % 2 === 0 ? CENTRO_ID : NORTE_ID
    return {
      businessId: BID,
      locationId: loc,
      clientId: id,
      serviceId: svcId,
      employeeId: empId,
      rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=8',
      nextAt: new Date(Date.now() + gs * 24 * 3600 * 1000).toISOString(),
      until: new Date(Date.now() + (60 + gs * 3) * 24 * 3600 * 1000).toISOString(),
      isActive: gs % 5 !== 0,
    }
  })
  await batchInsert(recurringAppointments, rows as any)
  console.log('Seeded recurring_appointments (15)')
}

// ─────────────────────────────────────────────
// 15) Appointments — 8000 (America/Bogota, Mon-Sat, breaks, holidays, overlap)
// ─────────────────────────────────────────────
type Svc = { id: string; price: string; durationMin: number; name: string }

async function seedAppointments(allClientIds: string[], allServices: Svc[], empServiceMap: Map<string, string[]>, allEmps: string[], holidaySet: Set<string>) {
  const cnt = await getCount(appointments, BID)
  if (cnt >= 6000) {
    console.log(`Appointments already ${cnt}, skipping`)
    return
  }
  // Disable triggers that block past bookings / FSM
  try {
    await db.execute(sql.raw(`ALTER TABLE public.appointments DISABLE TRIGGER USER`))
  } catch {}
  // Build unavailability map from DB (if any existing) + our 3 future blocks
  const unavail: Array<{ employeeId: string; startsAt: number; endsAt: number }> = []
  // Add the 3 seed unavailabilities that will be inserted later? For overlap check, we need them now
  // We'll add them now and insert later, but check against them
  const nowMs = Date.now()
  unavail.push(
    { employeeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', startsAt: nowMs + 10 * 24 * 3600 * 1000, endsAt: nowMs + 12 * 24 * 3600 * 1000 },
    { employeeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', startsAt: nowMs - 20 * 24 * 3600 * 1000, endsAt: nowMs - 19 * 24 * 3600 * 1000 },
    { employeeId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', startsAt: nowMs + 3 * 24 * 3600 * 1000 + 9 * 3600 * 1000, endsAt: nowMs + 3 * 24 * 3600 * 1000 + 13 * 3600 * 1000 }
  )
  // Load existing appointments to avoid overlap with them if re-run? Query existing intervals
  let existingIntervals: Map<string, Array<{ start: number; end: number }>> = new Map()
  try {
    const existing = await db.select({ employeeId: appointments.employeeId, startsAt: appointments.startsAt, endsAt: appointments.endsAt, status: appointments.status }).from(appointments).where(eq(appointments.businessId, BID))
    for (const row of existing as any[]) {
      if (!row.employeeId) continue
      if (row.status === 'cancelled' || row.status === 'no_show') continue
      const s = new Date(row.startsAt).getTime()
      const e = new Date(row.endsAt).getTime()
      if (!existingIntervals.has(row.employeeId)) existingIntervals.set(row.employeeId, [])
      existingIntervals.get(row.employeeId)!.push({ start: s, end: e })
    }
  } catch {}
  // Also track intervals for new appointments we generate
  const newIntervals: Map<string, Array<{ start: number; end: number }>> = new Map()
  const getIntervals = (empId: string) => {
    return [...(existingIntervals.get(empId) || []), ...(newIntervals.get(empId) || [])]
  }
  const rows: any[] = []
  const now = new Date()
  const nowMinus2Days = new Date(now.getTime() - 2 * 24 * 3600 * 1000)

  const holidayArray = Array.from(holidaySet) // for quick check
  void holidayArray

  for (let gs = 1; gs <= 8000; gs++) {
    const svc = pick(allServices)
    const clientId = pick(allClientIds)
    // employee qualified
    let empCandidates = empServiceMap.get(svc.id) || []
    if (empCandidates.length === 0) empCandidates = allEmps
    let empId = pick(empCandidates)
    let locId = rnd() < 0.62 ? CENTRO_ID : NORTE_ID

    // Generate local date Mon-Sat not holiday (try 10)
    let localDateStr = ''
    let dow = 0
    for (let attempt = 0; attempt < 10; attempt++) {
      const daysAgo = Math.floor(rnd() * 360)
      // Bogota now
      const bogotaNow = new Date(Date.now() - 5 * 3600 * 1000)
      const target = new Date(bogotaNow)
      target.setUTCDate(target.getUTCDate() - daysAgo)
      const str = target.toISOString().slice(0, 10)
      const d = new Date(str + 'T12:00:00Z')
      const w = d.getUTCDay()
      if (w !== 0 && !holidaySet.has(str)) {
        localDateStr = str
        dow = w
        break
      }
      // try again
      localDateStr = str
      dow = w
    }
    if (dow === 0 || holidaySet.has(localDateStr)) {
      // force monday
      const d = new Date(localDateStr)
      d.setUTCDate(d.getUTCDate() + 1)
      localDateStr = d.toISOString().slice(0, 10)
      dow = 1
    }
    // compute slot respecting break
    let startMin = 540 // 09:00
    if (dow >= 1 && dow <= 5) {
      if (rnd() < 0.4) {
        const steps = Math.max(0, Math.floor((240 - svc.durationMin) / 15))
        const offset = Math.floor(rnd() * (steps + 1)) * 15
        startMin = 540 + offset
      } else {
        const steps = Math.max(0, Math.floor((360 - svc.durationMin) / 15))
        const offset = Math.floor(rnd() * (steps + 1)) * 15
        startMin = 840 + offset
      }
    } else {
      const steps = Math.max(0, Math.floor((660 - svc.durationMin) / 15))
      const offset = Math.floor(rnd() * (steps + 1)) * 15
      startMin = 540 + offset
    }
    const [y, m, d] = localDateStr.split('-').map(Number)
    if (y === undefined || m === undefined || d === undefined) continue
    let startAt = new Date(Date.UTC(y, m - 1, d, Math.floor(startMin / 60) + 5, startMin % 60))
    let endAt = new Date(startAt.getTime() + svc.durationMin * 60000)
    const r = rnd()
    let status: string
    if (startAt < nowMinus2Days) {
      if (r < 0.55) status = 'completed'
      else if (r < 0.7) status = 'paid'
      else if (r < 0.82) status = 'cancelled'
      else if (r < 0.88) status = 'no_show'
      else if (r < 0.93) status = 'confirmed'
      else status = 'pending'
    } else if (startAt < now) {
      if (r < 0.7) status = 'completed'
      else if (r < 0.85) status = 'paid'
      else status = 'no_show'
    } else {
      if (r < 0.45) status = 'confirmed'
      else if (r < 0.75) status = 'scheduled'
      else if (r < 0.9) status = 'pending'
      else status = 'cancelled'
    }

    // overlap check (3 attempts)
    let ok = false
    let attempts = 0
    for (attempts = 0; attempts < 3; attempts++) {
      const intervals = getIntervals(empId)
      const isOverlap = intervals.some((iv) => startAt.getTime() < iv.end && endAt.getTime() > iv.start)
      const isUnavail = unavail.some((u) => u.employeeId === empId && startAt.getTime() < u.endsAt && endAt.getTime() > u.startsAt)
      if (!isOverlap && !isUnavail) {
        ok = true
        break
      }
      // retry: pick new employee and recompute time within same day
      empCandidates = empServiceMap.get(svc.id) || allEmps
      empId = pick(empCandidates)
      // recompute offset same day respecting break
      if (dow >= 1 && dow <= 5) {
        if (rnd() < 0.4) {
          const steps = Math.max(0, Math.floor((240 - svc.durationMin) / 15))
          const offset = Math.floor(rnd() * (steps + 1)) * 15
          startMin = 540 + offset
        } else {
          const steps = Math.max(0, Math.floor((360 - svc.durationMin) / 15))
          const offset = Math.floor(rnd() * (steps + 1)) * 15
          startMin = 840 + offset
        }
      } else {
        const steps = Math.max(0, Math.floor((660 - svc.durationMin) / 15))
        const offset = Math.floor(rnd() * (steps + 1)) * 15
        startMin = 540 + offset
      }
      startAt = new Date(Date.UTC(y, m - 1, d, Math.floor(startMin / 60) + 5, startMin % 60))
      endAt = new Date(startAt.getTime() + svc.durationMin * 60000)
    }
    if (!ok) status = 'cancelled'

    // track interval if not cancelled/no_show
    if (status !== 'cancelled' && status !== 'no_show') {
      if (!newIntervals.has(empId)) newIntervals.set(empId, [])
      newIntervals.get(empId)!.push({ start: startAt.getTime(), end: endAt.getTime() })
    }

    const price = svc.price
    let notes: string | null = null
    if (gs % 47 === 0) notes = 'Cliente pide barbero específico'
    else if (gs % 97 === 0) notes = 'Cita recurrente'
    const source = pick(['manual', 'online', 'telegram', 'viber'])
    const createdAt = new Date(startAt.getTime() - 24 * 3600 * 1000 + Math.floor(rnd() * 12) * 3600 * 1000).toISOString()
    rows.push({
      id: uuidFor('a', gs),
      businessId: BID,
      clientId,
      employeeId: empId,
      serviceId: svc.id,
      locationId: locId,
      startsAt: startAt.toISOString(),
      endsAt: endAt.toISOString(),
      status,
      price,
      notes,
      source,
      recurringId: null,
      createdAt,
      updatedAt: startAt.toISOString(),
    })
  }

  // batch insert
  await batchInsert(appointments, rows)

  // vinculate ~15 to recurring
  try {
    const recurringIds: string[] = (await db.select({ id: recurringAppointments.id }).from(recurringAppointments).where(eq(recurringAppointments.businessId, BID))).map((r: any) => r.id)
    if (recurringIds.length) {
      // pick 15 scheduled/confirmed appointments
      const targetAppts = rows.filter((r) => r.status === 'scheduled' || r.status === 'confirmed').slice(0, 15)
      for (let i = 0; i < Math.min(15, targetAppts.length, recurringIds.length); i++) {
        const apptId = targetAppts[i].id
        const recId = recurringIds[i % recurringIds.length]
        await db.execute(sql.raw(`UPDATE public.appointments SET recurring_id='${recId}' WHERE id='${apptId}'`))
      }
    }
  } catch (e) {
    console.warn('recurring link skipped', (e as Error).message)
  }

  // delete domingo non-cancelled/no_show with id like a% (idempotente)
  try {
    await db.execute(sql.raw(`DELETE FROM public.appointments WHERE business_id='${BID}' AND EXTRACT(DOW FROM starts_at AT TIME ZONE 'America/Bogota')=0 AND status NOT IN ('cancelled','no_show') AND id::text LIKE 'a%'`))
  } catch {}
  // move holidays to next day for scheduled etc
  try {
    await db.execute(
      sql.raw(
        `UPDATE public.appointments a SET starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' WHERE business_id='${BID}' AND EXISTS (SELECT 1 FROM public.holidays h WHERE h.business_id='${BID}' AND h.date = (a.starts_at AT TIME ZONE 'America/Bogota')::date AND h.is_open=false) AND a.status IN ('scheduled','confirmed','pending')`
      )
    )
  } catch {}

  try {
    await db.execute(sql.raw(`ALTER TABLE public.appointments ENABLE TRIGGER USER`))
  } catch {}
  console.log(`Seeded appointments (8000)`)
  return rows
}

// ─────────────────────────────────────────────
// 16) Transactions — 2426
// ─────────────────────────────────────────────
async function seedTransactions(apptRows: any[], allClientIds: string[], allEmps: string[], allServices: Svc[]) {
  const cnt = await getCount(transactions, BID)
  if (cnt >= 2000) {
    console.log(`Transactions already ${cnt}, skipping`)
    return []
  }
  // map service price by id for quick lookup
  const svcMap = new Map(allServices.map((s) => [s.id, s]))
  // completed/paid appts sorted by startsAt
  const completed = apptRows
    .filter((r) => r.status === 'completed' || r.status === 'paid')
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 900)

  const txnRows: any[] = []
  // 1) linked
  for (let i = 0; i < completed.length; i++) {
    const a = completed[i]
    const svc = svcMap.get(a.serviceId)!
    const disc = rnd() < 0.22 ? Math.floor(Number(svc.price) * (0.05 + rnd() * 0.1)) : 0
    const amount = Math.max(0, Number(a.price) - disc)
    const pm = pick(['cash', 'card', 'transfer', 'online'])
    const tip = rnd() < 0.35 ? 1000 + Math.floor(rnd() * 9000) : 0
    const discReason = disc > 0 ? pick(['promo BIENVENIDA10', 'promo LUNES15', 'descuento vip', 'cortesía']) : null
    const promo = disc > 0 && rnd() < 0.5 ? pick(['BIENVENIDA10', 'LUNES15', 'BARBA5K']) : null
    const ptsEarn = Math.floor(amount / 1000)
    const ptsRedeem = rnd() < 0.08 ? 50 + Math.floor(rnd() * 100) : 0
    const createdAt = new Date(new Date(a.endsAt).getTime() + Math.floor(rnd() * 3) * 3600 * 1000).toISOString()
    txnRows.push({
      id: uuidFor('b', i + 1),
      businessId: BID,
      locationId: a.locationId,
      appointmentId: a.id,
      clientId: a.clientId,
      employeeId: a.employeeId,
      amount: String(amount),
      paymentMethod: pm,
      status: 'completed',
      items: JSON.stringify([{ service_id: a.serviceId, name: svc.name, price: svc.price, qty: 1 }]),
      tipAmount: tip,
      discountAmount: disc,
      discountReason: discReason,
      promoCode: promo,
      loyaltyPointsEarned: ptsEarn,
      loyaltyPointsRedeemed: ptsRedeem,
      createdAt,
    })
  }
  // 2) POS walk-ins 1513 (to reach 2426 total: 900 linked +1513 POS +8 refunded +5 pending =2426)
  for (let gs = 1; gs <= 1513; gs++) {
    const idx = 900 + gs
    const loc = rnd() < 0.6 ? CENTRO_ID : NORTE_ID
    const clientId = pick(allClientIds)
    const empId = pick(allEmps)
    const amount = 15000 + Math.floor(rnd() * 65000)
    const pm = pick(['cash', 'card', 'transfer'])
    const tip = rnd() < 0.25 ? 2000 + Math.floor(rnd() * 5000) : 0
    const disc = rnd() < 0.15 ? 2000 + Math.floor(rnd() * 4000) : 0
    const net = Math.max(0, amount - disc)
    const createdAt = new Date(Date.now() - Math.floor(rnd() * 90) * 24 * 3600 * 1000).toISOString()
    txnRows.push({
      id: uuidFor('b', idx),
      businessId: BID,
      locationId: loc,
      appointmentId: null,
      clientId,
      employeeId: empId,
      amount: String(net),
      paymentMethod: pm,
      status: 'completed',
      items: JSON.stringify([{ product: 'Venta mostrador', price: 15000 + Math.floor(rnd() * 30000), qty: 1 }]),
      tipAmount: tip,
      discountAmount: disc,
      discountReason: disc ? 'descuento mostrador' : null,
      promoCode: null,
      loyaltyPointsEarned: 0,
      loyaltyPointsRedeemed: 0,
      createdAt,
    })
  }
  // 3) refunded 8
  for (let i = 0; i < 8; i++) {
    txnRows.push({
      businessId: BID,
      clientId: pick(allClientIds),
      employeeId: pick(allEmps),
      amount: '30000',
      paymentMethod: 'cash',
      status: 'refunded',
      items: JSON.stringify([]),
      tipAmount: 0,
      discountAmount: 0,
      createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    })
  }
  // 4) pending 5
  for (let i = 0; i < 5; i++) {
    txnRows.push({
      businessId: BID,
      clientId: pick(allClientIds),
      employeeId: pick(allEmps),
      amount: '25000',
      paymentMethod: 'card',
      status: 'pending',
      items: JSON.stringify([]),
      tipAmount: 0,
      discountAmount: 0,
      createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    })
  }

  // Drizzle insert: need to handle items jsonb -> pass object not string? In schema items is jsonb default []
  // Convert stringified back to object for drizzle
  const drizzleRows = txnRows.map((r) => ({
    ...r,
    items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items,
  }))

  await batchInsert(transactions, drizzleRows as any)
  console.log(`Seeded transactions (${drizzleRows.length})`)
  return drizzleRows
}

// ─────────────────────────────────────────────
// 17) Transaction items, tips, loyalty sync
// ─────────────────────────────────────────────
async function seedTransactionExtras() {
  // transaction_items for linked transactions
  try {
    const _res = await db.execute(
      sql.raw(
        `INSERT INTO public.transaction_items (transaction_id, service_id, name_snapshot, price_snapshot, qty) SELECT t.id, a.service_id, s.name, s.price, 1 FROM public.transactions t JOIN public.appointments a ON a.id = t.appointment_id JOIN public.services s ON s.id = a.service_id WHERE t.business_id='${BID}' AND t.appointment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.transaction_id=t.id) LIMIT 800 ON CONFLICT DO NOTHING`
      )
    )
    void _res
    console.log('Seeded transaction_items')
  } catch (e) {
    // fallback via ORM - query transactions and insert via drizzle
    try {
      const _txs = await db
        .select({ id: transactions.id, appointmentId: transactions.appointmentId })
        .from(transactions)
        .where(eq(transactions.businessId, BID))
      void _txs
      // simplified: skip if raw failed
      console.warn('transaction_items raw failed, skipping fallback', (e as Error).message)
    } catch {}
  }
  // tips
  try {
    await db.execute(
      sql.raw(
        `INSERT INTO public.tips (business_id, transaction_id, employee_id, amount, method) SELECT t.business_id, t.id, t.employee_id, t.tip_amount, CASE WHEN t.payment_method='cash' THEN 'cash' ELSE 'card' END FROM public.transactions t WHERE t.business_id='${BID}' AND t.tip_amount>0 AND t.employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tips tp WHERE tp.transaction_id=t.id) ON CONFLICT DO NOTHING`
      )
    )
    console.log('Seeded tips')
  } catch (e) {
    console.warn('tips seed failed', (e as Error).message)
  }
  // loyalty movements sync
  try {
    await db.execute(
      sql.raw(
        `INSERT INTO public.loyalty_movements (business_id, client_id, type, points, reference) SELECT t.business_id, t.client_id, 'earn', t.loyalty_points_earned, 'txn:'||t.id::text FROM public.transactions t WHERE t.business_id='${BID}' AND t.loyalty_points_earned>0 AND t.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.loyalty_movements lm WHERE lm.reference='txn:'||t.id::text) ON CONFLICT DO NOTHING`
      )
    )
    await db.execute(
      sql.raw(
        `INSERT INTO public.loyalty_movements (business_id, client_id, type, points, reference) SELECT t.business_id, t.client_id, 'redeem', -t.loyalty_points_redeemed, 'redeem:'||t.id::text FROM public.transactions t WHERE t.business_id='${BID}' AND t.loyalty_points_redeemed>0 AND t.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.loyalty_movements lm WHERE lm.reference='redeem:'||t.id::text) ON CONFLICT DO NOTHING`
      )
    )
    await db.execute(
      sql.raw(
        `INSERT INTO public.loyalty_accounts (client_id, business_id, points) SELECT client_id, business_id, GREATEST(0, SUM(points))::int FROM public.loyalty_movements WHERE business_id='${BID}' GROUP BY client_id, business_id ON CONFLICT (client_id) DO UPDATE SET points = GREATEST(0, EXCLUDED.points), updated_at=now()`
      )
    )
    console.log('Synced loyalty movements/accounts')
  } catch (e) {
    console.warn('loyalty sync failed', (e as Error).message)
  }
}

// ─────────────────────────────────────────────
// 18) Waitlist, Cash registers, Unavailability
// ─────────────────────────────────────────────
async function seedWaitlist(allClientIds: string[], allServices: Svc[], allEmps: string[]) {
  const cnt = await getCount(waitlist, BID)
  if (cnt >= 30) {
    console.log(`Waitlist already ${cnt}, skipping`)
    return
  }
  const rows: any[] = []
  for (let gs = 1; gs <= 120; gs++) {
    const loc = rnd() < 0.5 ? CENTRO_ID : NORTE_ID
    const svc = pick(allServices)
    const emp = pick(allEmps)
    const client = pick(allClientIds)
    const desiredAt = new Date(Date.now() + (1 + Math.floor(rnd() * 14)) * 24 * 3600 * 1000 + (9 + Math.floor(rnd() * 8)) * 3600 * 1000).toISOString()
    const status = pick(['waiting', 'notified', 'converted', 'expired', 'cancelled'])
    rows.push({ businessId: BID, locationId: loc, serviceId: svc.id, employeeId: emp, clientId: client, desiredAt, status })
  }
  // deduplicate by business_id, client_id, desiredAt unique -> use onConflictDoNothing handles
  await batchInsert(waitlist, rows as any)
  console.log('Seeded waitlist (120)')
}

async function seedCashRegisters() {
  // Check existing
  const existing = await db.select().from(cashRegisters).where(eq(cashRegisters.businessId, BID))
  const hasCentroOpen = existing.some((r: any) => r.locationId === CENTRO_ID && r.status === 'open')
  const hasNorteOpen = existing.some((r: any) => r.locationId === NORTE_ID && r.status === 'open')
  const hasClosed = existing.some((r: any) => r.status === 'closed')
  if (!hasCentroOpen) {
    await db.insert(cashRegisters).values({ businessId: BID, locationId: CENTRO_ID, openedBy: OWNER_ID, openingCash: '150000', status: 'open' } as any).onConflictDoNothing()
  }
  if (!hasNorteOpen) {
    await db.insert(cashRegisters).values({ businessId: BID, locationId: NORTE_ID, openedBy: OWNER_ID, openingCash: '120000', status: 'open' } as any).onConflictDoNothing()
  }
  if (!hasClosed) {
    await db
      .insert(cashRegisters)
      .values({
        businessId: BID,
        locationId: NORTE_ID,
        openedBy: OWNER_ID,
        openingCash: '100000',
        expectedCash: '185000',
        actualCash: '184000',
        status: 'closed',
        openedAt: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
        closedAt: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(),
      } as any)
      .onConflictDoNothing()
  }
  console.log('Seeded cash_registers')
}

async function seedUnavailability() {
  const cntRes = await db.execute(sql.raw(`SELECT count(*)::int as cnt FROM public.employee_unavailability WHERE business_id='${BID}'`)) as any
  const cnt = Number(cntRes.rows?.[0]?.cnt ?? 0)
  if (cnt >= 3) {
    console.log(`Unavailability already ${cnt}, skipping`)
    return
  }
  const rows = [
    { businessId: BID, employeeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', startsAt: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(), endsAt: new Date(Date.now() + 12 * 24 * 3600 * 1000).toISOString(), reason: 'Vacaciones' },
    { businessId: BID, employeeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', startsAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(), endsAt: new Date(Date.now() - 19 * 24 * 3600 * 1000).toISOString(), reason: 'Incapacidad' },
    { businessId: BID, employeeId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', startsAt: new Date(Date.now() + 3 * 24 * 3600 * 1000 + 9 * 3600 * 1000).toISOString(), endsAt: new Date(Date.now() + 3 * 24 * 3600 * 1000 + 13 * 3600 * 1000).toISOString(), reason: 'Capacitación' },
  ]
  await batchInsert(employeeUnavailability, rows as any)
  console.log('Seeded employee_unavailability (3)')
}

// ─────────────────────────────────────────────
// 19) Refresh & stats
// ─────────────────────────────────────────────
async function refreshStats() {
  try {
    await db.execute(sql.raw(`REFRESH MATERIALIZED VIEW public.client_stats`))
    console.log('Refreshed client_stats')
  } catch (e) {
    console.warn('client_stats refresh skipped', (e as Error).message)
  }
  try {
    await db.execute(
      sql.raw(
        `UPDATE public.clients c SET total_visits = sub.visits, total_spent = sub.spent, last_visit_at = sub.last_at FROM (SELECT client_id, count(*)::int as visits, COALESCE(sum(amount),0)::numeric(10,2) as spent, max(created_at) as last_at FROM public.transactions WHERE status='completed' AND client_id IS NOT NULL GROUP BY client_id) sub WHERE c.id = sub.client_id AND c.business_id='${BID}'`
      )
    )
    console.log('Updated client stats')
  } catch (e) {
    console.warn('client stats update skipped', (e as Error).message)
  }
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  console.log('Seeding Escudería ULTRA ORM — 2000/8000 ...')
  const start = Date.now()
  await ensureAuthUsers()
  await seedBusinessAndLocations()
  await seedBusinessHours()
  await seedEmployees()
  await seedServiceCategories()
  await seedServices()
  await seedEmployeeServices()
  await seedTags()
  await seedInventory()
  await seedHolidays()
  await seedPromotionsAndMemberships()

  // Prepare data for clients etc
  // Need all services and employees lists for later
  const allServices: Svc[] = [
    { id: '683dbb3c-6b10-4c85-b3b2-87fdb500ddec', price: '30000', durationMin: 30, name: 'Corte Clásico' },
    { id: '0730db42-332f-46d9-851d-e036c66fb8d6', price: '45000', durationMin: 50, name: 'Corte + Barba' },
    { id: 'b06e02ba-d274-4c83-9f22-bfbc992b6f03', price: '20000', durationMin: 20, name: 'Barba y Perfilado' },
    { id: 'cf73968f-4475-463c-933c-1bc678ed1ee9', price: '25000', durationMin: 30, name: 'Afeitado Clásico' },
    { id: '48d9363a-a97b-49ce-b24a-db424141beea', price: '15000', durationMin: 15, name: 'Diseño de Cejas' },
    { id: '11111111-aaaa-4000-a000-000000000001', price: '35000', durationMin: 40, name: 'Corte Fade' },
    { id: '11111111-aaaa-4000-a000-000000000002', price: '25000', durationMin: 30, name: 'Corte Infantil' },
    { id: '11111111-aaaa-4000-a000-000000000003', price: '30000', durationMin: 35, name: 'Barba Premium' },
    { id: '11111111-aaaa-4000-a000-000000000004', price: '70000', durationMin: 75, name: 'Combo VIP' },
    { id: '11111111-aaaa-4000-a000-000000000005', price: '80000', durationMin: 90, name: 'Color Cabello' },
    { id: '11111111-aaaa-4000-a000-000000000006', price: '75000', durationMin: 85, name: 'Mechas / Iluminación' },
    { id: '11111111-aaaa-4000-a000-000000000007', price: '60000', durationMin: 45, name: 'Tratamiento Capilar' },
    { id: '11111111-aaaa-4000-a000-000000000008', price: '28000', durationMin: 30, name: 'Afeitado Premium' },
    { id: '11111111-aaaa-4000-a000-000000000009', price: '18000', durationMin: 20, name: 'Perfilado Cejas Pro' },
    { id: '11111111-aaaa-4000-a000-00000000000a', price: '65000', durationMin: 60, name: 'Corte + Color' },
  ]
  const allEmps = [
    'f822de0d-ca09-42dd-bea1-76b2ca334d7e',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
    'cccccccc-dddd-eeee-ffff-111111111111',
  ]
  const empServiceMap = new Map<string, string[]>([
    ['683dbb3c-6b10-4c85-b3b2-87fdb500ddec', ['f822de0d-ca09-42dd-bea1-76b2ca334d7e', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', 'cccccccc-dddd-eeee-ffff-111111111111']],
    ['0730db42-332f-46d9-851d-e036c66fb8d6', ['f822de0d-ca09-42dd-bea1-76b2ca334d7e', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff']],
    ['b06e02ba-d274-4c83-9f22-bfbc992b6f03', ['f822de0d-ca09-42dd-bea1-76b2ca334d7e', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'cccccccc-dddd-eeee-ffff-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']],
    ['cf73968f-4475-463c-933c-1bc678ed1ee9', ['f822de0d-ca09-42dd-bea1-76b2ca334d7e', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']],
    ['48d9363a-a97b-49ce-b24a-db424141beea', ['f822de0d-ca09-42dd-bea1-76b2ca334d7e', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'ffffffff-ffff-ffff-ffff-ffffffffffff']],
    ['11111111-aaaa-4000-a000-000000000001', ['eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-dddd-eeee-ffff-111111111111']],
    ['11111111-aaaa-4000-a000-000000000002', []],
    ['11111111-aaaa-4000-a000-000000000003', ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-cccccccccccc']],
    ['11111111-aaaa-4000-a000-000000000004', ['f822de0d-ca09-42dd-bea1-76b2ca334d7e', 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff']],
    ['11111111-aaaa-4000-a000-000000000005', ['dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-dddd-eeee-ffff-111111111111']],
    ['11111111-aaaa-4000-a000-000000000006', ['dddddddd-dddd-dddd-dddd-dddddddddddd']],
    ['11111111-aaaa-4000-a000-000000000007', ['ffffffff-ffff-ffff-ffff-ffffffffffff']],
    ['11111111-aaaa-4000-a000-000000000008', ['eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee']],
    ['11111111-aaaa-4000-a000-000000000009', ['dddddddd-dddd-dddd-dddd-dddddddddddd', 'ffffffff-ffff-ffff-ffff-ffffffffffff']],
    ['11111111-aaaa-4000-a000-00000000000a', ['bbbbbbbb-cccc-dddd-eeee-ffffffffffff']],
  ])

  await seedClients()
  // fetch client ids after insertion for later steps (if skipped, query DB)
  let allClientIds: string[]
  try {
    const rows = await db.select({ id: clients.id }).from(clients).where(eq(clients.businessId, BID))
    allClientIds = rows.map((r: any) => r.id)
  } catch {
    // fallback to generated ids
    allClientIds = Array.from({ length: 2000 }, (_, i) => uuidFor('c', i + 1))
  }
  // Ensure we have at least 2000
  if (allClientIds.length < 2000) {
    console.warn(`Warning: only ${allClientIds.length} clients found, expected 2000`)
  }

  await seedLoyalty(allClientIds)
  await seedClientMemberships(allClientIds)
  await seedRecurring(allClientIds)

  const holidaySet = new Set([
    '2026-01-01',
    '2026-01-12',
    '2026-03-23',
    '2026-04-02',
    '2026-04-03',
    '2026-05-01',
    '2026-05-18',
    '2026-06-08',
    '2026-06-15',
    '2026-06-29',
    '2026-07-20',
    '2026-08-07',
    '2026-08-17',
    '2026-10-12',
    '2026-11-02',
    '2026-11-16',
    '2026-12-08',
    '2026-12-25',
  ])

  const apptRows = await seedAppointments(allClientIds, allServices, empServiceMap, allEmps, holidaySet)
  // if apptRows was skipped (already seeded), we need to fetch them for transactions
  let apptsForTx = apptRows
  if (!apptsForTx || apptsForTx.length === 0) {
    try {
      const dbAppts = await db.select().from(appointments).where(eq(appointments.businessId, BID))
      apptsForTx = dbAppts.map((r: any) => ({
        id: r.id,
        serviceId: r.serviceId,
        clientId: r.clientId,
        employeeId: r.employeeId,
        locationId: r.locationId,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        status: r.status,
        price: r.price,
      }))
    } catch {
      apptsForTx = []
    }
  }
  await seedTransactions(apptsForTx as any, allClientIds, allEmps, allServices)
  await seedTransactionExtras()
  await seedWaitlist(allClientIds, allServices, allEmps)
  await seedCashRegisters()
  await seedUnavailability()
  await refreshStats()

  const elapsed = ((Date.now() - start) / 1000).toFixed(2)
  console.log(`✓ Ultra ORM seed done in ${elapsed}s`)
  // Verification
  try {
    const checks: Array<[string, any]> = [
      ['locations', locations],
      ['employees', employees],
      ['services', services],
      ['clients', clients],
      ['appointments', appointments],
      ['transactions', transactions],
      ['inventory_items', inventoryItems],
      ['holidays', holidays],
    ]
    for (const [name, tbl] of checks) {
      const cnt = await getCount(tbl as any, BID).catch(() => 0)
      // for tags/holidays which are not per business? holidays is per business
      console.log(`  ${name}: ${cnt}`)
    }
    // holidays already per business, but we can also query directly
    const holCntRes = await db.execute(sql.raw(`SELECT count(*)::int as cnt FROM public.holidays WHERE business_id='${BID}'`)) as any
    console.log(`  holidays (raw): ${holCntRes.rows?.[0]?.cnt}`)
  } catch (e) {
    console.warn('verification failed', (e as Error).message)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error('Seed failed', e)
  process.exit(1)
})
