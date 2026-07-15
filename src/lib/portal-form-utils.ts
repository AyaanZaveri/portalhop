import type { SourceType } from "@/lib/source-types"
import type { EpgMode } from "@/lib/source-types"
import type { PortalChannel } from "@/lib/stalker-types"

export function readSourceType(value: unknown): SourceType {
  return value === "xtream" || value === "m3u" ? value : "stalker"
}

export function stringValue(value: unknown) {
  if (value === null || value === undefined) {
    return ""
  }

  return String(value)
}

export function nullableString(value: unknown) {
  const text = stringValue(value).trim()
  return text || null
}

export function safeNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function readEpgMode(value: unknown): EpgMode {
  return value === "none" || value === "iptv-org" || value === "custom" ? value : "portal"
}

export function readEpgSourceId(value: unknown) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export function readChannel(value: unknown): PortalChannel | null {
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

export function isPortalChannel(
  value: PortalChannel | null
): value is PortalChannel {
  return Boolean(value)
}

export function readChannels(value: unknown): PortalChannel[] {
  return Array.isArray(value)
    ? (value as unknown[]).map(readChannel).filter(isPortalChannel)
    : []
}
