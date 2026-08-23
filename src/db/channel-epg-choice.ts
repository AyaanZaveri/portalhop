import { and, eq, inArray } from "drizzle-orm"

import { channelIdentityPrefs, savedChannels, savedSources } from "@/db/schema"

type Db = ReturnType<typeof import("@/db/client").getDb>

/**
 * Every guide the user has pinned, as identity key -> saved channel id.
 *
 * Read whole rather than per channel, like the source order beside it: the
 * table is sparse — a row only where someone overruled the ranking — and the
 * catalogue needs all of it at once to decide what each row's guide is.
 */
export async function listChannelEpgChoices(db: Db, userId: string) {
  const rows = await db
    .select({
      identityKey: channelIdentityPrefs.identityKey,
      epgSavedChannelId: channelIdentityPrefs.epgSavedChannelId,
    })
    .from(channelIdentityPrefs)
    .where(eq(channelIdentityPrefs.userId, userId))

  const choices: Record<string, number> = {}
  for (const row of rows) {
    // Rows exist for other per-channel preferences too, and a null here means
    // this channel has no pinned guide rather than a pin to nothing.
    if (row.epgSavedChannelId != null) {
      choices[row.identityKey] = row.epgSavedChannelId
    }
  }
  return choices
}

/**
 * Pins one channel's guide, or clears the pin when given null.
 *
 * Clearing writes null rather than deleting the row: the same row carries other
 * per-channel preferences, and dropping it to undo a guide choice would take
 * those with it.
 *
 * An id the user does not own is treated as a clear rather than rejected.
 * saved_channel_id is a foreign key but not a permission — the channels are
 * reachable by id, so the ownership join is what stops someone pinning another
 * account's row into their own preferences. The only way to send a foreign id
 * is a stale catalogue, where falling back to the ranking is the right answer.
 */
export async function saveChannelEpgChoice(
  db: Db,
  userId: string,
  identityKey: string,
  savedChannelId: number | null,
) {
  let owned: number | null = null

  if (savedChannelId != null) {
    const [row] = await db
      .select({ id: savedChannels.id })
      .from(savedChannels)
      .innerJoin(savedSources, eq(savedChannels.sourceId, savedSources.id))
      .where(
        and(
          eq(savedSources.userId, userId),
          inArray(savedChannels.id, [savedChannelId]),
        ),
      )
      .limit(1)

    owned = row?.id ?? null
  }

  const now = new Date()

  await db
    .insert(channelIdentityPrefs)
    .values({
      userId,
      identityKey,
      epgSavedChannelId: owned,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [channelIdentityPrefs.userId, channelIdentityPrefs.identityKey],
      set: { epgSavedChannelId: owned, updatedAt: now },
    })

  return owned
}
