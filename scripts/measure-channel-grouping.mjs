// Measures what would happen if channels were grouped across sources into one
// logical channel with several streams behind it.
//
// Read-only. It SELECTs name, xmltv_id and source_id from saved_channels and
// writes nothing, so it is safe to point at the real database.
//
// The question it answers is not whether to group — it is how aggressive the
// key should be. Grouping too little leaves duplicates, which are noise.
// Grouping too much hides a channel behind another one, and nobody audits a
// list of thirty thousand for something silently absent. So the output that
// matters is the last section: groups whose members disagree about what they
// are. Those are the false merges, and they are the whole risk.
//
// Usage: node scripts/measure-channel-grouping.mjs [--user <id>] [--show 40]
import fs from "node:fs"
import path from "node:path"
import pg from "pg"

const { Pool } = pg
const rootDir = process.cwd()

const args = process.argv.slice(2)
const userId = readFlag("--user")
const showLimit = Number(readFlag("--show") ?? 25)

const databaseUrl = readEnv("DATABASE_URL")
if (!databaseUrl) throw new Error("DATABASE_URL is required.")

/* ------------------------------------------------------------------ keys */

/** Portals prefix their names with a country: "CA - TSN 1", "US| CNN". */
const COUNTRY_PREFIX = /^[a-z0-9]{2,6}\s*[-–|]\s*/i

/** Guide ids carry a country suffix, and some portals append "@SD". */
function normalizeId(value) {
  return (value ?? "")
    .trim()
    .replace(/\s*@[^@\s]+$/, "")
    .trim()
    .toLowerCase()
}

/**
 * Markers that describe the feed rather than the channel. Two names differing
 * only by one of these are the same channel at a different quality, which is
 * exactly the pair that should become two sources of one row.
 */
const QUALITY_TOKENS = new Set([
  "4k", "8k", "uhd", "fhd", "qhd", "hd", "sd", "hq", "lq",
  "hevc", "h264", "h265", "x265", "raw", "backup", "alt", "vip",
])

/**
 * Words the search normalizer also strips, kept here on purpose.
 *
 * epg-search.ts drops "plus", "tv" and "channel" as noise, which is right for
 * ranking a search box and wrong for deciding identity: it collapses "TSN" and
 * "TSN Plus" onto one key, and a merge that swallows a distinct channel is the
 * one failure this whole exercise is trying to avoid. The aggressive key below
 * exists to measure exactly how much that costs.
 */
const SEARCH_ONLY_NOISE = new Set(["plus", "tv", "channel", "feed"])

function tokens(name) {
  return name
    .replace(COUNTRY_PREFIX, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Strict: quality markers only. The candidate for real identity. */
function strictNameKey(name) {
  return tokens(name).filter((token) => !QUALITY_TOKENS.has(token)).join("")
}

/** Aggressive: what epg-search would do. Measured, not recommended. */
function aggressiveNameKey(name) {
  return tokens(name)
    .filter((token) => !QUALITY_TOKENS.has(token) && !SEARCH_ONLY_NOISE.has(token))
    .join("")
}

/* ------------------------------------------------------------------- run */

const pool = new Pool({ connectionString: databaseUrl })

try {
  const { rows } = await pool.query(
    `SELECT c.name, c.xmltv_id, c.source_id, s.name AS source_name, s.user_id
     FROM saved_channels c
     JOIN saved_sources s ON s.id = c.source_id
     ${userId ? "WHERE s.user_id = $1" : ""}
     ORDER BY c.source_id`,
    userId ? [userId] : [],
  )

  if (!rows.length) {
    console.log("No channels found. Is DATABASE_URL pointing at the right database?")
    process.exit(0)
  }

  const bySource = new Map()
  for (const row of rows) {
    const entry = bySource.get(row.source_id) ?? { name: row.source_name, count: 0 }
    entry.count++
    bySource.set(row.source_id, entry)
  }

  const withId = rows.filter((row) => normalizeId(row.xmltv_id)).length

  heading("Catalogue")
  console.log(`  ${rows.length.toLocaleString()} channels across ${bySource.size} sources`)
  for (const [id, entry] of bySource) {
    console.log(`    ${String(id).padStart(4)}  ${entry.count.toLocaleString().padStart(7)}  ${entry.name}`)
  }
  console.log(
    `  ${withId.toLocaleString()} carry a guide id (${pct(withId / rows.length)}), ` +
      `${(rows.length - withId).toLocaleString()} do not`,
  )

  // The proposed key: the guide id when there is one, the strict name when
  // there is not. Reported separately, because they carry different confidence
  // and the interface should say which one it used.
  const groups = new Map()
  for (const row of rows) {
    const id = normalizeId(row.xmltv_id)
    const key = id ? `id:${id}` : `name:${strictNameKey(row.name)}`
    if (key === "name:") continue
    const group = groups.get(key) ?? { key, by: id ? "id" : "name", rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }

  const all = [...groups.values()]
  const merged = all.filter((group) => group.rows.length > 1)
  const byId = all.filter((group) => group.by === "id")
  const byName = all.filter((group) => group.by === "name")

  heading("Grouping")
  console.log(`  ${all.length.toLocaleString()} groups from ${rows.length.toLocaleString()} channels`)
  console.log(
    `    ${byId.length.toLocaleString()} keyed by guide id, ` +
      `${byName.length.toLocaleString()} keyed by name`,
  )
  console.log(
    `  ${merged.length.toLocaleString()} groups hold more than one channel, ` +
      `collapsing ${(rows.length - all.length).toLocaleString()} rows ` +
      `(${pct((rows.length - all.length) / rows.length)} shorter)`,
  )

  const sizes = new Map()
  for (const group of all) {
    sizes.set(group.rows.length, (sizes.get(group.rows.length) ?? 0) + 1)
  }
  console.log("  Group sizes:")
  for (const size of [...sizes.keys()].sort((a, b) => a - b)) {
    console.log(`    ${String(size).padStart(3)} source(s)  ${sizes.get(size).toLocaleString()}`)
  }

  /* --------------------------------------------------------- the risk */

  // A group whose members disagree about their own name is a merge that put
  // two different channels together. Quality markers are already stripped, so
  // what is left is a real disagreement.
  const nameDisagreements = merged
    .filter((group) => new Set(group.rows.map((row) => strictNameKey(row.name))).size > 1)
    .sort((a, b) => b.rows.length - a.rows.length)

  // A name-keyed group carrying two different guide ids is the same problem
  // seen from the other side: the guide already says these are not one channel.
  const idContradictions = merged
    .filter(
      (group) =>
        group.by === "name" &&
        new Set(group.rows.map((row) => normalizeId(row.xmltv_id)).filter(Boolean)).size > 1,
    )
    .sort((a, b) => b.rows.length - a.rows.length)

  heading("Suspect groups — the false merges, if there are any")
  report("Members disagree on name", nameDisagreements)
  report("Members carry different guide ids", idContradictions)

  /* -------------------------------------------- how much aggression costs */

  // Every extra merge the search normalizer would cause on top of the strict
  // key. This is the "TSN" and "TSN Plus" question, answered with real names.
  const extra = new Map()
  for (const row of rows) {
    if (normalizeId(row.xmltv_id)) continue
    const strict = strictNameKey(row.name)
    const loose = aggressiveNameKey(row.name)
    if (!loose || loose === strict) continue
    const group = extra.get(loose) ?? new Set()
    group.add(strict)
    extra.set(loose, group)
  }
  const wouldMerge = [...extra.entries()].filter(([, set]) => set.size > 1)

  heading("If the key dropped \"plus\", \"tv\" and \"channel\" as well")
  if (!wouldMerge.length) {
    console.log("  Nothing extra would merge. The aggressive key is safe on this catalogue.")
  } else {
    console.log(`  ${wouldMerge.length} further merges, each joining channels the strict key keeps apart:`)
    for (const [key, set] of wouldMerge.slice(0, showLimit)) {
      console.log(`    ${key}  ←  ${[...set].join(", ")}`)
    }
    if (wouldMerge.length > showLimit) {
      console.log(`    … and ${wouldMerge.length - showLimit} more`)
    }
  }

  console.log()
} finally {
  await pool.end()
}

/* --------------------------------------------------------------- output */

function report(title, groups) {
  if (!groups.length) {
    console.log(`  ${title}: none.`)
    return
  }
  console.log(`  ${title}: ${groups.length}`)
  for (const group of groups.slice(0, showLimit)) {
    const names = [...new Set(group.rows.map((row) => row.name))]
    console.log(`    ${group.key}`)
    for (const name of names.slice(0, 6)) console.log(`      ${name}`)
    if (names.length > 6) console.log(`      … ${names.length - 6} more`)
  }
  if (groups.length > showLimit) {
    console.log(`    … and ${groups.length - showLimit} more`)
  }
}

function heading(text) {
  console.log(`\n${text}\n${"─".repeat(text.length)}`)
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`
}

function readFlag(flag) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

function readEnv(name) {
  if (process.env[name]) return process.env[name]
  const envPath = path.join(rootDir, ".env")
  if (!fs.existsSync(envPath)) return ""
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`))
  if (!line) return ""
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")
}
