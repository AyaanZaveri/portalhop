import { eq } from "drizzle-orm"

import { userSettings } from "@/db/schema"
import { generateFavoritesToken } from "@/lib/favorites-token"

type Db = ReturnType<typeof import("@/db/client").getDb>

/** Resolves the owning user id for a favorites-playlist token, or null. */
export async function getUserIdByFavoritesToken(
  db: Db,
  token: string,
): Promise<string | null> {
  if (!token) {
    return null
  }

  const [row] = await db
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(eq(userSettings.favoritesToken, token))
    .limit(1)

  return row?.userId ?? null
}

/** Returns the user's existing favorites token, creating one if absent. */
export async function ensureFavoritesToken(
  db: Db,
  userId: string,
): Promise<string> {
  const [row] = await db
    .select({ favoritesToken: userSettings.favoritesToken })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)

  if (row?.favoritesToken) {
    return row.favoritesToken
  }

  return setFavoritesToken(db, userId, generateFavoritesToken())
}

/** Rotates the user's favorites token, invalidating any previously shared URL. */
export async function regenerateFavoritesToken(
  db: Db,
  userId: string,
): Promise<string> {
  return setFavoritesToken(db, userId, generateFavoritesToken())
}

async function setFavoritesToken(db: Db, userId: string, token: string) {
  const now = new Date()

  await db
    .insert(userSettings)
    .values({ userId, favoritesToken: token, updatedAt: now })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { favoritesToken: token, updatedAt: now },
    })

  return token
}
