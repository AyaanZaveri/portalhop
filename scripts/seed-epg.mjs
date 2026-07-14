// One-time seed: pushes the locally-cached EPG directory (data/epg/*.json) into
// Postgres, so a fresh deploy has channel logos and country mappings without
// waiting on a full refresh from Settings -> EPG.
//
//   node scripts/seed-epg.mjs
//
// Safe to re-run: each country is replaced wholesale.

import fs from "node:fs"
import path from "node:path"
import pg from "pg"

const { Pool } = pg

const rootDir = process.cwd()
const epgDir = path.join(rootDir, "data", "epg")
const databaseUrl = readEnv("DATABASE_URL")

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.")
}

if (!fs.existsSync(epgDir)) {
  throw new Error(`No local EPG cache found at ${epgDir}`)
}

const manifestPath = path.join(epgDir, "manifest.json")

if (!fs.existsSync(manifestPath)) {
  throw new Error(`No manifest found at ${manifestPath}`)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
const fetchedAt = new Date(manifest.lastFetchedAt ?? Date.now())
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
})

let totalChannels = 0

try {
  for (const country of manifest.countries) {
    const code = country.code.toUpperCase()
    const filePath = path.join(epgDir, `${code.toLowerCase()}.json`)

    if (!fs.existsSync(filePath)) {
      console.warn(`Skipping ${code}: ${filePath} is missing`)
      continue
    }

    const channels = JSON.parse(fs.readFileSync(filePath, "utf8"))

    // A single XMLTV file can repeat a channel id; the composite primary key
    // would reject the batch, so keep the first occurrence of each.
    const deduped = new Map()
    for (const channel of channels) {
      if (channel.id && !deduped.has(channel.id)) {
        deduped.set(channel.id, channel)
      }
    }

    const rows = [...deduped.values()]
    const client = await pool.connect()

    try {
      await client.query("BEGIN")
      await client.query(
        `INSERT INTO epg_countries (code, channel_count, fetched_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE
           SET channel_count = EXCLUDED.channel_count,
               fetched_at = EXCLUDED.fetched_at`,
        [code, rows.length, fetchedAt]
      )
      await client.query("DELETE FROM epg_channels WHERE country_code = $1", [
        code,
      ])

      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500)
        const values = []
        const placeholders = chunk.map((channel, index) => {
          const offset = index * 6
          values.push(
            code,
            channel.id,
            channel.name,
            channel.logoUrl ?? null,
            channel.id.trim().toLowerCase(),
            normalizeChannelName(channel.name)
          )
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
        })

        await client.query(
          `INSERT INTO epg_channels
             (country_code, channel_id, name, logo_url, channel_id_lower, name_normalized)
           VALUES ${placeholders.join(", ")}`,
          values
        )
      }

      await client.query("COMMIT")
      totalChannels += rows.length
      console.log(`Seeded ${code}: ${rows.length} channels`)
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }

  console.log(
    `\nDone. ${manifest.countries.length} countries, ${totalChannels} channels.`
  )
} finally {
  await pool.end()
}

// Must stay in sync with normalizeChannelName in src/lib/epg-store.ts.
function normalizeChannelName(value) {
  return value
    .toLowerCase()
    .replace(/\b(hd|fhd|uhd|4k|sd|cc)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
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

  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")
}
