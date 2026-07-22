import type {
  EpgProgramme,
  PortalChannel,
  PortalRequest,
  PortalResponse,
} from "@/lib/stalker-types"

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
  xmltv_id?: string
}

type StalkerGenre = {
  id?: string | number
  title?: string
  name?: string
  alias?: string
}

type StalkerEpgRow = {
  id?: string | number
  name?: string
  title?: string
  descr?: string
  description?: string
  category?: string
  start_timestamp?: string | number
  stop_timestamp?: string | number
  start?: string | number
  stop?: string | number
  on_date?: string
}

const DEFAULT_TIMEZONE = "America/Toronto"
const DEFAULT_STB_TYPE = "MAG254"
const USER_AGENT =
  "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG254 stbapp ver: 4 rev: 1812 Mobile Safari/533.3"
const PROFILE_VERSION =
  "ImageDescription: 0.2.18-r23-250; ImageDate: Thu Sep 13 11:31:16 EEST 2018; PORTAL version: 5.6.2; API Version: JS API version: 343; STB API version: 146; Player Engine version: 0x58c"
// Some Stalker deployments intermittently pause for 15–30 seconds while
// servicing a MAG request. A 15-second client cutoff turns that temporary
// delay into a misleading credentials/endpoint failure.
const PORTAL_REQUEST_TIMEOUT_MS = 45_000

export function normalizePortalRequest(body: PortalRequest) {
  const deviceId = extractHex(body.deviceId)
  const deviceId2 = extractHex(body.deviceId2)

  return {
    mac: normalizeMac(body.mac),
    timezone: body.timezone?.trim() || DEFAULT_TIMEZONE,
    stbType: body.stbType?.trim() || DEFAULT_STB_TYPE,
    serial: body.serial?.trim(),
    // Most resellers only ever hand out a single "Device ID" value, but
    // portals commonly validate device_id and device_id2 together and
    // reject the pair if only one is present (seen as a "device conflict"
    // on get_profile). Mirror whichever one was supplied into the other.
    deviceId: deviceId || deviceId2,
    deviceId2: deviceId2 || deviceId,
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

      if (!base.includes("/stalker_portal")) {
        candidates.add(`${origin}${base}/stalker_portal/server/load.php`)
      }
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

export async function fetchPortalEpg(
  endpoint: string,
  options: ReturnType<typeof normalizePortalRequest>,
  channelId: string,
  period = 6
): Promise<EpgProgramme[]> {
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

  const shortEpgEnvelope = await stalkerRequest(
    endpoint,
    options,
    {
      type: "itv",
      action: "get_short_epg",
      ch_id: channelId,
      size: 12,
      JsHttpRequest: "1-xml",
    },
    token
  ).catch(() => null)

  if (shortEpgEnvelope) {
    const programmes = readProviderEpg(shortEpgEnvelope.js, channelId)

    if (programmes.length) {
      return programmes
    }
  }

  const epgEnvelope = await stalkerRequest(
    endpoint,
    options,
    {
      type: "itv",
      action: "get_epg_info",
      ch_id: channelId,
      period,
      JsHttpRequest: "1-xml",
    },
    token
  )

  return readProviderEpg(epgEnvelope.js, channelId)
}

// Reseller "info cards" for these portals often stylize field labels with
// bold Unicode letters and decorative symbols (e.g. "𝐃𝐞𝐯𝐢𝐜𝐞𝐈𝐃 ¹💥²28F8F8D6...")
// glued directly onto the actual value. Device IDs are always plain hex, so
// strip anything that isn't a hex digit rather than reject a value a user
// copy-pasted verbatim from one of these cards.
function extractHex(value: string | undefined) {
  const stripped = value?.trim().replace(/[^0-9a-fA-F]/g, "")
  return stripped || undefined
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
    signal: AbortSignal.timeout(PORTAL_REQUEST_TIMEOUT_MS),
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
      xmltvId: stringValue(channel.xmltv_id),
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

function readProviderEpg(value: unknown, channelId: string): EpgProgramme[] {
  const payload = readObject(value)
  const data = readObject(payload.data ?? payload.epg ?? value)
  let rows: StalkerEpgRow[] = []

  if (Array.isArray(data[channelId])) {
    rows = data[channelId] as StalkerEpgRow[]
  } else if (Array.isArray(payload.data)) {
    rows = payload.data as StalkerEpgRow[]
  } else if (Array.isArray(payload.epg)) {
    rows = payload.epg as StalkerEpgRow[]
  } else if (Array.isArray(value)) {
    rows = value as StalkerEpgRow[]
  }

  const programmes: Array<EpgProgramme | null> = rows.map((row, index) => {
    const startAt = readStalkerTimestamp(row.start_timestamp ?? row.start)
    const stopAt = readStalkerTimestamp(row.stop_timestamp ?? row.stop)
    const title = stringValue(row.name ?? row.title)

    if (!startAt || !stopAt || !title) {
      return null
    }

    return {
      id: `${channelId}:${startAt.toISOString()}:${index}`,
      channelId,
      title,
      description: stringValue(row.descr ?? row.description),
      category: stringValue(row.category),
      startAt: startAt.toISOString(),
      stopAt: stopAt.toISOString(),
      source: "provider",
    }
  })

  return programmes
    .filter((programme): programme is EpgProgramme => Boolean(programme))
    .sort(
      (a, b) =>
        new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    )
}

function readStalkerTimestamp(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const numeric = Number(value)

  if (Number.isFinite(numeric)) {
    return new Date(numeric * 1000)
  }

  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
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
