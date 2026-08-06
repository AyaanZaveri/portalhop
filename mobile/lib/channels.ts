import { useMemo } from "react"
import { useQueries, useQuery } from "@tanstack/react-query"

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
 * The channel catalogues for every given source, merged.
 *
 * One query per source rather than one for the selection: catalogues are large
 * and each is cached under its own key, so toggling a source off and on again
 * costs nothing the second time. Selecting a set would key the cache by the
 * combination and refetch everything whenever it changed.
 *
 * `updatedAt` is part of each key rather than something compared by hand: a
 * re-synced source produces a new key, its old entry ages out, and the
 * invalidation rule the web implements manually falls out for free.
 */
export function usePortalChannels(portals: SavedSourceRecord[]) {
  const results = useQueries({
    queries: portals.map((portal) => ({
      queryKey: ["portal", portal.id, portal.updatedAt],
      queryFn: () =>
        apiJson<{ channels: PortalChannel[] }>(`/api/portals/${portal.id}`),
      // A catalogue is valid until its source changes, and that shows up as a
      // new key — there is nothing for a timer to improve.
      staleTime: Infinity,
    })),
  })

  // Deliberately not a `select`: an inline one is a new function each render,
  // which TanStack cannot memoize, so it would re-map tens of thousands of
  // channels on every keystroke in the search field. Stamping here instead
  // runs only when a source's data actually changes.
  const signature = results
    .map((result, index) => `${portals[index]?.id}:${result.dataUpdatedAt}`)
    .join(",")

  const channels = useMemo(
    () =>
      results.flatMap((result, index) => {
        const portal = portals[index]
        if (!result.data || !portal) return []
        return result.data.channels.map((channel) => ({
          ...channel,
          portalSource: { id: portal.id, name: portal.name },
        }))
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- results and
    // portals are fresh arrays each render; the signature is what changes only
    // when a source's data does.
    [signature],
  )

  return {
    channels,
    // Only blocks the list while nothing at all has arrived. A source still
    // loading alongside others that have shouldn't hide what is already there.
    isPending: results.length > 0 && results.every((r) => r.isPending),
    error: results.find((r) => r.error)?.error ?? null,
  }
}
