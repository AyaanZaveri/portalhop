import { NextResponse } from "next/server"
import { createHash } from "node:crypto"

import { fetchAndParseEpgProgrammes } from "@/lib/epg-parser"
import { findEpgSourceForChannel } from "@/lib/epg-store"
import {
  selectUserEpgSource,
  selectUserEpgSources,
} from "@/db/user-epg-sources"
import { findCustomEpgChannel } from "@/lib/user-epg-store"
import { getDb } from "@/db/client"
import { requireUser } from "@/lib/session"
import {
  getCachedChannelEpgPage,
  setCachedChannelEpgPage,
  type CachedChannelEpgPage,
} from "@/lib/iptv-epg-cache"
import {
  fetchPortalEpg,
  getEndpointCandidates,
  normalizePortalRequest,
} from "@/lib/stalker-client"
import type { SourceType } from "@portalhop/shared/source-types"
import type {
  EpgProgramme,
  PortalRequest,
} from "@portalhop/shared/stalker-types"

type EpgRequest = PortalRequest & {
  sourceType?: SourceType
  epgMode?: "none" | "portal" | "iptv-org" | "custom" | "auto"
  epgSourceId?: number | null
  epgProviderOrder?: string[]
  endpoint?: string
  channelId?: string
  channelName?: string
  xmltvId?: string
  /** ISO timestamp cursor: only programmes starting after this are returned. */
  from?: string
}

const PAGE_SIZE = 20
// Wide enough to skip over multi-day gaps some EPG sources have, without
// paging forever looking for the next available programme.
const LOOKAHEAD_MS = 30 * 24 * 60 * 60 * 1000
// Stalker's get_epg_info takes a `period` in days rather than a cursor, so
// paging further just means asking for a longer period and filtering out
// what was already shown.
const PORTAL_MAX_PERIOD_DAYS = 60
const CHANNEL_PAGE_BUCKET_MS = 5 * 60 * 1000

function channelPageKey(provider: string, channelId: string, from: Date) {
  // The initial request uses "now - 30 minutes", which changes every reload.
  // Bucket it so repeat opens share a Redis page; client-side id de-duplication
  // makes the same safe for a page cursor that lands in the same bucket.
  const bucket = Math.floor(from.getTime() / CHANNEL_PAGE_BUCKET_MS)
  return createHash("sha256")
    .update(`${provider}\u0000${channelId}\u0000${bucket}`)
    .digest("hex")
}

async function cachedChannelPage(
  provider: string,
  channelId: string,
  from: Date,
  load: () => Promise<CachedChannelEpgPage>,
) {
  const key = channelPageKey(provider, channelId, from)
  const cached = await getCachedChannelEpgPage(key)
  if (cached) return cached

  const page = await load()
  void setCachedChannelEpgPage(key, page)
  return page
}

async function xmltvChannelPage(
  provider: string,
  url: string,
  channelId: string,
  from: Date,
  to: Date,
) {
  return cachedChannelPage(provider, channelId, from, async () => {
    const programmes = await fetchAndParseEpgProgrammes(url, [channelId], {
      from,
      to,
      limit: PAGE_SIZE,
    })
    return {
      programmes: programmes.map((programme): EpgProgramme => ({
        ...programme,
        source: "epg",
      })),
      hasMore: programmes.length >= PAGE_SIZE,
    }
  })
}

export const runtime = "nodejs"

export async function POST(request: Request) {
  let body: EpgRequest

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const epgMode =
    body.epgMode === "none" ||
    body.epgMode === "iptv-org" ||
    body.epgMode === "custom"
      ? body.epgMode
      : "portal"
  const channelId = body.channelId?.trim() || ""
  const channelName = body.channelName?.trim() || ""
  const xmltvId = body.xmltvId?.trim() || ""

  if (!channelId && !channelName && !xmltvId) {
    return NextResponse.json(
      { error: "A channel id, XMLTV id, or channel name is required." },
      { status: 400 },
    )
  }

  if (epgMode === "none") return NextResponse.json({ programmes: [] })

  const from = body.from
    ? new Date(body.from)
    : new Date(Date.now() - 30 * 60 * 1000)
  const to = new Date(from.getTime() + LOOKAHEAD_MS)

  if (body.epgMode === "auto") {
    const user = await requireUser()
    if (user instanceof NextResponse) return user
    const orderedProviders = Array.isArray(body.epgProviderOrder)
      ? body.epgProviderOrder.filter(
          (id): id is string => id === "iptv-org" || /^custom:\d+$/.test(id),
        )
      : ["iptv-org"]
    // Newly added feeds join at the bottom until the user drags them. Keeping
    // this completion server-side means they work immediately on every device;
    // no settings visit is required to make a new provider eligible.
    const providers = [
      ...new Set([
        ...orderedProviders,
        ...(await selectUserEpgSources(getDb(), user.id)).map(
          (source) => `custom:${source.id}`,
        ),
      ]),
    ]

    // Ask providers in the user's order. A provider is eligible only when it
    // actually contains this exact XMLTV id; it is not enough that a portal
    // happens to be configured to use it.
    for (const provider of providers) {
      if (provider === "iptv-org") {
        const match = await findEpgSourceForChannel([{ id: xmltvId }])
        if (!match) continue
        return NextResponse.json(
          await xmltvChannelPage(
            `iptv-org:${match.source.code}`,
            match.source.url,
            match.channelId,
            from,
            to,
          ),
        )
      }

      const sourceId = Number(provider.slice("custom:".length))
      const source = await selectUserEpgSource(getDb(), sourceId)
      if (!source || source.userId !== user.id) continue
      const matchedChannelId = await findCustomEpgChannel(sourceId, [
        { id: xmltvId },
      ])
      if (!matchedChannelId) continue
      return NextResponse.json(
        await xmltvChannelPage(
          `custom:${sourceId}`,
          source.url,
          matchedChannelId,
          from,
          to,
        ),
      )
    }

    // Ranked XMLTV feeds exhausted: continue into the native portal fallback.
    body = { ...body, epgMode: "portal" }
  }

  if (epgMode === "iptv-org") {
    const match = await findEpgSourceForChannel([
      { id: xmltvId },
      { id: channelId },
      { name: channelName },
    ])

    if (!match) {
      return NextResponse.json({ programmes: [], hasMore: false })
    }

    return NextResponse.json(
      await xmltvChannelPage(
        `iptv-org:${match.source.code}`,
        match.source.url,
        match.channelId,
        from,
        to,
      ),
    )
  }

  if (epgMode === "custom") {
    const user = await requireUser()
    if (user instanceof NextResponse) return user
    const sourceId = Number(body.epgSourceId)
    if (!Number.isInteger(sourceId))
      return NextResponse.json({ programmes: [], hasMore: false })
    const source = await selectUserEpgSource(getDb(), sourceId)
    if (!source || source.userId !== user.id)
      return NextResponse.json({ programmes: [], hasMore: false })
    const matchedChannelId = await findCustomEpgChannel(sourceId, [
      { id: xmltvId },
      { id: channelId },
      { name: channelName },
    ])
    if (!matchedChannelId)
      return NextResponse.json({ programmes: [], hasMore: false })
    return NextResponse.json(
      await xmltvChannelPage(
        `custom:${sourceId}`,
        source.url,
        matchedChannelId,
        from,
        to,
      ),
    )
  }

  if (body.sourceType === "xtream" || body.sourceType === "m3u") {
    return NextResponse.json({ programmes: [], hasMore: false })
  }

  const portalUrl = body.portalUrl?.trim()
  const options = normalizePortalRequest(body)

  if (!portalUrl || !options.mac || !channelId) {
    return NextResponse.json(
      { error: "Portal URL, MAC address, and channel id are required." },
      { status: 400 },
    )
  }

  const endpoints = [
    ...(body.endpoint ? [body.endpoint] : []),
    ...getEndpointCandidates(portalUrl),
  ].filter(
    (endpoint, index, list) => endpoint && list.indexOf(endpoint) === index,
  )

  // Portal-native EPG has no cursor of its own; `period` is a day count from
  // "now", so paging further out just means asking for a longer period and
  // filtering out whatever the cursor already covers.
  const daysAhead = Math.min(
    PORTAL_MAX_PERIOD_DAYS,
    Math.max(
      6,
      Math.ceil((from.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) + 14,
    ),
  )

  const errors: string[] = []

  for (const endpoint of endpoints) {
    try {
      const page = await cachedChannelPage(
        `portal:${portalUrl}`,
        channelId,
        from,
        async () => {
          const allProgrammes = await fetchPortalEpg(
            endpoint,
            options,
            channelId,
            daysAhead,
          )
          const fromTime = from.getTime()
          const programmes = allProgrammes
            .filter(
              (programme) => new Date(programme.startAt).getTime() >= fromTime,
            )
            .sort(
              (a, b) =>
                new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
            )
            .slice(0, PAGE_SIZE)

          return {
            programmes,
            hasMore:
              programmes.length >= PAGE_SIZE ||
              daysAhead < PORTAL_MAX_PERIOD_DAYS,
          }
        },
      )

      return NextResponse.json(page)
    } catch (error) {
      errors.push(
        `${endpoint}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return NextResponse.json(
    {
      error: "Could not load EPG data from the portal.",
      details: errors,
    },
    { status: 502 },
  )
}
