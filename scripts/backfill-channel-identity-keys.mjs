// One-time backfill: populate saved_channels.identity_key, then add the NOT
// NULL constraint and the unique index that syncSavedChannels upserts against.
//
// This replaces the identity-key half of migrate-stable-channel-identities.sql.
// That script derives the M3U identity from saved_channels.cmd in SQL, which
// stopped working once cmd became an encrypted column: it would hash ciphertext
// into the key, so the next refresh — which computes the key from the plaintext
// the provider returns — would match nothing and insert duplicates instead of
// updating in place. Deriving the key here, after decrypting, keeps the stored
// keys identical to what the app computes at refresh time.
//
// The favorites/favorite_group_channels compaction in that SQL script is
// unaffected by encryption and should still be run from there.
//
// Usage: node scripts/backfill-channel-identity-keys.mjs
import { createDecipheriv } from "node:crypto"
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
const AUTH_TAG_LENGTH = 16

const PAGE_SIZE = 2000
const UPDATE_BATCH_SIZE = 500

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
})

try {
  const { rows: sources } = await pool.query(
    `select s.id, s.source_type, count(c.id)::int as channels
     from saved_sources s
     left join saved_channels c on c.source_id = s.id
     group by s.id, s.source_type
     order by s.id`
  )

  let totalWritten = 0

  for (const source of sources) {
    if (!source.channels) {
      continue
    }

    // Only M3U identities read cmd, and cmd is by far the largest column in the
    // table — skip pulling it for the source types that cannot use it.
    const needsCmd = source.source_type === "m3u"
    const columns = needsCmd
      ? `id, channel_id, xmltv_id, name, genre, cmd`
      : `id, channel_id, xmltv_id, name, genre`

    // Occurrence counts must accumulate across the whole source in id order,
    // matching the order the app assigns them in during a refresh.
    const occurrences = new Map()
    let cursor = 0
    let written = 0
    let pending = []

    for (;;) {
      const { rows } = await pool.query(
        `select ${columns} from saved_channels
         where source_id = $1 and id > $2
         order by id
         limit $3`,
        [source.id, cursor, PAGE_SIZE]
      )

      if (!rows.length) {
        break
      }

      cursor = rows[rows.length - 1].id

      for (const row of rows) {
        const base = channelIdentityBase(row, source.source_type)
        const occurrence = (occurrences.get(base) ?? 0) + 1
        occurrences.set(base, occurrence)
        pending.push({
          id: row.id,
          identityKey: occurrence === 1 ? base : `${base}#${occurrence}`,
        })
      }

      while (pending.length >= UPDATE_BATCH_SIZE) {
        written += await flush(pending.splice(0, UPDATE_BATCH_SIZE))
      }
    }

    written += await flush(pending)
    totalWritten += written
    console.log(
      `  source ${source.id} (${source.source_type}): ${written} identity key(s)`
    )
  }

  console.log(`Backfilled ${totalWritten} identity key(s).`)

  const { rows: [{ remaining }] } = await pool.query(
    `select count(*)::int as remaining from saved_channels where identity_key is null`
  )

  if (remaining) {
    throw new Error(
      `${remaining} row(s) still have a null identity_key; refusing to add the constraint.`
    )
  }

  const { rows: [{ dupes }] } = await pool.query(
    `select count(*)::int as dupes from (
       select 1 from saved_channels group by source_id, identity_key having count(*) > 1
     ) d`
  )

  if (dupes) {
    throw new Error(
      `${dupes} duplicate (source_id, identity_key) group(s) remain; the unique index would fail.`
    )
  }

  await pool.query(
    `alter table saved_channels alter column identity_key set not null`
  )
  await pool.query(
    `create unique index if not exists saved_channels_source_identity_key_idx
       on saved_channels(source_id, identity_key)`
  )

  console.log("Applied NOT NULL and created saved_channels_source_identity_key_idx.")
} finally {
  await pool.end()
}

async function flush(batch) {
  if (!batch.length) {
    return 0
  }

  const values = batch
    .map((_, index) => `($${index * 2 + 1}::integer, $${index * 2 + 2}::text)`)
    .join(", ")
  const params = batch.flatMap((row) => [row.id, row.identityKey])

  await pool.query(
    `update saved_channels as c
     set identity_key = v.identity_key
     from (values ${values}) as v(id, identity_key)
     where c.id = v.id`,
    params
  )

  return batch.length
}

// The four functions below must stay in sync with channelIdentityBase and its
// helpers in src/db/saved-channels.ts, and normalizeXmltvId in
// src/lib/xmltv-id.ts. A key computed differently here than at refresh time
// would silently turn every future upsert into an insert.
function normalizeIdentityPart(value) {
  return (value ?? "").trim().toLowerCase()
}

function normalizeXmltvId(id) {
  return (id ?? "")
    .trim()
    .replace(/\s*@[^@\s]+$/, "")
    .trim()
    .toLowerCase()
}

function m3uStreamIdentity(command) {
  return normalizeIdentityPart(command).split("?")[0].replace(/^ffmpeg\s+/, "")
}

function channelIdentityBase(row, sourceType) {
  if (sourceType !== "m3u") {
    return `provider:${normalizeIdentityPart(row.channel_id)}`
  }

  return [
    "m3u",
    normalizeIdentityPart(normalizeXmltvId(row.xmltv_id)),
    normalizeIdentityPart(row.name),
    normalizeIdentityPart(row.genre),
    m3uStreamIdentity(decryptSecret(row.cmd)),
  ].join("|")
}

function decryptSecret(value) {
  if (typeof value !== "string" || !value.startsWith(ENCRYPTION_PREFIX)) {
    return value ?? ""
  }

  const payload = Buffer.from(value.slice(ENCRYPTION_PREFIX.length), "base64")
  const iv = payload.subarray(0, IV_LENGTH)
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv)
  decipher.setAuthTag(authTag)

  return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8")
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
