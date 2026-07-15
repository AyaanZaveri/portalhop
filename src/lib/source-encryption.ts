import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// Saved source credentials (portal URLs, MAC addresses, serials, device ids,
// signatures, Xtream/M3U usernames + passwords) are effectively live keys to a
// user's IPTV subscription, so they are encrypted at rest with AES-256-GCM
// rather than stored as plaintext. This defends against a database leak — a
// dumped table, a leaked connection string, an over-broad read — not against a
// full app-server compromise, since the server necessarily holds the key to
// talk to the upstream portal on every request.

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

// Stored values are tagged so we can tell ciphertext from legacy plaintext and
// leave room to rotate the scheme later (`enc:v2:` etc.).
const ENCRYPTION_PREFIX = "enc:v1:"

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) {
    return cachedKey
  }

  const raw = process.env.SOURCE_ENCRYPTION_KEY

  if (!raw) {
    throw new Error(
      "SOURCE_ENCRYPTION_KEY is required to read or write saved source " +
        "credentials. Generate one with: openssl rand -base64 32"
    )
  }

  const key = Buffer.from(raw, "base64")

  if (key.length !== 32) {
    throw new Error(
      `SOURCE_ENCRYPTION_KEY must decode to 32 bytes for AES-256 (got ${key.length}). ` +
        "Generate one with: openssl rand -base64 32"
    )
  }

  cachedKey = key
  return key
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX)
}

export function encryptSecret(plaintext: string): string {
  // Nothing to protect in an empty string, and leaving it untagged keeps it
  // readable by the plaintext passthrough in decryptSecret.
  if (plaintext === "") {
    return ""
  }

  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  const payload = Buffer.concat([iv, authTag, ciphertext])

  return ENCRYPTION_PREFIX + payload.toString("base64")
}

export function decryptSecret(value: string): string {
  // Rows written before encryption was added (and empty strings) are stored as
  // plaintext, so anything without the tag is returned as-is. This keeps reads
  // working before the one-time backfill runs.
  if (!isEncrypted(value)) {
    return value
  }

  const payload = Buffer.from(value.slice(ENCRYPTION_PREFIX.length), "base64")
  const iv = payload.subarray(0, IV_LENGTH)
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(authTag)

  return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8")
}
