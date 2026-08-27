"use client"

import { useEffect, useMemo, useState } from "react"

import {
  getCachedEpgWindow,
  setCachedEpgWindow,
} from "@/lib/portal-channels-cache"
import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"
import { apiFetch } from "@/lib/api-fetch"

export type NowPlaying = {
  title: string
  startAt: number
  stopAt: number
}

export type ProgrammeMatch = NowPlaying & { description?: string }

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

export type EpgNowChannel = {
  xmltvId: string
  /** Set when the channel's source uses the user's own EPG rather than a country file. */
  epgSourceId?: number | null
}

function useEpgWindows(
  entries: EpgNowChannel[],
  { active, includeDescriptions }: { active: boolean; includeDescriptions: boolean },
) {
  const [windows, setWindows] = useState<Windows>({})

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

    for (const key of feedKey.split("|")) {
      const [kind, value] = key.split(":")
      const query = kind === "source" ? `sourceId=${value}` : `country=${value}`
      const cacheKey = `${includeDescriptions ? "details:" : ""}${key}`

      void (async () => {
        const cached = await getCachedEpgWindow(cacheKey)

        if (cached) {
          if (!cancelled) {
            setWindows((current) => ({ ...current, [cacheKey]: cached.channels }))
          }
          return
        }

        try {
          const response = await apiFetch(
            `/api/epg/now?${query}${includeDescriptions ? "&details=1" : ""}`,
          )
          if (!response.ok) return

          const data = (await response.json()) as {
            to: number
            channels: Record<string, Slot[]>
          }

          if (cancelled) return
          setWindows((current) => ({ ...current, [cacheKey]: data.channels }))
          void setCachedEpgWindow({ key: cacheKey, to: data.to, channels: data.channels })
        } catch {
          // A missing guide just means no strip under the row.
        }
      })()
    }

    return () => {
      cancelled = true
    }
  }, [feedKey, includeDescriptions])

  return windows
}

export function useEpgNow(entries: EpgNowChannel[]) {
  const windows = useEpgWindows(entries, {
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
        byId.set(normalized, { title: slot[2], startAt: slot[0], stopAt: slot[1] })
      }
    }

    return byId
  }, [windows, entries, now])
}

/** Searches only the programme airing now after the user opts in. */
export function useEpgProgrammeSearch(
  entries: EpgNowChannel[],
  query: string,
  enabled: boolean,
) {
  const normalizedQuery = query.trim().toLowerCase()
  const [now, setNow] = useState(() => Date.now())
  const windows = useEpgWindows(entries, {
    active: enabled && normalizedQuery.length >= 2,
    includeDescriptions: true,
  })

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  return useMemo(() => {
    const byId = new Map<string, ProgrammeMatch>()
    if (!enabled || normalizedQuery.length < 2) return byId

    for (const entry of entries) {
      const normalized = normalizeXmltvId(entry.xmltvId)
      const key = feedKeyFor(entry)
      if (!key) continue

      const slot = windows[`details:${key}`]?.[normalized]?.find(
        ([startAt, stopAt, title, description]) =>
          startAt <= now &&
          stopAt > now &&
          `${title} ${description ?? ""}`.toLowerCase().includes(normalizedQuery),
      )
      if (slot) {
        byId.set(normalized, {
          title: slot[2],
          description: slot[3],
          startAt: slot[0],
          stopAt: slot[1],
        })
      }
    }

    return byId
  }, [enabled, entries, normalizedQuery, now, windows])
}
