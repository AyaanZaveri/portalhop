import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "@/db/schema"

let pool: Pool | null = null
let db: ReturnType<typeof drizzle<typeof schema>> | null = null

function getPool() {
  if (pool) {
    return pool
  }

  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to connect to Postgres.")
  }

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  return pool
}

export function getDb() {
  if (!db) {
    db = drizzle(getPool(), { schema })
  }

  return db
}

export { getPool }
