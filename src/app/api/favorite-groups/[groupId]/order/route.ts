import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { setFavoriteGroupChannelOrder } from "@/db/favorite-groups"
import { requireUser } from "@/lib/session"

export const runtime = "nodejs"

function readChannelKeys(value: unknown) {
  if (!value || typeof value !== "object") return null
  const keys = (value as Record<string, unknown>).channelKeys
  if (!Array.isArray(keys)) return null
  return keys.every((key) => typeof key === "string") ? (keys as string[]) : null
}

/** Persists one group's channel order, given the full sequence. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const { groupId } = await context.params
  const id = Number(groupId)

  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid group." }, { status: 400 })
  }

  const channelKeys = readChannelKeys(await request.json().catch(() => null))

  if (!channelKeys) {
    return NextResponse.json(
      { error: "channelKeys must be an array of strings." },
      { status: 400 },
    )
  }

  const updated = await setFavoriteGroupChannelOrder(
    getDb(),
    user.id,
    id,
    channelKeys,
  )

  if (!updated) {
    return NextResponse.json({ error: "Group not found." }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
