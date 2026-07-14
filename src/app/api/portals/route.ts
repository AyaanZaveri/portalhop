import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { insertSavedChannels } from "@/db/saved-channels"
import { selectSavedSources } from "@/db/saved-sources"
import {
  savedM3uSources,
  savedSources,
  savedStalkerSources,
  savedXtreamSources,
} from "@/db/schema"
import { parseXtreamFromM3uUrl } from "@/lib/m3u-client"
import {
  nullableString,
  readChannels,
  readSourceType,
  safeNumber,
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
  const channels = readChannels(body.channels)
  const portal = await db.transaction(async (tx) => {
    const [source] = await tx
      .insert(savedSources)
      .values({
        userId: user.id,
        name,
        sourceType,
        channelCount: channels.length || safeNumber(body.channelCount),
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (sourceType === "stalker") {
      await tx.insert(savedStalkerSources).values({
        sourceId: source.id,
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
        sourceId: source.id,
        serverUrl,
        username,
        password,
        outputFormat,
      })
    } else {
      const derived = parseXtreamFromM3uUrl(playlistUrl)
      await tx.insert(savedM3uSources).values({
        sourceId: source.id,
        playlistUrl,
        derivedXtreamServerUrl: derived?.serverUrl ?? null,
        derivedXtreamUsername: derived?.username ?? null,
        derivedXtreamPassword: derived?.password ?? null,
      })
    }

    if (channels.length) {
      await insertSavedChannels(tx, source.id, channels, now)
    }

    return {
      id: source.id,
      name: source.name,
      sourceType,
      channelCount: source.channelCount,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      portalUrl,
      mac,
      serial: nullableString(body.serial),
      deviceId: nullableString(body.deviceId),
      deviceId2: nullableString(body.deviceId2),
      signature: nullableString(body.signature),
      timezone,
      stbType,
      endpoint: nullableString(body.endpoint),
      serverUrl,
      username,
      password,
      outputFormat,
      playlistUrl,
    }
  })

  return NextResponse.json({ portal }, { status: 201 })
}
