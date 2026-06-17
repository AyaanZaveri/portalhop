import { desc } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb } from "@/db/client"
import { insertSavedChannels } from "@/db/saved-channels"
import { savedPortals } from "@/db/schema"
import type { PortalChannel } from "@/lib/stalker-types"

export const runtime = "nodejs"

export async function GET() {
  const portals = await getDb()
    .select()
    .from(savedPortals)
    .orderBy(desc(savedPortals.updatedAt))

  return NextResponse.json({ portals })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const name = stringValue(body.name).trim()
  const portalUrl = stringValue(body.portalUrl).trim()
  const mac = stringValue(body.mac).trim()
  const timezone = stringValue(body.timezone).trim() || "America/Toronto"
  const stbType = stringValue(body.stbType).trim() || "MAG254"

  if (!name || !portalUrl || !mac) {
    return NextResponse.json(
      { error: "Nickname, portal URL, and MAC address are required." },
      { status: 400 }
    )
  }

  const now = new Date()
  const db = getDb()
  const channels = Array.isArray(body.channels)
    ? (body.channels as unknown[]).map(readChannel).filter(isPortalChannel)
    : []
  const [portal] = await db
    .insert(savedPortals)
    .values({
      name,
      portalUrl,
      mac,
      serial: nullableString(body.serial),
      deviceId: nullableString(body.deviceId),
      deviceId2: nullableString(body.deviceId2),
      signature: nullableString(body.signature),
      timezone,
      stbType,
      endpoint: nullableString(body.endpoint),
      channelCount: channels.length || safeNumber(body.channelCount),
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (channels.length) {
    await insertSavedChannels(db, portal.id, channels, now)
  }

  return NextResponse.json({ portal }, { status: 201 })
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) {
    return ""
  }

  return String(value)
}

function nullableString(value: unknown) {
  const text = stringValue(value).trim()
  return text || null
}

function safeNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function readChannel(value: unknown): PortalChannel | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const channel = value as Record<string, unknown>

  return {
    id: stringValue(channel.id),
    xmltvId: stringValue(channel.xmltvId),
    number: stringValue(channel.number),
    name: stringValue(channel.name),
    genreId: stringValue(channel.genreId),
    genre: stringValue(channel.genre),
    cmd: stringValue(channel.cmd),
    logo: stringValue(channel.logo),
    logoUrl: stringValue(channel.logoUrl),
  }
}

function isPortalChannel(value: PortalChannel | null): value is PortalChannel {
  return Boolean(value)
}
