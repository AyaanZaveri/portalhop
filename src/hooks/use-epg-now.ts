"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"

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

function searchTokens(value: string) {
  return value
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2)
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

/**
 * Searches the cached six-hour window through an inverted token index.
 *
 * Building the index is O(events × terms) only when the guide window changes.
 * Each token is additionally indexed by its first three characters, so typing
 * does not scan every term in the guide on every keypress.
 */
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
  // A detailed guide response can be large. Let an in-progress keystroke win
  // over rebuilding its local index when it arrives.
  const deferredWindows = useDeferredValue(windows)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const index = useMemo(() => {
    const prefixes = new Map<string, Set<string>>()
    const entriesByKey = new Map<string, EpgNowChannel>()

    for (const entry of entries) {
      const feedKey = feedKeyFor(entry)
      const channelId = normalizeXmltvId(entry.xmltvId)
      if (!feedKey || !channelId) continue
      const key = `${feedKey}|${channelId}`
      entriesByKey.set(key, entry)

      for (const slot of deferredWindows[`details:${feedKey}`]?.[channelId] ?? []) {
        for (const token of new Set(searchTokens(`${slot[2]} ${slot[3] ?? ""}`))) {
          const prefix = token.slice(0, Math.min(3, token.length))
          const ids = prefixes.get(prefix) ?? new Set<string>()
          ids.add(key)
          prefixes.set(prefix, ids)
        }
      }
    }

    return { prefixes, entriesByKey }
  }, [deferredWindows, entries])

  return useMemo(() => {
    const byId = new Map<string, ProgrammeMatch>()
    const tokens = searchTokens(normalizedQuery)
    if (!enabled || tokens.length === 0) return byId

    // Prefix lookup preserves the natural "blue j" typing path without a full
    // fuzzy engine. Pick the smallest list first, then intersect it with the
    // others; a keypress never needs to scan every term in the guide.
    const lists = tokens.map((token) => {
      const prefix = token.slice(0, Math.min(3, token.length))
      return index.prefixes.get(prefix) ?? new Set<string>()
    }).sort((a, b) => a.size - b.size)
    if (!lists.length || lists[0].size === 0) return byId

    const candidates = [...lists[0]].filter((id) => lists.slice(1).every((list) => list.has(id)))
    for (const candidate of candidates) {
      const entry = index.entriesByKey.get(candidate)
      if (!entry) continue
      const feedKey = feedKeyFor(entry)
      const channelId = normalizeXmltvId(entry.xmltvId)
      if (!feedKey || !channelId) continue
      const slot = deferredWindows[`details:${feedKey}`]?.[channelId]?.find(
        ([, stopAt, title, description]) => stopAt > now &&
          tokens.every((token) => searchTokens(`${title} ${description ?? ""}`).some((word) => word.startsWith(token))),
      )
      if (!slot) continue
      byId.set(channelId, { title: slot[2], description: slot[3], startAt: slot[0], stopAt: slot[1] })
    }
    return byId
  }, [deferredWindows, enabled, index, normalizedQuery, now])
}
