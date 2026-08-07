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

type Slot = [number, number, string]
type Windows = Record<string, Record<string, Slot[]>>

// Guide ids carry their country: "tsn1.ca". That suffix is the EPG file to ask
// for, so no extra lookup is needed to know where a channel's schedule lives.
function countryOf(xmltvId: string) {
  const suffix = xmltvId.toLowerCase().match(/\.([a-z]{2})$/)?.[1]
  return suffix ?? null
}

// Re-render on a slow tick so the progress bar advances without a request.
const TICK_MS = 30_000

export type EpgNowChannel = {
  xmltvId: string
  /** Set when the channel's source uses the user's own EPG rather than a country file. */
  epgSourceId?: number | null
}

export function useEpgNow(entries: EpgNowChannel[]) {
  const [windows, setWindows] = useState<Windows>({})
  const [now, setNow] = useState(() => Date.now())

  // "country:ca" or "source:7" — one key per file to fetch and cache.
  const feedKey = useMemo(() => {
    const found = new Set<string>()
    for (const entry of entries) {
      if (entry.epgSourceId) {
        found.add(`source:${entry.epgSourceId}`)
        continue
      }
      const country = countryOf(normalizeXmltvId(entry.xmltvId))
      if (country) found.add(`country:${country}`)
    }
    return [...found].sort().join("|")
  }, [entries])

  useEffect(() => {
    if (!feedKey) return

    let cancelled = false

    for (const key of feedKey.split("|")) {
      const [kind, value] = key.split(":")
      const query =
        kind === "source" ? `sourceId=${value}` : `country=${value}`

      void (async () => {
        const cached = await getCachedEpgWindow(key)

        if (cached) {
          if (!cancelled) {
            setWindows((current) => ({ ...current, [key]: cached.channels }))
          }
          return
        }

        try {
          const response = await apiFetch(`/api/epg/now?${query}`)
          if (!response.ok) return

          const data = (await response.json()) as {
            to: number
            channels: Record<string, Slot[]>
          }

          if (cancelled) return
          setWindows((current) => ({ ...current, [key]: data.channels }))
          void setCachedEpgWindow({ key, to: data.to, channels: data.channels })
        } catch {
          // A missing guide just means no strip under the row.
        }
      })()
    }

    return () => {
      cancelled = true
    }
  }, [feedKey])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  return useMemo(() => {
    const byId = new Map<string, NowPlaying>()

    for (const entry of entries) {
      const normalized = normalizeXmltvId(entry.xmltvId)
      const key = entry.epgSourceId
        ? `source:${entry.epgSourceId}`
        : `country:${countryOf(normalized) ?? ""}`
      if (key === "country:") continue

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
