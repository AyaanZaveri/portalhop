import { Redis } from "@upstash/redis"
import { gzipSync, gunzipSync } from "node:zlib"

import { EPG_SOURCES } from "@portalhop/shared/epg-sources"

import { fetchEpgWindow, type EpgWindow } from "@/lib/epg-parser"

const CHUNK_MS = 6 * 60 * 60 * 1000
// The API serves six hours and active guides refresh hourly. Twelve hours keeps
// a full extra response window available without retaining four times as many
// programme descriptions in memory (the US feed exceeds a small worker heap
// at 48 hours).
const HOT_WINDOW_MS = 12 * 60 * 60 * 1000
const CACHE_TTL_SECONDS = 72 * 60 * 60
const ACTIVE_COUNTRY_TTL_SECONDS = 30 * 24 * 60 * 60
const MAX_SOURCE_BYTES = 32 * 1024 * 1024
const MAX_TOTAL_BYTES = 160 * 1024 * 1024
const PREFIX = "portalhop:iptv-epg:v1"

type CachedManifest = {
  version: string
  updatedAt: number
  bytes: number
  chunkKeys: string[]
}

type CacheCatalog = Record<string, { bytes: number; lastAccessedAt: number }>

let cachedRedisClient: Redis | null | undefined

function redisClient() {
  if (cachedRedisClient !== undefined) return cachedRedisClient

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  cachedRedisClient = url && token ? new Redis({ url, token }) : null
  return cachedRedisClient
}

function normalizeCountry(country: string) {
  const code = country.toUpperCase()
  return code === "UK" ? "GB" : code
}

function manifestKey(country: string) {
  return `${PREFIX}:country:${country}:manifest`
}

function chunkKey(country: string, version: string, start: number) {
  return `${PREFIX}:country:${country}:version:${version}:chunk:${start}`
}

function activeCountriesKey() {
  return `${PREFIX}:active-countries`
}

function activeCountryKey(country: string) {
  return `${PREFIX}:country:${country}:active`
}

function catalogKey() {
  return `${PREFIX}:catalog`
}

function lockKey() {
  return `${PREFIX}:publish-lock`
}

function refreshRequestedKey(country: string) {
  return `${PREFIX}:country:${country}:refresh-requested`
}

function alignChunkStart(value: number) {
  return Math.floor(value / CHUNK_MS) * CHUNK_MS
}

function encode(value: EpgWindow) {
  return gzipSync(JSON.stringify(value)).toString("base64")
}

function decode(value: string) {
  return JSON.parse(
    gunzipSync(Buffer.from(value, "base64")).toString("utf8"),
  ) as EpgWindow
}

function stripDescriptions(window: EpgWindow): EpgWindow {
  const channels: EpgWindow["channels"] = {}
  for (const [channelId, slots] of Object.entries(window.channels)) {
    channels[channelId] = slots.map(([start, stop, title]) => [
      start,
      stop,
      title,
    ])
  }
  return { ...window, channels }
}

function splitIntoChunks(window: EpgWindow) {
  const chunks = new Map<number, EpgWindow["channels"]>()
  const firstChunk = alignChunkStart(window.from)
  const finalChunk = alignChunkStart(window.to - 1)

  for (const [channelId, slots] of Object.entries(window.channels)) {
    for (const slot of slots) {
      const first = Math.max(firstChunk, alignChunkStart(slot[0]))
      const final = Math.min(
        finalChunk,
        alignChunkStart(Math.max(slot[0], slot[1] - 1)),
      )
      for (let start = first; start <= final; start += CHUNK_MS) {
        const channels = chunks.get(start) ?? {}
        ;(channels[channelId] ??= []).push(slot)
        chunks.set(start, channels)
      }
    }
  }

  return [...chunks.entries()].map(([from, channels]) => ({
    from,
    to: from + CHUNK_MS,
    channels,
  }))
}

async function getManifest(country: string) {
  const redis = redisClient()
  if (!redis) return null
  return (await redis.get<CachedManifest>(manifestKey(country))) ?? null
}

async function withPublishLock<T>(run: () => Promise<T>) {
  const redis = redisClient()
  if (!redis) return null
  const token = crypto.randomUUID()
  const acquired = await redis.set(lockKey(), token, { nx: true, ex: 120 })
  if (!acquired) return null
  try {
    return await run()
  } finally {
    // The short lock serializes staging/publishing. A later worker may already
    // own it if this one exceeded its TTL, so only delete our own token.
    if ((await redis.get<string>(lockKey())) === token)
      await redis.del(lockKey())
  }
}

async function publishCountry(country: string, window: EpgWindow) {
  const redis = redisClient()
  if (!redis) return false
  const chunks = splitIntoChunks(window)
  const encoded = chunks.map((chunk) => ({ chunk, value: encode(chunk) }))
  const bytes = encoded.reduce(
    (total, item) => total + Buffer.byteLength(item.value),
    0,
  )
  if (bytes > MAX_SOURCE_BYTES)
    throw new Error(`${country} guide exceeds the 32 MB cache limit.`)

  return Boolean(
    await withPublishLock(async () => {
      const catalog = (await redis.get<CacheCatalog>(catalogKey())) ?? {}
      const previous = await getManifest(country)
      const entries = Object.entries(catalog)
        .filter(([code]) => code !== country)
        .sort(
          ([, left], [, right]) => left.lastAccessedAt - right.lastAccessedAt,
        )

      let total =
        entries.reduce((sum, [, entry]) => sum + entry.bytes, 0) + bytes
      for (const [code, entry] of entries) {
        if (total <= MAX_TOTAL_BYTES) break
        const manifest = await getManifest(code)
        if (manifest) await redis.del(...manifest.chunkKeys, manifestKey(code))
        delete catalog[code]
        total -= entry.bytes
      }
      if (total > MAX_TOTAL_BYTES)
        throw new Error("IPTV-EPG cache budget is full.")

      const version = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
      const chunkKeys = encoded.map(({ chunk }) =>
        chunkKey(country, version, chunk.from),
      )
      const pipeline = redis.pipeline()
      for (let index = 0; index < encoded.length; index += 1) {
        pipeline.set(chunkKeys[index]!, encoded[index]!.value, {
          ex: CACHE_TTL_SECONDS,
        })
      }
      await pipeline.exec()

      const manifest: CachedManifest = {
        version,
        updatedAt: Date.now(),
        bytes,
        chunkKeys,
      }
      catalog[country] = { bytes, lastAccessedAt: Date.now() }
      await redis
        .multi()
        .set(manifestKey(country), manifest, { ex: CACHE_TTL_SECONDS })
        .set(catalogKey(), catalog, { ex: CACHE_TTL_SECONDS })
        .exec()

      if (previous) await redis.del(...previous.chunkKeys)
      return true
    }),
  )
}

export function getIptvEpgSource(country: string) {
  const code = normalizeCountry(country)
  return EPG_SOURCES.find((source) => source.code === code) ?? null
}

export async function markIptvEpgCountryActive(country: string) {
  const redis = redisClient()
  const code = normalizeCountry(country)
  if (!redis || !getIptvEpgSource(code)) return

  // This runs on every guide read. The country marker, manifest and catalogue
  // are independent, so serial REST requests here put avoidable latency on
  // the search response.
  const [manifest, storedCatalog] = await Promise.all([
    getManifest(code),
    redis.get<CacheCatalog>(catalogKey()),
  ])
  const catalog = storedCatalog ?? {}
  const pipeline = redis.pipeline()
  pipeline.zadd(activeCountriesKey(), { score: Date.now(), member: code })
  pipeline.set(activeCountryKey(code), "1", { ex: ACTIVE_COUNTRY_TTL_SECONDS })

  if (manifest && catalog[code]) {
    catalog[code]!.lastAccessedAt = Date.now()
    pipeline.set(catalogKey(), catalog, { ex: CACHE_TTL_SECONDS })
  }
  await pipeline.exec()
}

export async function requestIptvEpgRefresh(country: string) {
  const redis = redisClient()
  const code = normalizeCountry(country)
  if (!redis || !getIptvEpgSource(code)) return false
  return Boolean(
    await redis.set(refreshRequestedKey(code), "1", { nx: true, ex: 5 * 60 }),
  )
}

export async function getCachedIptvEpgWindow(
  country: string,
  options: { from?: Date; hours?: number; includeDescriptions?: boolean } = {},
) {
  const redis = redisClient()
  const code = normalizeCountry(country)
  if (!redis || !getIptvEpgSource(code)) return null
  const manifest = await getManifest(code)
  if (!manifest) return null

  const from = options.from?.getTime() ?? Date.now()
  const to = from + (options.hours ?? 6) * 60 * 60 * 1000
  const starts: number[] = []
  for (let start = alignChunkStart(from); start < to; start += CHUNK_MS)
    starts.push(start)
  const values = await redis.mget<string[]>(
    ...starts.map((start) => chunkKey(code, manifest.version, start)),
  )
  if (values.some((value) => !value)) return null

  const channels: EpgWindow["channels"] = {}
  for (const value of values) {
    const chunk = decode(value!)
    for (const [channelId, slots] of Object.entries(chunk.channels)) {
      const target = (channels[channelId] ??= [])
      for (const slot of slots) {
        if (
          slot[1] > from &&
          slot[0] < to &&
          !target.some(
            (existing) =>
              existing[0] === slot[0] &&
              existing[1] === slot[1] &&
              existing[2] === slot[2],
          )
        )
          target.push(slot)
      }
    }
  }
  for (const slots of Object.values(channels))
    slots.sort((left, right) => left[0] - right[0])
  const window = { from, to, channels }
  return options.includeDescriptions ? window : stripDescriptions(window)
}

export async function refreshIptvEpgCountry(country: string) {
  const code = normalizeCountry(country)
  const source = getIptvEpgSource(code)
  if (!source || !redisClient()) return false
  const from = new Date(alignChunkStart(Date.now()))
  const window = await fetchEpgWindow(source.url, {
    from,
    hours: HOT_WINDOW_MS / (60 * 60 * 1000),
    includeDescriptions: true,
  })
  return publishCountry(code, window)
}

export async function getActiveIptvEpgCountries() {
  const redis = redisClient()
  if (!redis) return []
  const members = await redis.zrange<string[]>(activeCountriesKey(), 0, -1)
  const active = members.length
    ? await redis.mget<string[]>(...members.map(activeCountryKey))
    : []
  return members.filter(
    (country, index) => active[index] && Boolean(getIptvEpgSource(country)),
  )
}
