import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from './schema.ts'

export * from './schema.ts'

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set')
  return drizzle(postgres(url, { prepare: !url.includes('-pooler') }), { schema })
}

export type Db = ReturnType<typeof createDb>

export const whileHolding = <T>(db: Db, lock: number, work: () => Promise<T>) =>
  db.transaction(async (tx) => {
    const [row] = await tx.execute(sql`select pg_try_advisory_xact_lock(${lock}) as free`)
    return row?.free === true ? await work() : undefined
  })

export const migrateDb = (db: Db) =>
  migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) })
