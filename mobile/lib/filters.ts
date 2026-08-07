import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

import type { BrowseFilter } from "@portalhop/shared/browse-filter"

import { apiJson } from "./api"
import type { PortalChannelWithSource } from "./channels"

export type FavoriteGroup = {
  id: number
  name: string
  icon: string
  channelKeys: string[]
}

export type CategoryEntry = {
  sourceId: number
  sourceName: string
  genre: string
  count: number
}

export function useFavorites(enabled: boolean) {
  const query = useQuery({
    queryKey: ["favorites"],
    queryFn: () => apiJson<{ favorites: string[] }>("/api/favorites"),
    enabled,
  })

  // The array is the user's manual order (the API sorts by `position`), and the
  // Set is for membership tests. Both are built here rather than in a `select`:
  // an inline select is a new function every render, so TanStack re-runs it and
  // hands back new objects each time — which changed the identity of a
  // dependency the channel filter is memoized on, and made that filter re-run
  // on every single render rather than when the filter actually changed.
  const favoriteKeys = query.data?.favorites
  const favorites = useMemo(
    () => ({
      keys: favoriteKeys ?? [],
      set: new Set(favoriteKeys ?? []),
    }),
    [favoriteKeys],
  )

  return { favorites, isPending: query.isPending }
}

export type Favorites = { keys: string[]; set: Set<string> }

export function useFavoriteGroups(enabled: boolean) {
  return useQuery({
    queryKey: ["favorite-groups"],
    queryFn: () => apiJson<{ groups: FavoriteGroup[] }>("/api/favorite-groups"),
    select: (data) => data.groups,
    enabled,
  })
}

/**
 * Categories are derived from the loaded channels rather than fetched — there
 * is no endpoint for them, and the counts have to reflect whatever is currently
 * in view. Same grouping and sort the web list uses.
 */
export function useCategories(channels: PortalChannelWithSource[]) {
  return useMemo(() => {
    const entries = new Map<string, CategoryEntry>()

    for (const channel of channels) {
      const genre = channel.genre || "Uncategorized"
      const sourceId = channel.portalSource?.id ?? 0
      const key = `${sourceId}\u0000${genre}`
      const current = entries.get(key)
      entries.set(key, {
        sourceId,
        sourceName: channel.portalSource?.name ?? "Manual",
        genre,
        count: (current?.count ?? 0) + 1,
      })
    }

    return [...entries.values()].sort(
      (a, b) =>
        a.genre.localeCompare(b.genre, undefined, { sensitivity: "base" }) ||
        a.sourceName.localeCompare(b.sourceName, undefined, {
          sensitivity: "base",
        }),
    )
  }, [channels])
}

/** Applies the active chip's filter to the channel list. */
export function applyBrowseFilter(
  channels: PortalChannelWithSource[],
  byKey: Map<string, PortalChannelWithSource>,
  filter: BrowseFilter,
  favorites: Favorites | undefined,
  groups: FavoriteGroup[] | undefined,
) {
  switch (filter.type) {
    case "all":
      return channels

    // Walks the saved keys rather than the catalogue, so the rows come out in
    // the order the user arranged them. A key with no channel behind it is
    // skipped: a source can be removed while its favourites remain.
    case "favorites": {
      if (!favorites?.keys.length) return []
      return favorites.keys
        .map((key) => byKey.get(key))
        .filter((channel): channel is PortalChannelWithSource => Boolean(channel))
    }

    case "category":
      return channels.filter(
        (channel) =>
          (channel.genre || "Uncategorized") === filter.genre &&
          (filter.sourceId === undefined ||
            (channel.portalSource?.id ?? 0) === filter.sourceId),
      )

    // Same again — a group carries its own per-group ordering.
    case "favoriteGroup": {
      const group = groups?.find((entry) => entry.id === filter.groupId)
      if (!group) return []
      return group.channelKeys
        .map((key) => byKey.get(key))
        .filter((channel): channel is PortalChannelWithSource => Boolean(channel))
    }
  }
}
