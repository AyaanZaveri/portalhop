import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { insertSavedChannels } from "@/db/saved-channels"
import { selectSavedSource } from "@/db/saved-sources"
import { savedChannels, savedSources, savedStalkerSources } from "@/db/schema"
import { requireUser } from "@/lib/session"
import { fetchM3uChannels } from "@/lib/m3u-client"
import {
  fetchPortalChannels,
  getEndpointCandidates,
  normalizePortalRequest,
} from "@/lib/stalker-client"
import type { SourceResponse } from "@/lib/source-types"
import { fetchXtreamChannels } from "@/lib/xtream-client"

export const runtime = "nodejs"

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireUser()
  if (user instanceof NextResponse) {
    return user
  }

  const { id } = await context.params
  const sourceId = Number(id)

  if (!Number.isInteger(sourceId)) {
    return NextResponse.json({ error: "Invalid source id." }, { status: 400 })
  }

  const db = getDb()
  const portal = await selectSavedSource(db, sourceId)

  if (!portal || portal.userId !== user.id) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 })
  }

  if (portal.sourceType === "xtream") {
    try {
      return refetchDirectSource(
        portal,
        await fetchXtreamChannels({
          serverUrl: portal.serverUrl ?? "",
          username: portal.username ?? "",
          password: portal.password ?? "",
          outputFormat: portal.outputFormat ?? "m3u8",
        })
      )
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Could not refetch this source.",
        },
        { status: 502 }
      )
    }
  }

  if (portal.sourceType === "m3u") {
    try {
      return refetchDirectSource(
        portal,
        await fetchM3uChannels(portal.playlistUrl ?? "")
      )
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Could not refetch this source.",
        },
        { status: 502 }
      )
    }
  }

  const options = normalizePortalRequest({
    portalUrl: portal.portalUrl ?? "",
    mac: portal.mac ?? "",
    serial: portal.serial ?? "",
    deviceId: portal.deviceId ?? "",
    deviceId2: portal.deviceId2 ?? "",
    signature: portal.signature ?? "",
    timezone: portal.timezone,
    stbType: portal.stbType,
  })
  const endpoints = [
    ...(portal.endpoint ? [portal.endpoint] : []),
    ...getEndpointCandidates(portal.portalUrl ?? ""),
  ].filter((endpoint, index, list) => endpoint && list.indexOf(endpoint) === index)

  const errors: string[] = []

  for (const endpoint of endpoints) {
    try {
      const result = await fetchPortalChannels(endpoint, options)
      const now = new Date()

      await db.transaction(async (tx) => {
        await tx.delete(savedChannels)
          .where(eq(savedChannels.portalId, portal.id))
        await tx.delete(savedChannels)
          .where(eq(savedChannels.sourceId, portal.id))

        if (result.channels.length) {
          await insertSavedChannels(tx, portal.id, result.channels, now)
        }
        await tx.update(savedSources)
          .set({
            channelCount: result.channels.length,
            updatedAt: now,
          })
          .where(eq(savedSources.id, portal.id))
        await tx.update(savedStalkerSources)
          .set({ endpoint: result.endpoint })
          .where(eq(savedStalkerSources.sourceId, portal.id))
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

async function refetchDirectSource(
  portal: { id: number },
  result: SourceResponse
) {
  const db = getDb()
  const now = new Date()

  await db.transaction(async (tx) => {
    await tx.delete(savedChannels).where(eq(savedChannels.sourceId, portal.id))

    if (result.channels.length) {
      await insertSavedChannels(tx, portal.id, result.channels, now)
    }

    await tx
      .update(savedSources)
      .set({
        channelCount: result.channels.length,
        updatedAt: now,
      })
      .where(eq(savedSources.id, portal.id))
  })

  return NextResponse.json({
    portal: {
      ...portal,
      channelCount: result.channels.length,
      updatedAt: now,
    },
    result,
  })
}
