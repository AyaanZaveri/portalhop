import { eq } from "drizzle-orm"

import { userSettings } from "@/db/schema"
import {
  DEFAULT_USER_SETTINGS,
  type UserSettingsData,
} from "@/lib/user-settings"

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
