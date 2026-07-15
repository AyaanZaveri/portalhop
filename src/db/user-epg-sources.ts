import { and, desc, eq } from "drizzle-orm"

import { userEpgSources } from "@/db/schema"

type Db = ReturnType<typeof import("@/db/client").getDb>

export async function selectUserEpgSources(db: Db, userId: string) {
  return db
    .select()
    .from(userEpgSources)
    .where(eq(userEpgSources.userId, userId))
    .orderBy(desc(userEpgSources.updatedAt))
}

export async function selectUserEpgSource(db: Db, id: number) {
  const [source] = await db
    .select()
    .from(userEpgSources)
    .where(eq(userEpgSources.id, id))
    .limit(1)
  return source ?? null
}

export async function deleteUserEpgSource(db: Db, id: number, userId: string) {
  const deleted = await db
    .delete(userEpgSources)
    .where(and(eq(userEpgSources.id, id), eq(userEpgSources.userId, userId)))
    .returning({ id: userEpgSources.id })
  return deleted.length > 0
}
