/**
 * Fuzzy channel-name → XMLTV id matching.
 *
 * The EPG list is large (~28k channels) and a single source can carry tens of
 * thousands of channels, so we never hand the whole EPG list to the model.
 * Instead this module does the cheap, deterministic work — normalize, exact
 * match, and fuzzy-retrieve a short candidate list — and only the genuinely
 * ambiguous cases are handed to the AI reranker.
 */

export type EpgChannelEntry = {
  id: string
  name: string
  logoUrl?: string
  countryCode?: string
}

export type MatchCandidate = {
  id: string
  name: string
  score: number
}

export type ClassifiedMatch =
  /** A single confident match — assign it without spending any tokens. */
  | { kind: "exact"; xmltvId: string }
  /**
   * The same channel across multiple regions (identical name, e.g. CNN.us /
   * CNN.ca). Logos are region-identical, so this is resolved by region hint
   * without spending tokens.
   */
  | { kind: "regional"; candidates: MatchCandidate[] }
  /** Genuinely different candidate names — the AI reranker should pick. */
  | { kind: "ambiguous"; candidates: MatchCandidate[] }
  /** Nothing plausible — leave unmatched. */
  | { kind: "none" }

/** Country/region suffix of an xmltv id, e.g. `CNN.ca` → `ca`. */
export function regionOf(xmltvId: string): string {
  const dot = xmltvId.lastIndexOf(".")
  return dot === -1 ? "" : xmltvId.slice(dot + 1).toLowerCase()
}

/**
 * Choose the best id among same-channel regional variants: prefer the hinted
 * region, otherwise the highest score, with a stable id tiebreak.
 */
export function pickRegional(
  candidates: MatchCandidate[],
  regionHint?: string
): string {
  if (!candidates.length) {
    return ""
  }

  if (regionHint) {
    const hinted = candidates
      .filter((candidate) => regionOf(candidate.id) === regionHint)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    if (hinted.length) {
      return hinted[0].id
    }
  }

  return [...candidates].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id)
  )[0].id
}

const QUALITY_TOKENS = new Set([
  "hd",
  "fhd",
  "uhd",
  "sd",
  "4k",
  "8k",
  "hevc",
  "h265",
  "h264",
  "cc",
  "vip",
  "backup",
  "bk",
  "alt",
  "raw",
  "fps50",
  "fps60",
  "50fps",
  "60fps",
])

/**
 * A leading region/country prefix like `CA - `, `USA| `, `UK: `. Kept short so
 * we don't strip legitimate channel-name leaders (e.g. `TV3 - Sport`).
 */
const LEADING_PREFIX = /^\s*[\p{L}]{2}(?:[\p{L}&.-]{0,3})?\s*[-–—|:]\s*/u

function stripQuality(tokens: string[]): string[] {
  return tokens.filter((token) => token && !QUALITY_TOKENS.has(token))
}

function toTokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/** Canonical normalized name (quality tags removed, no region prefix stripped). */
export function normalizeName(raw: string): string {
  return stripQuality(toTokens(raw)).join(" ")
}

/**
 * The set of keys a name can be indexed / looked up under. Always includes the
 * canonical name; when the raw name starts with a short region prefix, also
 * includes the prefix-stripped form so `CA - CNN` and `CNN` collide.
 */
export function nameKeys(raw: string): string[] {
  const keys = new Set<string>()
  const canonical = normalizeName(raw)
  if (canonical) {
    keys.add(canonical)
  }

  const withoutPrefix = raw.replace(LEADING_PREFIX, "")
  if (withoutPrefix !== raw) {
    const stripped = normalizeName(withoutPrefix)
    if (stripped) {
      keys.add(stripped)
    }
  }

  return [...keys]
}

export type EpgIndex = {
  /** Normalized-name key → distinct EPG ids sharing it. */
  byName: Map<string, string[]>
  /** Token → set of entry indexes for fuzzy retrieval. */
  byToken: Map<string, Set<number>>
  entries: { id: string; name: string; tokens: string[] }[]
  /** All EPG ids currently known, lowercased — used to detect stale ids. */
  knownIds: Set<string>
}

export function buildEpgIndex(
  channels: Record<string, EpgChannelEntry> | EpgChannelEntry[]
): EpgIndex {
  const list = Array.isArray(channels)
    ? channels
    : Object.entries(channels).map(([id, value]) => ({ ...value, id }))

  const byName = new Map<string, string[]>()
  const byToken = new Map<string, Set<number>>()
  const entries: EpgIndex["entries"] = []
  const knownIds = new Set<string>()

  for (const channel of list) {
    if (!channel.id) {
      continue
    }

    knownIds.add(channel.id.toLowerCase())

    const tokens = stripQuality(toTokens(channel.name))
    const entryIndex = entries.length
    entries.push({ id: channel.id, name: channel.name, tokens })

    for (const key of nameKeys(channel.name)) {
      const ids = byName.get(key)
      if (ids) {
        if (!ids.includes(channel.id)) {
          ids.push(channel.id)
        }
      } else {
        byName.set(key, [channel.id])
      }
    }

    for (const token of new Set(tokens)) {
      const bucket = byToken.get(token)
      if (bucket) {
        bucket.add(entryIndex)
      } else {
        byToken.set(token, new Set([entryIndex]))
      }
    }
  }

  return { byName, byToken, entries, knownIds }
}

function diceScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) {
    return 0
  }

  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1
    }
  }

  return (2 * intersection) / (setA.size + setB.size)
}

const CANDIDATE_LIMIT = 8
const FUZZY_FLOOR = 0.34
const STRONG_AUTO = 0.86
const AUTO_GAP = 0.2

/**
 * Retrieve the best candidate EPG channels for a query name via the inverted
 * token index. Only entries sharing at least one token are scored.
 */
export function retrieveCandidates(
  raw: string,
  index: EpgIndex,
  limit = CANDIDATE_LIMIT
): MatchCandidate[] {
  const queryTokens = stripQuality(toTokens(raw))
  if (!queryTokens.length) {
    return []
  }

  const candidateIndexes = new Set<number>()
  for (const token of new Set(queryTokens)) {
    const bucket = index.byToken.get(token)
    if (bucket) {
      for (const entryIndex of bucket) {
        candidateIndexes.add(entryIndex)
      }
    }
  }

  const scored: MatchCandidate[] = []
  for (const entryIndex of candidateIndexes) {
    const entry = index.entries[entryIndex]
    let score = diceScore(queryTokens, entry.tokens)

    // Reward one name fully containing the other (e.g. "cnn" ⊂ "cnn international").
    const q = queryTokens.join(" ")
    const e = entry.tokens.join(" ")
    if (q && e && (q.includes(e) || e.includes(q))) {
      score += 0.1
    }

    if (score >= FUZZY_FLOOR) {
      scored.push({ id: entry.id, name: entry.name, score })
    }
  }

  scored.sort((a, b) => b.score - a.score)

  // Collapse duplicate ids, keeping the best-scoring occurrence.
  const seen = new Set<string>()
  const deduped: MatchCandidate[] = []
  for (const candidate of scored) {
    if (seen.has(candidate.id)) {
      continue
    }
    seen.add(candidate.id)
    deduped.push(candidate)
    if (deduped.length >= limit) {
      break
    }
  }

  return deduped
}

const REGIONAL_BAND = 0.02

/**
 * Classify a single channel name into exact / regional / ambiguous / none using
 * only the deterministic tiers. `exact` and `regional` cost no tokens; only
 * `ambiguous` (candidates with genuinely different names) needs the AI.
 */
export function classifyMatch(raw: string, index: EpgIndex): ClassifiedMatch {
  const keys = nameKeys(raw)

  // Tier 1: exact normalized-name hit. Multiple hits here share the same
  // normalized name, so they are the same channel in different regions.
  const exactIds = new Set<string>()
  for (const key of keys) {
    const ids = index.byName.get(key)
    if (ids) {
      for (const id of ids) {
        exactIds.add(id)
      }
    }
  }

  if (exactIds.size === 1) {
    return { kind: "exact", xmltvId: [...exactIds][0] }
  }

  if (exactIds.size > 1) {
    const byId = new Map(index.entries.map((entry) => [entry.id, entry]))
    return {
      kind: "regional",
      candidates: [...exactIds].map((id) => ({
        id,
        name: byId.get(id)?.name ?? id,
        score: 1,
      })),
    }
  }

  // Tier 2: fuzzy retrieval.
  const candidates = retrieveCandidates(raw, index)
  if (!candidates.length) {
    return { kind: "none" }
  }

  const top = candidates[0]

  // Among the strongest candidates, are they all the same channel (one
  // normalized name) or genuinely different channels?
  const strong = candidates.filter(
    (candidate) => candidate.score >= top.score - REGIONAL_BAND
  )
  const strongNames = new Set(strong.map((candidate) => normalizeName(candidate.name)))

  if (top.score >= STRONG_AUTO && strongNames.size === 1) {
    const topName = normalizeName(top.name)
    const sameChannel = candidates.filter(
      (candidate) => normalizeName(candidate.name) === topName
    )
    // Single region → exact; multiple regions → resolve by hint downstream.
    return sameChannel.length === 1
      ? { kind: "exact", xmltvId: sameChannel[0].id }
      : { kind: "regional", candidates: sameChannel }
  }

  const second = candidates[1]
  const gap = top.score - (second?.score ?? 0)
  if (top.score >= STRONG_AUTO && gap >= AUTO_GAP) {
    return { kind: "exact", xmltvId: top.id }
  }

  return { kind: "ambiguous", candidates }
}
