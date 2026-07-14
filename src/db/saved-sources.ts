import { and, desc, eq } from "drizzle-orm"

import {
  savedM3uSources,
  savedSources,
  savedStalkerSources,
  savedXtreamSources,
} from "@/db/schema"
import type { SavedSourceRecord, SourceType } from "@/lib/source-types"

type Db = ReturnType<typeof import("@/db/client").getDb>

export async function selectSavedSources(
  db: Db,
  userId: string
): Promise<SavedSourceRecord[]> {
  const rows = await db
    .select()
    .from(savedSources)
    .leftJoin(
      savedStalkerSources,
      eq(savedStalkerSources.sourceId, savedSources.id)
    )
    .leftJoin(savedXtreamSources, eq(savedXtreamSources.sourceId, savedSources.id))
    .leftJoin(savedM3uSources, eq(savedM3uSources.sourceId, savedSources.id))
    .where(eq(savedSources.userId, userId))
    .orderBy(desc(savedSources.updatedAt))

  return rows.map((row) =>
    flattenSavedSource(
      row.saved_sources,
      row.saved_stalker_sources,
      row.saved_xtream_sources,
      row.saved_m3u_sources
    )
  )
}

export async function deleteSavedSource(
  db: Db,
  sourceId: number,
  userId: string
): Promise<boolean> {
  const deleted = await db
    .delete(savedSources)
    .where(and(eq(savedSources.id, sourceId), eq(savedSources.userId, userId)))
    .returning({ id: savedSources.id })

  return deleted.length > 0
}

export async function selectSavedSource(
  db: Db,
  sourceId: number
): Promise<SavedSourceRecord | null> {
  const [row] = await db
    .select()
    .from(savedSources)
    .leftJoin(
      savedStalkerSources,
      eq(savedStalkerSources.sourceId, savedSources.id)
    )
    .leftJoin(savedXtreamSources, eq(savedXtreamSources.sourceId, savedSources.id))
    .leftJoin(savedM3uSources, eq(savedM3uSources.sourceId, savedSources.id))
    .where(eq(savedSources.id, sourceId))
    .limit(1)

  if (!row) {
    return null
  }

  return flattenSavedSource(
    row.saved_sources,
    row.saved_stalker_sources,
    row.saved_xtream_sources,
    row.saved_m3u_sources
  )
}

function flattenSavedSource(
  source: typeof savedSources.$inferSelect,
  stalker: typeof savedStalkerSources.$inferSelect | null,
  xtream: typeof savedXtreamSources.$inferSelect | null,
  m3u: typeof savedM3uSources.$inferSelect | null
): SavedSourceRecord {
  return {
    id: source.id,
    userId: source.userId,
    name: source.name,
    sourceType: source.sourceType as SourceType,
    channelCount: source.channelCount,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    portalUrl: stalker?.portalUrl,
    mac: stalker?.mac,
    serial: stalker?.serial,
    deviceId: stalker?.deviceId,
    deviceId2: stalker?.deviceId2,
    signature: stalker?.signature,
    timezone: stalker?.timezone,
    stbType: stalker?.stbType,
    endpoint: stalker?.endpoint ?? undefined,
    serverUrl: xtream?.serverUrl,
    username: xtream?.username,
    password: xtream?.password,
    outputFormat: xtream?.outputFormat,
    playlistUrl: m3u?.playlistUrl,
    derivedXtreamServerUrl: m3u?.derivedXtreamServerUrl,
    derivedXtreamUsername: m3u?.derivedXtreamUsername,
    derivedXtreamPassword: m3u?.derivedXtreamPassword,
  }
}
