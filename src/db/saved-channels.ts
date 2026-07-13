import { eq, sql } from "drizzle-orm"

import { getDb } from "@/db/client"
import { savedChannels } from "@/db/schema"
import type { PortalChannel } from "@/lib/stalker-types"

const CHANNEL_INSERT_BATCH_SIZE = 100
const CHANNEL_UPDATE_BATCH_SIZE = 100

type ChannelInsert = typeof savedChannels.$inferInsert
type ChannelInserter = {
  insert: (table: typeof savedChannels) => {
    values: (rows: ChannelInsert[]) => {
      run?: () => unknown
      then?: unknown
    }
  }
}

export async function insertSavedChannels(
  db: ChannelInserter,
  sourceId: number,
  channels: PortalChannel[],
  timestamp: Date
) {
  for (let index = 0; index < channels.length; index += CHANNEL_INSERT_BATCH_SIZE) {
    const batch = channels.slice(index, index + CHANNEL_INSERT_BATCH_SIZE)
    const insert = db.insert(savedChannels).values(
      batch.map((channel) => ({
        sourceId,
        channelId: channel.id,
        xmltvId: channel.xmltvId ?? "",
        number: channel.number,
        name: channel.name,
        genreId: channel.genreId,
        genre: channel.genre,
        cmd: channel.cmd,
        logo: channel.logo,
        logoUrl: channel.logoUrl,
        createdAt: timestamp,
        updatedAt: timestamp,
      }))
    )

    if ("run" in insert && typeof insert.run === "function") {
      insert.run()
    } else {
      await insert
    }
  }
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

    await db.execute(sql`
      UPDATE "saved_channels" AS channel
      SET "xmltv_id" = assignment.xmltv_id,
          "updated_at" = ${now}
      FROM (VALUES ${values}) AS assignment(id, xmltv_id)
      WHERE channel.id = assignment.id
    `)
    await onBatchApplied?.(batch)
    updated += batch.length
  }

  return updated
}
