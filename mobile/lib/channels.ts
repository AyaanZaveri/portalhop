import { useMemo } from "react"
import { useQueries, useQuery } from "@tanstack/react-query"

import { getChannelKey } from "@portalhop/shared/channel-keys"
import type { PortalChannel } from "@portalhop/shared/stalker-types"
import type { SavedSourceRecord } from "@portalhop/shared/source-types"
import type { UserSettingsData } from "@portalhop/shared/user-settings"

import { apiJson } from "./api"

export type PortalChannelWithSource = PortalChannel & {
  portalSource?: { id: number; name: string }
  /**
   * The favourite key and a lowercased name, computed once when a catalogue
   * arrives rather than per filter pass.
   *
   * `getChannelKey` is a `JSON.stringify`, so the favourites filter was running
   * tens of thousands of them synchronously every time it ran, and the search
   * box another `toLowerCase` per channel per keystroke. Both answers are fixed
   * for the life of the channel, so neither belongs in the hot path.
   */
  key: string
  searchName: string
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
        return result.data.channels.map((channel) => {
          const withSource = {
            ...channel,
            portalSource: { id: portal.id, name: portal.name },
          }
          return {
            ...withSource,
            key: getChannelKey(withSource),
            searchName: (channel.name ?? "").toLowerCase(),
          }
        })
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- results and
    // portals are fresh arrays each render; the signature is what changes only
    // when a source's data does.
    [signature],
  )

  return {
    channels,
    /**
     * Held until every source has settled, rather than showing whichever
     * arrived first.
     *
     * Sources are concatenated in a fixed order, so one resolving splices its
     * catalogue into the middle of the list and shifts everything after it —
     * with twelve of them that happened twelve times, and what the list showed
     * in between was whatever had landed so far, at whatever offset. A restored
     * cache makes this wait short; a cold one is better spent on a spinner than
     * on a list reshuffling under the reader.
     *
     * `isPending` is false as soon as a query has data or has failed, so a
     * source that errors unblocks the rest rather than holding them.
     */
    isPending: results.some((result) => result.isPending),
    // For the background indicator: data is already on screen, and a refresh is
    // in flight behind it.
    isFetching: results.some((result) => result.isFetching),
    error: results.find((r) => r.error)?.error ?? null,
  }
}
