import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { selectSavedSource } from "@/db/saved-sources"
import { savedChannels } from "@/db/schema"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const sourceId = Number(id)

  if (!Number.isInteger(sourceId)) {
    return NextResponse.json({ error: "Invalid source id." }, { status: 400 })
  }

  const db = getDb()
  const portal = await selectSavedSource(db, sourceId)

  if (!portal) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 })
  }

  const channels = await db
    .select()
    .from(savedChannels)
    .where(eq(savedChannels.sourceId, sourceId))

  return NextResponse.json({
    portal,
    channels: channels.map((channel) => ({
      id: channel.channelId,
      xmltvId: channel.xmltvId,
      number: channel.number,
      name: channel.name,
      genreId: channel.genreId,
      genre: channel.genre,
      cmd: channel.cmd,
      logo: channel.logo,
      logoUrl: channel.logoUrl,
    })),
  })
}
