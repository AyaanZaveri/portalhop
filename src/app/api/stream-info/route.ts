import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { listStreamInfo, recordStreamInfo } from "@/db/stream-info"
import { requireUser } from "@/lib/session"

export const runtime = "nodejs"

/**
 * What the user's streams turned out to be.
 *
 * The whole map on GET, because the sources drawer compares every stream of a
 * channel at once and the table is sparse — a row only where something has
 * actually been watched. One stream at a time on PUT, because that is how it is
 * learned: a player opens one stream and reports what arrived.
 */
export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const info = await listStreamInfo(getDb(), user.id)
  return NextResponse.json({ info })
}

/** A positive integer, or null for a figure the stream did not state. */
function readNumber(value: unknown, { integer = true } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return integer ? Math.round(value) : value
}

export async function PUT(request: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const body = (await request.json().catch(() => null)) as {
    savedChannelId?: unknown
    width?: unknown
    height?: unknown
    frameRate?: unknown
    bandwidth?: unknown
  } | null

  const savedChannelId = readNumber(body?.savedChannelId)
  if (!savedChannelId) {
    return NextResponse.json(
      { error: "A saved channel id is required." },
      { status: 400 },
    )
  }

  const info = {
    width: readNumber(body?.width),
    height: readNumber(body?.height),
    // Not rounded: 59.94 is not 60, and that difference is a broadcast feed
    // against a re-encode.
    frameRate: readNumber(body?.frameRate, { integer: false }),
    bandwidth: readNumber(body?.bandwidth),
  }

  // Nothing worth storing. A stream that states none of this would otherwise
  // get a row saying only that somebody watched it, which the drawer would
  // then have to tell apart from a row that means something.
  if (!info.width && !info.height && !info.frameRate && !info.bandwidth) {
    return NextResponse.json({ ok: true, stored: false })
  }

  const stored = await recordStreamInfo(getDb(), user.id, savedChannelId, info)
  if (!stored) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 })
  }

  return NextResponse.json({ ok: true, stored: true })
}
