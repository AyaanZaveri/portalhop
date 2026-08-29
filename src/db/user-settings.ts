import { eq } from "drizzle-orm"

import { userSettings } from "@/db/schema"
import {
  DEFAULT_USER_SETTINGS,
  type UserSettingsData,
} from "@portalhop/shared/user-settings"
import { sanitizeEpgKindOrder } from "@portalhop/shared/epg-preference"

type Db = ReturnType<typeof import("@/db/client").getDb>

export async function getUserSettings(
  db: Db,
  userId: string
): Promise<UserSettingsData> {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)

  if (!row) {
    return { ...DEFAULT_USER_SETTINGS }
  }

  return {
    enabledSourceIds: Array.isArray(row.enabledSourceIds)
      ? row.enabledSourceIds
      : [],
    iptvOrgEnabled: row.iptvOrgEnabled,
    useProxy: row.useProxy,
    useImageProxy: row.useImageProxy,
    // Sanitized on the way out as well as in: the column predates nothing, but
    // a row written before it existed carries the default, and a hand-edited
    // one can carry anything.
    epgKindOrder: sanitizeEpgKindOrder(row.epgKindOrder),
    sourcePriorityIds: Array.isArray(row.sourcePriorityIds)
      ? row.sourcePriorityIds.filter((id): id is number => Number.isInteger(id) && id > 0)
      : [],
    epgProviderOrder: Array.isArray(row.epgProviderOrder)
      ? row.epgProviderOrder.filter((id): id is string => typeof id === "string")
      : ["iptv-org"],
  }
}

export async function updateUserSettings(
  db: Db,
  userId: string,
  patch: Partial<UserSettingsData>
): Promise<UserSettingsData> {
  const current = await getUserSettings(db, userId)
  const next: UserSettingsData = { ...current, ...patch }
  const now = new Date()

  await db
    .insert(userSettings)
    .values({ userId, ...next, updatedAt: now })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...next, updatedAt: now },
    })

  return next
}
