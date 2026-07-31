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

import type { PortalChannel, PortalResponse } from "@/lib/stalker-types"
import type { SourceRequest } from "@/lib/source-types"
import { normalizeXmltvId } from "@/lib/xmltv-id"
import { useFavorites, useFavoritesSync } from "@/hooks/use-favorites"
import { useUserSettings } from "@/hooks/use-user-settings"
import { IPTV_ORG_SOURCE_ID, IPTV_ORG_SOURCE_NAME } from "@/lib/iptv-org"
import { prunePortalChannelsCache } from "@/lib/portal-channels-cache"
import {
  buildChannelIndex,
  channelSlug as channelSlugFor,
  defaultSourceRequest,
  getChannelKey,
  getLegacyChannelKey,
  getPortalSource,
  loadPortalChannels,
  type LoadedPortal,
  type PortalChannelWithSource,
  type PortalSource,
  type SavedPortalRecord,
} from "@/lib/tv-channels"

export type BrowseFilter =
  { type: "favorites" } | { type: "all" } | { type: "category"; genre: string }

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
  updateSettings: ReturnType<typeof useUserSettings>["updateSettings"]

  // Preview (unsaved "View" source)
  endpoint: string
  previewSourceRequest: SourceRequest

  // Loading
  isLoadingPortals: boolean
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

export function useTv() {
  const context = useContext(TvContext)
  if (!context) {
    throw new Error("useTv must be used within a TvProvider")
  }
  return context
}

export function TvProvider({ children }: { children: ReactNode }) {
  useFavoritesSync()
  const { settings, settingsLoaded, userId, updateSettings } = useUserSettings()
  const { enabledSourceIds, iptvOrgEnabled, useProxy, useImageProxy } = settings
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
  const [iptvOrgChannels, setIptvOrgChannels] = useState<
    PortalChannelWithSource[]
  >([])
  const [iptvOrgLoading, setIptvOrgLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [epgChannels, setEpgChannels] = useState<
    Record<string, { name: string; logoUrl?: string; countryCode?: string }>
  >({})
  const [customEpgChannels, setCustomEpgChannels] = useState<
    Record<number, Record<string, { logoUrl?: string }>>
  >({})

  // Filters (previously split between Home and ChannelBrowser)
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const [categorySearch, setCategorySearch] = useState("")
  const [selectedPortalIds, setSelectedPortalIds] = useState<Set<number>>(
    () => new Set(),
  )

  const fetchEpgChannels = useCallback(async () => {
    try {
      const customIds = Object.values(loadedPortals)
        .map(({ portal }) =>
          portal.epgMode === "custom" ? portal.epgSourceId : null,
        )
        .filter((id): id is number => Number.isInteger(id))
      const res = await fetch(
        `/api/epg/channels${customIds.length ? `?sourceIds=${customIds.join(",")}` : ""}`,
      )
      if (!res.ok) throw new Error("Failed to fetch EPG channels")
      const channels = await res.json()
      setEpgChannels(channels.builtin ?? channels)
      setCustomEpgChannels(channels.custom ?? {})
    } catch (err) {
      console.error("Failed to load EPG channels:", err)
    }
  }, [loadedPortals])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEpgChannels()
  }, [fetchEpgChannels])

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
    setIptvOrgLoading(true)

    fetch("/api/iptv-org")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled || !Array.isArray(body?.channels)) return
        const portalSource: PortalSource = {
          id: IPTV_ORG_SOURCE_ID,
          name: IPTV_ORG_SOURCE_NAME,
          endpoint: "",
          request: { sourceType: "m3u", playlistUrl: "" },
          epgMode: "iptv-org",
          epgSourceId: null,
        }
        setIptvOrgChannels(
          (body.channels as PortalChannel[]).map((channel) => ({
            ...channel,
            xmltvId: normalizeXmltvId(channel.xmltvId),
            portalSource,
          })),
        )
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

        const response = await fetch("/api/portals", { cache: "no-store" })
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
  }, [settingsLoaded, enabledKey])

  // Favorites: consider a channel favorited under the new or legacy key.
  const isChannelFavorited = useCallback(
    (channel: PortalChannelWithSource) =>
      isFavorite(getChannelKey(channel)) ||
      isFavorite(getLegacyChannelKey(channel)),
    [isFavorite],
  )

  // Migrate legacy favorite keys once channels are loaded. A legacy key can map
  // to multiple current keys (duplicate guide metadata), so values are arrays.
  useEffect(() => {
    const mappings = new Map<string, string[]>()
    for (const channel of browserChannels) {
      const legacyKey = getLegacyChannelKey(channel)
      if (!favorites.has(legacyKey)) continue
      const current = mappings.get(legacyKey) ?? []
      current.push(getChannelKey(channel))
      mappings.set(legacyKey, current)
    }
    if (mappings.size) migrateFavoriteKeys(mappings)
  }, [browserChannels, favorites, migrateFavoriteKeys])

  const favoriteCount = useMemo(
    () => browserChannels.filter(isChannelFavorited).length,
    [browserChannels, isChannelFavorited],
  )

  // Auto-default the filter to favorites/all until the user picks one.
  const [browseFilter, setBrowseFilter] = useState<BrowseFilter>({
    type: "all",
  })
  const userChoseFilter = useRef(false)
  useEffect(() => {
    if (userChoseFilter.current) return
    setBrowseFilter(favoriteCount > 0 ? { type: "favorites" } : { type: "all" })
  }, [favoriteCount])

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
      updateSettings,
      endpoint: result?.endpoint ?? "",
      previewSourceRequest,
      isLoadingPortals,
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
      updateSettings,
      result,
      previewSourceRequest,
      isLoadingPortals,
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
      toggleFavorite,
      sheetOpen,
      onSheetSaved,
      onSheetView,
    ],
  )

  return <TvContext.Provider value={value}>{children}</TvContext.Provider>
}
