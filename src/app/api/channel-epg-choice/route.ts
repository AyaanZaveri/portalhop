import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import {
  listChannelEpgChoices,
  saveChannelEpgChoice,
} from "@/db/channel-epg-choice"
import { requireUser } from "@/lib/session"

export const runtime = "nodejs"

/**
 * Which stream supplies a channel's guide, where the user has overruled the
 * ranking.
 *
 * The whole map on GET, one channel at a time on PUT — the same shape as
 * channel-source-order, and for the same reason: the unit the interface works
 * in is a channel, and sending every other channel's choice back with it would
 * make two people editing different channels overwrite each other.
 */
export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const choices = await listChannelEpgChoices(getDb(), user.id)
  return NextResponse.json({ choices })
}

export async function PUT(request: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const body = (await request.json().catch(() => null)) as {
    identityKey?: unknown
    savedChannelId?: unknown
  } | null

  const identityKey =
    typeof body?.identityKey === "string" ? body.identityKey.trim() : ""

  // null clears the pin and drops the channel back to the ranking. Distinct
  // from an absent field, which is a malformed body.
  const savedChannelId =
    body?.savedChannelId === null
      ? null
      : Number.isInteger(body?.savedChannelId) &&
          (body?.savedChannelId as number) > 0
        ? (body?.savedChannelId as number)
        : undefined

  // Only an id: key, as the source order requires. A name key is derived from
  // the channel's name and moves the moment a source renames it, which would
  // leave the row pinning a guide for a channel nobody chose.
  if (!identityKey.startsWith("id:") || savedChannelId === undefined) {
    return NextResponse.json(
      {
        error:
          "An identity key and a saved channel id (or null to clear) are required.",
      },
      { status: 400 },
    )
  }

  const written = await saveChannelEpgChoice(
    getDb(),
    user.id,
    identityKey,
    savedChannelId,
  )

  return NextResponse.json({ identityKey, savedChannelId: written })
}
