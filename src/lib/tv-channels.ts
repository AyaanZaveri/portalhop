import type {
  PortalChannel,
  PortalResponse,
} from "@portalhop/shared/stalker-types"
import type {
  SavedSourceRecord,
  SourceRequest,
} from "@portalhop/shared/source-types"
import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"
import {
  buildChannelIndex,
  channelSlug,
  getChannelKey,
  getFavoriteKey,
  getLegacyChannelKey,
  isFavoriteKeyed,
} from "@portalhop/shared/channel-keys"

// Channel identity lives in the shared package so the Expo app computes the
// same favourite keys and deep links. Re-exported here so existing call sites
// keep importing from where they always have.
export {
  buildChannelIndex,
  channelSlug,
  getChannelKey,
  getFavoriteKey,
  getLegacyChannelKey,
  isFavoriteKeyed,
}

import { proxyImageUrl } from "@portalhop/shared/image-proxy"
import {
  getCachedPortalChannels,
  setCachedPortalChannels,
  type CachedPortalChannels,
} from "@/lib/portal-channels-cache"
import { apiFetch } from "@/lib/api-fetch"

export type SavedPortalRecord = SavedSourceRecord

export type LoadedPortal = {
  portal: SavedPortalRecord
  response: PortalResponse
}

export type PortalSource = {
  id: number
  name: string
  endpoint: string
  request: SourceRequest
  epgMode: SavedSourceRecord["epgMode"]
  epgSourceId: number | null
}

export type PortalChannelWithSource = PortalChannel & {
  portalSource?: PortalSource
}

export type StreamVariant = {
  resolutionLabel: string
  frameRateLabel: string
  bitrateLabel: string
}

export type CaptionCue = {
  startTime: number
  endTime: number
  line: number
  text: string
}

export type ExternalPlayer = "iina" | "vlc" | "mpv" | "outplayer"
export type ClientPlatform =
  "android" | "ios" | "linux" | "macos" | "windows" | "other"

export const externalPlayers: Array<{
  id: ExternalPlayer
  label: string
  platforms: ClientPlatform[]
}> = [
  { id: "iina", label: "IINA", platforms: ["macos"] },
  {
    id: "vlc",
    label: "VLC",
    platforms: ["android", "ios", "linux", "macos", "windows"],
  },
  {
    id: "mpv",
    label: "mpv",
    platforms: ["android", "linux", "macos", "windows"],
  },
  { id: "outplayer", label: "Outplayer", platforms: ["ios"] },
]

export function getExternalPlayerLabel(player: ExternalPlayer) {
  return externalPlayers.find(({ id }) => id === player)?.label ?? "player"
}

export function getClientPlatform(
  userAgent: string,
  maxTouchPoints = 0,
): ClientPlatform {
  if (/Android/i.test(userAgent)) return "android"
  if (/iPad|iPhone|iPod/i.test(userAgent)) return "ios"
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios"
  if (/Macintosh/i.test(userAgent)) return "macos"
  if (/Windows/i.test(userAgent)) return "windows"
  if (/Linux/i.test(userAgent)) return "linux"
  return "other"
}

function androidIntentUrl(streamUrl: string, packageName: string) {
  const url = new URL(streamUrl)
  const path = `${url.host}${url.pathname}${url.search}${url.hash}`
  return `intent://${path}#Intent;scheme=${url.protocol.slice(0, -1)};action=android.intent.action.VIEW;type=video/*;package=${packageName};end`
}

export function getExternalPlayerUrl(
  player: ExternalPlayer,
  streamUrl: string,
) {
  const encodedStreamUrl = encodeURIComponent(streamUrl)

  switch (player) {
    case "iina":
      return `iina://weblink?url=${encodedStreamUrl}`
    case "vlc":
      return /Android/i.test(navigator.userAgent)
        ? androidIntentUrl(streamUrl, "org.videolan.vlc")
        : `vlc-x-callback://x-callback-url/stream?url=${encodedStreamUrl}`
    case "mpv":
      return /Android/i.test(navigator.userAgent)
        ? androidIntentUrl(streamUrl, "is.xyz.mpv")
        : `mpv://open?url=${encodedStreamUrl}`
    case "outplayer":
      return `outplayer://x-callback-url/open?url=${encodedStreamUrl}`
  }
}

const proxyBaseUrl = process.env.NEXT_PUBLIC_PROXY_URL?.replace(/\/$/, "")
// MediaFlow validates each manifest and segment request independently. This is
// intentionally public: proxy URLs are fetched directly by hls.js, not by our
// server, so a server-only value could never reach MediaFlow without relaying
// the entire video stream through Vercel.
const mediaflowApiPassword = process.env.NEXT_PUBLIC_MEDIAFLOW_API_PASSWORD

export const defaultSourceRequest: SourceRequest = {
  sourceType: "stalker",
  portalUrl: "",
  mac: "",
  serial: "",
  deviceId: "",
  deviceId2: "",
  signature: "",
  timezone: "America/Toronto",
  stbType: "MAG254",
}

export function canResolveChannel(channel: PortalChannel) {
  return Boolean(channel.id || channel.number || channel.name || channel.cmd)
}

// Resolves the latest playable stream URL for a channel via /api/channel-link
// (stalker create-link vs. direct cmd handled server-side), wrapping it in the
// stream proxy when enabled. Throws on failure.
export async function resolveChannelLink(
  channel: PortalChannelWithSource,
  opts: {
    endpoint: string
    portalRequest: SourceRequest
    useProxy: boolean
    signal?: AbortSignal
  },
): Promise<string> {
  const sourceId = channel.portalSource?.id
  const savedChannelId = channel.savedChannelId
  const sourceRequest = channel.portalSource?.request ?? opts.portalRequest
  const sourceEndpoint = channel.portalSource?.endpoint ?? opts.endpoint

  // Persisted channels resolve on the server, where both the source
  // credentials and its stream command remain private. The browser only ever
  // receives the compact catalogue fields until playback is requested.
  const savedChannelRequest =
    typeof sourceId === "number" &&
    sourceId > 0 &&
    typeof savedChannelId === "number"
      ? { sourceId, savedChannelId }
      : null

  const response = await apiFetch("/api/channel-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: opts.signal,
    body: JSON.stringify(
      savedChannelRequest ?? {
        ...sourceRequest,
        endpoint: sourceEndpoint,
        cmd: channel.cmd,
        channelId: channel.id,
        channelNumber: channel.number,
        channelName: channel.name,
      },
    ),
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok || typeof data.link !== "string" || !data.link) {
    throw new Error(data.error || "Could not pull the latest stream.")
  }

  return opts.useProxy ? proxyStreamUrl(data.link) : data.link
}

export function proxyStreamUrl(streamUrl: string) {
  // No proxy configured: play direct. Interpolating an undefined base produced
  // "undefined/proxy/hls/manifest.m3u8", which is not an absolute URL, so
  // `new URL` threw "Failed to construct 'URL'" and the player went red — a
  // hard failure for an optional feature, in any build missing the variable.
  if (!proxyBaseUrl) return streamUrl

  const url = new URL(`${proxyBaseUrl}/proxy/hls/manifest.m3u8`)
  url.searchParams.set("d", streamUrl)
  if (mediaflowApiPassword) {
    url.searchParams.set("api_password", mediaflowApiPassword)
  }
  return url.href
}

/** Whether stream proxying can actually be used in this build. */
export function isStreamProxyConfigured() {
  return Boolean(proxyBaseUrl)
}

export function formatStreamVariant({
  width,
  height,
  frameRate,
}: {
  width: number
  height: number
  frameRate: number
}): StreamVariant {
  return {
    resolutionLabel: formatResolutionLabel({ width, height }),
    frameRateLabel: formatFrameRateLabel(frameRate),
    bitrateLabel: "",
  }
}

export function formatResolutionLabel({
  width,
  height,
}: {
  width: number
  height: number
}) {
  if (width >= 3840 || height >= 2160) {
    return "4K"
  }
  return height ? `${height}p` : ""
}

export function formatFrameRateLabel(frameRate: number) {
  if (!frameRate) {
    return ""
  }
  const roundedFrameRate = Math.round(frameRate)
  const labelValue =
    Math.abs(frameRate - roundedFrameRate) < 0.05
      ? String(roundedFrameRate)
      : String(Number(frameRate.toFixed(2)))
  return `${labelValue} fps`
}

export function formatBitrateLabel(bitrate: number) {
  if (!Number.isFinite(bitrate) || bitrate <= 0) {
    return ""
  }
  return `${(bitrate / 1_000_000).toFixed(1)} Mbps`
}

const COMMON_FRAME_RATES = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60]

export function snapToCommonFrameRate(frameRate: number) {
  let closest = COMMON_FRAME_RATES[0]
  let smallestDiff = Infinity

  for (const candidate of COMMON_FRAME_RATES) {
    const diff = Math.abs(frameRate - candidate)
    if (diff < smallestDiff) {
      smallestDiff = diff
      closest = candidate
    }
  }

  return smallestDiff / closest < 0.04 ? closest : frameRate
}

export function getPortalSource(portal: SavedPortalRecord): PortalSource {
  if (portal.sourceType === "xtream") {
    return {
      id: portal.id,
      name: portal.name,
      endpoint: portal.endpoint || "",
      request: {
        sourceType: "xtream",
        serverUrl: portal.serverUrl ?? "",
        username: portal.username ?? "",
        password: portal.password ?? "",
        outputFormat: portal.outputFormat ?? "m3u8",
      },
      epgMode: portal.epgMode,
      epgSourceId: portal.epgSourceId,
    }
  }

  if (portal.sourceType === "m3u") {
    return {
      id: portal.id,
      name: portal.name,
      endpoint: portal.endpoint || "",
      request: {
        sourceType: "m3u",
        playlistUrl: portal.playlistUrl ?? "",
      },
      epgMode: portal.epgMode,
      epgSourceId: portal.epgSourceId,
    }
  }

  return {
    id: portal.id,
    name: portal.name,
    endpoint: portal.endpoint || "",
    request: {
      sourceType: "stalker",
      portalUrl: portal.portalUrl ?? "",
      mac: portal.mac ?? "",
      serial: portal.serial ?? "",
      deviceId: portal.deviceId ?? "",
      deviceId2: portal.deviceId2 ?? "",
      signature: portal.signature ?? "",
      timezone: portal.timezone,
      stbType: portal.stbType,
    },
    epgMode: portal.epgMode,
    epgSourceId: portal.epgSourceId,
  }
}

async function fetchSavedPortalResult(
  portal: SavedPortalRecord,
): Promise<PortalResponse> {
  const response = await apiFetch(`/api/portals/${portal.id}`, {
    cache: "no-store",
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || "Could not load this saved portal.")
  }

  const channels = Array.isArray(data.channels) ? data.channels : []

  return {
    endpoint: portal.endpoint || "",
    profile: {},
    genres: uniqueGenres(channels),
    channels,
  }
}

// Skips the /api/portals/[id] round trip (and the Postgres read behind it)
// when the source's cached channels are still fresh, so a plain page
// refresh doesn't re-download every enabled portal's full channel list.
export async function loadPortalChannels(
  portal: SavedPortalRecord,
  cachedEntry?: CachedPortalChannels | null,
): Promise<PortalResponse> {
  const updatedAt = new Date(portal.updatedAt).getTime()
  const cached =
    cachedEntry === undefined
      ? Number.isFinite(updatedAt)
        ? await getCachedPortalChannels(portal.id)
        : null
      : cachedEntry

  if (cached && cached.updatedAt === updatedAt) {
    return {
      endpoint: portal.endpoint || "",
      profile: {},
      genres: uniqueGenres(cached.channels),
      channels: cached.channels,
    }
  }

  const result = await fetchSavedPortalResult(portal)

  if (Number.isFinite(updatedAt)) {
    await setCachedPortalChannels({
      sourceId: portal.id,
      updatedAt,
      channels: result.channels,
    })
  }

  return result
}

export function getChannelLogoUrl(
  channel: PortalChannel,
  portalSource: PortalSource | undefined,
  epgChannels: Record<
    string,
    { name: string; logoUrl?: string; countryCode?: string }
  >,
  customEpgChannels: Record<number, Record<string, { logoUrl?: string }>>,
  useImageProxy: boolean,
) {
  const lookupId = normalizeXmltvId(channel.xmltvId) || channel.id

  const logoUrl =
    (portalSource?.epgMode === "iptv-org" && lookupId
      ? epgChannels[lookupId.toLowerCase()]?.logoUrl
      : null) ||
    (portalSource?.epgMode === "custom" && portalSource.epgSourceId && lookupId
      ? customEpgChannels[portalSource.epgSourceId]?.[lookupId.toLowerCase()]
          ?.logoUrl
      : null) ||
    channel.logoUrl ||
    ""

  return logoUrl ? proxyImageUrl(logoUrl, useImageProxy) : ""
}

/**
 * The artwork this one stream shipped, rather than the channel's.
 *
 * Only the sources drawer wants this. Everywhere else — the row, the header
 * above the player, the player's own overlay — is showing the channel, and a
 * channel wears the guide's mark whichever portal is currently supplying the
 * pixels. sourceLogoUrl is absent on a catalogue cached before the two were
 * told apart, and on the built-in iptv-org list where a stream and a channel
 * are the same thing; both fall through to the channel's.
 */
export function getStreamLogoUrl(
  channel: PortalChannel,
  useImageProxy: boolean,
) {
  const logoUrl = channel.sourceLogoUrl || channel.logoUrl || ""
  return logoUrl ? proxyImageUrl(logoUrl, useImageProxy) : ""
}

export function formatTimeRange(startAt: string, stopAt: string) {
  return `${formatClockTime(startAt)} - ${formatClockTime(stopAt)}`
}

export function formatClockTime(value: string | number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

export function formatScheduleDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(value))
}

export function scheduleDateKey(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function uniqueGenres(channels: PortalChannel[]) {
  const genres = new Map<string, { id: string; title: string }>()

  for (const channel of channels) {
    if (channel.genreId || channel.genre) {
      genres.set(channel.genreId || channel.genre, {
        id: channel.genreId,
        title: channel.genre || "Uncategorized",
      })
    }
  }

  return [...genres.values()]
}

// --- URL identity -----------------------------------------------------------
