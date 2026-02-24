import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { mkdirSync } from 'fs'

const DB_DIR = '/tmp/ai-platform/data'
const DB_PATH = `${DB_DIR}/platform.db`

mkdirSync(DB_DIR, { recursive: true })

// Singleton — prevents multiple connections during Next.js hot reload in dev
const globalForDb = globalThis as unknown as { _aiPlatformDb: ReturnType<typeof drizzle> | undefined }

function createDb() {
  const sqlite = new Database(DB_PATH)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

export const db = globalForDb._aiPlatformDb ?? createDb()
if (process.env.NODE_ENV !== 'production') globalForDb._aiPlatformDb = db
