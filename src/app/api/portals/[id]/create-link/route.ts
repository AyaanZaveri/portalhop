import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { selectSavedSource } from "@/db/saved-sources"
import { savedChannels } from "@/db/schema"
import { readErrorDetails } from "@portalhop/shared/errors"
import { resolveStalkerChannelLink } from "@/lib/stalker-link"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const sourceId = Number(id)
  const channelRowId = Number(new URL(request.url).searchParams.get("channel"))

  if (!Number.isInteger(sourceId) || !Number.isInteger(channelRowId)) {
    return NextResponse.json(
      { error: "Source id and channel id are required." },
      { status: 400 }
    )
  }

  const db = getDb()
  const source = await selectSavedSource(db, sourceId)

  if (!source) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 })
  }

  if (source.sourceType !== "stalker") {
    return NextResponse.json(
      { error: "Only Stalker sources can resolve create-link playlist entries." },
      { status: 400 }
    )
  }

  const [channel] = await db
    .select()
    .from(savedChannels)
    .where(
      and(
        eq(savedChannels.id, channelRowId),
        eq(savedChannels.sourceId, sourceId)
      )
    )
    .limit(1)

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 })
  }

  try {
    const { link } = await resolveStalkerChannelLink(
      {
        portalUrl: source.portalUrl ?? "",
        mac: source.mac ?? "",
        serial: source.serial ?? "",
        deviceId: source.deviceId ?? "",
        deviceId2: source.deviceId2 ?? "",
        signature: source.signature ?? "",
        timezone: source.timezone,
        stbType: source.stbType,
        endpoint: source.endpoint ?? "",
      },
      {
        id: channel.channelId,
        number: channel.number,
        name: channel.name,
        cmd: channel.cmd,
      }
    )

    return NextResponse.redirect(link, 302)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not resolve the channel through create_link.",
        details: readErrorDetails(error),
      },
      { status: 502 }
    )
  }
}
