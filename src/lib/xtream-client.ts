import type { PortalChannel } from "@portalhop/shared/stalker-types"
import type { SourceResponse } from "@portalhop/shared/source-types"

type XtreamCategory = {
  category_id?: string | number
  category_name?: string
}

type XtreamStream = {
  stream_id?: string | number
  name?: string
  num?: string | number
  category_id?: string | number
  stream_icon?: string
  epg_channel_id?: string
}

type XtreamUserInfo = {
  username?: string
  status?: string
  exp_date?: string | number
}

type XtreamPlayerApiResponse = {
  user_info?: XtreamUserInfo
}

export async function fetchXtreamChannels(input: {
  serverUrl: string
  username: string
  password: string
  outputFormat?: string
}): Promise<SourceResponse> {
  const serverUrl = normalizeServerUrl(input.serverUrl)
  const username = input.username.trim()
  const password = input.password.trim()
  const outputFormat = normalizeOutputFormat(input.outputFormat)

  if (!serverUrl || !username || !password) {
    throw new Error("Xtream server URL, username, and password are required.")
  }

  const [profile, categories, streams] = await Promise.all([
    xtreamRequest<XtreamPlayerApiResponse>(serverUrl, username, password),
    xtreamRequest<XtreamCategory[]>(serverUrl, username, password, {
      action: "get_live_categories",
    }).catch(() => []),
    xtreamRequest<XtreamStream[]>(serverUrl, username, password, {
      action: "get_live_streams",
    }),
  ])
  const genres = readGenres(categories)
  const genreTitles = new Map(genres.map((genre) => [genre.id, genre.title]))
  const channels = streams.map((stream, index) =>
    readXtreamChannel(stream, index, serverUrl, username, password, outputFormat, genreTitles)
  )

  return {
    endpoint: `${serverUrl}/player_api.php`,
    profile: {
      login: profile.user_info?.username ?? username,
      status: profile.user_info?.status ?? "",
      tariffPlan: stringValue(profile.user_info?.exp_date),
    },
    genres,
    channels,
  }
}

function readGenres(categories: XtreamCategory[]) {
  return categories
    .map((category) => ({
      id: stringValue(category.category_id),
      title: stringValue(category.category_name) || "Uncategorized",
    }))
    .filter((category) => category.id)
}

function readXtreamChannel(
  stream: XtreamStream,
  index: number,
  serverUrl: string,
  username: string,
  password: string,
  outputFormat: string,
  genreTitles: Map<string, string>
): PortalChannel {
  const streamId = stringValue(stream.stream_id)
  const genreId = stringValue(stream.category_id)
  const logo = stringValue(stream.stream_icon)

  return {
    id: streamId || String(index + 1),
    xmltvId: stringValue(stream.epg_channel_id),
    number: stringValue(stream.num) || String(index + 1),
    name: stringValue(stream.name) || "Untitled channel",
    genreId,
    genre: genreTitles.get(genreId) || "",
    cmd: streamId
      ? `${serverUrl}/live/${encodeURIComponent(username)}/${encodeURIComponent(
          password
        )}/${encodeURIComponent(streamId)}.${outputFormat}`
      : "",
    logo,
    logoUrl: logo,
  }
}

async function xtreamRequest<T>(
  serverUrl: string,
  username: string,
  password: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${serverUrl}/player_api.php`)
  url.searchParams.set("username", username)
  url.searchParams.set("password", password)

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return (await response.json()) as T
}

function normalizeServerUrl(value: string) {
  try {
    const url = new URL(value.trim())

    if (!["http:", "https:"].includes(url.protocol)) {
      return ""
    }

    url.pathname = url.pathname.replace(/\/+$/, "")
    url.search = ""
    url.hash = ""
    return url.toString().replace(/\/$/, "")
  } catch {
    return ""
  }
}

function normalizeOutputFormat(value: string | undefined) {
  const format = value?.trim().replace(/^\./, "")
  return format || "m3u8"
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) {
    return ""
  }

  return String(value)
}
