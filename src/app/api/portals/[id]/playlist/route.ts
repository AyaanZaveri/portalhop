import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { selectSavedSource } from "@/db/saved-sources"
import { savedChannels } from "@/db/schema"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const sourceId = Number(id)

  if (!Number.isInteger(sourceId)) {
    return NextResponse.json({ error: "Invalid source id." }, { status: 400 })
  }

  const db = getDb()
  const source = await selectSavedSource(db, sourceId)

  if (!source) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 })
  }

  if (source.sourceType !== "stalker") {
    return NextResponse.json(
      {
        error:
          "Only Stalker sources can be exported as lazy create-link playlists.",
      },
      { status: 400 }
    )
  }

  const channels = await db
    .select()
    .from(savedChannels)
    .where(eq(savedChannels.sourceId, sourceId))

  const body = buildM3uPlaylist(
    source.name,
    channels.map((channel) => ({
      id: channel.id,
      xmltvId: channel.xmltvId,
      number: channel.number,
      name: channel.name,
      genre: channel.genre,
      logo: channel.logo,
      logoUrl: channel.logoUrl,
    })),
    request.url,
    sourceId
  )

  return new NextResponse(body, {
    headers: {
      "Content-Type": "audio/x-mpegurl; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameSafe(
        source.name
      )}.m3u"`,
      "Cache-Control": "no-store",
    },
  })
}

function buildM3uPlaylist(
  sourceName: string,
  channels: Array<{
    id: number
    xmltvId: string
    number: string
    name: string
    genre: string
    logo: string
    logoUrl: string
  }>,
  requestUrl: string,
  sourceId: number
) {
  const lines = [`#EXTM3U playlist="${escapeM3uAttribute(sourceName)}"`]

  for (const channel of channels) {
    const logo = channel.logoUrl || channel.logo
    const displayName = channel.name || channel.number || `Channel ${channel.id}`
    const url = new URL(`/api/portals/${sourceId}/create-link`, requestUrl)
    url.searchParams.set("channel", String(channel.id))

    lines.push(
      [
        "#EXTINF:-1",
        `tvg-id="${escapeM3uAttribute(channel.xmltvId)}"`,
        `tvg-name="${escapeM3uAttribute(displayName)}"`,
        `tvg-logo="${escapeM3uAttribute(logo)}"`,
        `group-title="${escapeM3uAttribute(channel.genre)}"`,
        `,${escapeM3uText(displayName)}`,
      ].join(" "),
      url.href
    )
  }

  return `${lines.join("\n")}\n`
}

function escapeM3uAttribute(value: string) {
  return value.replace(/[\r\n"]/g, (match) => (match === '"' ? "&quot;" : " "))
}

function escapeM3uText(value: string) {
  return value.replace(/[\r\n]/g, " ")
}

function filenameSafe(value: string) {
  const filename = value
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-|-$/g, "")
  return filename || "playlist"
}
