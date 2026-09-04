"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import {
  getCachedEpgWindow,
  setCachedEpgWindow,
} from "@/lib/portal-channels-cache"
import { HOSTED_EPG_COUNTRY_CODES } from "@portalhop/shared/epg-sources"
import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"
import { apiBaseUrl, apiFetch } from "@/lib/api-fetch"

export type NowPlaying = {
  title: string
  startAt: number
  stopAt: number
}

export type ProgrammeMatch = NowPlaying & {
  description?: string
  /** Calculated in the EPG worker alongside its live-first ranking. */
  isLive: boolean
}

type Slot = [number, number, string, string?]
type Windows = Record<string, Record<string, Slot[]>>

function countryOf(xmltvId: string) {
  const suffix = xmltvId.toLowerCase().match(/\.([a-z]{2})$/)?.[1]
  return suffix ?? null
}

function feedKeyFor(entry: EpgNowChannel) {
  if (entry.epgSourceId) return `source:${entry.epgSourceId}`
  const country = countryOf(normalizeXmltvId(entry.xmltvId))
  return country ? `country:${country}` : null
}

const TICK_MS = 30_000
const EPG_REFRESH_RETRY_MS = 2_000
const EPG_REFRESH_RETRY_ATTEMPTS = 30

// Programme search is intentionally scoped to the regions PortalHop's initial
// audience actually uses. Fetching every guide a large IPTV catalogue happens
// to mention would turn one keystroke into dozens of cache warm-ups.
const DEFAULT_PROGRAMME_SEARCH_COUNTRIES = new Set([
  ...HOSTED_EPG_COUNTRY_CODES.map((country) => country.toLowerCase()),
])

export type EpgNowChannel = {
  xmltvId: string
  /** Set when the channel's source uses the user's own EPG rather than a country file. */
  epgSourceId?: number | null
}

function useEpgWindows(
  entries: EpgNowChannel[],
  {
    active,
    includeDescriptions,
    reportLoading = false,
  }: { active: boolean; includeDescriptions: boolean; reportLoading?: boolean },
) {
  const [windows, setWindows] = useState<Windows>({})
  const [isLoading, setIsLoading] = useState(false)

  const feedKey = useMemo(() => {
    if (!active) return ""
    const found = new Set<string>()
    for (const entry of entries) {
      const key = feedKeyFor(entry)
      if (key) found.add(key)
    }
    return [...found].sort().join("|")
  }, [active, entries])

  useEffect(() => {
    if (!feedKey) return

    let cancelled = false

    void (async () => {
      if (reportLoading) setIsLoading(true)

      await Promise.all(
        feedKey.split("|").map(async (key) => {
          const [kind, value] = key.split(":")
          const query =
            kind === "source" ? `sourceId=${value}` : `country=${value}`
          const cacheKey = `${includeDescriptions ? "details:" : ""}${key}`

          try {
            const cached = await getCachedEpgWindow(cacheKey)

            if (cached) {
              if (!cancelled) {
                setWindows((current) => ({
                  ...current,
                  [cacheKey]: cached.channels,
                }))
              }
              return
            }

            let response: Response | null = null
            for (
              let attempt = 0;
              attempt < EPG_REFRESH_RETRY_ATTEMPTS;
              attempt += 1
            ) {
              response = await apiFetch(
                `/api/epg/now?${query}${includeDescriptions ? "&details=1" : ""}`,
              )
              if (response.status !== 202) break
              await new Promise((resolve) =>
                setTimeout(resolve, EPG_REFRESH_RETRY_MS),
              )
              if (cancelled) return
            }
            if (!response?.ok || response.status === 202) return

            const data = (await response.json()) as {
              to: number
              channels: Record<string, Slot[]>
            }

            if (cancelled) return
            setWindows((current) => ({ ...current, [cacheKey]: data.channels }))
            void setCachedEpgWindow({
              key: cacheKey,
              to: data.to,
              channels: data.channels,
            })
          } catch {
            // A missing guide just means no strip under the row.
          }
        }),
      )

      if (!cancelled && reportLoading) setIsLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [feedKey, includeDescriptions, reportLoading])

  return {
    windows,
    isLoading: reportLoading && active && Boolean(feedKey) && isLoading,
  }
}

export function useEpgNow(entries: EpgNowChannel[]) {
  const { windows } = useEpgWindows(entries, {
    active: true,
    includeDescriptions: false,
  })
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  return useMemo(() => {
    const byId = new Map<string, NowPlaying>()

    for (const entry of entries) {
      const normalized = normalizeXmltvId(entry.xmltvId)
      const key = feedKeyFor(entry)
      if (!key) continue

      const slot = windows[key]?.[normalized]?.find(
        ([startAt, stopAt]) => startAt <= now && stopAt > now,
      )

      if (slot) {
        byId.set(normalized, {
          title: slot[2],
          startAt: slot[0],
          stopAt: slot[1],
        })
      }
    }

    return byId
  }, [windows, entries, now])
}

/** Searches guide data in a worker so a large programme index never blocks typing. */
export function useEpgProgrammeSearch(
  entries: EpgNowChannel[],
  query: string,
  enabled: boolean,
) {
  const normalizedQuery = query.trim().toLowerCase()
  const [matches, setMatches] = useState<Map<string, ProgrammeMatch>>(
    () => new Map(),
  )
  const [isLoading, setIsLoading] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)

  const countries = useMemo(() => {
    const result = new Set<string>()
    for (const entry of entries) {
      const suffix = countryOf(normalizeXmltvId(entry.xmltvId))
      // XMLTV ids conventionally use .uk, while the source/cache use GB as
      // the country code.
      const country = suffix === "uk" ? "gb" : suffix
      if (country && DEFAULT_PROGRAMME_SEARCH_COUNTRIES.has(country)) {
        result.add(country)
      }
    }
    return [...result].sort()
  }, [entries])
  const countriesKey = countries.join("|")

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/epg-programme-search.worker.ts", import.meta.url),
    )
    workerRef.current = worker
    worker.onmessage = (
      event: MessageEvent<{
        id: number
        matches: Array<ProgrammeMatch & { id: string }>
        pending?: boolean
      }>,
    ) => {
      if (event.data.id !== requestIdRef.current) return
      setMatches(
        new Map(event.data.matches.map(({ id, ...match }) => [id, match])),
      )
      setIsLoading(
        Boolean(event.data.pending && event.data.matches.length === 0),
      )
    }
    worker.onerror = () => setIsLoading(false)
    return () => worker.terminate()
  }, [])

  useEffect(() => {
    const worker = workerRef.current
    const id = requestIdRef.current + 1
    requestIdRef.current = id
    if (
      !worker ||
      !enabled ||
      normalizedQuery.length < 2 ||
      !countries.length
    ) {
      setMatches(new Map())
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    worker.postMessage({
      id,
      baseUrl: apiBaseUrl,
      countries,
      query: normalizedQuery,
    })
  }, [countries, countriesKey, enabled, normalizedQuery])

  return { matches, isLoading }
}
