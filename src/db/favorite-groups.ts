import { and, asc, eq, inArray } from "drizzle-orm"

import { favoriteGroupChannels, favoriteGroups } from "@/db/schema"

type Db = ReturnType<typeof import("@/db/client").getDb>

export type FavoriteGroup = {
  id: number
  name: string
  icon: string
  channelKeys: string[]
}

export async function listFavoriteGroups(db: Db, userId: string) {
  const groups = await db
    .select({
      id: favoriteGroups.id,
      name: favoriteGroups.name,
      icon: favoriteGroups.icon,
    })
    .from(favoriteGroups)
    .where(eq(favoriteGroups.userId, userId))
    .orderBy(asc(favoriteGroups.createdAt), asc(favoriteGroups.id))

  if (!groups.length) return []

  const memberships = await db
    .select({
      favoriteGroupId: favoriteGroupChannels.favoriteGroupId,
      channelKey: favoriteGroupChannels.channelKey,
    })
    .from(favoriteGroupChannels)
    .where(inArray(favoriteGroupChannels.favoriteGroupId, groups.map((group) => group.id)))
    .orderBy(
      asc(favoriteGroupChannels.position),
      asc(favoriteGroupChannels.createdAt),
      asc(favoriteGroupChannels.channelKey),
    )

  const keysByGroup = new Map<number, Set<string>>()
  for (const membership of memberships) {
    const keys = keysByGroup.get(membership.favoriteGroupId) ?? new Set<string>()
    // Saved-channel catalogue keys no longer include a stream command. Keep
    // prior memberships valid by normalizing their permanent source/channel
    // identity when a group is read; this also de-duplicates an old and new
    // representation of the same channel.
    keys.add(normalizeSavedChannelKey(membership.channelKey))
    keysByGroup.set(membership.favoriteGroupId, keys)
  }

  return groups.map((group) => ({
    ...group,
    channelKeys: [...(keysByGroup.get(group.id) ?? [])],
  }))
}

function normalizeSavedChannelKey(key: string) {
  try {
    const parsed = JSON.parse(key)
    if (!Array.isArray(parsed) || !Number.isInteger(parsed[0]) || !Number.isInteger(parsed[1])) {
      return key
    }

    // Saved-channel favorites are now deliberately just source + row ID. The
    // row survives a refresh, while channel name/number/stream data can vary.
    return JSON.stringify([parsed[0], parsed[1]])
  } catch {
    return key
  }
}

export async function createFavoriteGroup(
  db: Db,
  userId: string,
  group: Omit<FavoriteGroup, "id" | "channelKeys">,
) {
  const [created] = await db
    .insert(favoriteGroups)
    .values({ ...group, userId, createdAt: new Date() })
    .returning({
      id: favoriteGroups.id,
      name: favoriteGroups.name,
      icon: favoriteGroups.icon,
    })

  return { ...created, channelKeys: [] }
}

export async function deleteFavoriteGroup(db: Db, userId: string, groupId: number) {
  await db.delete(favoriteGroups).where(
    and(eq(favoriteGroups.id, groupId), eq(favoriteGroups.userId, userId)),
  )
}

export async function updateFavoriteGroup(
  db: Db,
  userId: string,
  groupId: number,
  group: Omit<FavoriteGroup, "id" | "channelKeys">,
) {
  const [updated] = await db
    .update(favoriteGroups)
    .set(group)
    .where(and(eq(favoriteGroups.id, groupId), eq(favoriteGroups.userId, userId)))
    .returning({
      id: favoriteGroups.id,
      name: favoriteGroups.name,
      icon: favoriteGroups.icon,
    })

  return updated ?? null
}

export async function setFavoriteGroupChannel(
  db: Db,
  userId: string,
  groupId: number,
  channelKey: string,
  included: boolean,
) {
  const [group] = await db
    .select({ id: favoriteGroups.id })
    .from(favoriteGroups)
    .where(and(eq(favoriteGroups.id, groupId), eq(favoriteGroups.userId, userId)))
    .limit(1)

  if (!group) return false

  if (included) {
    await db
      .insert(favoriteGroupChannels)
      .values({ favoriteGroupId: groupId, channelKey, createdAt: new Date() })
      .onConflictDoNothing({
        target: [favoriteGroupChannels.favoriteGroupId, favoriteGroupChannels.channelKey],
      })
  } else {
    await db.delete(favoriteGroupChannels).where(
      and(
        eq(favoriteGroupChannels.favoriteGroupId, groupId),
        eq(favoriteGroupChannels.channelKey, channelKey),
      ),
    )
  }

  return true
}

/**
 * Rewrites a group's channel order. Positions are assigned from the given
 * sequence rather than trusted from the client, so a stale or partial list
 * cannot leave gaps or duplicates behind.
 */
export async function setFavoriteGroupChannelOrder(
  db: Db,
  userId: string,
  groupId: number,
  channelKeys: string[],
): Promise<boolean> {
  const [group] = await db
    .select({ id: favoriteGroups.id })
    .from(favoriteGroups)
    .where(and(eq(favoriteGroups.id, groupId), eq(favoriteGroups.userId, userId)))
    .limit(1)

  if (!group) {
    return false
  }

  const seen = new Set<string>()
  const ordered = channelKeys
    .map((key) => normalizeSavedChannelKey(key.trim()))
    .filter((key) => key && !seen.has(key) && (seen.add(key), true))

  if (!ordered.length) {
    return true
  }

  await db.transaction(async (tx) => {
    for (const [index, channelKey] of ordered.entries()) {
      await tx
        .update(favoriteGroupChannels)
        .set({ position: index })
        .where(
          and(
            eq(favoriteGroupChannels.favoriteGroupId, groupId),
            eq(favoriteGroupChannels.channelKey, channelKey),
          ),
        )
    }
  })

  return true
}
