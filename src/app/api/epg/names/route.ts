import { NextResponse } from "next/server"

import { getEpgChannels } from "@/lib/epg-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Guide names for a specific set of channels.
 *
 * The sibling route already exposes the whole directory, and deliberately does
 * not send it: at 5.8MB it is most of a page load, and a client showing a few
 * thousand rows has no use for the other twenty-odd thousand entries. So this
 * takes the ids the catalogue actually contains and answers only those.
 *
 * POST rather than GET because the id list is the request. A catalogue with
 * several portals loaded runs to thousands of ids, which is past what a query
 * string can carry.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ids?: unknown }
    const ids = Array.isArray(body.ids) ? body.ids : []
    if (!ids.length) return NextResponse.json({ names: {} })

    const directory = await getEpgChannels()
    const names: Record<string, { name: string; logoUrl?: string }> = {}

    for (const raw of ids) {
      if (typeof raw !== "string") continue
      const id = raw.trim().toLowerCase()
      const entry = directory[id]
      if (entry) names[id] = { name: entry.name, logoUrl: entry.logoUrl }
    }

    return NextResponse.json({ names })
  } catch {
    // A missing name is a cosmetic loss: the row falls back to the portal's
    // own name, which is what it showed before this route existed.
    return NextResponse.json({ names: {} })
  }
}
