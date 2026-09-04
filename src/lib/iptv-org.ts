import { fetchM3uChannels } from "@/lib/m3u-client"
import type { PortalChannel } from "@portalhop/shared/stalker-types"
import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"
import { resolveCategoryVisual } from "@portalhop/shared/category-flags"

// A built-in, free playlist from the iptv-org project. It's the same public data
// for everyone, so it lives outside the per-user portals model: fetched once and
// cached in memory here, exposed to every visitor (signed in or not).
export const IPTV_ORG_SOURCE_ID = -1
export const IPTV_ORG_SOURCE_NAME = "IPTV-org"
export const IPTV_ORG_PLAYLIST_URL =
  "https://iptv-org.github.io/iptv/index.country.m3u"

const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

// The country-indexed playlist otherwise opens on whatever sorts first
// alphabetically (Afghanistan), which isn't a useful default for most
// visitors. Surface the largest English-language markets first, interleaved
// by channel name rather than grouped by country; everything else keeps its
// original alphabetical (by country, then name) order after them.
const PRIORITY_COUNTRIES = new Set([
  "United States",
  "Canada",
  "United Kingdom",
  "Australia",
])

let cache: { channels: PortalChannel[]; fetchedAt: number } | null = null
let inFlight: Promise<PortalChannel[]> | null = null

// iptv-org tags multi-category channels as "Movies;Series". Collapse to the
// primary category so the category selector stays clean.
function normalizeCategory(genre: string): string {
  const primary = genre.split(";")[0]?.trim()
  return primary || "Undefined"
}

export async function getIptvOrgChannels(): Promise<PortalChannel[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.channels
  }

  if (inFlight) {
    return inFlight
  }

  inFlight = (async () => {
    try {
      const result = await fetchM3uChannels(IPTV_ORG_PLAYLIST_URL)
      const mapped = result.channels.map((channel) => {
        const category = normalizeCategory(channel.genre)
        const countryVisual = resolveCategoryVisual(channel.genre)
        return {
          ...channel,
          // IPTV-org's playlist may add a stream-quality suffix (for example
          // `TSN1.ca@SD`) which is not part of IPTV-EPG's XMLTV channel ID.
          xmltvId: normalizeXmltvId(channel.xmltvId),
          countryCode:
            countryVisual?.kind === "flag" ? countryVisual.code : undefined,
          genre: category,
          genreId: category,
        }
      })

      const priority: PortalChannel[] = []
      const rest: PortalChannel[] = []
      for (const channel of mapped) {
        ;(PRIORITY_COUNTRIES.has(channel.genre) ? priority : rest).push(channel)
      }
      priority.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      )

      const channels = [...priority, ...rest]
      cache = { channels, fetchedAt: Date.now() }
      return channels
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}
