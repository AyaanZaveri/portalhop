// One-time backfill: encrypt any saved-source credential columns that are still
// stored as plaintext (rows written before encryption was added). The app reads
// plaintext and ciphertext interchangeably, so this can run at any time; it is
// idempotent and skips values that are already tagged `enc:v1:`.
//
// Usage: node scripts/encrypt-saved-sources.mjs
import { createCipheriv, randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import pg from "pg"

const { Pool } = pg

const rootDir = process.cwd()
const databaseUrl = readEnv("DATABASE_URL")
const encryptionKeyRaw = readEnv("SOURCE_ENCRYPTION_KEY")

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.")
}

const encryptionKey = Buffer.from(encryptionKeyRaw, "base64")

if (encryptionKey.length !== 32) {
  throw new Error(
    "SOURCE_ENCRYPTION_KEY must decode to 32 bytes. Generate one with: openssl rand -base64 32"
  )
}

// Must stay in sync with src/lib/source-encryption.ts.
const ENCRYPTION_PREFIX = "enc:v1:"
const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12

// Which columns hold credentials, per table. Keep aligned with the
// encryptedText() columns in src/db/schema.ts.
const TARGETS = [
  {
    table: "saved_stalker_sources",
    key: "source_id",
    columns: [
      "portal_url",
      "mac",
      "serial",
      "device_id",
      "device_id_2",
      "signature",
      "endpoint",
    ],
  },
  {
    table: "saved_xtream_sources",
    key: "source_id",
    columns: ["server_url", "username", "password"],
  },
  {
    table: "saved_m3u_sources",
    key: "source_id",
    columns: [
      "playlist_url",
      "derived_xtream_server_url",
      "derived_xtream_username",
      "derived_xtream_password",
    ],
  },
]

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
})

try {
  let totalUpdatedRows = 0
  let totalEncryptedValues = 0

  for (const target of TARGETS) {
    const selectCols = [target.key, ...target.columns]
      .map((col) => `"${col}"`)
      .join(", ")
    const { rows } = await pool.query(
      `select ${selectCols} from ${target.table}`
    )

    for (const row of rows) {
      const updates = []
      const values = []

      for (const col of target.columns) {
        const current = row[col]

        // Null/empty and already-encrypted values are left untouched.
        if (typeof current !== "string" || current === "") {
          continue
        }
        if (current.startsWith(ENCRYPTION_PREFIX)) {
          continue
        }

        values.push(encryptSecret(current))
        updates.push(`"${col}" = $${values.length}`)
      }

      if (!updates.length) {
        continue
      }

      values.push(row[target.key])
      await pool.query(
        `update ${target.table} set ${updates.join(", ")} where "${target.key}" = $${values.length}`,
        values
      )

      totalUpdatedRows += 1
      totalEncryptedValues += updates.length
    }

    console.log(`${target.table}: scanned ${rows.length} row(s)`)
  }

  console.log(
    `Done. Encrypted ${totalEncryptedValues} value(s) across ${totalUpdatedRows} row(s).`
  )
} finally {
  await pool.end()
}

function encryptSecret(plaintext) {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  const payload = Buffer.concat([iv, authTag, ciphertext])

  return ENCRYPTION_PREFIX + payload.toString("base64")
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
