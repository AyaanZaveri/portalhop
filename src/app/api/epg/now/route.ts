import { NextResponse } from "next/server"

import { selectUserEpgSource } from "@/db/user-epg-sources"
import { getDb } from "@/db/client"
import { EPG_SOURCES } from "@portalhop/shared/epg-sources"
import { fetchEpgWindow, type EpgWindow } from "@/lib/epg-parser"
import {
  getCachedIptvEpgWindow,
  markIptvEpgCountryActive,
  requestIptvEpgRefresh,
} from "@/lib/iptv-epg-cache"
import { requireUser } from "@/lib/session"
import { refreshIptvEpgCountryTask } from "@/trigger/refresh-iptv-epg"

export const runtime = "nodejs"
// Without this the handler is treated as static and replays one response for
// every query string.
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Long enough that the window is always hours ahead of the clock reading it.
const WINDOW_HOURS = 6

// Guide ids do not always use the source's own code: thousands of channels end
// in .uk while the file is published as GB.
const COUNTRY_ALIASES: Record<string, string> = { uk: "gb" }

const CACHE_MS = 60 * 60 * 1000
const customSourceCache = new Map<
  string,
  { expires: number; window: EpgWindow }
>()

// Custom EPG URLs belong to one user and are not eligible for the shared
// country cache. Built-in country guides intentionally do not use this path:
// Trigger.dev prepares those in Redis before the API serves them.
async function loadCustomWindow(
  key: string,
  url: string,
  includeDescriptions: boolean,
) {
  const hit = customSourceCache.get(key)
  if (hit && hit.expires > Date.now()) return hit.window

  const window = await fetchEpgWindow(url, {
    hours: WINDOW_HOURS,
    includeDescriptions,
  })
  customSourceCache.set(key, { expires: Date.now() + CACHE_MS, window })
  return window
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const country = params.get("country")
  const includeDescriptions = params.get("details") === "1"
  // Read before parsing: Number(null) is 0, which would look like a valid id.
  const sourceIdParam = params.get("sourceId")

  try {
    if (country) {
      const code = country.toLowerCase()
      const resolved = COUNTRY_ALIASES[code] ?? code
      const source = EPG_SOURCES.find(
        (entry) => entry.code.toLowerCase() === resolved,
      )

      if (!source) {
        return NextResponse.json({ error: "Unknown country." }, { status: 404 })
      }

      await markIptvEpgCountryActive(resolved)
      const cachedWindow = await getCachedIptvEpgWindow(resolved, {
        includeDescriptions,
      })
      if (!cachedWindow) {
        // XMLTV parsing is Trigger.dev's job. A user search must never make a
        // Vercel Function download or parse a country guide on a cache miss.
        if (await requestIptvEpgRefresh(resolved)) {
          void refreshIptvEpgCountryTask
            .trigger({ country: resolved })
            .catch(() => {})
        }
        return NextResponse.json(
          { status: "refreshing" },
          {
            status: 202,
            headers: { "Cache-Control": "no-store", "Retry-After": "2" },
          },
        )
      }

      // Identical for every user, so the edge can serve one parse to everyone.
      return NextResponse.json(cachedWindow, {
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=21600",
        },
      })
    }

    if (sourceIdParam !== null) {
      const sourceId = Number(sourceIdParam)

      if (!Number.isInteger(sourceId)) {
        return NextResponse.json({ error: "Invalid source." }, { status: 400 })
      }

      const user = await requireUser()
      if (user instanceof NextResponse) return user

      const source = await selectUserEpgSource(getDb(), sourceId)

      if (!source || source.userId !== user.id) {
        return NextResponse.json(
          { error: "Source not found." },
          { status: 404 },
        )
      }

      const window = await loadCustomWindow(
        `source:${sourceId}${includeDescriptions ? ":details" : ""}`,
        source.url,
        includeDescriptions,
      )

      // A user's own source: never shared at the edge, browser only.
      return NextResponse.json(window, {
        headers: { "Cache-Control": "private, max-age=1800" },
      })
    }

    return NextResponse.json(
      { error: "Pass country or sourceId." },
      { status: 400 },
    )
  } catch {
    return NextResponse.json(
      { error: "Could not load guide." },
      { status: 502 },
    )
  }
}
