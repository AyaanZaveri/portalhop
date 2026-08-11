import { and, asc, eq, inArray } from "drizzle-orm"

import { channelIdentitySourceOrder, savedChannels, savedSources } from "@/db/schema"

type Db = ReturnType<typeof import("@/db/client").getDb>

/**
 * Every source choice this user has made, as identity key -> saved channel ids,
 * most preferred first.
 *
 * Read whole rather than per channel. It is one small sparse table — a row only
 * where someone has actually chosen — and the catalogue needs all of it at once
 * to decide which stream each row stands for.
 */
export async function listChannelSourceOrder(db: Db, userId: string) {
  const rows = await db
    .select({
      identityKey: channelIdentitySourceOrder.identityKey,
      savedChannelId: channelIdentitySourceOrder.savedChannelId,
    })
    .from(channelIdentitySourceOrder)
    .where(eq(channelIdentitySourceOrder.userId, userId))
    .orderBy(
      asc(channelIdentitySourceOrder.identityKey),
      asc(channelIdentitySourceOrder.position),
    )

  const order: Record<string, number[]> = {}
  for (const row of rows) {
    ;(order[row.identityKey] ??= []).push(row.savedChannelId)
  }
  return order
}

/**
 * Records the order for one channel, replacing whatever was there.
 *
 * Replace rather than merge: the client sends the whole list it just showed the
 * user, and a merge would leave a stream the user dragged out of first place
 * still sitting there under its old position.
 *
 * Ids the user does not own are dropped instead of rejected. saved_channel_id is
 * a foreign key but not a permission — the channels are reachable by id, so the
 * ownership join is what stops someone writing another account's rows into their
 * own ordering. Dropping is right rather than 403: the only way to send a
 * foreign id is a stale catalogue, and the rest of the order is still valid.
 */
export async function saveChannelSourceOrder(
  db: Db,
  userId: string,
  identityKey: string,
  savedChannelIds: number[],
) {
  const owned = savedChannelIds.length
    ? await db
        .select({ id: savedChannels.id })
        .from(savedChannels)
        .innerJoin(savedSources, eq(savedChannels.sourceId, savedSources.id))
        .where(
          and(
            eq(savedSources.userId, userId),
            inArray(savedChannels.id, savedChannelIds),
          ),
        )
    : []

  const ownedIds = new Set(owned.map((row) => row.id))
  const ordered = savedChannelIds.filter((id) => ownedIds.has(id))

  await db.transaction(async (tx) => {
    await tx
      .delete(channelIdentitySourceOrder)
      .where(
        and(
          eq(channelIdentitySourceOrder.userId, userId),
          eq(channelIdentitySourceOrder.identityKey, identityKey),
        ),
      )

    if (!ordered.length) return

    await tx.insert(channelIdentitySourceOrder).values(
      ordered.map((savedChannelId, position) => ({
        userId,
        identityKey,
        savedChannelId,
        position,
      })),
    )
  })

  return ordered
}
