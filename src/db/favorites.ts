import { and, eq } from "drizzle-orm"

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
