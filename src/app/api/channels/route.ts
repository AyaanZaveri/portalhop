import { NextResponse } from "next/server"

import {
  fetchPortalChannels,
  getEndpointCandidates,
  normalizePortalRequest,
} from "@/lib/stalker-client"
import { fetchM3uChannels } from "@/lib/m3u-client"
import type { SourceRequest } from "@/lib/source-types"
import { fetchXtreamChannels } from "@/lib/xtream-client"

export async function POST(request: Request) {
  let body: SourceRequest

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  if (body.sourceType === "xtream") {
    try {
      return NextResponse.json(await fetchXtreamChannels(body))
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not connect to Xtream." },
        { status: 502 }
      )
    }
  }

  if (body.sourceType === "m3u") {
    try {
      return NextResponse.json(await fetchM3uChannels(body.playlistUrl))
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not load M3U playlist." },
        { status: 502 }
      )
    }
  }

  const portalUrl = body.portalUrl?.trim()
  const options = normalizePortalRequest(body)

  if (!portalUrl || !options.mac) {
    return NextResponse.json(
      { error: "Portal URL and MAC address are required." },
      { status: 400 }
    )
  }

  const endpoints = getEndpointCandidates(portalUrl)

  if (!endpoints.length) {
    return NextResponse.json(
      { error: "Portal URL must be a valid http or https URL." },
      { status: 400 }
    )
  }

  const errors: string[] = []

  for (const endpoint of endpoints) {
    try {
      const result = await fetchPortalChannels(endpoint, options)
      return NextResponse.json(result)
    } catch (error) {
      errors.push(
        `${endpoint}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return NextResponse.json(
    {
      error: "Could not connect to the portal with the tested endpoints.",
      details: errors,
    },
    { status: 502 }
  )
}
