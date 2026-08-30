import { Readable } from "stream"
import zlib from "zlib"
import type { EpgProgramme } from "@portalhop/shared/stalker-types"

export interface EpgChannel {
  id: string
  name: string
  logoUrl?: string
}

type XmltvProgramme = Omit<EpgProgramme, "source">

/**
 * Fetches a gzipped XMLTV file from the given URL and parses it on the fly.
 * Uses a highly optimized line-by-line reading strategy: because the XMLTV DTD
 * requires all `<channel>` elements to precede all `<programme>` elements,
 * we can stop downloading and parsing as soon as we hit the first `<programme>`
 * tag. This saves massive amounts of memory and network bandwidth.
 */
// Fetches an XMLTV file and returns a decompressed line source, auto-detecting
// gzip vs plain XML. The iptv-epg.org files are raw `.xml.gz` (no
// Content-Encoding, so `fetch` won't unzip them), while custom EPG endpoints
// (e.g. xmltv.php) are usually plain XML. This handles both by peeking the
// first bytes for the gzip magic number (0x1f 0x8b) without consuming them.
async function fetchXmltvStream(
  url: string,
): Promise<{ stream: Readable; cleanup: () => void }> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch EPG from ${url}: ${response.statusText}`)
  }
  if (!response.body) {
    throw new Error(`Empty response body from ${url}`)
  }

  const source = Readable.fromWeb(
    response.body as unknown as import("stream/web").ReadableStream,
  )

  const head = await new Promise<Buffer>((resolve, reject) => {
    const onReadable = () => {
      const chunk = source.read()
      if (chunk === null) return
      source.off("readable", onReadable)
      source.off("end", onEnd)
      source.off("error", reject)
      resolve(chunk as Buffer)
    }
    const onEnd = () => {
      source.off("readable", onReadable)
      resolve(Buffer.alloc(0))
    }
    source.on("readable", onReadable)
    source.once("end", onEnd)
    source.once("error", reject)
  })

  if (head.length) {
    source.unshift(head)
  }

  const isGzip = head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b

  if (!isGzip) {
    return { stream: source, cleanup: () => source.destroy() }
  }

  const gunzip = zlib.createGunzip()
  source.on("error", (err) => gunzip.destroy(err))

  return {
    stream: source.pipe(gunzip),
    cleanup: () => {
      gunzip.destroy()
      source.destroy()
    },
  }
}

// Yields complete `<tagName ...>...</tagName>` blocks as they become
// available in the stream, regardless of how the source formats its line
// breaks — some generators pretty-print one element per line, others emit
// the entire document as a single line, which a line-oriented reader can
// never make progress on. Consumed text is dropped from the buffer as soon
// as a block is extracted, so memory stays bounded to roughly one element's
// worth of data rather than the whole (possibly huge) document. If
// `stopMarkers` is given, iteration ends as soon as any of them appears in
// the buffer (once every already-buffered complete block has been yielded),
// so callers can bail out before the rest of the document downloads.
async function* iterateTagBlocks(
  stream: Readable,
  tagName: string,
  stopMarkers: string[] = [],
): AsyncGenerator<string> {
  const openTag = new RegExp(`<${tagName}(?=[\\s>/])`)
  const openMarker = `<${tagName}`
  const closeTag = `</${tagName}>`
  const decoder = new TextDecoder("utf-8")
  let buffer = ""

  const drainBlocks = function* () {
    for (;;) {
      const openMatch = openTag.exec(buffer)
      if (!openMatch) return
      const closeIndex = buffer.indexOf(closeTag, openMatch.index)
      if (closeIndex === -1) return
      const end = closeIndex + closeTag.length
      yield buffer.slice(openMatch.index, end)
      buffer = buffer.slice(end)
    }
  }

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk as Buffer, { stream: true })
    yield* drainBlocks()

    if (stopMarkers.some((marker) => buffer.includes(marker))) {
      return
    }

    // If this chunk contains no opening tag, everything except a possible
    // split tag suffix is already known to be irrelevant. Without trimming,
    // a large XMLTV channel preamble accumulates in memory until the first
    // programme element (the US guide can exceed the worker heap here).
    const nextOpen = openTag.exec(buffer)
    if (!nextOpen) {
      const partialMarkerLength = Math.max(
        openMarker.length - 1,
        ...stopMarkers.map((marker) => marker.length - 1),
      )
      buffer = buffer.slice(-partialMarkerLength)
    } else if (nextOpen.index > 0) {
      buffer = buffer.slice(nextOpen.index)
    }
  }

  buffer += decoder.decode()
  yield* drainBlocks()
}

export async function fetchAndParseEpg(url: string): Promise<EpgChannel[]> {
  const { stream, cleanup } = await fetchXmltvStream(url)
  const channels: EpgChannel[] = []

  try {
    for await (const block of iterateTagBlocks(stream, "channel", [
      "<programme",
    ])) {
      const id = decodeXmlText(
        block.match(/<channel\b[^>]*\sid="([^"]*)"/)?.[1] ?? "",
      )
      const name = decodeXmlText(
        block.match(/<display-name[^>]*>([^<]*)<\/display-name>/)?.[1] ?? "",
      ).trim()

      if (!id || !name) {
        continue
      }

      const logoUrl = decodeXmlText(
        block.match(/<icon\b[^>]*\ssrc="([^"]*)"/)?.[1] ?? "",
      )
      channels.push({ id, name, logoUrl: logoUrl || undefined })
    }
  } finally {
    cleanup()
  }

  return channels
}

export async function fetchAndParseEpgProgrammes(
  url: string,
  channelIds: string[],
  options: { from?: Date; to?: Date; limit?: number } = {},
): Promise<XmltvProgramme[]> {
  const wantedIds = new Set(channelIds.map((id) => id.trim()).filter(Boolean))

  if (!wantedIds.size) {
    return []
  }

  const from = options.from ?? new Date(Date.now() - 30 * 60 * 1000)
  // Some EPG sources have gaps of a day or more with no scheduled programmes
  // for a given channel. Defaulting `to` to a wide, multi-week horizon (rather
  // than a fixed 24h window) means a single page always finds the next
  // available programmes for the channel instead of coming back empty.
  const to = options.to ?? new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000)
  const limit = options.limit ?? 12
  const { stream, cleanup } = await fetchXmltvStream(url)
  const programmes: XmltvProgramme[] = []

  try {
    for await (const block of iterateTagBlocks(stream, "programme")) {
      const attrs = readXmlAttributes(
        block.match(/^<programme([^>]*)>/)?.[1] ?? "",
      )
      const channelId = attrs.channel ?? ""

      if (!wantedIds.has(channelId)) {
        continue
      }

      const startAt = parseXmltvDate(attrs.start ?? "")
      const stopAt = parseXmltvDate(attrs.stop ?? "")

      if (!startAt || !stopAt || stopAt <= from || startAt >= to) {
        continue
      }

      const title = readXmlText(block, "title")

      if (!title) {
        continue
      }

      const posterUrl = decodeXmlText(
        block.match(/<icon\b[^>]*\ssrc="([^"]*)"/)?.[1] ?? "",
      )

      programmes.push({
        id: `${channelId}:${startAt.toISOString()}`,
        channelId,
        title,
        description: readXmlText(block, "desc"),
        category: readXmlText(block, "category"),
        posterUrl: posterUrl || undefined,
        startAt: startAt.toISOString(),
        stopAt: stopAt.toISOString(),
      })

      if (programmes.length >= limit) {
        break
      }
    }
  } finally {
    cleanup()
  }

  return programmes.sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  )
}

function readXmlAttributes(value: string) {
  const attrs: Record<string, string> = {}
  const attrPattern = /([:\w-]+)="([^"]*)"/g
  let match: RegExpExecArray | null

  while ((match = attrPattern.exec(value))) {
    attrs[match[1]] = decodeXmlText(match[2])
  }

  return attrs
}

function readXmlText(value: string, tagName: string) {
  const match = value.match(
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`),
  )
  return match ? decodeXmlText(match[1]).trim() : ""
}

function parseXmltvDate(value: string) {
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?/,
  )

  if (!match) {
    return null
  }

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    sign,
    offsetHour,
    offsetMinute,
  ] = match
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
  const offsetMs =
    sign && offsetHour && offsetMinute
      ? (Number(offsetHour) * 60 + Number(offsetMinute)) * 60 * 1000
      : 0

  return new Date(sign === "-" ? timestamp + offsetMs : timestamp - offsetMs)
}

function decodeXmlText(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

/**
 * [startMs, stopMs, title, description?] — positional to keep guide windows
 * compact. Descriptions are requested only for an explicit programme search.
 */
export type EpgSlot = [number, number, string, string?]

export type EpgWindow = {
  from: number
  to: number
  channels: Record<string, EpgSlot[]>
}

/**
 * Every channel's schedule for one time window, in a single pass over the file.
 * The client picks what is on now against its own clock, so a stale window is
 * still correct — it just starts further ahead.
 */
export async function fetchEpgWindow(
  url: string,
  options: { from?: Date; hours?: number; includeDescriptions?: boolean } = {},
): Promise<EpgWindow> {
  const from = options.from ?? new Date()
  const to = new Date(from.getTime() + (options.hours ?? 6) * 60 * 60 * 1000)
  const { stream, cleanup } = await fetchXmltvStream(url)
  const channels: Record<string, EpgSlot[]> = {}

  try {
    for await (const block of iterateTagBlocks(stream, "programme")) {
      const attrs = readXmlAttributes(
        block.match(/^<programme([^>]*)>/)?.[1] ?? "",
      )
      const channelId = attrs.channel ?? ""
      if (!channelId) continue

      const startAt = parseXmltvDate(attrs.start ?? "")
      const stopAt = parseXmltvDate(attrs.stop ?? "")
      if (!startAt || !stopAt || stopAt <= from || startAt >= to) continue

      const title = readXmlText(block, "title")
      if (!title) continue

      const slot: EpgSlot = [startAt.getTime(), stopAt.getTime(), title]
      if (options.includeDescriptions) {
        const description = readXmlText(block, "desc")
        if (description) slot.push(description)
      }
      ;(channels[channelId.toLowerCase()] ??= []).push(slot)
    }
  } finally {
    cleanup()
  }

  for (const slots of Object.values(channels)) {
    slots.sort((a, b) => a[0] - b[0])
  }

  return { from: from.getTime(), to: to.getTime(), channels }
}
