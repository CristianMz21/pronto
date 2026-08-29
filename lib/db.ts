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

export async function tryDrizzle<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (process.env.NODE_ENV === 'test') return fallback()
    throw e
  }
}
