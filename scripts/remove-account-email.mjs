// Remove the email address from a shared username/password account while
// preserving the account id and therefore all PortalHop data keyed by it.
//
// Usage: TARGET_USERNAME=... node scripts/remove-account-email.mjs
import fs from "node:fs"
import path from "node:path"
import pg from "pg"

const targetUsername = process.env.TARGET_USERNAME?.trim().toLowerCase()
const databaseUrl = readEnv("DATABASE_URL")

if (!targetUsername) {
  throw new Error("TARGET_USERNAME is required.")
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

  await pool.query(
    'update "user" set email = null, email_verified = false, name = $1, updated_at = now() where id = $2',
    [targetUsername, targetUser.id]
  )

  await pool.query("commit")
  console.log("Removed the email and updated the display name for the shared account.")
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
