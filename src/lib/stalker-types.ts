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
  id: string
  number: string
  name: string
  genreId: string
  genre: string
  cmd: string
  logo: string
  logoUrl: string
  xmltvId?: string
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
