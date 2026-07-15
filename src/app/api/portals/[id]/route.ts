import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { insertSavedChannels } from "@/db/saved-channels"
import { deleteSavedSource, selectSavedSource } from "@/db/saved-sources"
import { selectUserEpgSource } from "@/db/user-epg-sources"
import {
  savedChannels,
  savedM3uSources,
  savedSources,
  savedStalkerSources,
  savedXtreamSources,
} from "@/db/schema"
import { parseXtreamFromM3uUrl } from "@/lib/m3u-client"
import {
  nullableString,
  readChannels,
  readEpgMode,
  readEpgSourceId,
  readSourceType,
  safeNumber,
  stringValue,
} from "@/lib/portal-form-utils"
import { requireUser } from "@/lib/session"

export const runtime = "nodejs"

export async function GET(
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

  const channels = await db
    .select()
    .from(savedChannels)
    .where(eq(savedChannels.sourceId, sourceId))

  return NextResponse.json({
    portal,
    channels: channels.map((channel) => ({
      savedChannelId: channel.id,
      id: channel.channelId,
      xmltvId: channel.xmltvId,
      number: channel.number,
      name: channel.name,
      genreId: channel.genreId,
      genre: channel.genre,
      cmd: channel.cmd,
      logo: channel.logo,
      logoUrl: channel.logoUrl,
    })),
  })
}

/**
 * Renames a source (body is just `{ name }`), or replaces its connection
 * details and channels entirely (body matches the shape POST /api/portals
 * accepts). The client tells these apart by whether `sourceType` is present —
 * a rename never needs to touch credentials or re-test the connection.
 */
export async function PATCH(
  request: Request,
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
  const existing = await selectSavedSource(db, sourceId)

  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 })
  }

  const body = await request.json().catch(() => null)

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  if (body.sourceType === undefined) {
    const name = stringValue(body.name).trim()

    if (!name) {
      return NextResponse.json(
        { error: "Nickname is required." },
        { status: 400 }
      )
    }

    const now = new Date()
    await db
      .update(savedSources)
      .set({ name, updatedAt: now })
      .where(eq(savedSources.id, sourceId))

    return NextResponse.json({
      portal: { ...existing, name, updatedAt: now },
    })
  }

  const name = stringValue(body.name).trim() || existing.name
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
    ? await selectUserEpgSource(db, requestedEpgSourceId)
    : null
  if (epgMode === "custom" && (!customEpg || customEpg.userId !== user.id)) {
    return NextResponse.json({ error: "Custom EPG source not found." }, { status: 400 })
  }
  const epgSourceId = epgMode === "custom" ? requestedEpgSourceId : null

  if (sourceType === "stalker" && (!portalUrl || !mac)) {
    return NextResponse.json(
      { error: "Portal URL and MAC address are required." },
      { status: 400 }
    )
  }

  if (sourceType === "xtream" && (!serverUrl || !username || !password)) {
    return NextResponse.json(
      { error: "Server URL, username, and password are required." },
      { status: 400 }
    )
  }

  if (sourceType === "m3u" && !playlistUrl) {
    return NextResponse.json(
      { error: "M3U playlist URL is required." },
      { status: 400 }
    )
  }

  const now = new Date()
  const channels = readChannels(body.channels)

  const portal = await db.transaction(async (tx) => {
    await tx
      .update(savedSources)
      .set({
        name,
        sourceType,
        channelCount: channels.length || safeNumber(body.channelCount),
        epgMode,
        epgSourceId,
        updatedAt: now,
      })
      .where(eq(savedSources.id, sourceId))

    // The source may have switched type (e.g. Stalker -> Xtream), so clear
    // every per-type row before inserting the one that now applies.
    await tx
      .delete(savedStalkerSources)
      .where(eq(savedStalkerSources.sourceId, sourceId))
    await tx
      .delete(savedXtreamSources)
      .where(eq(savedXtreamSources.sourceId, sourceId))
    await tx
      .delete(savedM3uSources)
      .where(eq(savedM3uSources.sourceId, sourceId))

    if (sourceType === "stalker") {
      await tx.insert(savedStalkerSources).values({
        sourceId,
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
        sourceId,
        serverUrl,
        username,
        password,
        outputFormat,
      })
    } else {
      const derived = parseXtreamFromM3uUrl(playlistUrl)
      await tx.insert(savedM3uSources).values({
        sourceId,
        playlistUrl,
        derivedXtreamServerUrl: derived?.serverUrl ?? null,
        derivedXtreamUsername: derived?.username ?? null,
        derivedXtreamPassword: derived?.password ?? null,
      })
    }

    await tx.delete(savedChannels).where(eq(savedChannels.sourceId, sourceId))

    if (channels.length) {
      await insertSavedChannels(tx, sourceId, channels, now)
    }

    return {
      id: sourceId,
      userId: existing.userId,
      name,
      sourceType,
      channelCount: channels.length || safeNumber(body.channelCount),
      epgMode,
      epgSourceId,
      createdAt: existing.createdAt,
      updatedAt: now,
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

  return NextResponse.json({ portal })
}

export async function DELETE(
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
  const deleted = await deleteSavedSource(db, sourceId, user.id)

  if (!deleted) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
