import { fetchM3uChannels } from "@/lib/m3u-client"
import type { PortalChannel } from "@/lib/stalker-types"

// A built-in, free playlist from the iptv-org project. It's the same public data
// for everyone, so it lives outside the per-user portals model: fetched once and
// cached in memory here, exposed to every visitor (signed in or not).
export const IPTV_ORG_SOURCE_ID = -1
export const IPTV_ORG_SOURCE_NAME = "IPTV-org"
export const IPTV_ORG_PLAYLIST_URL =
  "https://iptv-org.github.io/iptv/index.country.m3u"

const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

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
      const channels = result.channels.map((channel) => {
        const category = normalizeCategory(channel.genre)
        return { ...channel, genre: category, genreId: category }
      })
      cache = { channels, fetchedAt: Date.now() }
      return channels
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}
