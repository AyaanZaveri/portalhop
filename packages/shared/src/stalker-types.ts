export type PortalRequest = {
  portalUrl: string
  mac: string
  serial?: string
  deviceId?: string
  deviceId2?: string
  signature?: string
  timezone?: string
  stbType?: string
}

export type PortalChannel = {
  /** Primary key of a persisted saved-channel row, when loaded from a portal. */
  savedChannelId?: number
  id: string
  number: string
  /**
   * What the channel is called. The guide's name where there is one, so a row
   * reads the same whichever portal supplied it.
   */
  name: string
  /**
   * What this portal calls it. The only thing distinguishing one stream from
   * another once several sit behind one row, and the reason the source list is
   * worth reading at all.
   */
  sourceName?: string
  genreId: string
  genre: string
  cmd: string
  logo: string
  logoUrl: string
  xmltvId?: string
}

export type EpgProgramme = {
  id: string
  channelId: string
  title: string
  description: string
  category?: string
  posterUrl?: string
  startAt: string
  stopAt: string
  source: "provider" | "epg"
}

export type PortalResponse = {
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
