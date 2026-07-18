import { fetchM3uChannels } from "@/lib/m3u-client"
import {
  fetchPortalChannels,
  getEndpointCandidates,
  normalizePortalRequest,
} from "@/lib/stalker-client"
import { fetchXtreamChannels } from "@/lib/xtream-client"
import type { SourceResponse, SourceType } from "@/lib/source-types"

export type PortalFetchInput = {
  sourceType: SourceType
  portalUrl?: string | null
  mac?: string | null
  serial?: string | null
  deviceId?: string | null
  deviceId2?: string | null
  signature?: string | null
  timezone?: string | null
  stbType?: string | null
  endpoint?: string | null
  serverUrl?: string | null
  username?: string | null
  password?: string | null
  outputFormat?: string | null
  playlistUrl?: string | null
}

/**
 * Live-fetches a portal's channel list server-side. Saving/refetching a
 * portal always goes through this rather than accepting a client-supplied
 * channel array, so the (potentially huge, tens of thousands of entries)
 * channel list never has to round-trip through a request body, which is the
 * one path that reliably hits Vercel's ~4.5MB function payload limit for large
 * portals.
 */
export async function fetchChannelsForPortal(
  portal: PortalFetchInput
): Promise<SourceResponse> {
  if (portal.sourceType === "xtream") {
    return fetchXtreamChannels({
      serverUrl: portal.serverUrl ?? "",
      username: portal.username ?? "",
      password: portal.password ?? "",
      outputFormat: portal.outputFormat ?? "m3u8",
    })
  }

  if (portal.sourceType === "m3u") {
    return fetchM3uChannels(portal.playlistUrl ?? "")
  }

  const options = normalizePortalRequest({
    portalUrl: portal.portalUrl ?? "",
    mac: portal.mac ?? "",
    serial: portal.serial ?? "",
    deviceId: portal.deviceId ?? "",
    deviceId2: portal.deviceId2 ?? "",
    signature: portal.signature ?? "",
    timezone: portal.timezone ?? undefined,
    stbType: portal.stbType ?? undefined,
  })
  const endpoints = [
    ...(portal.endpoint ? [portal.endpoint] : []),
    ...getEndpointCandidates(portal.portalUrl ?? ""),
  ].filter((endpoint, index, list) => endpoint && list.indexOf(endpoint) === index)

  const errors: string[] = []

  for (const endpoint of endpoints) {
    try {
      return await fetchPortalChannels(endpoint, options)
    } catch (error) {
      errors.push(
        `${endpoint}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  throw new Error(
    errors.length
      ? `Could not fetch channels from any endpoint: ${errors.join("; ")}`
      : "No portal endpoint to fetch channels from."
  )
}
