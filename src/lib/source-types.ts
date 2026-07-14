import type { PortalChannel, PortalRequest } from "@/lib/stalker-types"

export type SourceType = "stalker" | "xtream" | "m3u"

export type XtreamRequest = {
  sourceType: "xtream"
  serverUrl: string
  username: string
  password: string
  outputFormat?: string
}

export type M3uRequest = {
  sourceType: "m3u"
  playlistUrl: string
}

export type StalkerSourceRequest = PortalRequest & {
  sourceType?: "stalker"
}

export type SourceRequest = StalkerSourceRequest | XtreamRequest | M3uRequest

export type SourceResponse = {
  endpoint: string
  profile: {
    id?: string
    login?: string
    tariffPlan?: string
    status?: string
  }
  genres: Array<{
    id: string
    title: string
    alias?: string
  }>
  channels: PortalChannel[]
}

export type SavedSourceRecord = {
  id: number
  userId: string
  name: string
  sourceType: SourceType
  channelCount: number
  createdAt: string | number | Date
  updatedAt: string | number | Date
  portalUrl?: string
  mac?: string
  serial?: string | null
  deviceId?: string | null
  deviceId2?: string | null
  signature?: string | null
  timezone?: string
  stbType?: string
  endpoint?: string | null
  serverUrl?: string
  username?: string
  password?: string
  outputFormat?: string
  playlistUrl?: string
  derivedXtreamServerUrl?: string | null
  derivedXtreamUsername?: string | null
  derivedXtreamPassword?: string | null
}
