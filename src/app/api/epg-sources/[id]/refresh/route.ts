import { NextResponse } from "next/server"
import { getDb } from "@/db/client"
import { selectUserEpgSource } from "@/db/user-epg-sources"
import { refreshUserEpgSource } from "@/lib/user-epg-store"
import { requireUser } from "@/lib/session"
export const runtime = "nodejs"
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if (user instanceof NextResponse) return user
  const { id } = await context.params; const sourceId = Number(id); const source = Number.isInteger(sourceId) ? await selectUserEpgSource(getDb(), sourceId) : null
  if (!source || source.userId !== user.id) return NextResponse.json({ error: "EPG source not found." }, { status: 404 })
  try { return NextResponse.json({ source: { ...source, ...(await refreshUserEpgSource(sourceId)) } }) } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Refresh failed." }, { status: 502 }) }
}
