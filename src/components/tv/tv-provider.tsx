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
import { identityKeyFor } from "@portalhop/shared/channel-grouping"
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

  const channelIndex = useMemo(
    () => buildChannelIndex(browserChannels, userId),
    [browserChannels, userId],
  )

  const channelSlug = useCallback(
    (channel: PortalChannelWithSource) => channelSlugFor(channel, userId),
    [userId],
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
      isFavoriteKeyed(channel, identityKeyFor(channel), isFavorite) ||
      isFavorite(getLegacyChannelKey(channel)),
    [isFavorite],
  )

  /** The key a new favourite is written under. */
  const favoriteKeyFor = useCallback(
    (channel: PortalChannelWithSource) =>
      getFavoriteKey(channel, identityKeyFor(channel)),
    [],
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
    if (mappings.size) migrateFavoriteKeys(mappings)
  }, [browserChannels, favorites, migrateFavoriteKeys])

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
