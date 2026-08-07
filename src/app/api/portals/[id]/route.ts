import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { syncSavedChannels } from "@/db/saved-channels"
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
import { getEpgChannelLogos } from "@/lib/epg-store"
import { fetchChannelsForPortal } from "@/lib/portal-fetch"
import {
  nullableString,
  readEpgMode,
  readEpgSourceId,
  readSourceType,
  stringValue,
} from "@portalhop/shared/portal-form-utils"
import { requireUser } from "@/lib/session"
import { getUserEpgChannelLogos } from "@/lib/user-epg-store"
import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"

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
    .select({
      id: savedChannels.id,
      channelId: savedChannels.channelId,
      xmltvId: savedChannels.xmltvId,
      number: savedChannels.number,
      name: savedChannels.name,
      genreId: savedChannels.genreId,
      genre: savedChannels.genre,
      logo: savedChannels.logo,
      logoUrl: savedChannels.logoUrl,
    })
    .from(savedChannels)
    .where(eq(savedChannels.sourceId, sourceId))

  const channelIds = channels.map((channel) => channel.xmltvId)
  const epgLogos = portal.epgMode === "iptv-org"
    ? await getEpgChannelLogos(channelIds)
    : {}
  const customEpgLogos =
    portal.epgMode === "custom" && portal.epgSourceId
      ? await getUserEpgChannelLogos(user.id, portal.epgSourceId, channelIds)
      : {}

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
      // Stream commands can be very large and are only needed after the user
      // chooses a channel. They stay in Postgres until /api/channel-link
      // resolves this specific saved-channel id.
      cmd: "",
      logo: channel.logo,
      logoUrl:
        epgLogos[normalizeXmltvId(channel.xmltvId) || channel.channelId.toLowerCase()]?.logoUrl ||
        customEpgLogos[normalizeXmltvId(channel.xmltvId) || channel.channelId.toLowerCase()]?.logoUrl ||
        channel.logoUrl,
    })),
  })
}

/**
 * Renames a source (body is just `{ name }`), or replaces its connection
 * details and channels entirely (body matches the shape POST /api/portals
 * accepts). The client tells these apart by whether `sourceType` is present;
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

  const same = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? "") === (b ?? "")

  // EPG choice is applied when a portal is read, not stored on its channels, so
  // changing it alone needs no refetch — only the connection fields do.
  const connectionUnchanged =
    sourceType === existing.sourceType &&
    (sourceType === "stalker"
      ? same(portalUrl, existing.portalUrl) &&
        same(mac, existing.mac) &&
        same(nullableString(body.serial), existing.serial) &&
        same(nullableString(body.deviceId), existing.deviceId) &&
        same(nullableString(body.deviceId2), existing.deviceId2) &&
        same(nullableString(body.signature), existing.signature) &&
        same(timezone, existing.timezone) &&
        same(stbType, existing.stbType)
      : sourceType === "xtream"
        ? same(serverUrl, existing.serverUrl) &&
          same(username, existing.username) &&
          same(password, existing.password) &&
          same(outputFormat, existing.outputFormat)
        : same(playlistUrl, existing.playlistUrl))

  const now = new Date()

  // Update the connection info first (small, text-only) so the channel list
  // can be fetched server-side afterward. A saved portal can have tens of
  // thousands of channels, which reliably blows past Vercel's ~4.5MB
  // function payload limit if the browser has to upload it directly.
  await db.transaction(async (tx) => {
    await tx
      .update(savedSources)
      .set({ name, sourceType, epgMode, epgSourceId, updatedAt: now })
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
  })

  // updatedAt still moves: the cached channel payload carries EPG logos, so the
  // client has to refetch it even though the channel rows are untouched.
  if (connectionUnchanged) {
    return NextResponse.json({
      portal: {
        id: sourceId,
        userId: existing.userId,
        name,
        sourceType,
        channelCount: existing.channelCount,
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
        endpoint: existing.endpoint,
        serverUrl,
        username,
        password,
        outputFormat,
        playlistUrl,
      },
    })
  }

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
    // Connection info is already updated, but leave the previous channel
    // list in place rather than wiping it out on a (likely transient)
    // fetch failure.
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
    await syncSavedChannels(tx, sourceId, sourceType, result.channels, updatedAt)

    await tx
      .update(savedSources)
      .set({ channelCount: result.channels.length, updatedAt })
      .where(eq(savedSources.id, sourceId))

    if (sourceType === "stalker") {
      await tx
        .update(savedStalkerSources)
        .set({ endpoint: result.endpoint })
        .where(eq(savedStalkerSources.sourceId, sourceId))
    }
  })

  const portal = {
    id: sourceId,
    userId: existing.userId,
    name,
    sourceType,
    channelCount: result.channels.length,
    epgMode,
    epgSourceId,
    createdAt: existing.createdAt,
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
  };

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
