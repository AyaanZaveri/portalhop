import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import {
  listChannelSourceOrder,
  saveChannelSourceOrder,
} from "@/db/channel-source-order"
import { requireUser } from "@/lib/session"

export const runtime = "nodejs"

/**
 * Which stream plays when this user opens a channel.
 *
 * The whole map on GET, one channel at a time on PUT — the unit the interface
 * works in is a channel, and sending every other channel's order back with it
 * would make two people editing different channels overwrite each other.
 */
export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const order = await listChannelSourceOrder(getDb(), user.id)
  return NextResponse.json({ order })
}

export async function PUT(request: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const body = (await request.json().catch(() => null)) as {
    identityKey?: unknown
    savedChannelIds?: unknown
  } | null

  const identityKey =
    typeof body?.identityKey === "string" ? body.identityKey.trim() : ""
  const savedChannelIds = Array.isArray(body?.savedChannelIds)
    ? body.savedChannelIds.filter(
        (id): id is number => Number.isInteger(id) && (id as number) > 0,
      )
    : null

  // Only an id: key. A name key is derived from the channel's name and moves
  // the moment a portal renames it, which would leave the row pointing at a
  // channel nobody chose. identityKeyFor already refuses to produce one; this
  // is the same rule where it can be enforced.
  if (!identityKey.startsWith("id:") || !savedChannelIds) {
    return NextResponse.json(
      { error: "An identity key and a list of saved channel ids are required." },
      { status: 400 },
    )
  }

  const savedChannelIdsWritten = await saveChannelSourceOrder(
    getDb(),
    user.id,
    identityKey,
    savedChannelIds,
  )

  return NextResponse.json({ identityKey, savedChannelIds: savedChannelIdsWritten })
}
