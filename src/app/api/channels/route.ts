import { NextResponse } from "next/server"

import {
  fetchPortalChannels,
  getEndpointCandidates,
  normalizePortalRequest,
} from "@/lib/stalker-client"
import type { PortalRequest } from "@/lib/stalker-types"

export async function POST(request: Request) {
  let body: PortalRequest

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
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
