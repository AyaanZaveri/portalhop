// Attach an email address to an existing account without changing its username
// or account data. Usage:
// TARGET_USERNAME=... TARGET_EMAIL=... node scripts/set-account-email.mjs
import fs from "node:fs"
import path from "node:path"
import pg from "pg"

const targetUsername = process.env.TARGET_USERNAME?.trim().toLowerCase()
const targetEmail = process.env.TARGET_EMAIL?.trim().toLowerCase()
const databaseUrl = readEnv("DATABASE_URL")

if (!targetUsername || !targetEmail) {
  throw new Error("TARGET_USERNAME and TARGET_EMAIL are required.")
}

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.")
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
})

try {
  await pool.query("begin")
  const userResult = await pool.query(
    'select id from "user" where username = $1 for update',
    [targetUsername]
  )
  const targetUser = userResult.rows[0]

  if (!targetUser) {
    throw new Error("Target account was not found.")
  }

  const conflict = await pool.query(
    'select id from "user" where lower(email) = $1 and id <> $2',
    [targetEmail, targetUser.id]
  )
  if (conflict.rowCount) {
    throw new Error("That email address is already in use.")
  }

  await pool.query(
    'update "user" set email = $1, email_verified = true, updated_at = now() where id = $2',
    [targetEmail, targetUser.id]
  )
  await pool.query("commit")
  console.log("Updated the account email.")
} catch (error) {
  await pool.query("rollback")
  throw error
} finally {
  await pool.end()
}

function readEnv(name) {
  if (process.env[name]) return process.env[name]

  const envPath = path.join(process.cwd(), ".env")
  if (!fs.existsSync(envPath)) return ""

  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`))

  return line
    ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")
    : ""
}
