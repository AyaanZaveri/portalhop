import {
  fetchPortalChannels,
  getEndpointCandidates,
  normalizePortalRequest,
} from "@/lib/stalker-client"
import type { PortalChannel, PortalRequest } from "@/lib/stalker-types"

type StalkerEnvelope = {
  js?: unknown
  error?: string
}

type RequestedChannel = {
  id: string
  number: string
  name: string
  cmd: string
}

const USER_AGENT =
  "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG254 stbapp ver: 4 rev: 1812 Mobile Safari/533.3"
const PROFILE_VERSION =
  "ImageDescription: 0.2.18-r23-250; ImageDate: Thu Sep 13 11:31:16 EEST 2018; PORTAL version: 5.6.2; API Version: JS API version: 343; STB API version: 146; Player Engine version: 0x58c"

export function hasChannelIdentity(channel: RequestedChannel) {
  return Boolean(channel.id || channel.number || channel.name || channel.cmd)
}

export async function resolveStalkerChannelLink(
  request: PortalRequest & { endpoint?: string },
  requestedChannel: RequestedChannel
) {
  const portalUrl = request.portalUrl?.trim()
  const options = normalizePortalRequest(request)

  if (!portalUrl || !options.mac || !hasChannelIdentity(requestedChannel)) {
    throw new Error("Portal URL, MAC address, and channel identity are required.")
  }

  const endpoints = [
    ...(request.endpoint ? [request.endpoint] : []),
    ...getEndpointCandidates(portalUrl),
  ].filter(
    (endpoint, index, list) => endpoint && list.indexOf(endpoint) === index
  )

  if (!endpoints.length) {
    throw new Error("Portal URL must be a valid http or https URL.")
  }

  const errors: string[] = []

  for (const endpoint of endpoints) {
    if (requestedChannel.cmd) {
      try {
        const link = await createChannelLink(
          endpoint,
          options,
          requestedChannel.cmd
        )
        return { link, endpoint }
      } catch (error) {
        errors.push(
          `${endpoint} cached cmd: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }

    try {
      const result = await fetchPortalChannels(endpoint, options)
      const freshChannel = findFreshChannel(result.channels, requestedChannel)

      if (!freshChannel?.cmd) {
        throw new Error("Live channel list did not include this channel.")
      }

      const link = await createChannelLink(endpoint, options, freshChannel.cmd)
      return {
        link,
        endpoint,
        channel: {
          id: freshChannel.id,
          number: freshChannel.number,
          name: freshChannel.name,
        },
      }
    } catch (error) {
      errors.push(
        `${endpoint}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  throw Object.assign(
    new Error("Could not resolve the channel through create_link."),
    { details: errors }
  )
}

function findFreshChannel(
  channels: PortalChannel[],
  requested: RequestedChannel
) {
  return (
    (requested.id
      ? channels.find((channel) => channel.id === requested.id)
      : undefined) ??
    (requested.number && requested.name
      ? channels.find(
          (channel) =>
            channel.number === requested.number &&
            channel.name === requested.name
        )
      : undefined) ??
    (requested.name
      ? channels.find((channel) => channel.name === requested.name)
      : undefined) ??
    (requested.cmd
      ? channels.find((channel) => channel.cmd === requested.cmd)
      : undefined)
  )
}

async function createChannelLink(
  endpoint: string,
  options: {
    mac: string
    timezone: string
    stbType: string
    serial?: string
    deviceId?: string
    deviceId2?: string
    signature?: string
  },
  cmd: string
) {
  const handshake = await stalkerRequest(endpoint, options, {
    type: "stb",
    action: "handshake",
    JsHttpRequest: "1-xml",
  })
  const token = getToken(handshake)

  if (!token) {
    throw new Error("Handshake response did not include a bearer token.")
  }

  await stalkerRequest(endpoint, options, buildProfileParams(options), token)

  const linkEnvelope = await stalkerRequest(
    endpoint,
    options,
    {
      type: "itv",
      action: "create_link",
      cmd,
      forced_storage: "undefined",
      disable_ad: "0",
      download: "0",
      JsHttpRequest: "1-xml",
    },
    token
  )
  const payload = readObject(linkEnvelope.js)
  const link = normalizeStreamLink(
    stringValue(payload.cmd ?? payload.url ?? payload.link),
    endpoint,
    options.mac,
    cmd
  )

  if (!link) {
    throw new Error("create_link response did not include a stream URL.")
  }

  return link
}

function buildProfileParams(options: {
  stbType: string
  serial?: string
  deviceId?: string
  deviceId2?: string
  signature?: string
}) {
  const params: Record<string, string | number> = {
    type: "stb",
    action: "get_profile",
    hd: "1",
    ver: PROFILE_VERSION,
    num_banks: "2",
    stb_type: options.stbType,
    client_type: "STB",
    image_version: "218",
    video_out: "hdmi",
    auth_second_step:
      options.serial || options.deviceId || options.deviceId2 || options.signature
        ? "1"
        : "0",
    hw_version: "1.7-BD-00",
    not_valid_token: "0",
    JsHttpRequest: "1-xml",
  }

  if (options.serial) {
    params.sn = options.serial
  }

  if (options.deviceId) {
    params.device_id = options.deviceId
  }

  if (options.deviceId2) {
    params.device_id2 = options.deviceId2
  }

  if (options.signature) {
    params.signature = options.signature
  }

  return params
}

async function stalkerRequest(
  endpoint: string,
  options: { mac: string; timezone: string; stbType: string },
  params: Record<string, string | number>,
  token?: string
): Promise<StalkerEnvelope> {
  const url = new URL(endpoint)

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: "*/*",
      "User-Agent": USER_AGENT,
      "X-User-Agent": `Model: ${options.stbType}; Link: Ethernet`,
      Cookie: `mac=${options.mac}; stb_lang=en; timezone=${encodeURIComponent(
        options.timezone
      )}`,
      Referer: getReferer(endpoint),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  const text = await response.text()

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  try {
    const data = JSON.parse(text) as StalkerEnvelope

    if (data.error) {
      throw new Error(data.error)
    }

    return data
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Portal returned a non-JSON response.")
    }

    throw error
  }
}

function getReferer(endpoint: string) {
  const url = new URL(endpoint)
  const pathname = url.pathname
  const stalkerIndex = pathname.indexOf("/stalker_portal")

  if (stalkerIndex >= 0) {
    return `${url.origin}${pathname.slice(
      0,
      stalkerIndex + "/stalker_portal".length
    )}/c/`
  }

  return `${url.origin}/c/`
}

function getToken(envelope: StalkerEnvelope) {
  const payload = readObject(envelope.js)
  return stringValue(payload.token)
}

function cleanStreamCommand(value: string) {
  return value.replace(/^(ffmpeg|ffrt)\s+/i, "").trim()
}

function normalizeStreamLink(
  value: string,
  endpoint: string,
  mac: string,
  fallbackCmd: string
) {
  const cleaned = cleanStreamCommand(value)
  const streamId = readStreamId(cleaned) || readStreamId(fallbackCmd)

  if (isHttpUrl(cleaned)) {
    return fillMissingStreamId(cleaned, streamId)
  }

  if (streamId) {
    return buildDirectStreamUrl(endpoint, mac, streamId)
  }

  return cleaned
}

function fillMissingStreamId(value: string, streamId: string) {
  if (!streamId) {
    return value
  }

  try {
    const url = new URL(value)
    const isDirectPlayUrl = /\/play\/live\.php$/i.test(url.pathname)

    if (!isDirectPlayUrl) {
      return value
    }

    if (!url.searchParams.get("stream")) {
      url.searchParams.set("stream", streamId)
    }

    const extension = url.searchParams.get("extension")?.trim().toLowerCase()

    if (!extension || extension === "ts") {
      url.searchParams.set("extension", "m3u8")
    }

    return url.href
  } catch {
    return value
  }
}

function readStreamId(value: string) {
  const cleaned = cleanStreamCommand(value)

  if (!cleaned) {
    return ""
  }

  try {
    const url = new URL(cleaned)
    const stream = url.searchParams.get("stream")?.trim()

    if (stream) {
      return stream
    }
  } catch {
    // Continue with command/path parsing.
  }

  const numericCommand = cleaned.match(/^\d+$/)

  if (numericCommand) {
    return numericCommand[0]
  }

  const pathMatch = cleaned.match(/(?:^|\/)(\d+)(?:\.[a-z0-9]+)?(?:[/?#]|$)/i)

  return pathMatch?.[1] ?? ""
}

function buildDirectStreamUrl(endpoint: string, mac: string, streamId: string) {
  const url = new URL("/play/live.php", endpoint)

  url.searchParams.set("mac", mac)
  url.searchParams.set("stream", streamId)
  url.searchParams.set("extension", "m3u8")

  return url.href
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function readObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return {}
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) {
    return ""
  }

  return String(value)
}
