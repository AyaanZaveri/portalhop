import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { addFavorites, listFavorites, removeFavorite } from "@/db/favorites"
import { requireUser } from "@/lib/session"

export const runtime = "nodejs"

export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) {
    return user
  }

  const channelKeys = await listFavorites(getDb(), user.id)

  return NextResponse.json({ favorites: channelKeys })
}

export async function POST(request: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) {
    return user
  }

  const body = await request.json().catch(() => null)

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  // Accepts a single { channelKey } or a bulk { channelKeys } (used to migrate
  // a device's local favorites into the account on first sign-in).
  const channelKeys = Array.isArray((body as Record<string, unknown>).channelKeys)
    ? ((body as Record<string, unknown>).channelKeys as unknown[]).map(String)
    : typeof (body as Record<string, unknown>).channelKey === "string"
      ? [(body as Record<string, string>).channelKey]
      : []

  if (!channelKeys.length) {
    return NextResponse.json(
      { error: "channelKey or channelKeys is required." },
      { status: 400 }
    )
  }

  await addFavorites(getDb(), user.id, channelKeys)

  const favorites = await listFavorites(getDb(), user.id)
  return NextResponse.json({ favorites }, { status: 201 })
}

export async function DELETE(request: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) {
    return user
  }

  const channelKey =
    new URL(request.url).searchParams.get("channelKey")?.trim() || ""

  if (!channelKey) {
    return NextResponse.json(
      { error: "channelKey is required." },
      { status: 400 }
    )
  }

  await removeFavorite(getDb(), user.id, channelKey)

  return NextResponse.json({ ok: true })
}
