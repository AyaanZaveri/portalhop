import { eq, inArray } from "drizzle-orm"

import { getDb } from "@/db/client"
import { savedChannels } from "@/db/schema"
import type { PortalChannel } from "@/lib/stalker-types"

const CHANNEL_INSERT_BATCH_SIZE = 100
const CHANNEL_UPDATE_BATCH_SIZE = 500

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
 * Apply xmltv id assignments to channel rows. Rows are grouped by their target
 * id so we run one UPDATE per distinct xmltv id (bounded by the EPG list size)
 * rather than one per channel.
 */
export async function applyXmltvIdUpdates(
  updates: { id: number; xmltvId: string }[]
): Promise<number> {
  if (!updates.length) {
    return 0
  }

  const db = getDb()
  const now = new Date()

  const byXmltvId = new Map<string, number[]>()
  for (const update of updates) {
    const bucket = byXmltvId.get(update.xmltvId)
    if (bucket) {
      bucket.push(update.id)
    } else {
      byXmltvId.set(update.xmltvId, [update.id])
    }
  }

  let updated = 0

  for (const [xmltvId, rowIds] of byXmltvId) {
    for (
      let index = 0;
      index < rowIds.length;
      index += CHANNEL_UPDATE_BATCH_SIZE
    ) {
      const batch = rowIds.slice(index, index + CHANNEL_UPDATE_BATCH_SIZE)
      await db
        .update(savedChannels)
        .set({ xmltvId, updatedAt: now })
        .where(inArray(savedChannels.id, batch))
      updated += batch.length
    }
  }

  return updated
}
