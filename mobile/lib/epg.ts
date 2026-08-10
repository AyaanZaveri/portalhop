import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"
import type { SavedSourceRecord } from "@portalhop/shared/source-types"

import { apiFetch } from "./api"
import type { PortalChannelWithSource } from "./channels"
import { db } from "./db"

export type NowPlaying = {
  title: string
  startAt: number
  stopAt: number
}

export type Programme = NowPlaying

/** `[startAt, stopAt, title]` — the wire shape, kept tight because a feed has tens of thousands. */
type Slot = [number, number, string]

type FeedResponse = { to: number; channels: Record<string, Slot[]> }

/**
 * Which guide file a channel's schedule lives in.
 *
 * A guide id carries its country — "tsn1.ca" — so the suffix names the file
 * without any extra lookup. A source configured with the user's own EPG
 * overrides that and points at their file instead.
 */
export function feedKeyFor(
  channel: PortalChannelWithSource,
  epgBySource: Map<number, Pick<SavedSourceRecord, "epgMode" | "epgSourceId">>,
): string | null {
  if (!channel.xmltvId) return null

  const source = channel.portalSource
    ? epgBySource.get(channel.portalSource.id)
    : undefined

  if (source?.epgMode === "custom" && source.epgSourceId) {
    return `source:${source.epgSourceId}`
  }

  // Every other mode falls through to the country file, including "none" and
  // "portal". That is what the web does — it only ever special-cases a custom
  // source — and skipping "none" here was silently costing those sources the
  // guide the web shows them.
  const country = normalizeXmltvId(channel.xmltvId)
    .toLowerCase()
    .match(/\.([a-z]{2})$/)?.[1]

  return country ? `country:${country}` : null
}

/**
 * Downloads a guide file and writes it to SQLite, unless a covering window is
 * already stored.
 *
 * Only slots for channels the user actually has are kept. A country file
 * describes every channel published for that country — the US one is 12,776
 * channels and 46,316 slots — and storing the ones no portal carries would be
 * most of the rows, for schedules nothing can ever display.
 */
/** Returns how many slots were stored, or -1 when nothing was attempted. */
async function ingestFeed(key: string, wanted: Set<string>): Promise<number> {
  const handle = await db

  const stored = await handle.getFirstAsync<{
    valid_to: number
    wanted_count: number
  }>("SELECT valid_to, wanted_count FROM epg_feed WHERE key = ?", key)

  // A window is fetched hours ahead of the clock, so it stays usable until it
  // runs out rather than for a fixed interval after the download — but only for
  // the channels it was filtered against. A larger set means channels have
  // joined the catalogue since, and their slots were dropped on the way in, so
  // the feed has to be read again for them.
  if (
    stored &&
    stored.valid_to > Date.now() &&
    stored.wanted_count >= wanted.size
  ) {
    return -1
  }

  const [kind, value] = key.split(":")
  const query = kind === "source" ? `sourceId=${value}` : `country=${value}`

  const response = await apiFetch(`/api/epg/now?${query}`)
  if (!response.ok) return -1

  const data = (await response.json()) as FeedResponse
  if (!data?.channels) return -1

  let inserted = 0

  await handle.withTransactionAsync(async () => {
    await handle.runAsync("DELETE FROM epg_slot WHERE feed = ?", key)

    // Rows are inserted in batches rather than one statement each. A user with
    // a few thousand channels in one country has tens of thousands of slots,
    // and awaiting a native call per row is seconds of work; a multi-row VALUES
    // list turns that into a couple of hundred calls.
    //
    // 199 rows at five bound parameters each is 995, just under SQLite's
    // conservative ceiling of 999 per statement — a third fewer round trips
    // than 150 for nothing.
    const BATCH = 199
    const params: Array<string | number> = []
    let pending = 0

    const flush = async () => {
      if (!pending) return
      const values = Array.from({ length: pending }, () => "(?,?,?,?,?)").join(
        ",",
      )
      await handle.runAsync(
        `INSERT INTO epg_slot (feed, xmltv_id, start_at, stop_at, title) VALUES ${values}`,
        ...params,
      )
      params.length = 0
      pending = 0
    }

    for (const [rawId, slots] of Object.entries(data.channels)) {
      const id = normalizeXmltvId(rawId)
      if (!wanted.has(id)) continue

      for (const [startAt, stopAt, title] of slots) {
        params.push(key, id, startAt, stopAt, title)
        pending++
        inserted++
        if (pending >= BATCH) await flush()
      }
    }

    await flush()

    if (__DEV__) {
      const feedIds = Object.keys(data.channels)
      console.log(
        `[portalhop] epg ${key}: feed had ${feedIds.length} channels, ` +
          `${wanted.size} wanted, ${inserted} slots stored`,
      )
      // Nothing matched, so the two sides are naming channels differently.
      // Printing a few of each is what tells them apart — a guide id that
      // needs normalising reads quite unlike one that is simply absent.
      if (!inserted && feedIds.length && wanted.size) {
        console.log(
          `[portalhop] epg ${key} matched nothing.\n` +
            `  feed ids:   ${feedIds.slice(0, 5).map(normalizeXmltvId).join(", ")}\n` +
            `  wanted ids: ${[...wanted].slice(0, 5).join(", ")}`,
        )
      }
    }

    // Only recorded when something was actually stored. Marking an empty
    // ingest as current would make it permanent: the feed would read as
    // covering its window, never be retried, and those channels would show no
    // guide until the window expired hours later.
    if (inserted > 0) {
      await handle.runAsync(
        "INSERT OR REPLACE INTO epg_feed (key, valid_to, wanted_count) VALUES (?, ?, ?)",
        key,
        data.to,
        wanted.size,
      )
    }
  })

  return inserted
}

// One download per feed even when several screens ask at once. Cleared on
// failure so a feed that was offline is retried rather than written off.
const inFlight = new Map<string, Promise<void>>()

// Feeds that downloaded fine but matched none of the user's channels. Since
// nothing was stored, they are no longer marked as covering their window, so
// without this every scroll would pull the same megabytes down again to reach
// the same answer. Held in memory only — a relaunch retries.
const matchedNothing = new Set<string>()

export function ensureFeed(key: string, wanted: Set<string>) {
  if (matchedNothing.has(key)) return Promise.resolve()

  const existing = inFlight.get(key)
  if (existing) return existing

  const task = ingestFeed(key, wanted)
    .then((stored) => {
      if (stored === 0) matchedNothing.add(key)
    })
    .finally(() => inFlight.delete(key))

  inFlight.set(key, task)
  return task
}

/**
 * What is airing right now, for every channel in the table.
 *
 * Not narrowed to the rows on screen. Scoping it to the viewport meant a row's
 * guide depended on it having been reported visible, and a viewability callback
 * that fired at the wrong moment — during a filter change, say — left channels
 * blank that had a programme stored the whole time. The table only ever holds
 * channels the user actually has, and only one programme per channel can be
 * airing, so the whole answer is one indexed query and a map of at most a few
 * thousand entries.
 */
export async function queryNowPlaying(
  now: number,
): Promise<Map<string, NowPlaying>> {
  const found = new Map<string, NowPlaying>()
  const handle = await db

  const rows = await handle.getAllAsync<{
    xmltv_id: string
    start_at: number
    stop_at: number
    title: string
  }>(
    `SELECT xmltv_id, start_at, stop_at, title FROM epg_slot
     WHERE start_at <= ? AND stop_at > ?`,
    now,
    now,
  )

  for (const row of rows) {
    found.set(row.xmltv_id, {
      title: row.title,
      startAt: row.start_at,
      stopAt: row.stop_at,
    })
  }

  return found
}

/**
 * Guide ids whose programme right now matches a query.
 *
 * Answered in SQL rather than by reading the now-playing map the list already
 * holds, because that map belongs to the provider the list renders, and the
 * list cannot consume a context it supplies. This is also the cheaper of the
 * two: the time predicate cuts the table to roughly one row per channel before
 * a single title is compared, so the LIKE never sees the whole schedule.
 *
 * Titles only, and only what is on right now. Both limits are the same idea:
 * a row shows the current programme's title and nothing else, so a match on a
 * description, or on something starting in three hours, returns a channel with
 * no visible reason to be in the results. That reads as a broken filter rather
 * than as a wider one.
 */
export async function searchNowPlaying(
  query: string,
  now: number,
): Promise<Set<string>> {
  const term = query.trim()
  if (term.length < 2) return new Set()

  const handle = await db
  // LIKE is case-insensitive for ASCII in SQLite by default. Underscore and
  // percent are its wildcards, so they are escaped rather than left to match
  // everything.
  const escaped = term.replace(/[\\%_]/g, (character) => `\\${character}`)

  const rows = await handle.getAllAsync<{ xmltv_id: string }>(
    `SELECT DISTINCT xmltv_id FROM epg_slot
     WHERE start_at <= ? AND stop_at > ? AND title LIKE ? ESCAPE '\\'`,
    now,
    now,
    `%${escaped}%`,
  )

  return new Set(rows.map((row) => row.xmltv_id))
}

/** The whole stored schedule for one channel, in order — what the detail screen lists. */
export async function querySchedule(
  xmltvId: string,
  from: number,
): Promise<Programme[]> {
  const handle = await db

  const rows = await handle.getAllAsync<{
    start_at: number
    stop_at: number
    title: string
  }>(
    `SELECT start_at, stop_at, title FROM epg_slot
     WHERE xmltv_id = ? AND stop_at > ?
     ORDER BY start_at`,
    normalizeXmltvId(xmltvId),
    from,
  )

  return rows.map((row) => ({
    title: row.title,
    startAt: row.start_at,
    stopAt: row.stop_at,
  }))
}

/**
 * Forgets which feeds are current, so the next scroll downloads them again.
 *
 * What pull to refresh reaches for. The stored slots are deliberately left in
 * place: they are still the best answer until the replacement arrives, and
 * clearing them would blank every row for as long as the download takes.
 */
export async function invalidateFeeds() {
  matchedNothing.clear()
  const handle = await db
  await handle.runAsync("DELETE FROM epg_feed")
}

/** Drops rows whose programmes have finished, so the table tracks the window rather than growing. */
export async function pruneExpiredSlots() {
  const handle = await db
  await handle.runAsync("DELETE FROM epg_slot WHERE stop_at < ?", Date.now())
  await handle.runAsync("DELETE FROM epg_feed WHERE valid_to < ?", Date.now())
}
