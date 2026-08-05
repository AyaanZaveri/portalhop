import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { setFavoriteOrder } from "@/db/favorites"
import { requireUser } from "@/lib/session"

export const runtime = "nodejs"

function readChannelKeys(value: unknown) {
  if (!value || typeof value !== "object") return null
  const keys = (value as Record<string, unknown>).channelKeys
  if (!Array.isArray(keys)) return null
  return keys.every((key) => typeof key === "string") ? (keys as string[]) : null
}

/** Persists the user's favourite order, given the full sequence. */
export async function PATCH(request: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const channelKeys = readChannelKeys(await request.json().catch(() => null))

  if (!channelKeys) {
    return NextResponse.json(
      { error: "channelKeys must be an array of strings." },
      { status: 400 },
    )
  }

  await setFavoriteOrder(getDb(), user.id, channelKeys)

  return NextResponse.json({ ok: true })
}
