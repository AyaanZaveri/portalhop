import { and, eq, inArray, or } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { getUserIdByFavoritesToken } from "@/db/favorites-token"
import { selectSavedSource } from "@/db/saved-sources"
import { favorites, savedChannels } from "@/db/schema"
import { selectUserEpgSources } from "@/db/user-epg-sources"
import { getUserSettings } from "@/db/user-settings"
import { EPG_SOURCES } from "@portalhop/shared/epg-sources"
import { getEpgChannels } from "@/lib/epg-store"
import { proxyImageUrl } from "@portalhop/shared/image-proxy"
import { IPTV_ORG_SOURCE_ID, getIptvOrgChannels } from "@/lib/iptv-org"
import { filenameSafe, m3uExtinf } from "@portalhop/shared/m3u-export"
import { getUserEpgChannelMaps } from "@/lib/user-epg-store"
import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"
import type { SavedSourceRecord } from "@portalhop/shared/source-types"

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

  const settings = await getUserSettings(db, userId)

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

  const bodyLines: string[] = []
  // Distinct XMLTV documents that cover the channels below, so players that
  // don't fetch program data live (most of them) can still show a guide.
  const epgUrls = new Set<string>()

  const portalGroups = [...groups.entries()].filter(
    ([sourceId]) => sourceId !== IPTV_ORG_SOURCE_ID,
  )

  const sources = new Map<number, SavedSourceRecord>()
  for (const [sourceId] of portalGroups) {
    const source = await selectSavedSource(db, sourceId)
    // Ownership check: a channelKey only ever encodes the source id, so this
    // also guards against a source having been deleted, transferred, or (if
    // a channelKey were ever tampered with) belonging to another user.
    if (source && source.userId === userId) {
      sources.set(sourceId, source)
    }
  }

  const customEpgSourceIds = [...sources.values()]
    .filter((source) => source.epgMode === "custom" && source.epgSourceId)
    .map((source) => source.epgSourceId as number)

  const iptvOrgFavs = groups.get(IPTV_ORG_SOURCE_ID)
  const needsIptvOrgEpg =
    [...sources.values()].some((source) => source.epgMode === "iptv-org") ||
    Boolean(iptvOrgFavs?.length)

  const [customEpgMaps, iptvOrgEpgChannels, userEpgSourceRows] =
    await Promise.all([
      getUserEpgChannelMaps(userId, customEpgSourceIds),
      needsIptvOrgEpg
        ? getEpgChannels()
        : Promise.resolve(
            {} as Record<
              string,
              { name: string; logoUrl?: string; countryCode: string }
            >,
          ),
      customEpgSourceIds.length
        ? selectUserEpgSources(db, userId)
        : Promise.resolve([]),
    ])

  const customEpgUrlById = new Map(
    userEpgSourceRows.map((source) => [source.id, source.url]),
  )
  const iptvOrgSourceUrlByCountry = new Map(
    EPG_SOURCES.map((source) => [source.code.toUpperCase(), source.url]),
  )

  if (iptvOrgFavs?.length) {
    const iptvChannels = await getIptvOrgChannels()
    const byId = new Map(iptvChannels.map((channel) => [channel.id, channel]))
    const seenIptvOrgIds = new Set<string>()

    for (const fav of iptvOrgFavs) {
      const channel = byId.get(fav.channelId)
      if (!channel?.cmd) {
        continue
      }
      // The same channel can be favorited twice under different (legacy vs.
      // current) channelKey encodings; only emit it once.
      if (seenIptvOrgIds.has(channel.id)) {
        continue
      }
      seenIptvOrgIds.add(channel.id)

      const lookupId = normalizeXmltvId(channel.xmltvId) || channel.id
      const epgMatch = lookupId
        ? iptvOrgEpgChannels[lookupId.toLowerCase()]
        : undefined
      if (epgMatch) {
        const epgUrl = iptvOrgSourceUrlByCountry.get(
          epgMatch.countryCode.toUpperCase(),
        )
        if (epgUrl) {
          epgUrls.add(epgUrl)
        }
      }

      bodyLines.push(
        m3uExtinf({
          xmltvId: channel.xmltvId ?? "",
          displayName:
            channel.name || channel.number || `Channel ${channel.id}`,
          logo: proxyImageUrl(
            epgMatch?.logoUrl || channel.logoUrl || channel.logo || "",
            settings.useImageProxy,
          ),
          genre: channel.genre,
        }),
        proxyStreamUrl(channel.cmd, settings.useProxy),
      )
    }
  }

  for (const [sourceId, favs] of portalGroups) {
    const source = sources.get(sourceId)
    if (!source) {
      continue
    }

    const rows = await selectFavoritedChannels(db, sourceId, favs)
    const byRowId = new Map(rows.map((row) => [row.id, row]))
    const byChannelId = new Map(rows.map((row) => [row.channelId, row]))
    const seenRowIds = new Set<number>()

    for (const fav of favs) {
      const row =
        (fav.savedChannelId !== null
          ? byRowId.get(fav.savedChannelId)
          : undefined) ?? byChannelId.get(fav.channelId)

      if (!row) {
        continue
      }

      // Legacy channelKeys (no savedChannelId) and stale savedChannelIds
      // pointing at a channel that's since been re-synced can both resolve
      // to the same current row; only emit each saved-channel row once.
      if (seenRowIds.has(row.id)) {
        continue
      }
      seenRowIds.add(row.id)

      const rawStreamUrl =
        source.sourceType === "stalker"
          ? createLinkUrl(request.url, sourceId, row.id)
          : row.cmd

      if (!rawStreamUrl) {
        continue
      }

      const streamUrl =
        source.sourceType === "stalker"
          ? rawStreamUrl
          : proxyStreamUrl(rawStreamUrl, settings.useProxy)

      const lookupId = normalizeXmltvId(row.xmltvId) || row.channelId
      const iptvOrgMatch =
        source.epgMode === "iptv-org" && lookupId
          ? iptvOrgEpgChannels[lookupId.toLowerCase()]
          : undefined
      const customMatch =
        source.epgMode === "custom" && source.epgSourceId && lookupId
          ? customEpgMaps[source.epgSourceId]?.[lookupId.toLowerCase()]
          : undefined

      if (iptvOrgMatch) {
        const epgUrl = iptvOrgSourceUrlByCountry.get(
          iptvOrgMatch.countryCode.toUpperCase(),
        )
        if (epgUrl) {
          epgUrls.add(epgUrl)
        }
      }
      if (source.epgMode === "custom" && source.epgSourceId) {
        const epgUrl = customEpgUrlById.get(source.epgSourceId)
        if (epgUrl) {
          epgUrls.add(epgUrl)
        }
      }

      const logo =
        iptvOrgMatch?.logoUrl ||
        customMatch?.logoUrl ||
        row.logoUrl ||
        row.logo ||
        ""

      bodyLines.push(
        m3uExtinf({
          xmltvId: row.xmltvId,
          displayName: row.name || row.number || `Channel ${row.channelId}`,
          logo: proxyImageUrl(logo, settings.useImageProxy),
          genre: row.genre,
        }),
        streamUrl,
      )
    }
  }

  const header = epgUrls.size
    ? `#EXTM3U playlist="Favorites" url-tvg="${[...epgUrls].join(",")}"`
    : '#EXTM3U playlist="Favorites"'

  return new NextResponse(`${[header, ...bodyLines].join("\n")}\n`, {
    headers: {
      "Content-Type": "audio/x-mpegurl; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameSafe("playlist")}.m3u"`,
      "Cache-Control": "no-store",
    },
  })
}

function proxyStreamUrl(streamUrl: string, enabled: boolean) {
  const proxyBaseUrl = process.env.NEXT_PUBLIC_PROXY_URL
  if (!enabled || !proxyBaseUrl) {
    return streamUrl
  }
  const url = new URL(`${proxyBaseUrl}/proxy/hls/manifest.m3u8`)
  url.searchParams.set("d", streamUrl)
  return url.href
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
