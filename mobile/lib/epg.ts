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
  if (source?.epgMode === "none") return null

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
async function ingestFeed(key: string, wanted: Set<string>) {
  const handle = await db

  const stored = await handle.getFirstAsync<{ valid_to: number }>(
    "SELECT valid_to FROM epg_feed WHERE key = ?",
    key,
  )
  // A window is fetched hours ahead of the clock, so it stays usable until it
  // runs out rather than for a fixed interval after the download.
  if (stored && stored.valid_to > Date.now()) return

  const [kind, value] = key.split(":")
  const query = kind === "source" ? `sourceId=${value}` : `country=${value}`

  const response = await apiFetch(`/api/epg/now?${query}`)
  if (!response.ok) return

  const data = (await response.json()) as FeedResponse
  if (!data?.channels) return

  await handle.withTransactionAsync(async () => {
    await handle.runAsync("DELETE FROM epg_slot WHERE feed = ?", key)

    // Rows are inserted in batches rather than one statement each. A user with
    // a few thousand channels in one country has tens of thousands of slots,
    // and awaiting a native call per row is seconds of work; a multi-row VALUES
    // list turns that into a couple of hundred calls.
    //
    // 150 rows is five bound parameters each, staying under SQLite's default
    // ceiling of 999 per statement.
    const BATCH = 150
    const params: Array<string | number> = []
    let pending = 0

    const flush = async () => {
      if (!pending) return
      const values = Array.from({ length: pending }, () => "(?,?,?,?,?)").join(",")
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
        if (pending >= BATCH) await flush()
      }
    }

    await flush()

    await handle.runAsync(
      "INSERT OR REPLACE INTO epg_feed (key, valid_to) VALUES (?, ?)",
      key,
      data.to,
    )
  })
}

// One download per feed even when several screens ask at once. Cleared on
// failure so a feed that was offline is retried rather than written off.
const inFlight = new Map<string, Promise<void>>()

export function ensureFeed(key: string, wanted: Set<string>) {
  const existing = inFlight.get(key)
  if (existing) return existing

  const task = ingestFeed(key, wanted).finally(() => inFlight.delete(key))
  inFlight.set(key, task)
  return task
}

/** What is airing right now on each of the given channels. */
export async function queryNowPlaying(
  ids: string[],
  now: number,
): Promise<Map<string, NowPlaying>> {
  const found = new Map<string, NowPlaying>()
  if (!ids.length) return found

  const handle = await db
  const placeholders = ids.map(() => "?").join(",")

  const rows = await handle.getAllAsync<{
    xmltv_id: string
    start_at: number
    stop_at: number
    title: string
  }>(
    `SELECT xmltv_id, start_at, stop_at, title FROM epg_slot
     WHERE xmltv_id IN (${placeholders}) AND start_at <= ? AND stop_at > ?`,
    ...ids,
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

/** Drops rows whose programmes have finished, so the table tracks the window rather than growing. */
export async function pruneExpiredSlots() {
  const handle = await db
  await handle.runAsync("DELETE FROM epg_slot WHERE stop_at < ?", Date.now())
  await handle.runAsync("DELETE FROM epg_feed WHERE valid_to < ?", Date.now())
}
