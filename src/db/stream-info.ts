import { and, eq } from "drizzle-orm"

import { savedChannelStreamInfo, savedChannels, savedSources } from "@/db/schema"

type Db = ReturnType<typeof import("@/db/client").getDb>

export type StreamInfo = {
  width: number | null
  height: number | null
  frameRate: number | null
  bandwidth: number | null
  frameRateMeasured: boolean
  bandwidthMeasured: boolean
  seenAt: string
}

/**
 * Everything this user's player has learned, as saved channel id -> what it
 * turned out to be.
 *
 * Read whole rather than per channel. It is sparse by construction — a row
 * only where a stream has actually been watched — and the sources drawer wants
 * every row of one channel at once, which is a lookup rather than a query.
 */
export async function listStreamInfo(db: Db, userId: string) {
  const rows = await db
    .select({
      savedChannelId: savedChannelStreamInfo.savedChannelId,
      width: savedChannelStreamInfo.width,
      height: savedChannelStreamInfo.height,
      frameRate: savedChannelStreamInfo.frameRate,
      bandwidth: savedChannelStreamInfo.bandwidth,
      frameRateMeasured: savedChannelStreamInfo.frameRateMeasured,
      bandwidthMeasured: savedChannelStreamInfo.bandwidthMeasured,
      seenAt: savedChannelStreamInfo.seenAt,
    })
    .from(savedChannelStreamInfo)
    .innerJoin(
      savedChannels,
      eq(savedChannels.id, savedChannelStreamInfo.savedChannelId),
    )
    .innerJoin(savedSources, eq(savedSources.id, savedChannels.sourceId))
    .where(eq(savedSources.userId, userId))

  const info: Record<number, StreamInfo> = {}
  for (const row of rows) {
    info[row.savedChannelId] = {
      width: row.width,
      height: row.height,
      frameRate: row.frameRate,
      bandwidth: row.bandwidth,
      frameRateMeasured: row.frameRateMeasured,
      bandwidthMeasured: row.bandwidthMeasured,
      seenAt: row.seenAt.toISOString(),
    }
  }
  return info
}

/**
 * Records what a stream turned out to be.
 *
 * Ownership is checked rather than assumed: a saved channel is reachable by id,
 * so the join is what stops one account writing readings onto another's rows.
 *
 * Replaces rather than merges, and stamps the time. A stream that has been
 * requantised reports different figures, and the newer reading is the true one
 * — keeping the higher of the two would preserve a resolution the portal no
 * longer sends.
 */
export async function recordStreamInfo(
  db: Db,
  userId: string,
  savedChannelId: number,
  info: {
    width: number | null
    height: number | null
    frameRate: number | null
    bandwidth: number | null
    frameRateMeasured: boolean
    bandwidthMeasured: boolean
  },
) {
  const owned = await db
    .select({ id: savedChannels.id })
    .from(savedChannels)
    .innerJoin(savedSources, eq(savedChannels.sourceId, savedSources.id))
    .where(
      and(eq(savedSources.userId, userId), eq(savedChannels.id, savedChannelId)),
    )
    .limit(1)

  if (!owned.length) return false

  const seenAt = new Date()
  await db
    .insert(savedChannelStreamInfo)
    .values({ savedChannelId, ...info, seenAt })
    .onConflictDoUpdate({
      target: savedChannelStreamInfo.savedChannelId,
      set: { ...info, seenAt },
    })

  return true
}
