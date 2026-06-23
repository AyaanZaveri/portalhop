import { NextResponse } from "next/server"

import {
  hasChannelIdentity,
  resolveStalkerChannelLink,
} from "@/lib/stalker-link"
import { readErrorDetails } from "@/lib/errors"
import type { PortalRequest } from "@/lib/stalker-types"
import type { SourceType } from "@/lib/source-types"

type LinkRequest = PortalRequest & {
  sourceType?: SourceType
  endpoint?: string
  cmd?: string
  channelId?: string
  channelNumber?: string
  channelName?: string
}

export async function POST(request: Request) {
  let body: LinkRequest

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
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

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}
