"use client"

import {
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import type { PortalChannel, PortalResponse } from "@portalhop/shared/stalker-types"
import type { SourceRequest } from "@portalhop/shared/source-types"
import { normalizeXmltvId } from "@portalhop/shared/xmltv-id"
import { proxyImageUrl } from "@portalhop/shared/image-proxy"
import {
  resolveChannelEpg,
  type EpgChoice,
  type EpgKind,
} from "@portalhop/shared/epg-preference"
import {
  withNewReading,
  type StreamInfo,
} from "@portalhop/shared/stream-info"
import {
  groupKeyFor,
  identityKeyFor,
  orderByChosenSource,
  trustedGuideIds,
  IDENTITY_NAME_LIMIT,
  type ChannelSourceOrder,
} from "@portalhop/shared/channel-grouping"
import {
  browseFilterCookieName,
  parseBrowseFilter,
  type BrowseFilter,
} from "@portalhop/shared/browse-filter"
import { useFavorites, useFavoritesSync } from "@/hooks/use-favorites"
import { useUserSettings } from "@/hooks/use-user-settings"
import { IPTV_ORG_SOURCE_ID, IPTV_ORG_SOURCE_NAME } from "@/lib/iptv-org"
import {
  getCachedIptvOrgChannels,
  prunePortalChannelsCache,
  setCachedIptvOrgChannels,
} from "@/lib/portal-channels-cache"
import {
  buildChannelIndex,
  channelSlug as channelSlugFor,
  defaultSourceRequest,
  getChannelKey,
  getFavoriteKey,
  isFavoriteKeyed,
  getLegacyChannelKey,
  getPortalSource,
  loadPortalChannels,
  type LoadedPortal,
  type PortalChannelWithSource,
  type PortalSource,
  type SavedPortalRecord,
} from "@/lib/tv-channels"
import { apiFetch } from "@/lib/api-fetch"

export type { BrowseFilter } from "@portalhop/shared/browse-filter"

const browseFilterStoragePrefix = "portalhop-browse-filter:"

function readSavedBrowseFilter(userId: string | null): BrowseFilter | null {
  if (typeof window === "undefined") return null
  return parseBrowseFilter(
    localStorage.getItem(`${browseFilterStoragePrefix}${userId ?? "guest"}`) ?? undefined,
  )
}

type TvContextValue = {
  // Channel data
  browserChannels: PortalChannelWithSource[]
  filteredChannels: PortalChannelWithSource[]
  channelIndex: Map<string, PortalChannelWithSource>
  channelSlug: (channel: PortalChannelWithSource) => string
  /** The channel's own artwork, the same wherever the channel is drawn. */
  channelLogoUrl: (channel: PortalChannelWithSource) => string
  /** Every stream carrying this channel, the chosen one first. */
  channelStreams: (channel: PortalChannelWithSource) => PortalChannelWithSource[]
  /** Which of a channel's streams supplies its guide, and whether that was pinned. */
  channelEpg: (channel: PortalChannelWithSource) => EpgChoice | null
  /** Pins a channel's guide to one stream, or clears the pin with null. */
  setChannelEpgChoice: (
    identityKey: string,
    savedChannelId: number | null,
  ) => void
  epgKindOrder: EpgKind[]
  /** What a channel is, for anything that stores or addresses one. */
  identityKeyOf: (channel: PortalChannelWithSource) => string | null
  /**
   * Which guide ids are identities rather than labels, over this catalogue.
   *
   * Handed out rather than recomputed per consumer: it is a whole-catalogue
   * statistic, so two consumers computing it over different sets would disagree
   * about which channel a row is.
   */
  trustedIds: ReadonlySet<string>
  /** What each watched stream turned out to be, by saved channel id. */
  streamInfo: Record<number, StreamInfo>
  /** Records what a stream turned out to be, and shows it at once. */
  recordStreamInfo: (
    savedChannelId: number,
    info: Omit<StreamInfo, "seenAt">,
  ) => void
  /** Which stream each channel plays, most preferred first. */
  sourceOrder: ChannelSourceOrder
  setChannelSourceOrder: (identityKey: string, savedChannelIds: number[]) => void
  epgChannels: Record<
    string,
    { name: string; logoUrl?: string; countryCode?: string }
  >
  customEpgChannels: Record<number, Record<string, { logoUrl?: string }>>

  // Settings / session
  userId: string | null
  settingsLoaded: boolean
  useProxy: boolean
  useImageProxy: boolean
  iptvOrgEnabled: boolean
  enabledSourceIds: number[]
  hiddenCategories: { sourceId: number; category: string }[]
  setCategoryHidden: (
    category: { sourceId: number; category: string },
    hidden: boolean,
  ) => void
  updateSettings: ReturnType<typeof useUserSettings>["updateSettings"]

  // Preview (unsaved "View" source)
  endpoint: string
  previewSourceRequest: SourceRequest

  // Loading
  isLoadingPortals: boolean
  reloadPortals: () => void
  applyChannelXmltvId: (
    sourceId: number,
    savedChannelId: number,
    xmltvId: string,
    logoUrl?: string,
  ) => void
  iptvOrgLoading: boolean

  // Search + filters
  query: string
  setQuery: (value: string) => void
  browseFilter: BrowseFilter
  chooseFilter: (filter: BrowseFilter) => void
  selectedPortalIds: Set<number>
  setSelectedPortalIds: (value: Set<number>) => void
  togglePortal: (portalId: number, checked: boolean) => void
  categoryMenuOpen: boolean
  setCategoryMenuOpen: (open: boolean) => void
  categorySearch: string
  setCategorySearch: (value: string) => void

  // Favorites
  favorites: Set<string>
  isChannelFavorited: (channel: PortalChannelWithSource) => boolean
  /** The key a new favourite for this channel should be written under. */
  favoriteKeyFor: (channel: PortalChannelWithSource) => string
  toggleFavorite: (key: string) => void

  // Add-portal sheet
  sheetOpen: boolean
  setSheetOpen: (open: boolean) => void
  onSheetSaved: (
    portal: SavedPortalRecord,
    activeResult: PortalResponse,
  ) => void
  onSheetView: (viewResult: PortalResponse, request: SourceRequest) => void
}

const TvContext = createContext<TvContextValue | null>(null)
const emptyEpgChannels: Record<
  string,
  { name: string; logoUrl?: string; countryCode?: string }
> = {}
const emptyCustomEpgChannels: Record<number, Record<string, { logoUrl?: string }>> = {}

export function useTv() {
  const context = useContext(TvContext)
  if (!context) {
    throw new Error("useTv must be used within a TvProvider")
  }
  return context
}

export function TvProvider({
  children,
  initialBrowseFilter = null,
}: {
  children: ReactNode
  initialBrowseFilter?: BrowseFilter | null
}) {
  useFavoritesSync()
  const { settings, settingsLoaded, userId, updateSettings } = useUserSettings()
  const {
    enabledSourceIds,
    iptvOrgEnabled,
    useProxy,
    useImageProxy,
    epgKindOrder,
  } = settings
  const { favorites, isFavorite, toggleFavorite, migrateFavoriteKeys } =
    useFavorites()

  const [query, setQuery] = useState("")
  const [result, setResult] = useState<PortalResponse | null>(null)
  const [previewSourceRequest, setPreviewSourceRequest] =
    useState<SourceRequest>(defaultSourceRequest)
  const [loadedPortals, setLoadedPortals] = useState<
    Record<number, LoadedPortal>
  >({})
  const [isLoadingPortals, setIsLoadingPortals] = useState(true)
  // Bumped to re-run the portal load when something changed a saved channel
  // out from under the cached list.
  const [portalsNonce, setPortalsNonce] = useState(0)
  const reloadPortals = useCallback(() => setPortalsNonce((n) => n + 1), [])

  // Patches one channel in place after its guide match is reassigned. Reloading
  // the whole source would work — the save bumps its updatedAt, which is what
  // invalidates the IndexedDB cache — but that refetches every channel before
  // the one row changes. This updates it on the spot; the cache bump then keeps
  // it correct on the next visit.
  const applyChannelXmltvId = useCallback(
    (
      sourceId: number,
      savedChannelId: number,
      xmltvId: string,
      logoUrl?: string,
    ) => {
      setLoadedPortals((current) => {
        const entry = current[sourceId]
        if (!entry) return current

        return {
          ...current,
          [sourceId]: {
            ...entry,
            response: {
              ...entry.response,
              channels: entry.response.channels.map((channel) =>
                channel.savedChannelId === savedChannelId
                  ? {
                      ...channel,
                      xmltvId,
                      // getChannelLogoUrl falls through to the channel's own
                      // logoUrl, so the row keeps the old artwork unless this
                      // moves with the id. Left alone when clearing, since the
                      // provider's original logo is not known here — the cache
                      // bump restores it on the next load.
                      ...(logoUrl ? { logoUrl } : {}),
                    }
                  : channel,
              ),
            },
          },
        }
      })
    },
    [],
  )
  const [iptvOrgChannels, setIptvOrgChannels] = useState<
    PortalChannelWithSource[]
  >([])
  const [iptvOrgLoading, setIptvOrgLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [hiddenCategories, setHiddenCategories] = useState<
    { sourceId: number; category: string }[]
  >([])
  const epgChannels = emptyEpgChannels
  const customEpgChannels = emptyCustomEpgChannels

  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHiddenCategories([])
      return
    }

    apiFetch("/api/hidden-categories", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (Array.isArray(body?.hiddenCategories)) {
          setHiddenCategories(body.hiddenCategories)
        }
      })
      .catch(() => {})
  }, [userId])

  const setCategoryHidden = useCallback(
    (category: { sourceId: number; category: string }, hidden: boolean) => {
      if (!userId) return

      setHiddenCategories((current) =>
        hidden
          ? [...current, category]
          : current.filter(
            (entry) =>
              entry.sourceId !== category.sourceId ||
              entry.category !== category.category,
          ),
      )

      apiFetch("/api/hidden-categories", {
        method: hidden ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(category),
      }).catch(() => {})
    },
    [userId],
  )

  // Filters (previously split between Home and ChannelBrowser)
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const [categorySearch, setCategorySearch] = useState("")
  const [selectedPortalIds, setSelectedPortalIds] = useState<Set<number>>(
    () => new Set(),
  )

  const deferredQuery = useDeferredValue(query)

  // Built-in free iptv-org playlist. Fetched once when enabled; shown to all.
  useEffect(() => {
    if (!iptvOrgEnabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIptvOrgChannels([])
      setIptvOrgLoading(false)
      return
    }

    let cancelled = false

    const portalSource: PortalSource = {
      id: IPTV_ORG_SOURCE_ID,
      name: IPTV_ORG_SOURCE_NAME,
      endpoint: "",
      request: { sourceType: "m3u", playlistUrl: "" },
      epgMode: "iptv-org",
      epgSourceId: null,
    }
    const applyChannels = (channels: PortalChannel[]) => {
      setIptvOrgChannels(
        channels.map((channel) => ({
          ...channel,
          xmltvId: normalizeXmltvId(channel.xmltvId),
          portalSource,
        })),
      )
    }

    getCachedIptvOrgChannels()
      .then((cached) => {
        if (cancelled || !cached) return false
        applyChannels(cached)
        setIptvOrgLoading(false)
        return true
      })
      .then((usedCache) => {
        if (!usedCache && !cancelled) setIptvOrgLoading(true)
        return usedCache ? null : apiFetch("/api/iptv-org")
      })
      .then((res) => (res?.ok ? res.json() : null))
      .then((body) => {
        if (cancelled || !Array.isArray(body?.channels)) return
        const channels = body.channels as PortalChannel[]
        applyChannels(channels)
        setCachedIptvOrgChannels(channels, Date.now() + 6 * 60 * 60 * 1000)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIptvOrgLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [iptvOrgEnabled])

  const loadedPortalChannels = useMemo<PortalChannelWithSource[]>(() => {
    return Object.values(loadedPortals).flatMap(({ portal, response }) => {
      const portalSource = getPortalSource(portal)
      return response.channels.map((channel) => ({ ...channel, portalSource }))
    })
  }, [loadedPortals])

  const browserChannels = useMemo<PortalChannelWithSource[]>(() => {
    const userChannels = loadedPortalChannels.length
      ? loadedPortalChannels
      : (result?.channels ?? [])

    if (!iptvOrgChannels.length) {
      return userChannels
    }

    return [...userChannels, ...iptvOrgChannels]
  }, [loadedPortalChannels, result, iptvOrgChannels])

  const searchableChannels = useMemo(() => {
    return browserChannels.map((channel) => ({
      channel,
      searchText: [
        channel.number,
        channel.name,
        channel.xmltvId,
        channel.genre,
        channel.cmd,
        channel.portalSource?.name,
      ]
        .join(" ")
        .toLowerCase(),
    }))
  }, [browserChannels])

  const filteredChannels = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) {
      return browserChannels
    }
    return searchableChannels
      .filter((entry) => entry.searchText.includes(q))
      .map((entry) => entry.channel)
  }, [browserChannels, deferredQuery, searchableChannels])

  /**
   * Which stream each channel plays, as the user has chosen it.
   *
   * Loaded once per session from the one table that holds it. Kept here rather
   * than in the sources drawer because two things read it — the drawer, and the
   * index that resolves a deep link — and if they read different copies then
   * following a link plays a different stream from the one the drawer says is
   * first, which is the whole thing the choice was supposed to fix.
   */
  const [sourceOrder, setSourceOrderState] = useState<ChannelSourceOrder>({})

  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSourceOrderState({})
      return
    }

    let current = true
    apiFetch("/api/channel-source-order", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (current && body?.order) setSourceOrderState(body.order)
      })
      .catch(() => {})

    return () => {
      current = false
    }
  }, [userId])


  /**
   * Applied here and saved in the background.
   *
   * Optimistic because the answer is already known: the user dragged a row, or
   * tapped one, and the list has to be in the new order under their finger. A
   * failed write leaves the app one refresh from the truth, which is the right
   * way round for a preference — the alternative is a list that ignores the
   * gesture until the network agrees.
   */
  const setChannelSourceOrder = useCallback(
    (identityKey: string, savedChannelIds: number[]) => {
      setSourceOrderState((current) => ({
        ...current,
        [identityKey]: savedChannelIds,
      }))

      apiFetch("/api/channel-source-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityKey, savedChannelIds }),
      })
        .then((response) => {
          if (!response.ok) throw new Error()
        })
        .catch(() => {
          toast.error("Could not save which source plays first.")
        })
    },
    [],
  )

  /**
   * Channels whose guide the user has pinned, as identity key -> stream.
   *
   * Sparse, and deliberately so: nothing writes the automatic choice down, so a
   * key here always means someone overruled the ranking. That is what lets the
   * global ranking change without disturbing the handful of channels that were
   * decided by hand — there is no stored default for it to be confused with.
   */
  const [epgChoices, setEpgChoices] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEpgChoices({})
      return
    }

    let current = true
    apiFetch("/api/channel-epg-choice", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (current && body?.choices) setEpgChoices(body.choices)
      })
      .catch(() => {})

    return () => {
      current = false
    }
  }, [userId])

  /** Optimistic, for the reason setChannelSourceOrder is. */
  const setChannelEpgChoice = useCallback(
    (identityKey: string, savedChannelId: number | null) => {
      setEpgChoices((current) => {
        const next = { ...current }
        if (savedChannelId == null) delete next[identityKey]
        else next[identityKey] = savedChannelId
        return next
      })

      apiFetch("/api/channel-epg-choice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityKey, savedChannelId }),
      })
        .then((response) => {
          if (!response.ok) throw new Error()
        })
        .catch(() => {
          toast.error("Could not save which guide this channel uses.")
        })
    },
    [],
  )

  /**
   * What each stream turned out to be, where one has been watched.
   *
   * Sparse and read once per session, like the source order beside it. The
   * sources drawer is what it is for: five copies of a channel, and no other
   * way to tell which is the 4K one without opening each in turn.
   */
  const [streamInfo, setStreamInfo] = useState<Record<number, StreamInfo>>({})

  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStreamInfo({})
      return
    }

    let current = true
    apiFetch("/api/stream-info", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (current && body?.info) setStreamInfo(body.info)
      })
      .catch(() => {})

    return () => {
      current = false
    }
  }, [userId])

  /**
   * Writes a reading down, and shows it immediately.
   *
   * The write lives here rather than in the player because the map does. Sent
   * straight from the player, the row reached the database and nothing on
   * screen knew: the map is read once a session, so the sources drawer went on
   * showing what it had loaded with, and the figures for the stream playing
   * right now only appeared after a reload. Which is the one stream the viewer
   * has just proved something about.
   *
   * The local copy is updated first and not rolled back. There is nothing to
   * roll back to -- the alternative to this reading is no reading -- and a
   * failed write costs a badge until the next play, which is the same nothing
   * it cost before.
   */
  const recordStreamInfo = useCallback(
    (savedChannelId: number, info: Omit<StreamInfo, "seenAt">) => {
      // Merged the way the table merges it, so the drawer never shows less than
      // the row holds. A player reports the figures it has and nulls for the
      // rest, and replacing the entry outright would blank a frame rate on
      // screen that the server had just been told to keep.
      setStreamInfo((current) => ({
        ...current,
        [savedChannelId]: withNewReading(current[savedChannelId], {
          ...info,
          seenAt: new Date().toISOString(),
        }),
      }))

      // A by-product of watching television, not an action anyone took: a
      // failure is worth nothing on screen, and the next play reports again.
      void apiFetch("/api/stream-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedChannelId, ...info }),
      }).catch(() => {})
    },
    [],
  )

  const channelIndex = useMemo(
    () => buildChannelIndex(browserChannels, userId, sourceOrder),
    [browserChannels, userId, sourceOrder],
  )

  /**
   * Every stream in the catalogue, grouped by the channel it is a copy of.
   *
   * Over the whole catalogue rather than whatever is on screen, because which
   * streams a channel has is a fact about the catalogue. It is also the only
   * way two places can agree: the list groups what it is showing and the player
   * resolves a slug, and those are different sets — a filter or a search can
   * leave one member visible and hide the other four, which is enough to change
   * which member either one lands on.
   */
  const catalogueGroups = useMemo(() => {
    const trusted = trustedGuideIds(browserChannels)
    // A looser limit, because being denied an identity costs a channel its
    // shareable link and its saved default while merging two costs the second
    // one any way of being reached at all. See IDENTITY_NAME_LIMIT.
    const identityTrusted = trustedGuideIds(
      browserChannels,
      IDENTITY_NAME_LIMIT,
    )
    const streams = new Map<string, PortalChannelWithSource[]>()

    for (const channel of browserChannels) {
      const key = groupKeyFor(channel, trusted)?.key
      if (!key) continue
      const members = streams.get(key)
      if (members) members.push(channel)
      else streams.set(key, [channel])
    }

    return { trusted, identityTrusted, streams }
  }, [browserChannels])

  /**
   * The streams behind a channel, the chosen one first.
   *
   * From the whole-catalogue grouping rather than a fresh one per caller, so
   * the sources drawer, the failover and the list cannot disagree about what a
   * channel's sources are or which of them leads.
   */
  const channelStreams = useCallback(
    (channel: PortalChannelWithSource) => {
      const key = groupKeyFor(channel, catalogueGroups.trusted)?.key
      const streams = (key && catalogueGroups.streams.get(key)) || [channel]
      return orderByChosenSource(
        streams,
        sourceOrder,
        catalogueGroups.identityTrusted,
      )
    },
    [catalogueGroups, sourceOrder],
  )

  /**
   * Which of a channel's streams supplies its guide.
   *
   * One answer per channel, not per stream — the same shape as channelLogoUrl a
   * few lines up, and for the same reason. Every source carrying a channel is
   * describing the same broadcast, so reading the schedule off whichever stream
   * happens to be playing made the guide change when the picture did not, and
   * made a channel on eight sources need its match corrected eight times.
   *
   * Ranked by what kind of guide it is rather than by which stream plays, so
   * dragging a source to the top for a better picture leaves the schedule
   * alone. See packages/shared/src/epg-preference.ts.
   */
  const channelEpg = useCallback(
    (channel: PortalChannelWithSource) => {
      const identityKey = identityKeyFor(
        channel,
        catalogueGroups.identityTrusted,
      )
      return resolveChannelEpg(channelStreams(channel), {
        kindOrder: epgKindOrder,
        pinnedSavedChannelId: identityKey ? epgChoices[identityKey] : null,
      })
    },
    [catalogueGroups, channelStreams, epgChoices, epgKindOrder],
  )

  /**
   * What a channel looks like, wherever it is drawn.
   *
   * Not a property of any one of its streams, which is the bug this replaces:
   * both the row and the header were resolving a logo from whichever member
   * they happened to be holding, so they disagreed with each other, and the
   * artwork above the player changed when the default source did — as though
   * picking a different pipe had changed the channel.
   *
   * So: the guide's mark if any stream has one, which is every stream with a
   * guide match, since /api/portals/[id] puts the guide's logo in logoUrl and
   * leaves the portal's own in sourceLogoUrl. Failing that, the first artwork
   * in the catalogue's own order.
   *
   * Deliberately not a function of sourceOrder. A channel does not change what
   * it looks like because someone chose which portal should carry it.
   */
  const channelLogoUrl = useCallback(
    (channel: PortalChannelWithSource) => {
      const key = groupKeyFor(channel, catalogueGroups.trusted)?.key
      const streams = (key && catalogueGroups.streams.get(key)) || [channel]

      const fromGuide = streams.find(
        (stream) => stream.logoUrl && stream.logoUrl !== stream.sourceLogoUrl,
      )
      const logoUrl =
        fromGuide?.logoUrl ||
        streams.find((stream) => stream.logoUrl)?.logoUrl ||
        ""

      return logoUrl ? proxyImageUrl(logoUrl, useImageProxy) : ""
    },
    [catalogueGroups, useImageProxy],
  )

  const channelSlug = useCallback(
    (channel: PortalChannelWithSource) =>
      channelSlugFor(channel, userId, catalogueGroups.identityTrusted),
    [catalogueGroups, userId],
  )

  /**
   * What a channel is, for anything that stores or addresses one.
   *
   * The trusted set comes from the same grouping the rows are built from, so a
   * favourite, a source choice and a URL all agree with the list about which
   * channel they are for.
   */
  const identityKeyOf = useCallback(
    (channel: PortalChannelWithSource) =>
      identityKeyFor(channel, catalogueGroups.identityTrusted),
    [catalogueGroups],
  )

  // Which saved sources appear is a per-user, DB-synced setting.
  const enabledKey = enabledSourceIds.join(",")
  useEffect(() => {
    if (!settingsLoaded) {
      return
    }

    let isMounted = true

    async function loadSavedPortals() {
      setIsLoadingPortals(true)
      try {
        if (!enabledSourceIds.length) {
          if (isMounted) setLoadedPortals({})
          return
        }

        const response = await apiFetch("/api/portals", { cache: "no-store" })
        const data = await response.json().catch(() => ({ portals: [] }))
        const portals = Array.isArray(data.portals)
          ? (data.portals as SavedPortalRecord[])
          : []

        if (!isMounted) return

        const portalsToOpen = portals.filter((portal) =>
          enabledSourceIds.includes(portal.id),
        )

        prunePortalChannelsCache(portals.map((portal) => portal.id))

        const loaded: Record<number, LoadedPortal> = {}

        for (const portal of portalsToOpen) {
          if (!isMounted) return
          try {
            const portalResult = await loadPortalChannels(portal)
            if (!isMounted) return
            loaded[portal.id] = { portal, response: portalResult }
            setLoadedPortals((current) => ({
              ...current,
              [portal.id]: { portal, response: portalResult },
            }))
          } catch (error) {
            if (!isMounted) return
            toast.error(
              error instanceof Error
                ? error.message
                : "Could not load a saved portal.",
            )
          }
        }

        if (isMounted) setLoadedPortals(loaded)
      } catch (error) {
        if (!isMounted) return
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not load saved portals.",
        )
      } finally {
        if (isMounted) setIsLoadingPortals(false)
      }
    }

    loadSavedPortals()

    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, enabledKey, portalsNonce])

  /**
   * Favorites: consider a channel favorited under any key it might carry.
   *
   * Three now, not two. A channel with a guide id is favourited under that id
   * so the favourite belongs to the channel rather than to whichever portal it
   * was made from, but the per-copy key stays readable: existing favourites
   * were written under it, and 62% of a real catalogue has no guide id and
   * never will. A channel can also move between the two when the enrichment
   * pass or a hand-picked match gives it an id, so neither replaces the other
   * in time and both are checked on every read.
   */
  const isChannelFavorited = useCallback(
    (channel: PortalChannelWithSource) =>
      isFavoriteKeyed(channel, identityKeyOf(channel), isFavorite) ||
      isFavorite(getLegacyChannelKey(channel)),
    [identityKeyOf, isFavorite],
  )

  /** The key a new favourite is written under. */
  const favoriteKeyFor = useCallback(
    (channel: PortalChannelWithSource) =>
      getFavoriteKey(channel, identityKeyOf(channel)),
    [identityKeyOf],
  )

  // Migrate legacy favorite keys once channels are loaded. A legacy key can map
  // to multiple current keys (duplicate guide metadata), so values are arrays.
  useEffect(() => {
    const mappings = new Map<string, string[]>()
    const savedChannelKeys = new Map<number, string>()
    for (const channel of browserChannels) {
      if (typeof channel.savedChannelId === "number") {
        savedChannelKeys.set(channel.savedChannelId, getChannelKey(channel))
      }
      const legacyKey = getLegacyChannelKey(channel)
      if (!favorites.has(legacyKey)) continue
      const current = mappings.get(legacyKey) ?? []
      current.push(getChannelKey(channel))
      mappings.set(legacyKey, current)
    }

    // Older saved-channel keys included the full stream command. Catalogues
    // now deliberately omit that command, so replace those keys with the
    // stable database row id without making existing favorites disappear.
    for (const key of favorites) {
      try {
        const parsed = JSON.parse(key)
        const savedChannelId = Array.isArray(parsed) ? parsed[1] : null
        if (typeof savedChannelId !== "number") continue
        const current = savedChannelKeys.get(savedChannelId)
        if (current && current !== key) mappings.set(key, [current])
      } catch {}
    }

    /**
     * And a key that names one portal's copy becomes the channel's own.
     *
     * The visible symptom is a favourite disappearing when its source is turned
     * off, while four other portals still carry the channel — the star was
     * attached to the copy rather than to the thing. Most of these are rows
     * written before favourites belonged to channels, and a one-off migration
     * covers those; this is here for the ones that arrive afterwards, when a
     * channel gains a guide id from the enrichment pass or from someone fixing
     * its match by hand, and its favourite is left behind on the old key.
     *
     * Only while the source is loaded, which is the limit of what a client can
     * do: a per-copy key cannot be resolved without the copy.
     */
    for (const channel of browserChannels) {
      const identityKey = identityKeyOf(channel)
      if (!identityKey) continue
      const copyKey = getChannelKey(channel)
      if (copyKey === identityKey || !favorites.has(copyKey)) continue
      mappings.set(copyKey, [identityKey])
    }

    if (mappings.size) migrateFavoriteKeys(mappings)
  }, [browserChannels, favorites, identityKeyOf, migrateFavoriteKeys])

  const favoriteCount = useMemo(
    () => browserChannels.filter(isChannelFavorited).length,
    [browserChannels, isChannelFavorited],
  )

  // Auto-default the filter to favorites/all until the user picks one.
  const [browseFilter, setBrowseFilter] = useState<BrowseFilter>(
    initialBrowseFilter ?? { type: "all" },
  )
  const userChoseFilter = useRef(initialBrowseFilter !== null)
  const [browseFilterRestored, setBrowseFilterRestored] = useState(
    initialBrowseFilter !== null,
  )

  useEffect(() => {
    if (!settingsLoaded) return
    const saved = readSavedBrowseFilter(userId)
    const restore = window.setTimeout(() => {
      if (saved) {
        userChoseFilter.current = true
        setBrowseFilter(saved)
      } else {
        userChoseFilter.current = false
      }
      setBrowseFilterRestored(true)
    }, 0)
    return () => window.clearTimeout(restore)
  }, [settingsLoaded, userId])

  useEffect(() => {
    if (!browseFilterRestored || userChoseFilter.current) return
    setBrowseFilter(favoriteCount > 0 ? { type: "favorites" } : { type: "all" })
  }, [browseFilterRestored, favoriteCount])

  useEffect(() => {
    if (!browseFilterRestored || typeof window === "undefined") return
    try {
      localStorage.setItem(
        `${browseFilterStoragePrefix}${userId ?? "guest"}`,
        JSON.stringify(browseFilter),
      )
      document.cookie = `${browseFilterCookieName}=${encodeURIComponent(JSON.stringify(browseFilter))}; Path=/; Max-Age=31536000; SameSite=Lax`
    } catch {}
  }, [browseFilter, browseFilterRestored, userId])

  const chooseFilter = useCallback((filter: BrowseFilter) => {
    userChoseFilter.current = true
    setBrowseFilter(filter)
  }, [])

  const togglePortal = useCallback(
    (portalId: number, checked: boolean) => {
      chooseFilter({ type: "all" })
      setSelectedPortalIds((current) => {
        const next = new Set(current)
        if (checked) {
          next.add(portalId)
        } else {
          next.delete(portalId)
        }
        return next
      })
    },
    [chooseFilter],
  )

  const onSheetSaved = useCallback(
    (portal: SavedPortalRecord, activeResult: PortalResponse) => {
      setLoadedPortals((current) => ({
        ...current,
        [portal.id]: { portal, response: activeResult },
      }))
      updateSettings({
        enabledSourceIds: [...enabledSourceIds, portal.id],
      })
    },
    [enabledSourceIds, updateSettings],
  )

  const onSheetView = useCallback(
    (viewResult: PortalResponse, request: SourceRequest) => {
      setLoadedPortals({})
      setResult(viewResult)
      setPreviewSourceRequest(request)
    },
    [],
  )

  const value = useMemo<TvContextValue>(
    () => ({
      browserChannels,
      filteredChannels,
      channelIndex,
      channelSlug,
      channelLogoUrl,
      channelStreams,
      channelEpg,
      setChannelEpgChoice,
      epgKindOrder,
      streamInfo,
      recordStreamInfo,
      identityKeyOf,
      trustedIds: catalogueGroups.identityTrusted,
      sourceOrder,
      setChannelSourceOrder,
      epgChannels,
      customEpgChannels,
      userId,
      settingsLoaded,
      useProxy,
      useImageProxy,
      iptvOrgEnabled,
      enabledSourceIds,
      hiddenCategories,
      setCategoryHidden,
      updateSettings,
      endpoint: result?.endpoint ?? "",
      previewSourceRequest,
      isLoadingPortals,
      reloadPortals,
      applyChannelXmltvId,
      iptvOrgLoading,
      query,
      setQuery,
      browseFilter,
      chooseFilter,
      selectedPortalIds,
      setSelectedPortalIds,
      togglePortal,
      categoryMenuOpen,
      setCategoryMenuOpen,
      categorySearch,
      setCategorySearch,
      favorites,
      isChannelFavorited,
      favoriteKeyFor,
      toggleFavorite,
      sheetOpen,
      setSheetOpen,
      onSheetSaved,
      onSheetView,
    }),
    [
      browserChannels,
      filteredChannels,
      channelIndex,
      channelSlug,
      channelLogoUrl,
      channelStreams,
      channelEpg,
      setChannelEpgChoice,
      epgKindOrder,
      streamInfo,
      recordStreamInfo,
      identityKeyOf,
      catalogueGroups,
      sourceOrder,
      setChannelSourceOrder,
      epgChannels,
      customEpgChannels,
      userId,
      settingsLoaded,
      useProxy,
      useImageProxy,
      iptvOrgEnabled,
      enabledSourceIds,
      hiddenCategories,
      setCategoryHidden,
      updateSettings,
      result,
      previewSourceRequest,
      isLoadingPortals,
      reloadPortals,
      applyChannelXmltvId,
      iptvOrgLoading,
      query,
      browseFilter,
      chooseFilter,
      selectedPortalIds,
      togglePortal,
      categoryMenuOpen,
      categorySearch,
      favorites,
      isChannelFavorited,
      favoriteKeyFor,
      toggleFavorite,
      sheetOpen,
      onSheetSaved,
      onSheetView,
    ],
  )

  return <TvContext.Provider value={value}>{children}</TvContext.Provider>
}
