import { and, eq, sql } from "drizzle-orm"

import { getDb } from "@/db/client"
import { savedChannels } from "@/db/schema"
import type { SourceType } from "@/lib/source-types"
import type { PortalChannel } from "@/lib/stalker-types"
import { normalizeXmltvId } from "@/lib/xmltv-id"

// Measured against the live database: 100 rows/statement spends most of a
// refresh waiting on round-trips, and 500 is ~2.2x faster. Past 500 the gain
// flattens and then reverses as statement parsing costs more than the saved
// latency. 500 rows is 6,500 bind parameters, well inside Postgres' 65,535 cap.
const CHANNEL_INSERT_BATCH_SIZE = 500
const CHANNEL_UPDATE_BATCH_SIZE = 500

type ChannelDatabase = Pick<ReturnType<typeof getDb>, "insert" | "delete">

function normalizeIdentityPart(value: string | undefined) {
  return (value ?? "").trim().toLowerCase()
}

function m3uStreamIdentity(command: string) {
  // Playlist URLs often carry rotating auth query parameters. The origin and
  // pathname identify the stream without tying a channel to those credentials.
  return normalizeIdentityPart(command).split("?")[0].replace(/^ffmpeg\s+/, "")
}

function channelIdentityBase(channel: PortalChannel, sourceType: SourceType) {
  if (sourceType !== "m3u") {
    return `provider:${normalizeIdentityPart(channel.id)}`
  }

  return [
    "m3u",
    normalizeIdentityPart(normalizeXmltvId(channel.xmltvId)),
    normalizeIdentityPart(channel.name),
    normalizeIdentityPart(channel.genre),
    m3uStreamIdentity(channel.cmd),
  ].join("|")
}

function channelsWithIdentityKeys(
  channels: PortalChannel[],
  sourceType: SourceType,
) {
  const occurrences = new Map<string, number>()
  return channels.map((channel) => {
    const base = channelIdentityBase(channel, sourceType)
    const occurrence = (occurrences.get(base) ?? 0) + 1
    occurrences.set(base, occurrence)
    // Truly identical duplicate rows have no independent identity. Keeping a
    // deterministic occurrence suffix lets both survive without conflating
    // them, as long as the provider retains their order.
    return {
      channel,
      identityKey: occurrence === 1 ? base : `${base}#${occurrence}`,
    }
  })
}

function channelValues(
  sourceId: number,
  channel: PortalChannel,
  identityKey: string,
  timestamp: Date,
) {
  return {
    sourceId,
    identityKey,
    channelId: channel.id,
    xmltvId: normalizeXmltvId(channel.xmltvId),
    number: channel.number,
    name: channel.name,
    genreId: channel.genreId,
    genre: channel.genre,
    cmd: channel.cmd,
    logo: channel.logo,
    logoUrl: channel.logoUrl,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export async function insertSavedChannels(
  db: ChannelDatabase,
  sourceId: number,
  sourceType: SourceType,
  channels: PortalChannel[],
  timestamp: Date
) {
  const keyedChannels = channelsWithIdentityKeys(channels, sourceType)
  for (let index = 0; index < keyedChannels.length; index += CHANNEL_INSERT_BATCH_SIZE) {
    const batch = keyedChannels.slice(index, index + CHANNEL_INSERT_BATCH_SIZE)
    await db.insert(savedChannels).values(
      batch.map(({ channel, identityKey }) =>
        channelValues(sourceId, channel, identityKey, timestamp),
      ),
    )
  }
}

/**
 * Refresh a source without replacing its channel rows. Favorites, groups,
 * playback links, and channel URLs reference those row IDs, so a refresh must
 * update matching rows in place and remove only rows that truly disappeared.
 */
export async function syncSavedChannels(
  db: ChannelDatabase,
  sourceId: number,
  sourceType: SourceType,
  channels: PortalChannel[],
  timestamp: Date,
) {
  const keyedChannels = channelsWithIdentityKeys(channels, sourceType)

  for (let index = 0; index < keyedChannels.length; index += CHANNEL_INSERT_BATCH_SIZE) {
    const batch = keyedChannels.slice(index, index + CHANNEL_INSERT_BATCH_SIZE)
    await db
      .insert(savedChannels)
      .values(
        batch.map(({ channel, identityKey }) =>
          channelValues(sourceId, channel, identityKey, timestamp),
        ),
      )
      .onConflictDoUpdate({
        target: [savedChannels.sourceId, savedChannels.identityKey],
        set: {
          channelId: sql`excluded.channel_id`,
          // A hand-picked EPG match outranks whatever the provider reports, or
          // the next refresh would quietly undo it.
          xmltvId: sql`case when ${savedChannels.xmltvIdLocked} then ${savedChannels.xmltvId} else excluded.xmltv_id end`,
          number: sql`excluded.number`,
          name: sql`excluded.name`,
          genreId: sql`excluded.genre_id`,
          genre: sql`excluded.genre`,
          cmd: sql`excluded.cmd`,
          logo: sql`excluded.logo`,
          logoUrl: sql`excluded.logo_url`,
          updatedAt: timestamp,
        },
      })
  }

  if (!keyedChannels.length) {
    await db.delete(savedChannels).where(eq(savedChannels.sourceId, sourceId))
    return
  }

  // notInArray() binds one parameter per key, and Postgres caps a bind message
  // at 65,535 parameters — a large source blows straight past that. Passing the
  // keys as a single text[] keeps this to one parameter at any size, and the
  // anti-join against unnest() hashes the set instead of rescanning it per row.
  await db.delete(savedChannels).where(
    and(
      eq(savedChannels.sourceId, sourceId),
      sql`not exists (
        select 1
        from unnest(${sql.param(keyedChannels.map(({ identityKey }) => identityKey))}::text[]) as provided(identity_key)
        where provided.identity_key = ${savedChannels.identityKey}
      )`,
    ),
  )
}

export type SavedChannelRow = {
  id: number
  name: string
  xmltvId: string
}

/** Load the (id, name, xmltvId) of every channel for a source, for enrichment. */
export async function selectSavedChannelRows(
  sourceId: number
): Promise<SavedChannelRow[]> {
  const db = getDb()

  const rows = await db
    .select({
      id: savedChannels.id,
      name: savedChannels.name,
      xmltvId: savedChannels.xmltvId,
    })
    .from(savedChannels)
    .where(eq(savedChannels.sourceId, sourceId))

  return rows
}

/**
 * Apply xmltv id assignments in batches. A single UPDATE … FROM (VALUES …)
 * statement updates hundreds of rows with distinct ids, avoiding one network
 * round-trip per EPG channel for large sources.
 */
export async function applyXmltvIdUpdates(
  updates: { id: number; xmltvId: string }[],
  onBatchApplied?: (batch: { id: number; xmltvId: string }[]) => void | Promise<void>
): Promise<number> {
  if (!updates.length) {
    return 0
  }

  const db = getDb()
  const now = new Date()

  let updated = 0

  for (let index = 0; index < updates.length; index += CHANNEL_UPDATE_BATCH_SIZE) {
    const batch = updates.slice(index, index + CHANNEL_UPDATE_BATCH_SIZE)
    const values = sql.join(
      batch.map(({ id, xmltvId }) => sql`(${id}::integer, ${xmltvId}::text)`),
      sql`, `
    )

    // Skips rows whose match was set by hand — the AI pass is a guess, and a
    // guess should not overwrite an answer.
    await db.execute(sql`
      UPDATE "saved_channels" AS channel
      SET "xmltv_id" = assignment.xmltv_id,
          "updated_at" = ${now}
      FROM (VALUES ${values}) AS assignment(id, xmltv_id)
      WHERE channel.id = assignment.id
        AND channel."xmltv_id_locked" = false
    `)
    await onBatchApplied?.(batch)
    updated += batch.length
  }

  return updated
}

/** Pin a saved channel to an EPG id chosen by hand, or release it back to the
 * provider's own value. Ownership is checked by the caller. */
export async function setSavedChannelXmltvId(
  savedChannelId: number,
  sourceId: number,
  xmltvId: string,
) {
  const db = getDb()
  const normalized = normalizeXmltvId(xmltvId)

  const [row] = await db
    .update(savedChannels)
    .set({
      xmltvId: normalized,
      // Clearing the match hands the channel back to the provider, so the lock
      // lifts with it.
      xmltvIdLocked: normalized !== "",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(savedChannels.id, savedChannelId),
        eq(savedChannels.sourceId, sourceId),
      ),
    )
    .returning({
      id: savedChannels.id,
      xmltvId: savedChannels.xmltvId,
      xmltvIdLocked: savedChannels.xmltvIdLocked,
    })

  return row ?? null
}
