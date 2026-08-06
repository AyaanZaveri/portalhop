import { useQuery } from "@tanstack/react-query"

import type { PortalChannel } from "@portalhop/shared/stalker-types"
import type { SavedSourceRecord } from "@portalhop/shared/source-types"
import type { UserSettingsData } from "@portalhop/shared/user-settings"

import { apiJson } from "./api"

export type PortalChannelWithSource = PortalChannel & {
  portalSource?: { id: number; name: string }
}

export function usePortals(enabled: boolean) {
  return useQuery({
    queryKey: ["portals"],
    queryFn: () => apiJson<{ portals: SavedSourceRecord[] }>("/api/portals"),
    select: (data) => data.portals,
    enabled,
  })
}

export function useSettings(enabled: boolean) {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => apiJson<{ settings: UserSettingsData }>("/api/settings"),
    select: (data) => data.settings,
    enabled,
  })
}

/**
 * A source's channel catalogue.
 *
 * `updatedAt` is part of the key rather than something we compare by hand: a
 * re-synced source produces a different key, the old entry ages out, and the
 * invalidation rule the web app implements manually falls out for free.
 */
export function usePortalChannels(portal: SavedSourceRecord | undefined) {
  return useQuery({
    queryKey: ["portal", portal?.id, portal?.updatedAt],
    queryFn: () =>
      apiJson<{ channels: PortalChannel[] }>(`/api/portals/${portal!.id}`),
    select: (data) => data.channels,
    enabled: Boolean(portal?.id),
    // A catalogue is valid until its source changes, and that change shows up
    // as a new key — so there is nothing for a timer to improve here.
    staleTime: Infinity,
  })
}
