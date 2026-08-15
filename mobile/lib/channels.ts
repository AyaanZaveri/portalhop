import { useCallback, useEffect, useMemo, useState } from "react"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  getChannelKey,
  getFavoriteKey,
  isFavoriteKeyed,
} from "@portalhop/shared/channel-keys"
import {
  channelNameKey,
  groupChannels,
  identityKeyFor,
  orderByChosenSource,
  trustedGuideIds,
  IDENTITY_NAME_LIMIT,
} from "@portalhop/shared/channel-grouping"
import type { PortalChannel } from "@portalhop/shared/stalker-types"
import type { SavedSourceRecord } from "@portalhop/shared/source-types"
import type { UserSettingsData } from "@portalhop/shared/user-settings"
import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"

import { apiJson } from "./api"
import { loadSelectedPortalIds } from "./preferences"
import { useChannelSourceOrder } from "./source-order"

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
  /**
   * The guide id, normalized, so search can match it without normalizing tens
   * of thousands of ids per keystroke. Empty when the channel has no id, which
   * is common enough that search has to expect it.
   */
  searchId: string
  /**
   * What the channel is, as opposed to what this copy of it is.
   *
   * "id:<guide id>", or null for a channel with no guide id — see
   * identityKeyFor. Favourites are stored under it, so it is stamped once here
   * with the other per-channel answers rather than recomputed per filter pass.
   */
  identityKey: string | null
}

/** A channel as the list shows it: one row, with its streams behind it. */
export type ChannelWithStreams = PortalChannelWithSource & {
  /** Every stream carrying this channel, the chosen one first. */
  streams: PortalChannelWithSource[]
}

/**
 * The key a new favourite for this channel is written under, and whether it is
 * already favourited under any key it might carry.
 *
 * A favourite is a statement about a channel, not about one portal's copy of
 * it: keyed per copy, favouriting TSN 1 makes a favourite that disappears when
 * that one portal is dropped, even though four others still carry it. So a
 * channel with a guide id is favourited under that id, and one without keeps
 * the per-copy key, which is all it has.
 *
 * Readers must accept both, on every read rather than by migrating once — the
 * two are not alternatives in time. A catalogue holds channels of both kinds
 * permanently, and a channel gains a guide id the moment its match is fixed.
 */
export function favoriteKeyFor(channel: PortalChannelWithSource) {
  return getFavoriteKey(channel, channel.identityKey)
}

export function isFavorited(
  channel: PortalChannelWithSource,
  has: (key: string) => boolean,
) {
  return isFavoriteKeyed(channel, channel.identityKey, has)
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

  const { channels, trustedIds } = useMemo(() => {
    const flat = results.flatMap((result, index) => {
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
          // Filled in below: whether a guide id is an identity is a statistic
          // over the whole catalogue, so it cannot be answered one row at a
          // time — and a portal that writes "default" on ten thousand channels
          // would otherwise hand all ten thousand the same identity.
          identityKey: null as string | null,
          searchName: (channel.name ?? "").toLowerCase(),
          searchId: normalizeXmltvId(channel.xmltvId),
        }
      })
    })

    // The identity limit, not the grouping one: this set decides slugs,
    // favourite keys and stored defaults. See IDENTITY_NAME_LIMIT.
    const trusted = trustedGuideIds(flat, IDENTITY_NAME_LIMIT)
    // Assigned in place rather than mapped again: these objects were built a
    // line ago and nothing else has seen them, and a second pass over 59k rows
    // to add one field is a second 59k allocations.
    for (const channel of flat) {
      channel.identityKey = identityKeyFor(channel, trusted)
    }

    return { channels: flat, trustedIds: trusted }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- results and
    // portals are fresh arrays each render; the signature is what changes only
    // when a source's data does.
  }, [signature])

  /**
   * One row per channel rather than one per stream.
   *
   * The same channel arrives once from every portal that carries it, so twelve
   * sources hold twelve Nickelodeons. Grouped, the row is the channel and the
   * streams sit behind it — which is what makes a source something the app
   * picks rather than something the list makes you pick.
   *
   * Grouped here rather than in the screen, and in its own memo rather than the
   * one above, because the two change on different beats: the stamping runs
   * when a catalogue arrives, this also when the user picks a source.
   */
  const sourceOrder = useChannelSourceOrder(portals.length > 0)

  // Grouping and choosing are separate passes because they change on separate
  // beats: which streams belong together is a fact about the catalogue, and
  // only the choice of which one leads changes when the user taps a source.
  // Fused, every tap re-derived trusted guide ids across all 59k rows.
  const groups = useMemo(() => groupChannels(channels), [channels])

  const { rows, byKey } = useMemo(() => {
    const index = new Map<string, ChannelWithStreams>()

    const grouped = groups.map((group) => {
      // The user's chosen stream leads, so what the row plays and what the
      // sources sheet marks as the default are one decision rather than two.
      const streams = orderByChosenSource(group.members, sourceOrder, trustedIds)
      const row: ChannelWithStreams = { ...streams[0], streams }

      // Every key a favourite might be stored under maps to the row, because
      // that is the thing to show: the channel's own key, and each copy's,
      // since a favourite made before favourites belonged to channels names
      // one portal's copy and a channel can gain a guide id later.
      if (row.identityKey) index.set(row.identityKey, row)
      for (const stream of streams) index.set(stream.key, row)

      return row
    })

    return { rows: grouped, byKey: index }
  }, [groups, sourceOrder, trustedIds])

  return {
    /** Every stream, ungrouped. What categories are counted from. */
    streams: channels,
    /**
     * Which guide ids are identities rather than labels. Handed out because a
     * screen addressing a channel has to agree with the list that grouped it.
     */
    trustedIds,
    channels: rows,
    byKey,
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
    error: results.find((r) => r.error)?.error ?? null,
  }
}

/**
 * The streams for one guide id, from catalogues already in the cache.
 *
 * For the detail screen, which is deliberately given its channel as route
 * params rather than resolving a slug: rebuilding the merged catalogue there
 * would mean stamping and grouping tens of thousands of rows on a screen that
 * needs one channel's worth. This reads the same cached queries the list filled
 * — nothing is fetched — and only when the sheet is actually opened.
 *
 * By guide id alone, so a channel without one offers no sources. That is the
 * honest answer rather than a limitation worked around: without a guide id
 * there is no identity to store a default against either, so a picker there
 * could show a choice it could not keep.
 */
export function useCachedStreams(enabled: boolean) {
  const queryClient = useQueryClient()
  const sourceOrder = useChannelSourceOrder(enabled)

  /**
   * Only the sources the user is browsing with.
   *
   * A catalogue stays in the persisted cache after its portal is switched off,
   * so scanning everything cached would offer streams from portals the list is
   * not showing — and, worse, could rank one of them first, so the sheet's top
   * row and the row the list plays would be different streams. An empty
   * selection means "all", which is what the list means by it too.
   */
  const [selectedPortalIds, setSelectedPortalIds] = useState<Set<number>>(
    () => new Set(),
  )

  useEffect(() => {
    let cancelled = false
    void loadSelectedPortalIds().then((ids) => {
      if (!cancelled) setSelectedPortalIds(ids)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return useCallback(
    (xmltvId: string | undefined): PortalChannelWithSource[] => {
      const id = normalizeXmltvId(xmltvId)
      if (!id) return []

      const portals = (
        queryClient.getQueryData<{ portals: SavedSourceRecord[] }>([
          "portals",
        ])?.portals ?? []
      ).filter(
        (portal) => !selectedPortalIds.size || selectedPortalIds.has(portal.id),
      )
      const names = new Map(portals.map((portal) => [portal.id, portal.name]))

      const streams: PortalChannelWithSource[] = []
      // Keyed by saved-channel id: a re-synced source leaves its previous
      // catalogue in the cache under an older updatedAt, and both would answer.
      const seen = new Set<number>()

      for (const [key, data] of queryClient.getQueriesData<{
        channels: PortalChannel[]
      }>({ queryKey: ["portal"] })) {
        const portalId = Number(key[1])
        const name = names.get(portalId)
        if (!data || name === undefined) continue

        for (const channel of data.channels) {
          if (normalizeXmltvId(channel.xmltvId) !== id) continue
          if (channel.savedChannelId != null) {
            if (seen.has(channel.savedChannelId)) continue
            seen.add(channel.savedChannelId)
          }

          const withSource = {
            ...channel,
            portalSource: { id: portalId, name },
          }
          streams.push({
            ...withSource,
            key: getChannelKey(withSource),
            identityKey: null,
            searchName: (channel.name ?? "").toLowerCase(),
            searchId: id,
          })
        }
      }

      /**
       * Whether this id is an identity, asked of this id alone.
       *
       * trustedGuideIds answers the same question for a whole catalogue and
       * needs a pass over all of it; restricted to one id the answer is already
       * in hand, because the streams wearing it are exactly what was just
       * collected. An id covering more differently-named channels than the
       * measured limit is a label a portal writes on everything — "default" is
       * ten thousand channels under four thousand names — and those are not
       * sources of one channel, they are the whole catalogue.
       */
      const distinctNames = new Set(
        streams.map((stream) => channelNameKey(stream.name ?? "")),
      )
      if (distinctNames.size > IDENTITY_NAME_LIMIT) return []

      const trusted = new Set([id])
      for (const stream of streams) {
        stream.identityKey = identityKeyFor(stream, trusted)
      }

      return orderByChosenSource(streams, sourceOrder, trusted)
    },
    [queryClient, selectedPortalIds, sourceOrder],
  )
}
