import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '@/drizzle/schema'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.MIGRATE_SSL === 'false' ? false : { rejectUnauthorized: false },
})

export const db = drizzle(pool, { schema })

export type DB = typeof db

export async function getDb() {
  return db
}
