import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { getUserIdByFavoritesToken } from "@/db/favorites-token"
import { HOSTED_EPG_COUNTRY_CODES } from "@portalhop/shared/epg-sources"
import {
  getCachedIptvEpgWindow,
  requestIptvEpgRefresh,
} from "@/lib/iptv-epg-cache"
import { refreshIptvEpgCountryTask } from "@/trigger/refresh-iptv-epg"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const hostedCountries = new Set<string>(HOSTED_EPG_COUNTRY_CODES)

/**
 * XMLTV view of PortalHop's Redis EPG window for M3U clients. Unlike the
 * upstream IPTV-EPG.org file, this is the same current data the website reads
 * and it is intentionally never cached by a CDN or player-facing proxy.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; country: string }> },
) {
  const { token, country: rawCountry } = await context.params
  const country =
    rawCountry.toUpperCase() === "UK" ? "GB" : rawCountry.toUpperCase()

  if (!hostedCountries.has(country)) {
    return new NextResponse(null, { status: 404 })
  }

  const userId = await getUserIdByFavoritesToken(getDb(), token)
  if (!userId) {
    return new NextResponse(null, { status: 404 })
  }

  const window = await getCachedIptvEpgWindow(country, {
    hours: 6,
    includeDescriptions: true,
  })
  if (!window) {
    if (await requestIptvEpgRefresh(country)) {
      void refreshIptvEpgCountryTask.trigger({ country }).catch(() => {})
    }
    return new NextResponse(null, {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "2" },
    })
  }

  return new NextResponse(toXmltv(window.channels), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store, max-age=0, must-revalidate",
    },
  })
}

function toXmltv(
  channels: Record<string, [number, number, string, string?][]>,
) {
  const ids = Object.keys(channels).sort()
  const channelLines = ids.map((id) => `<channel id="${escapeXml(id)}"/>`)
  const programmeLines = ids.flatMap((id) =>
    channels[id]!.map(
      ([start, stop, title, description]) =>
        `<programme start="${xmltvTime(start)}" stop="${xmltvTime(stop)}" channel="${escapeXml(id)}"><title>${escapeXml(title)}</title>${description ? `<desc>${escapeXml(description)}</desc>` : ""}</programme>`,
    ),
  )

  return `<?xml version="1.0" encoding="UTF-8"?><tv generator-info-name="PortalHop">${[...channelLines, ...programmeLines].join("")}</tv>`
}

function xmltvTime(value: number) {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())} +0000`
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      case "'":
        return "&apos;"
      default:
        return character
    }
  })
}
