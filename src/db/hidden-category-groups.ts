import { and, eq } from "drizzle-orm"

import { hiddenCategoryGroups } from "@/db/schema"

type Db = ReturnType<typeof import("@/db/client").getDb>

export type HiddenCategoryGroup = {
  sourceId: number
  category: string
}

export async function listHiddenCategoryGroups(db: Db, userId: string) {
  return db
    .select({
      sourceId: hiddenCategoryGroups.sourceId,
      category: hiddenCategoryGroups.category,
    })
    .from(hiddenCategoryGroups)
    .where(eq(hiddenCategoryGroups.userId, userId))
}

export async function hideCategoryGroup(
  db: Db,
  userId: string,
  group: HiddenCategoryGroup,
) {
  await db
    .insert(hiddenCategoryGroups)
    .values({ ...group, userId, createdAt: new Date() })
    .onConflictDoNothing({
      target: [
        hiddenCategoryGroups.userId,
        hiddenCategoryGroups.sourceId,
        hiddenCategoryGroups.category,
      ],
    })
}

export async function showCategoryGroup(
  db: Db,
  userId: string,
  group: HiddenCategoryGroup,
) {
  await db.delete(hiddenCategoryGroups).where(
    and(
      eq(hiddenCategoryGroups.userId, userId),
      eq(hiddenCategoryGroups.sourceId, group.sourceId),
      eq(hiddenCategoryGroups.category, group.category),
    ),
  )
}
