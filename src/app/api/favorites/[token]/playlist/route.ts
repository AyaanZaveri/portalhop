import { and, asc, eq, inArray, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { listChannelSourceOrder } from "@/db/channel-source-order"
import { getUserIdByFavoritesToken } from "@/db/favorites-token"
import { selectSavedSource } from "@/db/saved-sources"
import { favorites, savedChannels, savedSources } from "@/db/schema"
import { selectUserEpgSources } from "@/db/user-epg-sources"
import { getUserSettings } from "@/db/user-settings"
import { EPG_SOURCES } from "@portalhop/shared/epg-sources"
import { getEpgChannelMetadata, getEpgChannels } from "@/lib/epg-store"
import { proxyImageUrl } from "@portalhop/shared/image-proxy"
import { IPTV_ORG_SOURCE_ID, getIptvOrgChannels } from "@/lib/iptv-org"
import { filenameSafe, m3uExtinf } from "@portalhop/shared/m3u-export"
import { getUserEpgChannelMaps } from "@/lib/user-epg-store"
import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"
import type { SavedSourceRecord } from "@portalhop/shared/source-types"
import { logoTileKey } from "@/lib/logo-tile"

export const runtime = "nodejs"

type ParsedFavorite = {
  portalSourceId: number | null
  savedChannelId: number | null
  channelId: string
}

type FavoriteRow = ParsedFavorite & { position: number }

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
    .select({ channelKey: favorites.channelKey, position: favorites.position })
    .from(favorites)
    .where(eq(favorites.userId, userId))
    .orderBy(asc(favorites.position))

  const parsed = favoriteRows
    .map((row) => {
      const favorite = parseChannelKey(row.channelKey)
      return favorite ? { ...favorite, position: row.position } : null
    })
    .filter((value): value is FavoriteRow => value !== null)

  // Current favourites are channel-level (`id:<xmltv-id>`), while the older
  // JSON keys identify one source copy. Resolve the current form first so the
  // export has one playable stream per channel rather than every duplicate.
  const favoriteIdentityIds = [
    ...new Set(
      favoriteRows
        .map((row) => parseFavoriteIdentity(row.channelKey))
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const sourceOrder = await listChannelSourceOrder(db, userId)
  const identityCandidates = favoriteIdentityIds.length
    ? await db
        .select({ channel: savedChannels })
        .from(savedChannels)
        .innerJoin(savedSources, eq(savedChannels.sourceId, savedSources.id))
        .where(
          and(
            eq(savedSources.userId, userId),
            inArray(
              sql<string>`lower(${savedChannels.xmltvId})`,
              favoriteIdentityIds,
            ),
          ),
        )
    : []
  const identityRowsBySource = new Map<
    number,
    (typeof savedChannels.$inferSelect)[]
  >()
  const resolvedIdentityIds = new Set<string>()
  for (const identityId of favoriteIdentityIds) {
    const candidates = identityCandidates
      .map((row) => row.channel)
      .filter((channel) => normalizeXmltvId(channel.xmltvId) === identityId)
    if (!candidates.length) continue

    const manuallyOrdered = sourceOrder[`id:${identityId}`] ?? []
    const priorityRank = (sourceId: number) => {
      const index = settings.sourcePriorityIds.indexOf(sourceId)
      return index === -1 ? Number.MAX_SAFE_INTEGER : index
    }
    candidates.sort((left, right) => {
      const leftManual = manuallyOrdered.indexOf(left.id)
      const rightManual = manuallyOrdered.indexOf(right.id)
      const leftRank = leftManual === -1 ? Number.MAX_SAFE_INTEGER : leftManual
      const rightRank =
        rightManual === -1 ? Number.MAX_SAFE_INTEGER : rightManual
      return (
        leftRank - rightRank ||
        priorityRank(left.sourceId) - priorityRank(right.sourceId) ||
        left.sourceId - right.sourceId ||
        left.id - right.id
      )
    })
    const chosen = candidates[0]
    const selectedForSource = identityRowsBySource.get(chosen.sourceId) ?? []
    selectedForSource.push(chosen)
    identityRowsBySource.set(chosen.sourceId, selectedForSource)
    resolvedIdentityIds.add(identityId)
  }

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

  const portalSourceIds = new Set([
    ...[...groups.keys()].filter((sourceId) => sourceId !== IPTV_ORG_SOURCE_ID),
    ...identityRowsBySource.keys(),
  ])

  const sources = new Map<number, SavedSourceRecord>()
  for (const sourceId of portalSourceIds) {
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

  const [
    customEpgMaps,
    iptvOrgEpgChannels,
    directoryEpgChannels,
    userEpgSourceRows,
  ] = await Promise.all([
    getUserEpgChannelMaps(userId, customEpgSourceIds),
    needsIptvOrgEpg
      ? getEpgChannels()
      : Promise.resolve(
          {} as Record<
            string,
            { name: string; logoUrl?: string; countryCode: string }
          >,
        ),
    // A favourites export is channel-level, just like the app. Its guide
    // must therefore come from PortalHop's directory whenever the channel
    // has a canonical XMLTV id, rather than from only the stream selected
    // for playback. This is deliberately a small indexed lookup, not the
    // full EPG catalogue on every M3U download.
    getEpgChannelMetadata(favoriteIdentityIds),
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

  for (const sourceId of portalSourceIds) {
    const source = sources.get(sourceId)
    if (!source) {
      continue
    }

    const favs = groups.get(sourceId) ?? []
    const rows = await selectFavoritedChannels(db, sourceId, favs)
    const byRowId = new Map(rows.map((row) => [row.id, row]))
    const byChannelId = new Map(rows.map((row) => [row.channelId, row]))
    const seenRowIds = new Set<number>()

    const selectedRows: (typeof savedChannels.$inferSelect)[] = []
    for (const fav of favs) {
      const row =
        (fav.savedChannelId !== null
          ? byRowId.get(fav.savedChannelId)
          : undefined) ?? byChannelId.get(fav.channelId)

      if (!row) continue

      // A channel-level favourite already chose this channel's best source.
      // Do not add a stale per-source favourite as a duplicate beneath it.
      if (resolvedIdentityIds.has(normalizeXmltvId(row.xmltvId))) continue
      selectedRows.push(row)
    }
    for (const row of identityRowsBySource.get(sourceId) ?? []) {
      selectedRows.push(row)
    }

    for (const row of selectedRows) {
      // Legacy channelKeys (no savedChannelId) and a current channel-level
      // favourite can both resolve to the same current row; emit it once.
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
      // A channel-level favourite may play from a source whose own guide is
      // weak or absent while PortalHop has already matched the same XMLTV id in
      // its directory. Use that canonical directory record for both `url-tvg`
      // and artwork, exactly as the channel list does.
      const iptvOrgMatch = lookupId
        ? (directoryEpgChannels[lookupId.toLowerCase()] ??
          iptvOrgEpgChannels[lookupId.toLowerCase()])
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
          xmltvId: lookupId,
          displayName:
            iptvOrgMatch?.name ||
            row.name ||
            row.number ||
            `Channel ${row.channelId}`,
          logo:
            favoriteLogoTileUrl(request.url, token, row.id, logo) ||
            proxyImageUrl(logo, settings.useImageProxy),
          genre: row.genre,
        }),
        streamUrl,
      )
    }
  }

  const epgUrlList = [...epgUrls].join(",")
  const header = epgUrlList
    ? // `url-tvg` and `x-tvg-url` are aliases in M3U Plus. Including both lets
      // players with either convention fetch the XMLTV guides that carry Now,
      // Next, and future programme data for the tvg-id values below.
      `#EXTM3U playlist="Favorites" url-tvg="${epgUrlList}" x-tvg-url="${epgUrlList}"`
    : '#EXTM3U playlist="Favorites"'

  return new NextResponse(`${[header, ...bodyLines].join("\n")}\n`, {
    headers: {
      "Content-Type": "audio/x-mpegurl; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameSafe("playlist")}.m3u"`,
      "Cache-Control": "no-store",
    },
  })
}

function favoriteLogoTileUrl(
  requestUrl: string,
  token: string,
  channelId: number,
  logoUrl: string,
) {
  if (!logoUrl) return ""
  const url = new URL(
    `/api/favorites/${encodeURIComponent(token)}/logos/${channelId}/${logoTileKey(logoUrl)}.png`,
    requestUrl,
  )
  return url.href
}

function proxyStreamUrl(streamUrl: string, enabled: boolean) {
  const proxyBaseUrl = process.env.NEXT_PUBLIC_PROXY_URL
  if (!enabled || !proxyBaseUrl) {
    return streamUrl
  }
  const url = new URL(`${proxyBaseUrl}/proxy/hls/manifest.m3u8`)
  url.searchParams.set("d", streamUrl)
  // Favorites M3U consumers fetch MediaFlow directly, so this is the same
  // public, per-request credential the web player's hls.js requests use.
  const mediaflowApiPassword = process.env.NEXT_PUBLIC_MEDIAFLOW_API_PASSWORD
  if (mediaflowApiPassword) {
    url.searchParams.set("api_password", mediaflowApiPassword)
  }
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

function parseFavoriteIdentity(channelKey: string): string | null {
  if (!channelKey.startsWith("id:")) return null
  const id = normalizeXmltvId(channelKey.slice(3))
  return id || null
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
