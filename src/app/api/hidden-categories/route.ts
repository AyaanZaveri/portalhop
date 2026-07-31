import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import {
  hideCategoryGroup,
  listHiddenCategoryGroups,
  showCategoryGroup,
} from "@/db/hidden-category-groups"
import { requireUser } from "@/lib/session"

export const runtime = "nodejs"

function readGroup(value: unknown) {
  if (!value || typeof value !== "object") return null
  const input = value as Record<string, unknown>
  const sourceId = Number(input.sourceId)
  const category = typeof input.category === "string" ? input.category.trim() : ""
  return Number.isInteger(sourceId) && category ? { sourceId, category } : null
}

export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const hiddenCategories = await listHiddenCategoryGroups(getDb(), user.id)
  return NextResponse.json({ hiddenCategories })
}

export async function POST(request: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const group = readGroup(await request.json().catch(() => null))
  if (!group) return NextResponse.json({ error: "Invalid category group." }, { status: 400 })

  await hideCategoryGroup(getDb(), user.id, group)
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(request: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const group = readGroup(await request.json().catch(() => null))
  if (!group) return NextResponse.json({ error: "Invalid category group." }, { status: 400 })

  await showCategoryGroup(getDb(), user.id, group)
  return NextResponse.json({ ok: true })
}
