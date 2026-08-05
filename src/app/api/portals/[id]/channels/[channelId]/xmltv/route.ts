import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { setSavedChannelXmltvId } from "@/db/saved-channels"
import { selectSavedSource } from "@/db/saved-sources"
import { requireUser } from "@/lib/session"

export const runtime = "nodejs"

/**
 * Pin one saved channel to an EPG id the user picked, or clear it. An empty
 * xmltvId releases the channel back to whatever the provider reports on the
 * next refresh.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; channelId: string }> },
) {
  const user = await requireUser()
  if (user instanceof NextResponse) {
    return user
  }

  const { id, channelId } = await context.params
  const sourceId = Number(id)
  const savedChannelId = Number(channelId)

  if (!Number.isInteger(sourceId) || !Number.isInteger(savedChannelId)) {
    return NextResponse.json({ error: "Invalid channel." }, { status: 400 })
  }

  const db = getDb()
  const source = await selectSavedSource(db, sourceId)

  // Checked before the update rather than relying on the where clause, so a
  // channel belonging to someone else is a 404 rather than a silent no-op.
  if (!source || source.userId !== user.id) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 })
  }

  let body: { xmltvId?: unknown }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  if (typeof body.xmltvId !== "string") {
    return NextResponse.json(
      { error: "xmltvId must be a string." },
      { status: 400 },
    )
  }

  const channel = await setSavedChannelXmltvId(
    savedChannelId,
    sourceId,
    body.xmltvId,
  )

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 })
  }

  return NextResponse.json({ channel })
}
