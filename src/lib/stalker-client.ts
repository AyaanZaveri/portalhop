import type { PortalChannel, PortalRequest, PortalResponse } from "@/lib/stalker-types"

type StalkerEnvelope = {
  js?: unknown
  error?: string
}

type StalkerChannel = {
  id?: string | number
  number?: string | number
  name?: string
  title?: string
  tv_genre_id?: string | number
  genre_id?: string | number
  cmd?: string
  logo?: string
}

type StalkerGenre = {
  id?: string | number
  title?: string
  name?: string
  alias?: string
}

const DEFAULT_TIMEZONE = "America/Toronto"
const DEFAULT_STB_TYPE = "MAG254"
const USER_AGENT =
  "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG254 stbapp ver: 4 rev: 1812 Mobile Safari/533.3"
const PROFILE_VERSION =
  "ImageDescription: 0.2.18-r23-250; ImageDate: Thu Sep 13 11:31:16 EEST 2018; PORTAL version: 5.6.2; API Version: JS API version: 343; STB API version: 146; Player Engine version: 0x58c"

export function normalizePortalRequest(body: PortalRequest) {
  return {
    mac: normalizeMac(body.mac),
    timezone: body.timezone?.trim() || DEFAULT_TIMEZONE,
    stbType: body.stbType?.trim() || DEFAULT_STB_TYPE,
    serial: body.serial?.trim(),
    deviceId: body.deviceId?.trim(),
    deviceId2: body.deviceId2?.trim(),
    signature: body.signature?.trim(),
  }
}

export function getEndpointCandidates(portalUrl: string) {
  try {
    const parsed = new URL(portalUrl)

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return []
    }

    parsed.hash = ""
    parsed.search = ""

    const pathname = parsed.pathname.replace(/\/+$/, "")
    const origin = parsed.origin
    const candidates = new Set<string>()

    if (pathname.endsWith("/portal.php") || pathname.endsWith("/load.php")) {
      candidates.add(`${origin}${pathname}`)
    }

    if (pathname.includes("/stalker_portal")) {
      const root = pathname.slice(
        0,
        pathname.indexOf("/stalker_portal") + "/stalker_portal".length
      )
      candidates.add(`${origin}${root}/server/load.php`)
      candidates.add(`${origin}${root}/portal.php`)
    }

    const base =
      pathname.endsWith("/c") || pathname.endsWith("/client")
        ? pathname.replace(/\/(c|client)$/, "")
        : pathname

    if (base) {
      candidates.add(`${origin}${base}/portal.php`)
      candidates.add(`${origin}${base}/server/load.php`)
      candidates.add(`${origin}${base}/stalker_portal/server/load.php`)
    }

    candidates.add(`${origin}/portal.php`)
    candidates.add(`${origin}/stalker_portal/server/load.php`)

    return [...candidates]
  } catch {
    return []
  }
}

export async function fetchPortalChannels(
  endpoint: string,
  options: ReturnType<typeof normalizePortalRequest>
): Promise<PortalResponse> {
  const handshake = await stalkerRequest(endpoint, options, {
    type: "stb",
    action: "handshake",
    JsHttpRequest: "1-xml",
  })
  const token = getToken(handshake)

  if (!token) {
    throw new Error("Handshake response did not include a bearer token.")
  }

  const profileEnvelope = await stalkerRequest(
    endpoint,
    options,
    buildProfileParams(options),
    token
  )
  const profile = readObject(profileEnvelope.js)

  const [genresEnvelope, channelsEnvelope] = await Promise.all([
    stalkerRequest(
      endpoint,
      options,
      {
        type: "itv",
        action: "get_genres",
        JsHttpRequest: "1-xml",
      },
      token
    ).catch(() => ({ js: [] })),
    stalkerRequest(
      endpoint,
      options,
      {
        type: "itv",
        action: "get_all_channels",
        JsHttpRequest: "1-xml",
      },
      token
    ),
  ])

  const genres = readGenres(genresEnvelope.js)
  const genreTitles = new Map(genres.map((genre) => [genre.id, genre.title]))
  const channels = readChannels(channelsEnvelope.js, genreTitles, endpoint)

  return {
    endpoint,
    profile: {
      id: stringValue(profile.id ?? profile.ls ?? profile.account),
      login: stringValue(profile.login),
      tariffPlan: stringValue(profile.tariff_plan ?? profile.tariff),
      status: stringValue(profile.status),
    },
    genres,
    channels,
  }
}

function normalizeMac(value: string | undefined) {
  const raw = value?.trim().toUpperCase()

  if (!raw) {
    return ""
  }

  const compact = raw.replace(/[^0-9A-F]/g, "")

  if (compact.length === 12) {
    return compact.match(/.{1,2}/g)?.join(":") ?? raw
  }

  return raw
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
  const referer = getReferer(endpoint)

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
      Referer: referer,
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

function readGenres(value: unknown) {
  const genres = Array.isArray(value) ? (value as StalkerGenre[]) : []

  return genres
    .map((genre) => ({
      id: stringValue(genre.id),
      title: stringValue(genre.title ?? genre.name) || "Uncategorized",
      alias: stringValue(genre.alias),
    }))
    .filter((genre) => genre.id)
}

function readChannels(
  value: unknown,
  genreTitles: Map<string, string>,
  endpoint: string
) {
  const payload = readObject(value)
  const rows = Array.isArray(payload.data)
    ? (payload.data as StalkerChannel[])
    : Array.isArray(value)
      ? (value as StalkerChannel[])
      : []

  return rows.map<PortalChannel>((channel) => {
    const genreId = stringValue(channel.tv_genre_id ?? channel.genre_id)
    const logo = stringValue(channel.logo)

    return {
      id: stringValue(channel.id),
      number: stringValue(channel.number),
      name: stringValue(channel.name ?? channel.title) || "Untitled channel",
      genreId,
      genre: genreTitles.get(genreId) || (genreId ? `Genre ${genreId}` : ""),
      cmd: stringValue(channel.cmd),
      logo,
      logoUrl: resolveLogoUrl(logo, endpoint),
    }
  })
}

function resolveLogoUrl(logo: string, endpoint: string) {
  if (!logo) {
    return ""
  }

  try {
    const endpointUrl = new URL(endpoint)

    if (logo.startsWith("//")) {
      return `${endpointUrl.protocol}${logo}`
    }

    try {
      return new URL(logo).href
    } catch {
      const portalBase = getPortalBaseUrl(endpointUrl)

      if (logo.startsWith("/")) {
        return new URL(logo, endpointUrl.origin).href
      }

      if (logo.includes("/")) {
        return new URL(logo, `${portalBase}/`).href
      }

      return new URL(`misc/logos/320/${logo}`, `${portalBase}/`).href
    }
  } catch {
    return logo
  }
}

function getPortalBaseUrl(endpointUrl: URL) {
  const pathname = endpointUrl.pathname

  if (pathname.endsWith("/server/load.php")) {
    return `${endpointUrl.origin}${pathname.slice(0, -"/server/load.php".length)}`
  }

  if (pathname.endsWith("/portal.php")) {
    return `${endpointUrl.origin}${pathname.slice(0, -"/portal.php".length)}`
  }

  return endpointUrl.origin
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
