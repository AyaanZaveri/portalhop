import { and, eq, sql, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

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
 * Merges column by column, keeping what is already stored wherever the reading
 * says nothing. This replaced a whole-row write, which was quietly erasing the
 * table faster than it filled it.
 *
 * No client learns everything at once. The web build knows the resolution as
 * soon as the first frame decodes and the bitrate only after ten seconds of
 * one rendition, so the early write carried a null frame rate and a null
 * bitrate — and overwrote the figures the last viewing had worked out. That is
 * why a refresh emptied the badges and then filled them back in one at a time,
 * having thrown away the answers a moment before recomputing them.
 *
 * Across clients it was worse, because the phone cannot measure at all. It
 * reports whatever its video track declares and nulls for the rest, so opening
 * a channel on mobile deleted the frame rate the browser had counted. A reading
 * is evidence about the fields it carries and says nothing about the others;
 * only a field it actually names may replace what is stored.
 *
 * A non-null figure still replaces, lower or not. A portal that requantises a
 * stream down really has changed it, and the newer reading is the true one.
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
  const table = savedChannelStreamInfo
  // Each flag is decided by its own figure, not by its own previous value: a
  // measured frame rate arriving over a declared one has to bring its mark
  // with it, and a reading with no frame rate must not touch either.
  const carried = (column: PgColumn, incoming: SQL) =>
    sql`coalesce(${incoming}, ${column})`

  await db
    .insert(table)
    .values({ savedChannelId, ...info, seenAt })
    .onConflictDoUpdate({
      target: table.savedChannelId,
      set: {
        width: carried(table.width, sql`excluded.width`),
        height: carried(table.height, sql`excluded.height`),
        frameRate: carried(table.frameRate, sql`excluded.frame_rate`),
        bandwidth: carried(table.bandwidth, sql`excluded.bandwidth`),
        frameRateMeasured: sql`case when excluded.frame_rate is null then ${table.frameRateMeasured} else excluded.frame_rate_measured end`,
        bandwidthMeasured: sql`case when excluded.bandwidth is null then ${table.bandwidthMeasured} else excluded.bandwidth_measured end`,
        seenAt,
      },
    })

  return true
}
