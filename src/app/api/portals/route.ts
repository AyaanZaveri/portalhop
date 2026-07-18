import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { insertSavedChannels } from "@/db/saved-channels"
import { deleteSavedSource, selectSavedSources } from "@/db/saved-sources"
import { selectUserEpgSource } from "@/db/user-epg-sources"
import {
  savedM3uSources,
  savedSources,
  savedStalkerSources,
  savedXtreamSources,
} from "@/db/schema"
import { parseXtreamFromM3uUrl } from "@/lib/m3u-client"
import { fetchChannelsForPortal } from "@/lib/portal-fetch"
import {
  nullableString,
  readEpgMode,
  readEpgSourceId,
  readSourceType,
  stringValue,
} from "@/lib/portal-form-utils"
import { requireUser } from "@/lib/session"

export const runtime = "nodejs"

export async function GET() {
  const user = await requireUser()
  if (user instanceof NextResponse) {
    return user
  }

  const portals = await selectSavedSources(getDb(), user.id)

  return NextResponse.json({ portals })
}

export async function POST(request: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) {
    return user
  }

  const body = await request.json().catch(() => null)

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const name = stringValue(body.name).trim()
  const sourceType = readSourceType(body.sourceType)
  const portalUrl = stringValue(body.portalUrl).trim()
  const mac = stringValue(body.mac).trim()
  const serverUrl = stringValue(body.serverUrl).trim()
  const username = stringValue(body.username).trim()
  const password = stringValue(body.password).trim()
  const outputFormat = stringValue(body.outputFormat).trim() || "m3u8"
  const playlistUrl = stringValue(body.playlistUrl).trim()
  const timezone = stringValue(body.timezone).trim() || "America/Toronto"
  const stbType = stringValue(body.stbType).trim() || "MAG254"
  const epgMode = readEpgMode(body.epgMode)
  const requestedEpgSourceId = readEpgSourceId(body.epgSourceId)
  const customEpg = epgMode === "custom" && requestedEpgSourceId
    ? await selectUserEpgSource(getDb(), requestedEpgSourceId)
    : null
  if (epgMode === "custom" && (!customEpg || customEpg.userId !== user.id)) {
    return NextResponse.json({ error: "Custom EPG source not found." }, { status: 400 })
  }
  const epgSourceId = epgMode === "custom" ? requestedEpgSourceId : null

  if (!name) {
    return NextResponse.json(
      { error: "Nickname is required." },
      { status: 400 }
    )
  }

  if (sourceType === "stalker" && (!portalUrl || !mac)) {
    return NextResponse.json(
      { error: "Nickname, portal URL, and MAC address are required." },
      { status: 400 }
    )
  }

  if (sourceType === "xtream" && (!serverUrl || !username || !password)) {
    return NextResponse.json(
      { error: "Nickname, server URL, username, and password are required." },
      { status: 400 }
    )
  }

  if (sourceType === "m3u" && !playlistUrl) {
    return NextResponse.json(
      { error: "Nickname and M3U playlist URL are required." },
      { status: 400 }
    )
  }

  const now = new Date()
  const db = getDb()

  // The source row is created first (small, text-only insert) so the
  // channel list can be fetched server-side afterward instead of accepted
  // from the client — a saved portal can have tens of thousands of
  // channels, which reliably blows past Vercel's ~4.5MB function payload
  // limit if the browser has to upload it directly.
  const source = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(savedSources)
      .values({
        userId: user.id,
        name,
        sourceType,
        channelCount: 0,
        epgMode,
        epgSourceId,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (sourceType === "stalker") {
      await tx.insert(savedStalkerSources).values({
        sourceId: row.id,
        portalUrl,
        mac,
        serial: nullableString(body.serial),
        deviceId: nullableString(body.deviceId),
        deviceId2: nullableString(body.deviceId2),
        signature: nullableString(body.signature),
        timezone,
        stbType,
        endpoint: nullableString(body.endpoint),
      })
    } else if (sourceType === "xtream") {
      await tx.insert(savedXtreamSources).values({
        sourceId: row.id,
        serverUrl,
        username,
        password,
        outputFormat,
      })
    } else {
      const derived = parseXtreamFromM3uUrl(playlistUrl)
      await tx.insert(savedM3uSources).values({
        sourceId: row.id,
        playlistUrl,
        derivedXtreamServerUrl: derived?.serverUrl ?? null,
        derivedXtreamUsername: derived?.username ?? null,
        derivedXtreamPassword: derived?.password ?? null,
      })
    }

    return row
  })

  let result
  try {
    result = await fetchChannelsForPortal({
      sourceType,
      portalUrl,
      mac,
      serial: nullableString(body.serial) ?? undefined,
      deviceId: nullableString(body.deviceId) ?? undefined,
      deviceId2: nullableString(body.deviceId2) ?? undefined,
      signature: nullableString(body.signature) ?? undefined,
      timezone,
      stbType,
      endpoint: nullableString(body.endpoint) ?? undefined,
      serverUrl,
      username,
      password,
      outputFormat,
      playlistUrl,
    })
  } catch (error) {
    // The connection info didn't work — don't leave a channel-less source
    // sitting around.
    await deleteSavedSource(db, source.id, user.id)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not fetch channels for this source.",
      },
      { status: 502 }
    )
  }

  const updatedAt = new Date()
  await db.transaction(async (tx) => {
    if (result.channels.length) {
      await insertSavedChannels(tx, source.id, result.channels, updatedAt)
    }

    await tx
      .update(savedSources)
      .set({ channelCount: result.channels.length, updatedAt })
      .where(eq(savedSources.id, source.id))

    if (sourceType === "stalker") {
      await tx
        .update(savedStalkerSources)
        .set({ endpoint: result.endpoint })
        .where(eq(savedStalkerSources.sourceId, source.id))
    }
  })

  const portal = {
    id: source.id,
    name: source.name,
    sourceType,
    channelCount: result.channels.length,
    epgMode,
    epgSourceId,
    createdAt: source.createdAt,
    updatedAt,
    portalUrl,
    mac,
    serial: nullableString(body.serial),
    deviceId: nullableString(body.deviceId),
    deviceId2: nullableString(body.deviceId2),
    signature: nullableString(body.signature),
    timezone,
    stbType,
    endpoint: result.endpoint,
    serverUrl,
    username,
    password,
    outputFormat,
    playlistUrl,
  }

  return NextResponse.json({ portal }, { status: 201 })
}
