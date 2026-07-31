import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { setFavoriteGroupChannel } from "@/db/favorite-groups"
import { addFavorites } from "@/db/favorites"
import { requireUser } from "@/lib/session"

export const runtime = "nodejs"

function readChannelKey(value: unknown) {
  if (!value || typeof value !== "object") return ""
  const channelKey = (value as Record<string, unknown>).channelKey
  return typeof channelKey === "string" ? channelKey.trim() : ""
}

async function updateMembership(request: Request, included: boolean) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const groupId = Number(new URL(request.url).pathname.split("/").at(-2))
  const channelKey = readChannelKey(await request.json().catch(() => null))
  if (!Number.isInteger(groupId) || groupId <= 0 || !channelKey) {
    return NextResponse.json({ error: "A valid group and channel are required." }, { status: 400 })
  }

  const updated = await setFavoriteGroupChannel(
    getDb(),
    user.id,
    groupId,
    channelKey,
    included,
  )
  if (!updated) return NextResponse.json({ error: "Group not found." }, { status: 404 })

  if (included) await addFavorites(getDb(), user.id, [channelKey])
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  return updateMembership(request, true)
}

export async function DELETE(request: Request) {
  return updateMembership(request, false)
}
