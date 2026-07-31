import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { selectSavedSource } from "@/db/saved-sources"
import { savedChannels } from "@/db/schema"
import {
  hasChannelIdentity,
  resolveStalkerChannelLink,
} from "@/lib/stalker-link"
import { readErrorDetails } from "@/lib/errors"
import type { PortalRequest } from "@/lib/stalker-types"
import type { SourceType } from "@/lib/source-types"
import { requireUser } from "@/lib/session"

type LinkRequest = PortalRequest & {
  sourceType?: SourceType
  endpoint?: string
  cmd?: string
  channelId?: string
  channelNumber?: string
  channelName?: string
  sourceId?: number
  savedChannelId?: number
}

export async function POST(request: Request) {
  let body: LinkRequest

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  if (Number.isInteger(body.sourceId) && Number.isInteger(body.savedChannelId)) {
    return resolveSavedChannelLink(body.sourceId as number, body.savedChannelId as number)
  }

  const requestedChannel = {
    id: body.channelId?.trim() || "",
    number: body.channelNumber?.trim() || "",
    name: body.channelName?.trim() || "",
    cmd: body.cmd?.trim() || "",
  }

  if (body.sourceType === "xtream" || body.sourceType === "m3u") {
    if (isHttpUrl(requestedChannel.cmd)) {
      return NextResponse.json({
        link: requestedChannel.cmd,
        endpoint: body.endpoint ?? "",
      })
    }

    return NextResponse.json(
      { error: "This source did not include a playable stream URL." },
      { status: 400 }
    )
  }

  if (
    !body.portalUrl?.trim() ||
    !body.mac?.trim() ||
    !hasChannelIdentity(requestedChannel)
  ) {
    return NextResponse.json(
      { error: "Portal URL, MAC address, and channel identity are required." },
      { status: 400 }
    )
  }

  try {
    return NextResponse.json(
      await resolveStalkerChannelLink(body, requestedChannel)
    )
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

async function resolveSavedChannelLink(sourceId: number, savedChannelId: number) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user

  const db = getDb()
  const source = await selectSavedSource(db, sourceId)
  if (!source || source.userId !== user.id) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 })
  }

  const [channel] = await db
    .select({
      id: savedChannels.channelId,
      number: savedChannels.number,
      name: savedChannels.name,
      cmd: savedChannels.cmd,
    })
    .from(savedChannels)
    .where(and(eq(savedChannels.id, savedChannelId), eq(savedChannels.sourceId, sourceId)))
    .limit(1)

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 })
  }

  if (source.sourceType === "xtream" || source.sourceType === "m3u") {
    if (!isHttpUrl(channel.cmd)) {
      return NextResponse.json(
        { error: "This source did not include a playable stream URL." },
        { status: 400 },
      )
    }
    return NextResponse.json({ link: channel.cmd, endpoint: source.endpoint ?? "" })
  }

  try {
    return NextResponse.json(
      await resolveStalkerChannelLink(
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
        channel,
      ),
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not pull the latest stream." },
      { status: 502 },
    )
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}
