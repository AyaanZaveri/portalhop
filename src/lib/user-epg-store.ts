import { and, eq, inArray, or } from "drizzle-orm"

import { getDb } from "@/db/client"
import { userEpgChannels, userEpgSources } from "@/db/schema"
import type { NewUserEpgChannelRow } from "@/db/schema"
import { fetchAndParseEpg, type EpgChannel } from "@/lib/epg-parser"

const INSERT_CHUNK_SIZE = 1000

export async function saveUserEpgChannels(sourceId: number, channels: EpgChannel[]) {
  const deduped = new Map<string, EpgChannel>()
  for (const channel of channels) {
    if (channel.id && !deduped.has(channel.id)) deduped.set(channel.id, channel)
  }
  const rows: NewUserEpgChannelRow[] = [...deduped.values()].map((channel) => ({
    epgSourceId: sourceId,
    channelId: channel.id,
    name: channel.name,
    logoUrl: channel.logoUrl ?? null,
    channelIdLower: channel.id.trim().toLowerCase(),
    nameNormalized: normalizeChannelName(channel.name),
  }))
  const db = getDb()
  const refreshedAt = new Date()
  await db.transaction(async (tx) => {
    await tx.delete(userEpgChannels).where(eq(userEpgChannels.epgSourceId, sourceId))
    for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
      await tx.insert(userEpgChannels).values(rows.slice(i, i + INSERT_CHUNK_SIZE))
    }
    await tx.update(userEpgSources).set({ channelCount: rows.length, refreshedAt, updatedAt: refreshedAt }).where(eq(userEpgSources.id, sourceId))
  })
  return { channelCount: rows.length, refreshedAt }
}

export async function refreshUserEpgSource(sourceId: number) {
  const db = getDb()
  const [source] = await db.select().from(userEpgSources).where(eq(userEpgSources.id, sourceId)).limit(1)
  if (!source) throw new Error("EPG source not found.")
  return saveUserEpgChannels(sourceId, await fetchAndParseEpg(source.url))
}

export async function findCustomEpgChannel(sourceId: number, candidates: { id?: string; name?: string }[]) {
  const ids = new Set(candidates.map((item) => item.id?.trim().toLowerCase()).filter(Boolean) as string[])
  const names = new Set(candidates.map((item) => normalizeChannelName(item.name ?? "")).filter(Boolean))
  if (!ids.size && !names.size) return null
  const filters = [ids.size ? inArray(userEpgChannels.channelIdLower, [...ids]) : undefined, names.size ? inArray(userEpgChannels.nameNormalized, [...names]) : undefined].filter(Boolean)
  const matches = await getDb().select({ channelId: userEpgChannels.channelId, channelIdLower: userEpgChannels.channelIdLower }).from(userEpgChannels).where(and(eq(userEpgChannels.epgSourceId, sourceId), filters.length === 1 ? filters[0]! : or(...filters))).limit(50)
  return matches.find((match) => ids.has(match.channelIdLower))?.channelId ?? matches[0]?.channelId ?? null
}

export async function getUserEpgChannelMaps(userId: string, sourceIds: number[]) {
  const ids = [...new Set(sourceIds.filter(Number.isInteger))]
  if (!ids.length) return {}
  const rows = await getDb().select({ sourceId: userEpgChannels.epgSourceId, channelIdLower: userEpgChannels.channelIdLower, logoUrl: userEpgChannels.logoUrl }).from(userEpgChannels).innerJoin(userEpgSources, eq(userEpgChannels.epgSourceId, userEpgSources.id)).where(and(eq(userEpgSources.userId, userId), inArray(userEpgChannels.epgSourceId, ids)))
  const result: Record<number, Record<string, { logoUrl?: string }>> = {}
  for (const row of rows) (result[row.sourceId] ??= {})[row.channelIdLower] = { logoUrl: row.logoUrl ?? undefined }
  return result
}

export function normalizeChannelName(value: string) {
  return value.toLowerCase().replace(/\b(hd|fhd|uhd|4k|sd|cc)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim()
}
