import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

export function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? null
}

export function isDatabaseConfigured() {
  return Boolean(getDatabaseUrl())
}

let cached: ReturnType<typeof drizzle> | null = null

export function getDb() {
  if (cached) return cached

  const url = getDatabaseUrl()
  if (!url) {
    throw new Error('DATABASE_URL is not set. Add it to .env.local or run `npx neon link`.')
  }

  cached = drizzle({ client: neon(url), schema })
  return cached
}
