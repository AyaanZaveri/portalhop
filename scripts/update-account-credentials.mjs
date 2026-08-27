// Assign a username and password to an existing Better Auth account without
// creating a new user. This preserves every row keyed by the existing user id.
//
// Usage:
// TARGET_EMAIL=... TARGET_USERNAME=... TARGET_PASSWORD=... \
//   node scripts/update-account-credentials.mjs
import fs from "node:fs"
import path from "node:path"
import pg from "pg"
import { hashPassword } from "better-auth/crypto"

const targetEmail = process.env.TARGET_EMAIL?.trim().toLowerCase()
const targetUsername = process.env.TARGET_USERNAME?.trim().toLowerCase()
const targetPassword = process.env.TARGET_PASSWORD
const databaseUrl = readEnv("DATABASE_URL")

if (!targetEmail || !targetUsername || !targetPassword) {
  throw new Error("TARGET_EMAIL, TARGET_USERNAME, and TARGET_PASSWORD are required.")
}

if (!/^[a-zA-Z0-9_.]{3,30}$/.test(targetUsername)) {
  throw new Error("TARGET_USERNAME must be 3-30 letters, numbers, dots, or underscores.")
}

if (targetPassword.length < 8) {
  throw new Error("TARGET_PASSWORD must be at least 8 characters.")
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
    'select id from "user" where lower(email) = $1 for update',
    [targetEmail]
  )
  const targetUser = userResult.rows[0]

  if (!targetUser) {
    throw new Error("Target account was not found.")
  }

  const conflict = await pool.query(
    'select id from "user" where username = $1 and id <> $2',
    [targetUsername, targetUser.id]
  )
  if (conflict.rowCount) {
    throw new Error("That username is already in use.")
  }

  await pool.query(
    'update "user" set username = $1, display_username = $1, updated_at = now() where id = $2',
    [targetUsername, targetUser.id]
  )

  const password = await hashPassword(targetPassword)
  const accountResult = await pool.query(
    "update account set password = $1, updated_at = now() where user_id = $2 and provider_id = 'credential'",
    [password, targetUser.id]
  )
  if (!accountResult.rowCount) {
    throw new Error("Target account has no password credential to update.")
  }

  await pool.query("commit")
  console.log("Updated existing account credentials.")
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
