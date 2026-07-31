import { NextResponse } from "next/server"

import {
  createFavoriteGroup,
  deleteFavoriteGroup,
  listFavoriteGroups,
} from "@/db/favorite-groups"
import { getDb } from "@/db/client"
import { requireUser } from "@/lib/session"

export const runtime = "nodejs"

const validIcons = new Set([
  "star",
  "trophy",
  "cricket",
  "goal",
  "volleyball",
  "dumbbell",
  "film",
  "clapperboard",
  "popcorn",
  "music",
  "radio",
  "podcast",
  "gamepad",
  "heart",
  "house",
  "globe",
  "news",
  "book",
  "school",
  "tv",
  "sparkles",
])

function readGroup(value: unknown) {
  if (!value || typeof value !== "object") return null

  const input = value as Record<string, unknown>
  const name = typeof input.name === "string" ? input.name.trim() : ""
  const icon = typeof input.icon === "string" ? input.icon : ""

  if (!name || name.length > 60 || !validIcons.has(icon)) return null
  return { name, icon }
}

export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const groups = await listFavoriteGroups(getDb(), user.id)
  return NextResponse.json({ groups })
}

export async function POST(request: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const group = readGroup(await request.json().catch(() => null))
  if (!group) {
    return NextResponse.json({ error: "A name and valid icon are required." }, { status: 400 })
  }

  const created = await createFavoriteGroup(getDb(), user.id, group)
  return NextResponse.json({ group: created }, { status: 201 })
}

export async function DELETE(request: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const groupId = Number(new URL(request.url).searchParams.get("groupId"))
  if (!Number.isInteger(groupId) || groupId <= 0) {
    return NextResponse.json({ error: "A valid groupId is required." }, { status: 400 })
  }

  await deleteFavoriteGroup(getDb(), user.id, groupId)
  return NextResponse.json({ ok: true })
}
