import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { savedChannels, savedPortals } from "@/db/schema"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const portalId = Number(id)

  if (!Number.isInteger(portalId)) {
    return NextResponse.json({ error: "Invalid portal id." }, { status: 400 })
  }

  const db = getDb()
  const [portal] = await db
    .select()
    .from(savedPortals)
    .where(eq(savedPortals.id, portalId))
    .limit(1)

  if (!portal) {
    return NextResponse.json({ error: "Portal not found." }, { status: 404 })
  }

  const channels = await db
    .select()
    .from(savedChannels)
    .where(eq(savedChannels.portalId, portalId))

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
