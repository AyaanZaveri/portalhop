import { and, eq, inArray, or } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { getUserIdByFavoritesToken } from "@/db/favorites-token"
import { selectSavedSource } from "@/db/saved-sources"
import { favorites, savedChannels } from "@/db/schema"
import { IPTV_ORG_SOURCE_ID, getIptvOrgChannels } from "@/lib/iptv-org"
import { filenameSafe, m3uExtinf } from "@/lib/m3u-export"

export const runtime = "nodejs"

type ParsedFavorite = {
  portalSourceId: number | null
  savedChannelId: number | null
  channelId: string
}

/**
 * Public (token-gated, not session-gated) M3U Plus export of every channel
 * the token's owner has favorited, across all of their portals plus
 * IPTV-org. M3U players can't send a session cookie, so the token in the
 * URL path is the entire authorization boundary here — see
 * db/favorites-token.ts for how it's generated and rotated.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  const db = getDb()
  const userId = await getUserIdByFavoritesToken(db, token)

  if (!userId) {
    return NextResponse.json({ error: "Playlist not found." }, { status: 404 })
  }

  const favoriteRows = await db
    .select({ channelKey: favorites.channelKey })
    .from(favorites)
    .where(eq(favorites.userId, userId))

  const parsed = favoriteRows
    .map((row) => parseChannelKey(row.channelKey))
    .filter((value): value is ParsedFavorite => value !== null)

  const groups = new Map<number, ParsedFavorite[]>()
  for (const fav of parsed) {
    if (fav.portalSourceId === null) {
      continue
    }
    const list = groups.get(fav.portalSourceId) ?? []
    list.push(fav)
    groups.set(fav.portalSourceId, list)
  }

  const lines = ['#EXTM3U playlist="Favorites"']

  const iptvOrgFavs = groups.get(IPTV_ORG_SOURCE_ID)
  if (iptvOrgFavs?.length) {
    const iptvChannels = await getIptvOrgChannels()
    const byId = new Map(iptvChannels.map((channel) => [channel.id, channel]))

    for (const fav of iptvOrgFavs) {
      const channel = byId.get(fav.channelId)
      if (!channel?.cmd) {
        continue
      }
      lines.push(
        m3uExtinf({
          xmltvId: channel.xmltvId ?? "",
          displayName:
            channel.name || channel.number || `Channel ${channel.id}`,
          logo: channel.logoUrl || channel.logo,
          genre: channel.genre,
        }),
        channel.cmd,
      )
    }
  }

  for (const [sourceId, favs] of groups) {
    if (sourceId === IPTV_ORG_SOURCE_ID) {
      continue
    }

    const source = await selectSavedSource(db, sourceId)
    // Ownership check: a channelKey only ever encodes the source id, so this
    // also guards against a source having been deleted, transferred, or (if
    // a channelKey were ever tampered with) belonging to another user.
    if (!source || source.userId !== userId) {
      continue
    }

    const rows = await selectFavoritedChannels(db, sourceId, favs)
    const byRowId = new Map(rows.map((row) => [row.id, row]))
    const byChannelId = new Map(rows.map((row) => [row.channelId, row]))

    for (const fav of favs) {
      const row =
        (fav.savedChannelId !== null
          ? byRowId.get(fav.savedChannelId)
          : undefined) ?? byChannelId.get(fav.channelId)

      if (!row) {
        continue
      }

      const streamUrl =
        source.sourceType === "stalker"
          ? createLinkUrl(request.url, sourceId, row.id)
          : row.cmd

      if (!streamUrl) {
        continue
      }

      lines.push(
        m3uExtinf({
          xmltvId: row.xmltvId,
          displayName: row.name || row.number || `Channel ${row.channelId}`,
          logo: row.logoUrl || row.logo,
          genre: row.genre,
        }),
        streamUrl,
      )
    }
  }

  return new NextResponse(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "audio/x-mpegurl; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameSafe("favorites")}.m3u"`,
      "Cache-Control": "no-store",
    },
  })
}

function parseChannelKey(channelKey: string): ParsedFavorite | null {
  try {
    const value = JSON.parse(channelKey)

    if (!Array.isArray(value)) {
      return null
    }

    const [rawSourceId, rawSavedChannelId, rawId] = value
    const portalSourceId = Number.isInteger(rawSourceId) ? rawSourceId : null
    const savedChannelId = Number.isInteger(rawSavedChannelId)
      ? rawSavedChannelId
      : null
    const channelId = rawId === null || rawId === undefined ? "" : String(rawId)

    if (portalSourceId === null || (!savedChannelId && !channelId)) {
      return null
    }

    return { portalSourceId, savedChannelId, channelId }
  } catch {
    return null
  }
}

async function selectFavoritedChannels(
  db: ReturnType<typeof getDb>,
  sourceId: number,
  favs: ParsedFavorite[],
) {
  const savedChannelIds = favs
    .map((fav) => fav.savedChannelId)
    .filter((id): id is number => id !== null)
  const channelIds = favs
    .filter((fav) => fav.savedChannelId === null)
    .map((fav) => fav.channelId)
    .filter(Boolean)

  if (!savedChannelIds.length && !channelIds.length) {
    return []
  }

  const filters = [
    savedChannelIds.length
      ? inArray(savedChannels.id, savedChannelIds)
      : undefined,
    channelIds.length
      ? inArray(savedChannels.channelId, channelIds)
      : undefined,
  ].filter((filter) => filter !== undefined)

  return db
    .select()
    .from(savedChannels)
    .where(
      and(
        eq(savedChannels.sourceId, sourceId),
        filters.length === 1 ? filters[0] : or(...filters),
      ),
    )
}

function createLinkUrl(
  requestUrl: string,
  sourceId: number,
  savedChannelId: number,
) {
  const url = new URL(`/api/portals/${sourceId}/create-link`, requestUrl)
  url.searchParams.set("channel", String(savedChannelId))
  return url.href
}
