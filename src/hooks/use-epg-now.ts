"use client"

import { useEffect, useMemo, useState } from "react"

import {
  getCachedEpgWindow,
  setCachedEpgWindow,
} from "@/lib/portal-channels-cache"
import { normalizeXmltvId } from "@/lib/xmltv-id"

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

export function useEpgNow(xmltvIds: string[]) {
  const [windows, setWindows] = useState<Windows>({})
  const [now, setNow] = useState(() => Date.now())

  const countries = useMemo(() => {
    const found = new Set<string>()
    for (const id of xmltvIds) {
      const country = countryOf(normalizeXmltvId(id))
      if (country) found.add(country)
    }
    return [...found].sort()
  }, [xmltvIds])

  const countryKey = countries.join(",")

  useEffect(() => {
    if (!countryKey) return

    let cancelled = false

    for (const country of countryKey.split(",")) {
      const key = `country:${country}`

      void (async () => {
        const cached = await getCachedEpgWindow(key)

        if (cached) {
          if (!cancelled) {
            setWindows((current) => ({ ...current, [country]: cached.channels }))
          }
          return
        }

        try {
          const response = await fetch(`/api/epg/now?country=${country}`)
          if (!response.ok) return

          const data = (await response.json()) as {
            to: number
            channels: Record<string, Slot[]>
          }

          if (cancelled) return
          setWindows((current) => ({ ...current, [country]: data.channels }))
          void setCachedEpgWindow({ key, to: data.to, channels: data.channels })
        } catch {
          // A missing guide just means no strip under the row.
        }
      })()
    }

    return () => {
      cancelled = true
    }
  }, [countryKey])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  return useMemo(() => {
    const byId = new Map<string, NowPlaying>()

    for (const id of xmltvIds) {
      const normalized = normalizeXmltvId(id)
      const country = countryOf(normalized)
      if (!country) continue

      const slot = windows[country]?.[normalized]?.find(
        ([startAt, stopAt]) => startAt <= now && stopAt > now,
      )

      if (slot) {
        byId.set(normalized, { title: slot[2], startAt: slot[0], stopAt: slot[1] })
      }
    }

    return byId
  }, [windows, xmltvIds, now])
}
