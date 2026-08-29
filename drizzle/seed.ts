import { db } from '@/lib/db'
import { businesses } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'

async function seed() {
  console.log('Seeding Escudería...')
  const existing = await db.query.businesses.findFirst({
    where: eq(businesses.slug, 'escuderia'),
  })
  if (!existing) {
    await db.insert(businesses).values({
      id: '17c1a2b5-5d3b-4d84-bbb1-d361077d4c95',
      ownerId: 'b8f773b2-11e7-40d0-8f52-929b480d42b8',
      name: 'Escudería',
      slug: 'escuderia',
      type: 'barbershop',
      phone: '+57 300 123 4567',
      address: 'Colombia',
      timezone: 'America/Bogota',
      currency: 'COP',
      brandColor: '#0A0A0A',
    })
    console.log('Created Escudería')
  } else {
    console.log('Escudería already exists, skipping')
  }
  console.log('Seed done')
  process.exit(0)
}

seed().catch((e) => {
  console.error(e)
  process.exit(1)
})
