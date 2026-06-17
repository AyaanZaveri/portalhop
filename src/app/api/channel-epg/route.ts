import { NextResponse } from "next/server"

import { fetchAndParseEpgProgrammes } from "@/lib/epg-parser"
import { findEpgSourceForChannel } from "@/lib/epg-store"
import {
  fetchPortalEpg,
  getEndpointCandidates,
  normalizePortalRequest,
} from "@/lib/stalker-client"
import type { EpgProgramme, PortalRequest } from "@/lib/stalker-types"

type EpgRequest = PortalRequest & {
  source?: "provider" | "epg"
  endpoint?: string
  channelId?: string
  channelName?: string
  xmltvId?: string
}

export const runtime = "nodejs"

export async function POST(request: Request) {
  let body: EpgRequest

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const source = body.source === "epg" ? "epg" : "provider"
  const channelId = body.channelId?.trim() || ""
  const channelName = body.channelName?.trim() || ""
  const xmltvId = body.xmltvId?.trim() || ""

  if (!channelId && !channelName && !xmltvId) {
    return NextResponse.json(
      { error: "A channel id, XMLTV id, or channel name is required." },
      { status: 400 }
    )
  }

  if (source === "epg") {
    const match = await findEpgSourceForChannel([
      { id: xmltvId },
      { id: channelId },
      { name: channelName },
    ])

    if (!match) {
      return NextResponse.json({ programmes: [] })
    }

    const programmes = await fetchAndParseEpgProgrammes(match.source.url, [
      match.channelId,
    ])

    return NextResponse.json({
      programmes: programmes.map((programme): EpgProgramme => ({
        ...programme,
        source: "epg",
      })),
    })
  }

  const portalUrl = body.portalUrl?.trim()
  const options = normalizePortalRequest(body)

  if (!portalUrl || !options.mac || !channelId) {
    return NextResponse.json(
      { error: "Portal URL, MAC address, and channel id are required." },
      { status: 400 }
    )
  }

  const endpoints = [
    ...(body.endpoint ? [body.endpoint] : []),
    ...getEndpointCandidates(portalUrl),
  ].filter((endpoint, index, list) => endpoint && list.indexOf(endpoint) === index)

  const errors: string[] = []

  for (const endpoint of endpoints) {
    try {
      const programmes = await fetchPortalEpg(endpoint, options, channelId)
      return NextResponse.json({ programmes })
    } catch (error) {
      errors.push(
        `${endpoint}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return NextResponse.json(
    {
      error: "Could not load EPG data from the portal.",
      details: errors,
    },
    { status: 502 }
  )
}
