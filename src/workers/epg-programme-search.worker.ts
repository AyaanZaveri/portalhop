type Slot = [number, number, string, string?]
type ProgrammeMatch = {
  id: string
  title: string
  description?: string
  startAt: number
  stopAt: number
}

type IndexedProgramme = ProgrammeMatch & { tokens: string[] }

const RETRY_MS = 2_000
const RETRIES = 30
const programmes = new Map<string, IndexedProgramme[]>()

function tokens(value: string) {
  return value
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2)
}

async function loadCountry(baseUrl: string, country: string) {
  if (programmes.has(country)) return

  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    const response = await fetch(
      `${baseUrl}/api/epg/now?country=${country}&details=1`,
    )
    if (response.status === 202) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
      continue
    }
    if (!response.ok) return

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
    return
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
  try {
    await Promise.all(countries.map((country) => loadCountry(baseUrl, country)))
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
    self.postMessage({ id, matches: [...matches.values()] })
  } catch {
    self.postMessage({ id, matches: [] })
  }
}
