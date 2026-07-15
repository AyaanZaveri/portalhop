import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { userEpgSources } from "@/db/schema"
import { deleteUserEpgSource, selectUserEpgSource } from "@/db/user-epg-sources"
import { refreshUserEpgSource } from "@/lib/user-epg-store"
import { requireUser } from "@/lib/session"

export const runtime = "nodejs"

async function owned(id: string, userId: string) {
  const sourceId = Number(id)
  if (!Number.isInteger(sourceId)) return null
  const source = await selectUserEpgSource(getDb(), sourceId)
  return source?.userId === userId ? source : null
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if (user instanceof NextResponse) return user
  const { id } = await context.params; const source = await owned(id, user.id)
  if (!source) return NextResponse.json({ error: "EPG source not found." }, { status: 404 })
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : source.name
  const url = typeof body?.url === "string" ? body.url.trim() : source.url
  if (!name || !isHttpUrl(url)) return NextResponse.json({ error: "A name and valid HTTP(S) XMLTV URL are required." }, { status: 400 })
  const changedUrl = url !== source.url; const now = new Date(); const db = getDb()
  const [updated] = await db.update(userEpgSources).set({ name, url, updatedAt: now }).where(and(eq(userEpgSources.id, source.id), eq(userEpgSources.userId, user.id))).returning()
  if (changedUrl) { try { const refreshed = await refreshUserEpgSource(source.id); return NextResponse.json({ source: { ...updated, ...refreshed } }) } catch (error) { return NextResponse.json({ source: updated, refreshError: error instanceof Error ? error.message : "Refresh failed." }) } }
  return NextResponse.json({ source: updated })
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if (user instanceof NextResponse) return user
  const { id } = await context.params; const sourceId = Number(id)
  if (!Number.isInteger(sourceId) || !(await deleteUserEpgSource(getDb(), sourceId, user.id))) return NextResponse.json({ error: "EPG source not found." }, { status: 404 })
  return NextResponse.json({ ok: true })
}

function isHttpUrl(value: string) { try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:" } catch { return false } }
