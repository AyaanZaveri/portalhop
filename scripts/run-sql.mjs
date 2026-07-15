// Run a .sql file against DATABASE_URL. Usage: node scripts/run-sql.mjs <file>
import fs from "node:fs"
import path from "node:path"
import pg from "pg"

const rootDir = process.cwd()
const file = process.argv[2]

if (!file) {
  throw new Error("Usage: node scripts/run-sql.mjs <path-to.sql>")
}

const databaseUrl = readEnv("DATABASE_URL")
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.")
}

const sql = fs.readFileSync(path.resolve(rootDir, file), "utf8")
const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
})

try {
  await pool.query(sql)
  console.log(`Applied ${file}`)
} finally {
  await pool.end()
}

function readEnv(name) {
  if (process.env[name]) {
    return process.env[name]
  }

  const envPath = path.join(rootDir, ".env")
  if (!fs.existsSync(envPath)) {
    return ""
  }

  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`))

  if (!line) {
    return ""
  }

  return line
    .slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^["']|["']$/g, "")
}
