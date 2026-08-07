import type { PortalChannel } from "@portalhop/shared/stalker-types"
import type { SourceResponse } from "@portalhop/shared/source-types"

type M3uEntry = {
  attributes: Record<string, string>
  title: string
  url: string
}

export async function fetchM3uChannels(playlistUrl: string): Promise<SourceResponse> {
  const url = normalizeHttpUrl(playlistUrl)

  if (!url) {
    throw new Error("M3U playlist URL must be a valid http or https URL.")
  }

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const text = await response.text()
  const entries = parseM3u(text)
  const channels = entries.map(readM3uChannel)

  return {
    endpoint: url,
    profile: {},
    genres: uniqueGenres(channels),
    channels,
  }
}

export function parseXtreamFromM3uUrl(playlistUrl: string) {
  try {
    const url = new URL(playlistUrl)
    const username = url.searchParams.get("username")?.trim()
    const password = url.searchParams.get("password")?.trim()

    if (!username || !password || !/\/get\.php$/i.test(url.pathname)) {
      return null
    }

    url.pathname = ""
    url.search = ""
    url.hash = ""

    return {
      serverUrl: url.toString().replace(/\/$/, ""),
      username,
      password,
    }
  } catch {
    return null
  }
}

function parseM3u(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const entries: M3uEntry[] = []
  let pending: { attributes: Record<string, string>; title: string } | null = null

  for (const line of lines) {
    if (line.startsWith("#EXTINF")) {
      pending = readExtinf(line)
      continue
    }

    if (line.startsWith("#")) {
      continue
    }

    if (pending) {
      entries.push({ ...pending, url: line })
      pending = null
    }
  }

  return entries
}

function readExtinf(line: string) {
  const commaIndex = line.indexOf(",")
  const metadata = commaIndex >= 0 ? line.slice(0, commaIndex) : line
  const title = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : ""
  const attributes: Record<string, string> = {}
  const attributePattern = /([\w-]+)="([^"]*)"/g
  let match: RegExpExecArray | null

  while ((match = attributePattern.exec(metadata))) {
    attributes[match[1].toLowerCase()] = match[2]
  }

  return { attributes, title }
}

function readM3uChannel(entry: M3uEntry, index: number): PortalChannel {
  const tvgId = entry.attributes["tvg-id"] ?? ""
  const logo = entry.attributes["tvg-logo"] ?? ""
  const genre = entry.attributes["group-title"] ?? ""
  const name =
    entry.title ||
    entry.attributes["tvg-name"] ||
    entry.attributes["channel-name"] ||
    "Untitled channel"

  return {
    // `tvg-id` identifies guide metadata, not a unique playlist entry. A
    // provider can legitimately publish multiple streams under one XMLTV ID.
    // Keep the playlist position as the stream identity and retain `tvg-id`
    // separately for guide and logo matching.
    id: String(index + 1),
    xmltvId: tvgId,
    number: String(index + 1),
    name,
    genreId: genre,
    genre,
    cmd: entry.url,
    logo,
    logoUrl: logo,
  }
}

function normalizeHttpUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : ""
  } catch {
    return ""
  }
}

function uniqueGenres(channels: PortalChannel[]) {
  const genres = new Map<string, { id: string; title: string }>()

  for (const channel of channels) {
    if (channel.genre) {
      genres.set(channel.genre, { id: channel.genreId || channel.genre, title: channel.genre })
    }
  }

  return [...genres.values()]
}
