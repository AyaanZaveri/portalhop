import { and, asc, eq } from "drizzle-orm"

import { favorites } from "@/db/schema"

type Db = ReturnType<typeof import("@/db/client").getDb>

export async function listFavorites(
  db: Db,
  userId: string
): Promise<string[]> {
  const rows = await db
    .select({ channelKey: favorites.channelKey })
    .from(favorites)
    .where(eq(favorites.userId, userId))
    // Manual order first; created_at breaks ties for rows added before a
    // reorder, which all share position 0 until one is written.
    .orderBy(asc(favorites.position), asc(favorites.createdAt), asc(favorites.id))

  return rows.map((row) => row.channelKey)
}

export async function addFavorites(
  db: Db,
  userId: string,
  channelKeys: string[]
): Promise<void> {
  const unique = [...new Set(channelKeys.map((key) => key.trim()).filter(Boolean))]

  if (!unique.length) {
    return
  }

  const now = new Date()

  await db
    .insert(favorites)
    .values(
      unique.map((channelKey) => ({ userId, channelKey, createdAt: now }))
    )
    .onConflictDoNothing({
      target: [favorites.userId, favorites.channelKey],
    })
}

export async function removeFavorite(
  db: Db,
  userId: string,
  channelKey: string
): Promise<void> {
  await db
    .delete(favorites)
    .where(
      and(eq(favorites.userId, userId), eq(favorites.channelKey, channelKey))
    )
}

/**
 * Rewrites the user's favourite order. Positions come from the given sequence
 * rather than from the client, so a stale list cannot leave gaps or duplicates.
 */
export async function setFavoriteOrder(
  db: Db,
  userId: string,
  channelKeys: string[],
): Promise<void> {
  const seen = new Set<string>()
  const ordered = channelKeys
    .map((key) => key.trim())
    .filter((key) => key && !seen.has(key) && (seen.add(key), true))

  if (!ordered.length) {
    return
  }

  await db.transaction(async (tx) => {
    for (const [index, channelKey] of ordered.entries()) {
      await tx
        .update(favorites)
        .set({ position: index })
        .where(
          and(eq(favorites.userId, userId), eq(favorites.channelKey, channelKey)),
        )
    }
  })
}
