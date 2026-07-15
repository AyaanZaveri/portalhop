import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { userEpgSources } from "@/db/schema"
import { selectUserEpgSources } from "@/db/user-epg-sources"
import { refreshUserEpgSource } from "@/lib/user-epg-store"
import { requireUser } from "@/lib/session"

export const runtime = "nodejs"

export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  return NextResponse.json({ sources: await selectUserEpgSources(getDb(), user.id) })
}

export async function POST(request: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const url = typeof body?.url === "string" ? body.url.trim() : ""
  if (!name || !isHttpUrl(url)) return NextResponse.json({ error: "A name and valid HTTP(S) XMLTV URL are required." }, { status: 400 })
  const now = new Date()
  const [source] = await getDb().insert(userEpgSources).values({ userId: user.id, name, url, createdAt: now, updatedAt: now }).returning()
  try {
    const refreshed = await refreshUserEpgSource(source.id)
    return NextResponse.json({ source: { ...source, ...refreshed } }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ source, refreshError: error instanceof Error ? error.message : "Initial refresh failed." }, { status: 201 })
  }
}

function isHttpUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:" } catch { return false }
}
