// One-time backfill: encrypt saved_channels.cmd for rows written before the
// column became encryptedText(). The app reads plaintext and ciphertext
// interchangeably (decryptSecret passes untagged values through), so this can
// run before or after the schema change ships, and it is idempotent — values
// already tagged `enc:v1:` are skipped.
//
// Unlike scripts/encrypt-saved-sources.mjs, which touches a handful of rows,
// this table holds hundreds of thousands. Rows are paged by id and written
// back one UPDATE … FROM (VALUES …) per batch, so a run costs a few hundred
// round-trips rather than one per row.
//
// Usage: node scripts/encrypt-saved-channel-cmds.mjs
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

// Large enough to amortise the round-trip, small enough that a batch's
// parameters stay well inside Postgres' statement limits.
const BATCH_SIZE = 500

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
})

try {
  const { rows: [{ total, pending }] } = await pool.query(
    `select count(*)::int as total,
            count(*) filter (where cmd not like $1)::int as pending
     from saved_channels`,
    [`${ENCRYPTION_PREFIX}%`]
  )

  console.log(`saved_channels: ${total} row(s), ${pending} still plaintext.`)

  // Re-runs are the common case once the backfill has been applied, so skip the
  // paging entirely rather than reading every row to confirm there is nothing
  // left to encrypt.
  if (pending) {
    await encryptPendingCmds(total)
  } else {
    console.log("Nothing to do.")
  }
} finally {
  await pool.end()
}

async function encryptPendingCmds(total) {
  let cursor = 0
  let encrypted = 0
  let scanned = 0

  for (;;) {
    const { rows } = await pool.query(
      `select id, cmd from saved_channels
       where id > $1
       order by id
       limit $2`,
      [cursor, BATCH_SIZE]
    )

    if (!rows.length) {
      break
    }

    cursor = rows[rows.length - 1].id
    scanned += rows.length

    const updates = rows.filter(
      (row) => typeof row.cmd === "string" && !row.cmd.startsWith(ENCRYPTION_PREFIX)
    )

    if (updates.length) {
      // One statement per batch: UPDATE … FROM (VALUES …) matches the bulk
      // update pattern already used by applyXmltvIdUpdates.
      const values = updates
        .map((_, index) => `($${index * 2 + 1}::integer, $${index * 2 + 2}::text)`)
        .join(", ")
      const params = updates.flatMap((row) => [row.id, encryptSecret(row.cmd)])

      await pool.query(
        `update saved_channels as c
         set cmd = v.cmd
         from (values ${values}) as v(id, cmd)
         where c.id = v.id`,
        params
      )

      encrypted += updates.length
    }

    if (scanned % (BATCH_SIZE * 20) === 0 || rows.length < BATCH_SIZE) {
      console.log(`  scanned ${scanned}/${total}, encrypted ${encrypted}`)
    }
  }

  console.log(`Done. Encrypted ${encrypted} cmd value(s) across ${scanned} row(s).`)
}

function encryptSecret(plaintext) {
  // Matches src/lib/source-encryption.ts: empty strings stay untagged so the
  // plaintext passthrough in decryptSecret keeps reading them.
  if (plaintext === "") {
    return ""
  }

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
