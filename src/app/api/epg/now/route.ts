import { NextResponse } from "next/server"

import { selectUserEpgSource } from "@/db/user-epg-sources"
import { getDb } from "@/db/client"
import { EPG_SOURCES } from "@portalhop/shared/epg-sources"
import { fetchEpgWindow, type EpgWindow } from "@/lib/epg-parser"
import { requireUser } from "@/lib/session"

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
const cache = new Map<string, { expires: number; window: EpgWindow }>()

// s-maxage only helps where something in front honours it. Self-hosted with no
// CDN, this is what stops every request re-parsing the file.
async function loadWindow(key: string, url: string) {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.window

  const window = await fetchEpgWindow(url, { hours: WINDOW_HOURS })
  cache.set(key, { expires: Date.now() + CACHE_MS, window })
  return window
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const country = params.get("country")
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

      const window = await loadWindow(`country:${resolved}`, source.url)

      // Identical for every user, so the edge can serve one parse to everyone.
      return NextResponse.json(window, {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600",
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
        return NextResponse.json({ error: "Source not found." }, { status: 404 })
      }

      const window = await loadWindow(`source:${sourceId}`, source.url)

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
    return NextResponse.json({ error: "Could not load guide." }, { status: 502 })
  }
}
