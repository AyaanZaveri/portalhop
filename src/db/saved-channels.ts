import { savedChannels } from "@/db/schema"
import type { PortalChannel } from "@/lib/stalker-types"

const CHANNEL_INSERT_BATCH_SIZE = 100

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
  portalId: number,
  channels: PortalChannel[],
  timestamp: Date
) {
  for (let index = 0; index < channels.length; index += CHANNEL_INSERT_BATCH_SIZE) {
    const batch = channels.slice(index, index + CHANNEL_INSERT_BATCH_SIZE)
    const insert = db.insert(savedChannels).values(
      batch.map((channel) => ({
        portalId,
        channelId: channel.id,
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
