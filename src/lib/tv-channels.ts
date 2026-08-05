import type { PortalChannel, PortalResponse } from "@/lib/stalker-types"
import type { SavedSourceRecord, SourceRequest } from "@/lib/source-types"
import { normalizeXmltvId } from "@/lib/xmltv-id"
import { proxyImageUrl } from "@/lib/image-proxy"
import {
  getCachedPortalChannels,
  setCachedPortalChannels,
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

const proxyBaseUrl = process.env.NEXT_PUBLIC_PROXY_URL
const proxyManifestUrl = `${proxyBaseUrl}/proxy/hls/manifest.m3u8`

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
    typeof sourceId === "number" && sourceId > 0 && typeof savedChannelId === "number"
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
  const url = new URL(proxyManifestUrl)
  url.searchParams.set("d", streamUrl)
  return url.href
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

export function getChannelKey(channel: PortalChannelWithSource) {
  // Saved channels retain this row ID across portal refreshes. Keeping the
  // favorite key to these two durable values avoids mutable provider metadata
  // (number, name, stream URL) making a favorite disappear.
  if (
    typeof channel.portalSource?.id === "number" &&
    typeof channel.savedChannelId === "number"
  ) {
    return JSON.stringify([channel.portalSource.id, channel.savedChannelId])
  }

  // Channel IDs from older saved M3U sources can be XMLTV `tvg-id` values,
  // which are not necessarily unique. Include the stream URL and playlist
  // number so selection, favourites, and player state identify the actual
  // stream rather than its guide metadata.
  return JSON.stringify([
    channel.portalSource?.id ?? "manual",
    channel.savedChannelId ?? null,
    channel.id,
    channel.number,
    channel.cmd,
  ])
}

export function getLegacyChannelKey(channel: PortalChannelWithSource) {
  return [
    channel.portalSource?.id ?? "manual",
    channel.id || channel.number || channel.name,
  ].join(":")
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
): Promise<PortalResponse> {
  const updatedAt = new Date(portal.updatedAt).getTime()
  const cached = Number.isFinite(updatedAt)
    ? await getCachedPortalChannels(portal.id)
    : null

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
    setCachedPortalChannels({
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

// Small deterministic 32-bit FNV-1a hash rendered as base36. Not cryptographic;
// just needs to be stable and URL-safe.
function shortHash(input: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

// A channel's stable-ish identity within a user's list: the saved-channel row
// PK when available (portals), otherwise the normalized xmltv id + number +
// stream command (mirrors getChannelKey's uniqueness for iptv-org / m3u).
function channelIdentity(channel: PortalChannelWithSource) {
  if (channel.savedChannelId != null) {
    return `s${channel.savedChannelId}`
  }
  return [
    normalizeXmltvId(channel.xmltvId) || channel.id,
    channel.number,
    channel.cmd,
  ].join("|")
}

// URL id for a channel: a readable name slug plus a short hash tied to the
// user, the portal, and the channel identity (not category), so it is unique
// across portals/users and scoped per user.
export function channelSlug(
  channel: PortalChannelWithSource,
  userId: string | null,
) {
  const name = slugify(channel.name || channel.number || "channel") || "channel"
  const hash = shortHash(
    [
      userId ?? "anon",
      channel.portalSource?.id ?? "manual",
      channelIdentity(channel),
    ].join("|"),
  )
  return `${name}-${hash}`
}

// Builds a lookup from URL id -> channel for O(1) resolution of /tv/[channelId].
export function buildChannelIndex(
  channels: PortalChannelWithSource[],
  userId: string | null,
) {
  const index = new Map<string, PortalChannelWithSource>()
  for (const channel of channels) {
    const id = channelSlug(channel, userId)
    if (!index.has(id)) {
      index.set(id, channel)
    }
  }
  return index
}
