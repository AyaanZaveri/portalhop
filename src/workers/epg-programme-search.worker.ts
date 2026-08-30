type Slot = [number, number, string, string?]
type ProgrammeMatch = {
  id: string
  title: string
  description?: string
  startAt: number
  stopAt: number
}

type IndexedProgramme = ProgrammeMatch & { tokens: string[] }

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000]
const programmes = new Map<string, IndexedProgramme[]>()
const countryLoads = new Map<string, Promise<boolean>>()
let latestRequestId = 0

function tokens(value: string) {
  return value
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2)
}

function loadCountry(baseUrl: string, country: string) {
  if (programmes.has(country)) return Promise.resolve(true)
  const pending = countryLoads.get(country)
  if (pending) return pending

  const load = (async () => {
    try {
      const response = await fetch(
        `${baseUrl}/api/epg/now?country=${country}&details=1`,
      )
      if (!response.ok) return false

      const data = (await response.json()) as {
        channels: Record<string, Slot[]>
      }
      const indexed: IndexedProgramme[] = []
      for (const [id, slots] of Object.entries(data.channels)) {
        for (const [startAt, stopAt, title, description] of slots) {
          indexed.push({
            id,
            title,
            description,
            startAt,
            stopAt,
            tokens: tokens(`${title} ${description ?? ""}`),
          })
        }
      }
      programmes.set(country, indexed)
      return true
    } catch {
      return false
    } finally {
      countryLoads.delete(country)
    }
  })()

  countryLoads.set(country, load)
  return load
}

function findMatches(countries: string[], query: string) {
  const terms = tokens(query)
  const matches = new Map<string, ProgrammeMatch>()
  const now = Date.now()

  for (const country of countries) {
    for (const programme of programmes.get(country) ?? []) {
      if (
        programme.stopAt <= now ||
        !terms.every((term) =>
          programme.tokens.some((token) => token.startsWith(term)),
        )
      )
        continue
      if (!matches.has(programme.id)) matches.set(programme.id, programme)
    }
  }

  return [...matches.values()].sort((left, right) => {
    const leftIsLive = left.startAt <= now && left.stopAt > now
    const rightIsLive = right.startAt <= now && right.stopAt > now

    // A live match is the most useful answer. Future matches remain useful,
    // but are ordered by how soon the programme begins.
    if (leftIsLive !== rightIsLive) return leftIsLive ? -1 : 1
    return left.startAt - right.startAt
  })
}

function postMatches(id: number, countries: string[], query: string) {
  self.postMessage({ id, matches: findMatches(countries, query) })
}

async function refreshMissingCountries(
  id: number,
  baseUrl: string,
  countries: string[],
  query: string,
) {
  for (const delay of RETRY_DELAYS_MS) {
    const missing = countries.filter((country) => !programmes.has(country))
    if (!missing.length || id !== latestRequestId) return

    await new Promise((resolve) => setTimeout(resolve, delay))
    if (id !== latestRequestId) return

    const loaded = await Promise.all(
      missing.map((country) => loadCountry(baseUrl, country)),
    )
    if (id !== latestRequestId) return
    if (loaded.some(Boolean)) postMatches(id, countries, query)
  }
}

self.onmessage = async (
  event: MessageEvent<{
    id: number
    baseUrl: string
    countries: string[]
    query: string
  }>,
) => {
  const { id, baseUrl, countries, query } = event.data
  latestRequestId = id

  // A cold country returns 202 while Trigger prepares it. Return matches from
  // each country as soon as it is ready instead of making one slow response or
  // cache miss hold the entire search (and its spinner) open.
  let remaining = countries.length
  let publishedMatchCount = -1
  await Promise.all(
    countries.map(async (country) => {
      await loadCountry(baseUrl, country)
      if (id !== latestRequestId) return

      remaining -= 1
      const matches = findMatches(countries, query)
      if (matches.length > 0 && matches.length !== publishedMatchCount) {
        publishedMatchCount = matches.length
        self.postMessage({ id, matches })
      } else if (remaining === 0 && publishedMatchCount === -1) {
        self.postMessage({ id, matches: [] })
      }
    }),
  )
  if (id !== latestRequestId) return

  void refreshMissingCountries(id, baseUrl, countries, query)
}
