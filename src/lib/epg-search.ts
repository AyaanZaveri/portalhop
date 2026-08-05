// Matching a channel to a guide listing is mostly a fight with naming noise:
// the same channel is "TSN 1", "TSN1 HD", "TSN 1 FHD" and "CA - TSN 1"
// depending on who wrote it down. Comparisons run on a normalized form so
// those all collapse to "tsn1".

/**
 * Quality and format markers. They describe the feed, never the channel, so
 * two names that differ only by one of these are the same channel.
 */
const NOISE_TOKENS = new Set([
  "4k",
  "8k",
  "uhd",
  "fhd",
  "qhd",
  "hd",
  "sd",
  "hq",
  "lq",
  "hevc",
  "h264",
  "h265",
  "x265",
  "raw",
  "backup",
  "alt",
  "vip",
  "plus",
  "feed",
  "tv",
  "channel",
])

/** Directory names are prefixed with their country: "CA - TSN 1". */
const COUNTRY_PREFIX = /^[a-z0-9]{2,6}\s*[-–]\s*/i

/** Guide ids carry a country suffix: "tsn1.ca". */
const COUNTRY_SUFFIX = /\.[a-z]{2,6}$/i

export function stripCountryPrefix(name: string) {
  return name.replace(COUNTRY_PREFIX, "").trim()
}

/**
 * Reduces a channel or listing name to the part that identifies it: lowercase,
 * no punctuation, no quality markers. "TSN 1 HD" and "CA - TSN 1" both become
 * "tsn1".
 */
export function normalizeChannelName(value: string) {
  const withoutPrefix = stripCountryPrefix(value)
    .toLowerCase()
    .replace(COUNTRY_SUFFIX, "")

  return withoutPrefix
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !NOISE_TOKENS.has(token))
    .join("")
}

export type EpgSearchEntry = {
  xmltvId: string
  name: string
  logoUrl?: string
  countryCode?: string
}

type Scored = { entry: EpgSearchEntry; score: number; length: number }

// Lower is better.
const SCORE_EXACT = 0
const SCORE_ID_EXACT = 1
const SCORE_PREFIX = 2
const SCORE_CONTAINS = 3

/**
 * Ranks listings against a query. Exact normalized matches first, because
 * "tsn1" should find "TSN 1" ahead of every name that merely contains those
 * letters — "Fubo Sports Network" contains "tsn" and is never the answer.
 */
export function rankEpgMatches(
  entries: Iterable<EpgSearchEntry>,
  query: string,
  limit: number,
): EpgSearchEntry[] {
  const normalizedQuery = normalizeChannelName(query)
  const rawQuery = query.trim().toLowerCase()

  if (!normalizedQuery && !rawQuery) {
    return []
  }

  const scored: Scored[] = []

  for (const entry of entries) {
    const name = normalizeChannelName(entry.name)
    const id = normalizeChannelName(entry.xmltvId)
    let score: number | null = null

    if (normalizedQuery && (name === normalizedQuery || id === normalizedQuery)) {
      score = SCORE_EXACT
    } else if (rawQuery && entry.xmltvId.toLowerCase() === rawQuery) {
      score = SCORE_ID_EXACT
    } else if (
      normalizedQuery &&
      (name.startsWith(normalizedQuery) || id.startsWith(normalizedQuery))
    ) {
      score = SCORE_PREFIX
    } else if (
      normalizedQuery &&
      (name.includes(normalizedQuery) || id.includes(normalizedQuery))
    ) {
      score = SCORE_CONTAINS
    }

    if (score === null) {
      continue
    }

    scored.push({ entry, score, length: name.length })

    // Exact hits are rare and everything else is ranked behind them, so there
    // is no point scoring the whole directory once plenty have been found.
    if (scored.length > limit * 40) {
      break
    }
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.length - b.length ||
      a.entry.name.localeCompare(b.entry.name),
  )

  return scored.slice(0, limit).map((item) => item.entry)
}
