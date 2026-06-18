import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { insertSavedChannels } from "@/db/saved-channels"
import { savedChannels, savedPortals } from "@/db/schema"
import {
  fetchPortalChannels,
  getEndpointCandidates,
  normalizePortalRequest,
} from "@/lib/stalker-client"

export const runtime = "nodejs"

export async function POST(
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

  const options = normalizePortalRequest({
    portalUrl: portal.portalUrl,
    mac: portal.mac,
    serial: portal.serial ?? "",
    deviceId: portal.deviceId ?? "",
    deviceId2: portal.deviceId2 ?? "",
    signature: portal.signature ?? "",
    timezone: portal.timezone,
    stbType: portal.stbType,
  })
  const endpoints = [
    ...(portal.endpoint ? [portal.endpoint] : []),
    ...getEndpointCandidates(portal.portalUrl),
  ].filter((endpoint, index, list) => endpoint && list.indexOf(endpoint) === index)

  const errors: string[] = []

  for (const endpoint of endpoints) {
    try {
      const result = await fetchPortalChannels(endpoint, options)
      const now = new Date()

      await db.transaction(async (tx) => {
        await tx.delete(savedChannels)
          .where(eq(savedChannels.portalId, portal.id))

        if (result.channels.length) {
          await insertSavedChannels(tx, portal.id, result.channels, now)
        }
        await tx.update(savedPortals)
          .set({
            endpoint: result.endpoint,
            channelCount: result.channels.length,
            updatedAt: now,
          })
          .where(eq(savedPortals.id, portal.id))
      })

      return NextResponse.json({
        portal: {
          ...portal,
          endpoint: result.endpoint,
          channelCount: result.channels.length,
          updatedAt: now,
        },
        result,
      })
    } catch (error) {
      errors.push(
        `${endpoint}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return NextResponse.json(
    {
      error: "Could not refetch this portal.",
      details: errors,
    },
    { status: 502 }
  )
}
