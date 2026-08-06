import type { SourceType } from "./source-types"
import type { EpgMode } from "./source-types"

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

export function readEpgMode(value: unknown): EpgMode {
  return value === "none" || value === "iptv-org" || value === "custom" ? value : "portal"
}

export function readEpgSourceId(value: unknown) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}
