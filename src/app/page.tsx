"use client"

import {
  ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { toast } from "sonner"
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  LayoutGridIcon,
  Loader2Icon,
  RotateCcwIcon,
  RotateCwIcon,
  SearchIcon,
  StarIcon,
  TvIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  MediaPlayer,
  MediaPlayerControls,
  MediaPlayerControlsOverlay,
  MediaPlayerError,
  MediaPlayerFullscreen,
  MediaPlayerLoading,
  MediaPlayerPiP,
  MediaPlayerPlay,
  MediaPlayerSettings,
  MediaPlayerSeek,
  MediaPlayerSeekBackward,
  MediaPlayerSeekForward,
  MediaPlayerTime,
  MediaPlayerVideo,
  MediaPlayerVolume,
  MediaPlayerVolumeIndicator,
} from "@/components/ui/media-player"
import type { PortalChannel, PortalResponse } from "@/lib/stalker-types"
import type { SavedSourceRecord, SourceRequest } from "@/lib/source-types"
import type { EpgProgramme } from "@/lib/stalker-types"
import {
  Combobox,
  ComboboxTrigger,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox"
import { AuthDialog } from "@/components/auth-dialog"
import { copyTextToClipboard } from "@/lib/clipboard"
import { useFavorites, useFavoritesSync } from "@/hooks/use-favorites"
import { useUserSettings } from "@/hooks/use-user-settings"
import {
  IPTV_ORG_SOURCE_ID,
  IPTV_ORG_SOURCE_NAME,
} from "@/lib/iptv-org"
import { SettingsLink } from "@/components/settings-link"
import { CategoryVisual } from "@/components/category-visual"
import { PortalHopWordmark } from "@/components/portal-hop-wordmark"
import type { EpgManifest } from "@/lib/epg-store"
import MuxVideo from "@mux/mux-video-react"
import { Hls, getCoreReference } from "@mux/playback-core"
import { cn } from "@/lib/utils"
import { useHydratedLayout } from "@/hooks/use-hydrated-layout"
import { PrimaryMeshGradientBackdrop } from "@/components/mesh-gradient-backdrop"
import { AddPortalSheet } from "@/components/add-portal-sheet"

type SavedPortalRecord = SavedSourceRecord

type LoadedPortal = {
  portal: SavedPortalRecord
  response: PortalResponse
}

type PortalSource = {
  id: number
  name: string
  endpoint: string
  request: SourceRequest
}

type PortalChannelWithSource = PortalChannel & {
  portalSource?: PortalSource
}

type StreamVariant = {
  resolutionLabel: string
  frameRateLabel: string
}

const proxyManifestUrl =
  "https://nidhug95-mediaflow-proxy.hf.space/proxy/hls/manifest.m3u8"
const proxyApiPassword = "Nidhugxd123."

const defaultSourceRequest: SourceRequest = {
  sourceType: "stalker",
  portalUrl: "",
  mac: "",
  serial: "",
  deviceId: "",
  deviceId2: "",
  signature: "",
  timezone: "America/Toronto",
  stbType: "MAG254",
}

export default function Home() {
  useFavoritesSync()
  const { settings, settingsLoaded, userId, updateSettings } = useUserSettings()
  const { enabledSourceIds, iptvOrgEnabled, logoSource, useProxy } = settings
  const [query, setQuery] = useState("")
  const [result, setResult] = useState<PortalResponse | null>(null)
  const [previewSourceRequest, setPreviewSourceRequest] =
    useState<SourceRequest>(defaultSourceRequest)
  const [loadedPortals, setLoadedPortals] = useState<Record<number, LoadedPortal>>({})
  const [isLoadingPortals, setIsLoadingPortals] = useState(true)
  const [iptvOrgChannels, setIptvOrgChannels] = useState<
    PortalChannelWithSource[]
  >([])
  const [iptvOrgLoading, setIptvOrgLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [epgChannels, setEpgChannels] = useState<Record<string, { name: string; logoUrl?: string; countryCode?: string }>>({})

  const fetchEpgChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/epg/channels")
      if (!res.ok) throw new Error("Failed to fetch EPG channels")
      const channels = await res.json()
      setEpgChannels(channels)
    } catch (err) {
      console.error("Failed to load EPG channels:", err)
    }
  }, [])



  useEffect(() => {

    async function initEpg() {
      try {
        const res = await fetch("/api/epg")
        if (!res.ok) throw new Error("Failed to fetch manifest")
        const manifest: EpgManifest = await res.json()

        const isStale = !manifest.lastFetchedAt || (Date.now() - manifest.lastFetchedAt > 6 * 60 * 60 * 1000)
        const isEmpty = manifest.countries.length === 0

        if (isStale || isEmpty) {
          console.log("EPG data is stale or empty. Triggering background refetch...")
          fetch("/api/epg", { method: "POST" })
            .then(async (postRes) => {
              if (postRes.ok) {
                fetchEpgChannels()
              }
            })
            .catch((err) => console.error("Background EPG refetch failed:", err))
        }
      } catch (err) {
        console.error("Failed to initialize EPG:", err)
      }
    }

    initEpg()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEpgChannels()
  }, [fetchEpgChannels])

  const deferredQuery = useDeferredValue(query)

  // The built-in free iptv-org playlist. Fetched (and browser/CDN-cached) once
  // when enabled; shown to everyone, signed in or not.
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
        }
        setIptvOrgChannels(
          (body.channels as PortalChannel[]).map((channel) => ({
            ...channel,
            portalSource,
          }))
        )
      })
      .catch(() => { })
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

      return response.channels.map((channel) => ({
        ...channel,
        portalSource,
      }))
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
    const query = deferredQuery.trim().toLowerCase()

    if (!query) {
      return browserChannels
    }

    return searchableChannels
      .filter((entry) => entry.searchText.includes(query))
      .map((entry) => entry.channel)
  }, [browserChannels, deferredQuery, searchableChannels])

  // Which saved sources appear on the home page is a per-user, DB-synced setting
  // (settings.enabledSourceIds), so the same sources are active on every device.
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

        if (!isMounted) {
          return
        }

        const portalsToOpen = portals.filter((portal) =>
          enabledSourceIds.includes(portal.id)
        )

        const loaded: Record<number, LoadedPortal> = {}

        for (const portal of portalsToOpen) {
          if (!isMounted) {
            return
          }

          try {
            const portalResult = await fetchSavedPortalResult(portal)

            if (!isMounted) {
              return
            }

            loaded[portal.id] = { portal, response: portalResult }
            setLoadedPortals((current) => ({
              ...current,
              [portal.id]: { portal, response: portalResult },
            }))
          } catch (error) {
            if (!isMounted) {
              return
            }

            toast.error(
              error instanceof Error
                ? error.message
                : "Could not load a saved portal."
            )
          }
        }

        // Drop any sources that are no longer enabled.
        if (isMounted) {
          setLoadedPortals(loaded)
        }
      } catch (error) {
        if (!isMounted) {
          return
        }

        toast.error(
          error instanceof Error
            ? error.message
            : "Could not load saved portals."
        )
      } finally {
        if (isMounted) {
          setIsLoadingPortals(false)
        }
      }
    }

    loadSavedPortals()

    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, enabledKey])

  return (
    <main className="h-screen overflow-hidden bg-background text-foreground">
      <div className="relative h-full w-full">
        <AddPortalSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          onSaved={(portal, activeResult) => {
            setLoadedPortals((current) => ({
              ...current,
              [portal.id]: { portal, response: activeResult },
            }))
            updateSettings({
              enabledSourceIds: [...enabledSourceIds, portal.id],
            })
          }}
          onView={(viewResult, request) => {
            setLoadedPortals({})
            setResult(viewResult)
            setPreviewSourceRequest(request)
          }}
        />

        {isLoadingPortals || !browserChannels.length ? (
          <div className="absolute top-6 right-6 z-20 flex items-center gap-1">
            <SettingsLink />
            <AuthDialog />
          </div>
        ) : null}

        {isLoadingPortals || iptvOrgLoading ? (
          <LoadingShell />
        ) : browserChannels.length ? (
          <ChannelBrowser
            channels={filteredChannels}
            allChannels={browserChannels}
            endpoint={result?.endpoint ?? ""}
            portalRequest={previewSourceRequest}
            logoSource={logoSource}
            useProxy={useProxy}
            epgChannels={epgChannels}
            query={query}
            onQueryChange={setQuery}
            utilityControls={
              <>
                <SettingsLink />
                <AuthDialog />
              </>
            }
          />
        ) : (
          <NoPortalsSelected
            signedIn={Boolean(userId)}
            onEnableFreeChannels={
              iptvOrgEnabled
                ? undefined
                : () => updateSettings({ iptvOrgEnabled: true })
            }
          />
        )}
      </div>
    </main>
  )
}

function NoPortalsSelected({
  signedIn,
  onEnableFreeChannels,
}: {
  signedIn: boolean
  onEnableFreeChannels?: () => void
}) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden text-center">
      <PrimaryMeshGradientBackdrop />

      <div className="relative z-10 flex flex-col items-center justify-center gap-6 px-4">
        <PortalHopWordmark />
        <div className="flex max-w-sm flex-col gap-1.5">
          <p className="font-medium">Nothing to browse yet</p>
          <p className="text-sm text-muted-foreground">
            {signedIn
              ? "Add a portal, or turn the free IPTV-org channels back on to start browsing."
              : "Sign in to load your portals, or turn on the free IPTV-org channels to start browsing."}
          </p>
        </div>
        {onEnableFreeChannels ? (
          <Button variant="outline" size="sm" onClick={onEnableFreeChannels}>
            <TvIcon className="size-3.5 mr-0.5 mt-[-0.08rem]" />
            Show public channels
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function EmptyPlayerPanel({ showBackdrop = true }: { showBackdrop?: boolean }) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden p-4">
      {showBackdrop ? <PrimaryMeshGradientBackdrop /> : null}
      <div className="relative z-10 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <TvIcon className="size-8" />
        <p className="text-sm">No channel selected.</p>
      </div>
    </div>
  )
}

type BrowseFilter =
  | { type: "favorites" }
  | { type: "all" }
  | { type: "category"; genre: string }

function chipButtonProps(active: boolean, options?: { wide?: boolean }) {
  return {
    variant: active ? ("default" as const) : ("outline" as const),
    size: "sm" as const,
    className: cn(
      "rounded-full",
      options?.wide ? "min-w-0 max-w-56 shrink!" : "max-w-40",
      !active && "text-muted-foreground"
    ),
  }
}

function ChannelBrowser({
  channels,
  allChannels,
  endpoint,
  portalRequest,
  logoSource,
  useProxy,
  epgChannels,
  query,
  onQueryChange,
  utilityControls,
}: {
  channels: PortalChannelWithSource[]
  allChannels: PortalChannelWithSource[]
  endpoint: string
  portalRequest: SourceRequest
  logoSource: "provider" | "epg"
  useProxy: boolean
  epgChannels: Record<string, { name: string; logoUrl?: string; countryCode?: string }>
  query: string
  onQueryChange: (value: string) => void
  utilityControls: ReactNode
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const categoryTriggerRef = useRef<HTMLButtonElement>(null)
  const { favorites, toggleFavorite } = useFavorites()
  const [browseFilter, setBrowseFilter] = useState<BrowseFilter>({ type: "all" })
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)

  // Number of favorites that actually exist in the currently loaded list.
  const favoriteCount = useMemo(
    () =>
      allChannels.reduce(
        (count, channel) =>
          favorites.has(getChannelKey(channel)) ? count + 1 : count,
        0
      ),
    [allChannels, favorites]
  )

  // Default the filter to Favorites only when the current list actually has
  // some, otherwise fall back to All. Reacts as channels/favorites load, and
  // stops once the user picks a filter themselves.
  const userChoseFilter = useRef(false)
  useEffect(() => {
    if (userChoseFilter.current) return
    setBrowseFilter(favoriteCount > 0 ? { type: "favorites" } : { type: "all" })
  }, [favoriteCount])

  const chooseFilter = useCallback((filter: BrowseFilter) => {
    userChoseFilter.current = true
    setBrowseFilter(filter)
  }, [])

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const channel of allChannels) {
      const genre = channel.genre || "Uncategorized"
      counts.set(genre, (counts.get(genre) ?? 0) + 1)
    }
    return counts
  }, [allChannels])

  const categories = useMemo(() => {
    return [...categoryCounts.keys()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    )
  }, [categoryCounts])

  const visibleChannels = useMemo(() => {
    if (browseFilter.type === "all") {
      return channels
    }

    if (browseFilter.type === "favorites") {
      return channels.filter((channel) => favorites.has(getChannelKey(channel)))
    }

    return channels.filter(
      (channel) => (channel.genre || "Uncategorized") === browseFilter.genre
    )
  }, [browseFilter, channels, favorites])
  const [copiedChannel, setCopiedChannel] = useState("")
  const [resolvingChannel, setResolvingChannel] = useState("")
  const [failedChannel, setFailedChannel] = useState("")
  const [selectedChannel, setSelectedChannel] =
    useState<PortalChannelWithSource | null>(null)
  const [epgProgrammes, setEpgProgrammes] = useState<EpgProgramme[]>([])
  const [isLoadingEpg, setIsLoadingEpg] = useState(false)
  const [epgError, setEpgError] = useState("")
  const [playerStream, setPlayerStream] = useState<{
    channelKey: string
    channelName: string
    genre: string
    logoUrl: string
    number: string
    portalName: string
    url: string
  } | null>(null)
  const [playerElement, setPlayerElement] = useState<HTMLVideoElement | null>(null)
  const [streamVariant, setStreamVariant] = useState<StreamVariant>({
    resolutionLabel: "",
    frameRateLabel: "",
  })
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual intentionally returns imperative helpers for scroll math.
  const rowVirtualizer = useVirtualizer({
    count: visibleChannels.length,
    getScrollElement: () =>
      scrollAreaRef.current?.querySelector<HTMLElement>(
        "[data-slot='scroll-area-viewport']"
      ) ?? null,
    estimateSize: () => 84,
    overscan: 12,
  })

  useEffect(() => {
    rowVirtualizer.scrollToIndex(0)
  }, [visibleChannels, rowVirtualizer])

  useEffect(() => {
    setStreamVariant({ resolutionLabel: "", frameRateLabel: "" })

    if (!playerStream || !playerElement) {
      return
    }

    let removeHlsListeners: (() => void) | undefined
    let intervalId: number | undefined

    const updateFromNativeVideo = () => {
      setStreamVariant((current) => {
        if (current.resolutionLabel || !playerElement.videoHeight) {
          return current
        }

        return {
          resolutionLabel: formatResolutionLabel({
            width: playerElement.videoWidth,
            height: playerElement.videoHeight,
          }),
          frameRateLabel: "",
        }
      })
    }

    const connectToHls = () => {
      const hls = getCoreReference(playerElement)?.engine

      if (!hls) {
        return false
      }

      const updateFromLevel = (levelIndex?: number) => {
        const currentLevelIndex =
          typeof levelIndex === "number" ? levelIndex : hls.currentLevel
        const level =
          currentLevelIndex >= 0 ? hls.levels[currentLevelIndex] : undefined

        if (level) {
          setStreamVariant(formatStreamVariant(level))
        }
      }

      const handleManifestParsed = () => updateFromLevel()
      const handleLevelSwitching = (
        _event: typeof Hls.Events.LEVEL_SWITCHING,
        data: { level: number }
      ) => updateFromLevel(data.level)
      const handleLevelSwitched = (
        _event: typeof Hls.Events.LEVEL_SWITCHED,
        data: { level: number }
      ) => updateFromLevel(data.level)

      hls.on(Hls.Events.MANIFEST_PARSED, handleManifestParsed)
      hls.on(Hls.Events.LEVEL_SWITCHING, handleLevelSwitching)
      hls.on(Hls.Events.LEVEL_SWITCHED, handleLevelSwitched)
      updateFromLevel()

      removeHlsListeners = () => {
        hls.off(Hls.Events.MANIFEST_PARSED, handleManifestParsed)
        hls.off(Hls.Events.LEVEL_SWITCHING, handleLevelSwitching)
        hls.off(Hls.Events.LEVEL_SWITCHED, handleLevelSwitched)
      }

      return true
    }

    if (!connectToHls()) {
      intervalId = window.setInterval(() => {
        if (connectToHls() && intervalId) {
          window.clearInterval(intervalId)
          intervalId = undefined
        }
      }, 100)
    }

    playerElement.addEventListener("loadedmetadata", updateFromNativeVideo)
    updateFromNativeVideo()

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId)
      }

      playerElement.removeEventListener("loadedmetadata", updateFromNativeVideo)
      removeHlsListeners?.()
    }
  }, [playerElement, playerStream])

  useEffect(() => {
    if (!selectedChannel || !playerStream) {
      setEpgProgrammes([])
      setEpgError("")
      setIsLoadingEpg(false)
      return
    }

    const controller = new AbortController()
    const sourceRequest = selectedChannel.portalSource?.request ?? portalRequest
    const sourceEndpoint = selectedChannel.portalSource?.endpoint ?? endpoint

    async function loadChannelEpg() {
      setIsLoadingEpg(true)
      setEpgError("")

      try {
        const response = await fetch("/api/channel-epg", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({
            ...sourceRequest,
            source: logoSource,
            endpoint: sourceEndpoint,
            channelId: selectedChannel?.id,
            channelName: selectedChannel?.name,
            xmltvId: selectedChannel?.xmltvId,
          }),
        })
        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error || "Could not load EPG data.")
        }

        setEpgProgrammes(
          Array.isArray(data.programmes) ? (data.programmes as EpgProgramme[]) : []
        )
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        setEpgProgrammes([])
        setEpgError(error instanceof Error ? error.message : "Could not load EPG data.")
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingEpg(false)
        }
      }
    }

    loadChannelEpg()

    return () => {
      controller.abort()
    }
  }, [endpoint, logoSource, playerStream, portalRequest, selectedChannel])

  async function pullChannelStream(
    channel: PortalChannelWithSource,
    action: "copy" | "open" | "play" = "play"
  ) {
    const channelKey = getChannelKey(channel)
    const sourceRequest = channel.portalSource?.request ?? portalRequest
    const sourceEndpoint = channel.portalSource?.endpoint ?? endpoint

    if (!canResolveChannel(channel)) {
      return
    }

    setResolvingChannel(channelKey)
    setFailedChannel("")
    const toastId = toast.loading(`Pulling ${channel.name || "stream"}`, {
      description: "Resolving the latest stream from the portal.",
    })

    try {
      const response = await fetch("/api/channel-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          ...sourceRequest,
          endpoint: sourceEndpoint,
          cmd: channel.cmd,
          channelId: channel.id,
          channelNumber: channel.number,
          channelName: channel.name,
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok || typeof data.link !== "string" || !data.link) {
        throw new Error(data.error || "Could not pull the latest stream.")
      }

      const streamLink = useProxy ? proxyStreamUrl(data.link) : data.link

      if (action === "copy") {
        await copyTextToClipboard(streamLink)
        setCopiedChannel(channelKey)
        window.setTimeout(() => setCopiedChannel(""), 1400)
        toast.dismiss(toastId)
        toast.success("Copied stream", {
          description: channel.name,
          icon: <CheckIcon className="size-4 text-foreground" />,
        })
      } else if (action === "open") {
        window.location.href = `iina://weblink?url=${encodeURIComponent(
          streamLink
        )}`
        toast.dismiss(toastId)
        toast.success("Opening in IINA", {
          description: channel.name,
          icon: <CheckIcon className="size-4 text-foreground" />,
        })
      } else {
        setSelectedChannel(channel)
        setPlayerStream({
          channelKey,
          channelName: channel.name || "Live stream",
          genre: channel.genre,
          logoUrl: getChannelLogoUrl(channel, logoSource, epgChannels),
          number: channel.number,
          portalName: channel.portalSource?.name ?? "",
          url: streamLink,
        })
        toast.dismiss(toastId)
      }
    } catch (error) {
      setFailedChannel(channelKey)
      window.setTimeout(() => setFailedChannel(""), 1800)
      toast.dismiss(toastId)
      toast.error("Could not pull stream", {
        description: error instanceof Error ? error.message : channel.name,
      })
    } finally {
      setResolvingChannel("")
    }
  }

  const isMobileLayout = useMediaQuery("(max-width: 767px)", true)
  const resizableOrientation = isMobileLayout ? "vertical" : "horizontal"
  const isResponsiveLayoutReady = useHydratedLayout()

  const activeCategoryGenre =
    browseFilter.type === "category" ? browseFilter.genre : null

  const renderChannelContent = () => (
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm md:min-w-80">
      <div className="flex flex-col gap-3 p-4 pb-2">
        <PortalHopWordmark className="mb-1" />
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={`Search ${visibleChannels.length.toLocaleString()} channels`}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </InputGroup>
        <div className="flex items-center gap-1.5">
          <Button
            {...chipButtonProps(browseFilter.type === "favorites")}
            onClick={() => chooseFilter({ type: "favorites" })}
          >
            <StarIcon className="size-3" />
            Favorites
          </Button>
          <Button
            {...chipButtonProps(browseFilter.type === "all")}
            onClick={() => chooseFilter({ type: "all" })}
          >
            <LayoutGridIcon className="size-3" />
            All
          </Button>
          <Combobox
            items={categories}
            value={activeCategoryGenre}
            onValueChange={(genre) => {
              chooseFilter(genre ? { type: "category", genre } : { type: "all" })
            }}
            open={categoryMenuOpen}
            onOpenChange={setCategoryMenuOpen}
          >
            <ComboboxTrigger
              showChevron={false}
              render={
                <Button
                  ref={categoryTriggerRef}
                  {...chipButtonProps(browseFilter.type === "category", {
                    wide: true,
                  })}
                >
                  {activeCategoryGenre ? (
                    <CategoryVisual
                      category={activeCategoryGenre}
                      className="size-3.5 text-current"
                    />
                  ) : null}
                  <span className="min-w-0 truncate">
                    {activeCategoryGenre ?? "Categories"}
                  </span>
                  <ChevronDownIcon className="size-4 shrink-0 opacity-70" />
                </Button>
              }
            />
            <ComboboxContent
              align="start"
              anchor={categoryTriggerRef}
              className="flex w-72! flex-col gap-2 p-2"
            >
              <ComboboxInput
                autoFocus
                showTrigger={false}
                placeholder="Find a category"
              >
                <InputGroupAddon align="inline-start">
                  <SearchIcon />
                </InputGroupAddon>
              </ComboboxInput>
              <ComboboxList>
                {(genre: string) => (
                  <ComboboxItem key={genre} value={genre} className="pr-2">
                    <CategoryVisual category={genre} />
                    <span className="min-w-0 flex-1 truncate font-mono font-medium tracking-tight">
                      {genre}
                    </span>
                    {browseFilter.type === "category" &&
                      browseFilter.genre === genre ? null : (
                      <span className="ml-auto shrink-0 pl-2 font-mono text-xs tabular-nums text-muted-foreground">
                        {(categoryCounts.get(genre) ?? 0).toLocaleString()}
                      </span>
                    )}
                  </ComboboxItem>
                )}
              </ComboboxList>
              <ComboboxEmpty>No categories match.</ComboboxEmpty>
            </ComboboxContent>
          </Combobox>
        </div>
      </div>
      <ScrollArea
        ref={scrollAreaRef}
        className="min-h-0 flex-1 px-3 pb-2"
        aria-rowcount={visibleChannels.length}
      >
        {visibleChannels.length ? (
          <div
            className="relative"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const channel = visibleChannels[virtualRow.index]
              const channelKey = getChannelKey(channel)
              const canResolve = canResolveChannel(channel)
              const isResolving = resolvingChannel === channelKey
              const isSelected =
                selectedChannel && getChannelKey(selectedChannel) === channelKey
              const isFavorited = favorites.has(channelKey)
              const logoUrl = getChannelLogoUrl(channel, logoSource, epgChannels)
              const channelBadgeId = channel.xmltvId ?? ""

              return (
                <div
                  key={`${channel.id}-${channel.number}-${virtualRow.index}`}
                  className={cn(
                    "group absolute inset-x-0 flex items-center gap-1 rounded-xl pr-1 pl-2 transition-colors hover:bg-accent/80",
                    isSelected && "bg-accent shadow-xs"
                  )}
                  style={{
                    height: `${virtualRow.size - 6}px`,
                    transform: `translateY(${virtualRow.start + 3}px)`,
                  }}
                >
                  <button
                    type="button"
                    disabled={!canResolve || Boolean(resolvingChannel)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => pullChannelStream(channel)}
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center overflow-clip rounded-lg border border-border/60">
                      {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- Portal/EPG logos can come from arbitrary hosts.
                        <img
                          src={logoUrl}
                          alt=""
                          className="size-full rounded object-contain"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <TvIcon className="text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate font-medium">
                        {channel.name || `Channel ${channel.number || virtualRow.index + 1}`}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <CategoryVisual
                          category={channel.genre || "Uncategorized"}
                          className="size-3 shrink-0"
                        />
                        <span className="truncate">
                          {channel.genre || "Uncategorized"}
                        </span>
                      </span>
                      {channel.portalSource || channelBadgeId ? (
                        <span className="flex min-w-0 items-center gap-1.5">
                          {channel.portalSource ? (
                            <Badge
                              variant="outline"
                              className="h-4 max-w-28 rounded px-1.5 text-[10px]"
                            >
                              <span className="truncate">
                                {channel.portalSource.name}
                              </span>
                            </Badge>
                          ) : null}
                          {channelBadgeId ? (
                            <Badge
                              variant="secondary"
                              className="h-4 max-w-28 rounded px-1.5 font-mono text-[10px]"
                            >
                              <span className="truncate">{channelBadgeId}</span>
                            </Badge>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  </button>
                  {isResolving ? <Spinner className="mr-1 shrink-0" /> : null}
                  <button
                    type="button"
                    aria-label={
                      isFavorited
                        ? `Remove ${channel.name || "channel"} from favorites`
                        : `Add ${channel.name || "channel"} to favorites`
                    }
                    aria-pressed={isFavorited}
                    onClick={() => toggleFavorite(channelKey)}
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-[color,opacity,transform] duration-[160ms] ease-out hover:text-foreground active:scale-95",
                      isFavorited
                        ? "text-amber-500 opacity-100 hover:text-amber-500"
                        : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                    )}
                  >
                    <StarIcon
                      className={cn("size-4", isFavorited && "fill-current")}
                    />
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {browseFilter.type === "favorites"
              ? "Star channels to see them here."
              : "No channels matched the current filter."}
          </div>
        )}
      </ScrollArea>
    </div>
  )

  const renderPlayerContent = () => (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-background">
      {!playerStream ? <PrimaryMeshGradientBackdrop /> : null}
      <div className="relative z-10 flex min-h-16 items-center justify-between gap-3 px-4 pt-4 pb-3 md:pr-[28rem]">
        {playerStream ? (
          <div className="flex min-w-0 items-center gap-3">
            {playerStream.logoUrl ? (
              <div className="flex size-10 shrink-0 items-center justify-center overflow-clip rounded-lg border border-border/60">
                {/* eslint-disable-next-line @next/next/no-img-element -- Channel logos can come from arbitrary provider or EPG hosts. */}
                <img
                  src={playerStream.logoUrl}
                  alt=""
                  className="size-full rounded object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : null}
            <div className="flex min-w-0 flex-col">
              <p className="truncate font-semibold text-lg">
                {playerStream.channelName}
              </p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="truncate">
                  {playerStream.genre || "Uncategorized"}
                </span>
                {playerStream.portalName ? (
                  <Badge variant="outline" className="h-5">
                    {playerStream.portalName}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <p className="font-semibold">Select a channel</p>
            <p className="text-sm text-muted-foreground">
              Pick a channel from the sidebar to start playback.
            </p>
          </div>
        )}
      </div>
      {playerStream ? (
        <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pt-4">
            <MediaPlayer
              key={`${playerStream.channelKey}-${playerStream.url}`}
              autoHide
              className="aspect-video w-full overflow-hidden rounded-lg bg-black"
            >
              <MediaPlayerVideo
                render={
                  <MuxVideo
                    ref={(element) => setPlayerElement(element ?? null)}
                    src={playerStream.url}
                    type="hls"
                    streamType="live"
                    preferPlayback="mse"
                    preload="auto"
                    targetLiveWindow={30}
                    autoPlay
                    playsInline
                    envKey={process.env.NEXT_PUBLIC_MUX_ENV_KEY}
                    metadata={{
                      video_id: playerStream.channelKey,
                      video_title: playerStream.channelName,
                      video_stream_type: "live",
                    }}
                    className="h-full w-full bg-black object-contain"
                  />
                }
              />
              <MediaPlayerLoading />
              <MediaPlayerError />
              <MediaPlayerVolumeIndicator />
              <MediaPlayerControls className="flex-col items-start gap-2.5 px-4 pb-3">
                <MediaPlayerControlsOverlay />
                <div className="flex w-full items-center gap-3 pb-1">
                  {playerStream.logoUrl ? (
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-zinc-950/50 backdrop-blur p-1 shadow-inner">
                      {/* eslint-disable-next-line @next/next/no-img-element -- Channel logos can come from arbitrary provider or EPG hosts. */}
                      <img
                        src={playerStream.logoUrl}
                        alt=""
                        className="size-full rounded object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : null}
                  <div className="flex min-w-0 flex-col">
                    <h2 className="truncate text-lg font-semibold text-white">
                      {playerStream.channelName}
                    </h2>
                    <div className="flex min-w-0 items-center gap-2 text-sm text-white/60">
                      {playerStream.genre ? (
                        <span className="truncate font-medium">
                          {playerStream.genre}
                        </span>
                      ) : null}
                      {playerStream.portalName ? (
                        <Badge
                          variant="outline"
                          className="h-5 bg-white/10 text-white backdrop-blur"
                        >
                          {playerStream.portalName}
                        </Badge>
                      ) : null}
                      <StreamInfoBadges
                        variant={streamVariant}
                        className="bg-white/10 text-white backdrop-blur"
                      />
                    </div>
                  </div>
                </div>
                <MediaPlayerSeek />
                <div className="flex w-full items-center gap-2">
                  <div className="flex flex-1 items-center gap-2">
                    <MediaPlayerPlay />
                    <MediaPlayerSeekBackward>
                      <RotateCcwIcon />
                    </MediaPlayerSeekBackward>
                    <MediaPlayerSeekForward>
                      <RotateCwIcon />
                    </MediaPlayerSeekForward>
                    <MediaPlayerTime />
                  </div>
                  <div className="flex items-center gap-2">
                    <MediaPlayerVolume expandable />
                    <MediaPlayerSettings />
                    <MediaPlayerPiP />
                    <MediaPlayerFullscreen />
                  </div>
                </div>
              </MediaPlayerControls>
            </MediaPlayer>
            <EpgSchedule
              programmes={epgProgrammes}
              isLoading={isLoadingEpg}
              error={epgError}
            />
          </div>
        </ScrollArea>
      ) : (
        <EmptyPlayerPanel showBackdrop={false} />
      )}
    </div>
  )

  const renderChannelPanel = () => (
    <ResizablePanel
      key="channels"
      defaultSize={isMobileLayout ? "46%" : "360px"}
      minSize={isMobileLayout ? "260px" : "320px"}
      {...(isMobileLayout ? {} : { maxSize: "520px" })}
    >
      {renderChannelContent()}
    </ResizablePanel>
  )

  const renderPlayerPanel = () => (
    <ResizablePanel
      key="player"
      defaultSize={isMobileLayout ? "54%" : undefined}
      minSize={isMobileLayout ? "190px" : "560px"}
    >
      {renderPlayerContent()}
    </ResizablePanel>
  )

  const resizeHandle = (
    <ResizableHandle
      key="handle"
      className="bg-transparent focus-visible:ring-0"
    />
  )

  return (
    <>
      <div className="absolute top-6 right-6 z-20 flex items-center gap-2">
        {playerStream && selectedChannel ? (
          <>
            {!isMobileLayout && (
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(resolvingChannel)}
                onClick={() => pullChannelStream(selectedChannel, "open")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- IINA icon is a local public asset */}
                <img src="/iina.png" alt="" className="size-4 scale-125 object-contain" />
                Open in IINA
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size={isMobileLayout ? "icon" : "default"}
              disabled={Boolean(resolvingChannel)}
              onClick={() => pullChannelStream(selectedChannel, "copy")}
              title={isMobileLayout ? "Copy stream" : undefined}
            >
              {copiedChannel === getChannelKey(selectedChannel) ? (
                <CheckIcon data-icon={isMobileLayout ? undefined : "inline-start"} />
              ) : failedChannel === getChannelKey(selectedChannel) ? (
                <AlertCircleIcon data-icon={isMobileLayout ? undefined : "inline-start"} />
              ) : (
                <CopyIcon data-icon={isMobileLayout ? undefined : "inline-start"} />
              )}
              {!isMobileLayout && "Copy stream"}
            </Button>
          </>
        ) : null}
        <div className="flex items-center gap-1">{utilityControls}</div>
      </div>
      {isResponsiveLayoutReady ? (
        <ResizablePanelGroup
          key={resizableOrientation}
          orientation={resizableOrientation}
          className="h-full gap-1.5 overflow-hidden bg-muted/30 p-3"
          resizeTargetMinimumSize={{ coarse: 44, fine: 12 }}
        >
          {isMobileLayout ? (
            <>
              {renderPlayerPanel()}
              {resizeHandle}
              {renderChannelPanel()}
            </>
          ) : (
            <>
              {renderChannelPanel()}
              {resizeHandle}
              {renderPlayerPanel()}
            </>
          )}
        </ResizablePanelGroup>
      ) : (
        <div className="flex h-full w-full flex-col gap-1.5 overflow-hidden bg-muted/30 p-3 md:flex-row">
          <div className="order-3 min-h-0 basis-[46%] shrink md:order-1 md:w-[360px] md:max-w-[520px] md:min-w-80 md:basis-auto md:shrink-0">
            {renderChannelContent()}
          </div>
          <div className="order-2 w-px h-px bg-transparent shrink-0 md:order-2" />
          <div className="order-1 min-h-0 basis-[54%] shrink md:order-3 md:flex-1 md:basis-auto">
            {renderPlayerContent()}
          </div>
        </div>
      )}
    </>
  )
}

const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

function useMediaQuery(query: string, defaultMatches = false) {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? defaultMatches : window.matchMedia(query).matches
  )

  useBrowserLayoutEffect(() => {
    const mediaQuery = window.matchMedia(query)
    const handleChange = () => setMatches(mediaQuery.matches)

    handleChange()
    mediaQuery.addEventListener("change", handleChange)

    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [query])

  return matches
}

function canResolveChannel(channel: PortalChannel) {
  return Boolean(channel.id || channel.number || channel.name || channel.cmd)
}

function proxyStreamUrl(streamUrl: string) {
  const url = new URL(proxyManifestUrl)

  url.searchParams.set("d", streamUrl)
  url.searchParams.set("api_password", proxyApiPassword)

  return url.href
}

function StreamInfoBadges({
  variant,
  className,
}: {
  variant: StreamVariant
  className?: string
}) {
  const label = [
    variant.resolutionLabel,
    variant.frameRateLabel,
  ].filter(Boolean).join(" • ")

  if (!label) {
    return null
  }

  return (
    <Badge variant="outline" className={cn("h-5", className)}>
      {label}
    </Badge>
  )
}

function formatStreamVariant({
  width,
  height,
  frameRate,
}: {
  width: number
  height: number
  frameRate: number
}): StreamVariant {
  return {
    resolutionLabel: formatResolutionLabel({ width, height }),
    frameRateLabel: formatFrameRateLabel(frameRate),
  }
}

function formatResolutionLabel({
  width,
  height,
}: {
  width: number
  height: number
}) {
  if (width >= 3840 || height >= 2160) {
    return "4K"
  }

  return height ? `${height}p` : ""
}

function formatFrameRateLabel(frameRate: number) {
  if (!frameRate) {
    return ""
  }

  const roundedFrameRate = Math.round(frameRate)
  const labelValue =
    Math.abs(frameRate - roundedFrameRate) < 0.05
      ? String(roundedFrameRate)
      : String(Number(frameRate.toFixed(2)))

  return `${labelValue} fps`
}

function EpgSchedule({
  programmes,
  isLoading,
  error,
}: {
  programmes: EpgProgramme[]
  isLoading: boolean
  error: string
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 30000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <section className="mt-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 md:gap-2.5 min-w-0">
          <TvIcon className="size-4 md:size-5 shrink-0 text-muted-foreground" />
          <span className="text-base md:text-xl font-semibold">Programme Guide</span>
        </div>
        {programmes[0] ? (
          <span className="shrink-0 text-sm font-medium text-muted-foreground">
            {formatScheduleDate(programmes[0].startAt)}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex h-28 items-center justify-center rounded-md bg-muted/20 text-sm text-muted-foreground">
          <Loader2Icon className="mr-2 size-4 animate-spin" />
          Loading EPG
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : programmes.length ? (
        <div className="flex flex-col gap-3">
          {programmes.map((programme) => {
            const start = new Date(programme.startAt).getTime()
            const stop = new Date(programme.stopAt).getTime()
            const isLive = start <= now && stop > now
            const progress = isLive
              ? Math.min(100, Math.max(0, ((now - start) / (stop - start)) * 100))
              : 0

            return (
              <article
                key={programme.id}
                className="rounded-md bg-muted/20 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                      <span>
                        {formatTimeRange(programme.startAt, programme.stopAt)}
                      </span>
                      {isLive ? (
                        <Badge className="h-5 text-[10px] font-mono ">LIVE</Badge>
                      ) : null}
                      {programme.category ? (
                        <Badge variant="outline" className="h-5">
                          {programme.category}
                        </Badge>
                      ) : null}
                    </div>
                    <h3 className="truncate text-base font-semibold">
                      {programme.title}
                    </h3>
                    {programme.description ? (
                      <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {programme.description}
                      </p>
                    ) : null}
                  </div>
                </div>
                {isLive ? (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="flex h-28 items-center justify-center rounded-md bg-muted/20 px-4 text-center text-sm text-muted-foreground">
          No programme information available for this channel.
        </div>
      )}
    </section>
  )
}

function getChannelKey(channel: PortalChannelWithSource) {
  return [
    channel.portalSource?.id ?? "manual",
    channel.id || channel.number || channel.name,
  ].join(":")
}

function getPortalSource(portal: SavedPortalRecord): PortalSource {
  if (portal.sourceType === "xtream") {
    return {
      id: portal.id,
      name: portal.name,
      endpoint: portal.endpoint || "",
      request: {
        sourceType: "xtream",
        serverUrl: portal.serverUrl ?? "",
        username: portal.username ?? "",
        password: portal.password ?? "",
        outputFormat: portal.outputFormat ?? "m3u8",
      },
    }
  }

  if (portal.sourceType === "m3u") {
    return {
      id: portal.id,
      name: portal.name,
      endpoint: portal.endpoint || "",
      request: {
        sourceType: "m3u",
        playlistUrl: portal.playlistUrl ?? "",
      },
    }
  }

  return {
    id: portal.id,
    name: portal.name,
    endpoint: portal.endpoint || "",
    request: {
      sourceType: "stalker",
      portalUrl: portal.portalUrl ?? "",
      mac: portal.mac ?? "",
      serial: portal.serial ?? "",
      deviceId: portal.deviceId ?? "",
      deviceId2: portal.deviceId2 ?? "",
      signature: portal.signature ?? "",
      timezone: portal.timezone,
      stbType: portal.stbType,
    },
  }
}

async function fetchSavedPortalResult(
  portal: SavedPortalRecord
): Promise<PortalResponse> {
  const response = await fetch(`/api/portals/${portal.id}`, {
    cache: "no-store",
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || "Could not load this saved portal.")
  }

  const channels = Array.isArray(data.channels) ? data.channels : []

  return {
    endpoint: portal.endpoint || "",
    profile: {},
    genres: uniqueGenres(channels),
    channels,
  }
}

function getChannelLogoUrl(
  channel: PortalChannel,
  logoSource: "provider" | "epg",
  epgChannels: Record<string, { name: string; logoUrl?: string; countryCode?: string }>
) {
  const lookupId = channel.xmltvId || channel.id

  return (
    (logoSource === "epg" && lookupId
      ? epgChannels[lookupId.toLowerCase()]?.logoUrl
      : null) ||
    channel.logoUrl ||
    ""
  )
}

function formatTimeRange(startAt: string, stopAt: string) {
  return `${formatClockTime(startAt)} - ${formatClockTime(stopAt)}`
}

function formatClockTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatScheduleDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(value))
}

function uniqueGenres(channels: PortalChannel[]) {
  const genres = new Map<string, { id: string; title: string }>()

  for (const channel of channels) {
    if (channel.genreId || channel.genre) {
      genres.set(channel.genreId || channel.genre, {
        id: channel.genreId,
        title: channel.genre || "Uncategorized",
      })
    }
  }

  return [...genres.values()]
}

function LoadingShell() {
  const isMobileLayout = useMediaQuery("(max-width: 767px)", true)
  const isResponsiveLayoutReady = useHydratedLayout()

  const channelContent = (
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm md:min-w-80">
      <div className="flex flex-col gap-3 p-4 pb-2">
        <PortalHopWordmark className="mb-1" />
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search channels" />
        </InputGroup>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
        {Array.from({ length: 14 }).map((_, index) => (
          <div
            key={index}
            className="mb-2 flex h-14 items-center gap-3 rounded-xl px-3"
          >
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const playerContent = (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-background">
      <PrimaryMeshGradientBackdrop />
      <div className="relative z-10 flex min-h-16 items-center justify-between gap-3 px-4 pt-4 pb-3 md:pr-[28rem]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 flex-col">
            <p className="font-semibold">Select a channel</p>
            <p className="text-sm text-muted-foreground">
              Pick a channel from the sidebar to start playback.
            </p>
          </div>
        </div>
      </div>
      <EmptyPlayerPanel showBackdrop={false} />
    </div>
  )

  const channelPanel = (
    <ResizablePanel
      defaultSize={isMobileLayout ? "46%" : "360px"}
      minSize={isMobileLayout ? "260px" : "320px"}
      {...(isMobileLayout ? {} : { maxSize: "520px" })}
    >
      {channelContent}
    </ResizablePanel>
  )

  const playerPanel = (
    <ResizablePanel
      defaultSize={isMobileLayout ? "54%" : undefined}
      minSize={isMobileLayout ? "190px" : "560px"}
    >
      {playerContent}
    </ResizablePanel>
  )

  if (!isResponsiveLayoutReady) {
    return (
      <div className="flex h-full w-full flex-col gap-1.5 overflow-hidden bg-muted/30 p-3 md:flex-row">
        <div className="order-3 min-h-0 basis-[46%] shrink md:order-1 md:w-[360px] md:max-w-[520px] md:min-w-80 md:basis-auto md:shrink-0">
          {channelContent}
        </div>
        <div className="order-2 w-px h-px bg-transparent shrink-0 md:order-2" />
        <div className="order-1 min-h-0 basis-[54%] shrink md:order-3 md:flex-1 md:basis-auto">
          {playerContent}
        </div>
      </div>
    )
  }

  return (
    <ResizablePanelGroup
      key={isMobileLayout ? "vertical" : "horizontal"}
      orientation={isMobileLayout ? "vertical" : "horizontal"}
      className="h-full gap-1.5 overflow-hidden bg-muted/30 p-3"
      resizeTargetMinimumSize={{ coarse: 44, fine: 12 }}
    >
      {isMobileLayout ? (
        <>
          {playerPanel}
          <ResizableHandle
            key="handle"
            className="bg-transparent focus-visible:ring-0"
          />
          {channelPanel}
        </>
      ) : (
        <>
          {channelPanel}
          <ResizableHandle
            key="handle"
            className="bg-transparent focus-visible:ring-0"
          />
          {playerPanel}
        </>
      )}
    </ResizablePanelGroup>
  )
}
