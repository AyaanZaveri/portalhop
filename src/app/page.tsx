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
import { motion, useReducedMotion } from "motion/react"
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { normalizeXmltvId } from "@/lib/xmltv-id"
import { useFavorites, useFavoritesSync } from "@/hooks/use-favorites"
import { useUserSettings } from "@/hooks/use-user-settings"
import {
  IPTV_ORG_SOURCE_ID,
  IPTV_ORG_SOURCE_NAME,
} from "@/lib/iptv-org"
import { ThemeToggle } from "@/components/theme-toggle"
import { CategoryVisual } from "@/components/category-visual"
import { PortalHopWordmark } from "@/components/portal-hop-wordmark"
import MuxVideo from "@mux/mux-video-react"
import { Hls, getCoreReference } from "@mux/playback-core"
import { cn } from "@/lib/utils"
import { useHydratedLayout } from "@/hooks/use-hydrated-layout"
import { PrimaryMeshGradientBackdrop } from "@/components/mesh-gradient-backdrop"
import { AddPortalSheet } from "@/components/add-portal-sheet"
import {
  getCachedPortalChannels,
  prunePortalChannelsCache,
  setCachedPortalChannels,
} from "@/lib/portal-channels-cache"
import { proxyImageUrl } from "@/lib/image-proxy"

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
  epgMode: SavedSourceRecord["epgMode"]
  epgSourceId: number | null
}

type PortalChannelWithSource = PortalChannel & {
  portalSource?: PortalSource
}

type StreamVariant = {
  resolutionLabel: string
  frameRateLabel: string
}

type CaptionCue = {
  startTime: number
  endTime: number
  line: number
  text: string
}

type ExternalPlayer = "iina" | "vlc" | "mpv" | "outplayer"
type ClientPlatform = "android" | "ios" | "linux" | "macos" | "windows" | "other"

const externalPlayers: Array<{
  id: ExternalPlayer
  label: string
  platforms: ClientPlatform[]
}> = [
    { id: "iina", label: "IINA", platforms: ["macos"] },
    {
      id: "vlc",
      label: "VLC",
      platforms: ["android", "ios", "linux", "macos", "windows"],
    },
    {
      id: "mpv",
      label: "mpv",
      platforms: ["android", "linux", "macos", "windows"],
    },
    { id: "outplayer", label: "Outplayer", platforms: ["ios"] },
  ]

function getExternalPlayerLabel(player: ExternalPlayer) {
  return externalPlayers.find(({ id }) => id === player)?.label ?? "player"
}

function getClientPlatform(userAgent: string, maxTouchPoints = 0): ClientPlatform {
  if (/Android/i.test(userAgent)) return "android"
  if (/iPad|iPhone|iPod/i.test(userAgent)) return "ios"
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios"
  if (/Macintosh/i.test(userAgent)) return "macos"
  if (/Windows/i.test(userAgent)) return "windows"
  if (/Linux/i.test(userAgent)) return "linux"
  return "other"
}

function PlayerLogo({ player }: { player: ExternalPlayer }) {
  const extension = player === "vlc" ? "svg" : "png"

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Player logos are local static assets; image optimization is not useful for 16px menu icons.
    <img
      src={`/players/${player}/logo.${extension}`}
      alt=""
      className="size-4 shrink-0 rounded-[3px] object-contain"
    />
  )
}

function androidIntentUrl(streamUrl: string, packageName: string) {
  const url = new URL(streamUrl)
  const path = `${url.host}${url.pathname}${url.search}${url.hash}`
  return `intent://${path}#Intent;scheme=${url.protocol.slice(0, -1)};action=android.intent.action.VIEW;type=video/*;package=${packageName};end`
}

function getExternalPlayerUrl(player: ExternalPlayer, streamUrl: string) {
  const encodedStreamUrl = encodeURIComponent(streamUrl)

  switch (player) {
    case "iina":
      return `iina://weblink?url=${encodedStreamUrl}`
    case "vlc":
      return /Android/i.test(navigator.userAgent)
        ? androidIntentUrl(streamUrl, "org.videolan.vlc")
        : `vlc-x-callback://x-callback-url/stream?url=${encodedStreamUrl}`
    case "mpv":
      return /Android/i.test(navigator.userAgent)
        ? androidIntentUrl(streamUrl, "is.xyz.mpv")
        : `mpv://open?url=${encodedStreamUrl}`
    case "outplayer":
      return `outplayer://x-callback-url/open?url=${encodedStreamUrl}`
  }
}

const proxyBaseUrl =
  process.env.NEXT_PUBLIC_PROXY_URL
const proxyManifestUrl = `${proxyBaseUrl}/proxy/hls/manifest.m3u8`

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
  const { enabledSourceIds, iptvOrgEnabled, useProxy } = settings
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
  const [customEpgChannels, setCustomEpgChannels] = useState<Record<number, Record<string, { logoUrl?: string }>>>({})

  const fetchEpgChannels = useCallback(async () => {
    try {
      const customIds = Object.values(loadedPortals).map(({ portal }) => portal.epgMode === "custom" ? portal.epgSourceId : null).filter((id): id is number => Number.isInteger(id))
      const res = await fetch(`/api/epg/channels${customIds.length ? `?sourceIds=${customIds.join(",")}` : ""}`)
      if (!res.ok) throw new Error("Failed to fetch EPG channels")
      const channels = await res.json()
      setEpgChannels(channels.builtin ?? channels)
      setCustomEpgChannels(channels.custom ?? {})
    } catch (err) {
      console.error("Failed to load EPG channels:", err)
    }
  }, [loadedPortals])



  // Refreshing the EPG directory is a batch job over ~78 country feeds, so it is
  // driven from Settings → EPG rather than kicked off on page load.
  useEffect(() => {
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
          epgMode: "none",
          epgSourceId: null,
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

        // Drop cache entries for sources that were deleted entirely, so the
        // cache doesn't grow forever. Sources that are merely disabled keep
        // their cached channels for whenever they're re-enabled.
        prunePortalChannelsCache(portals.map((portal) => portal.id))

        const loaded: Record<number, LoadedPortal> = {}

        for (const portal of portalsToOpen) {
          if (!isMounted) {
            return
          }

          try {
            const portalResult = await loadPortalChannels(portal)

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
            {settingsLoaded && !userId ? <ThemeToggle /> : null}
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
            useProxy={useProxy}
            epgChannels={epgChannels}
            customEpgChannels={customEpgChannels}
            query={query}
            onQueryChange={setQuery}
            utilityControls={
              <>
                {settingsLoaded && !userId ? <ThemeToggle /> : null}
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
      options?.wide ? "min-w-0 max-w-full shrink!" : "max-w-40 shrink-0",
      !active && "text-muted-foreground"
    ),
  }
}

function ChannelBrowser({
  channels,
  allChannels,
  endpoint,
  portalRequest,
  useProxy,
  epgChannels,
  customEpgChannels,
  query,
  onQueryChange,
  utilityControls,
}: {
  channels: PortalChannelWithSource[]
  allChannels: PortalChannelWithSource[]
  endpoint: string
  portalRequest: SourceRequest
  useProxy: boolean
  epgChannels: Record<string, { name: string; logoUrl?: string; countryCode?: string }>
  customEpgChannels: Record<number, Record<string, { logoUrl?: string }>>
  query: string
  onQueryChange: (value: string) => void
  utilityControls: ReactNode
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const categoryTriggerRef = useRef<HTMLButtonElement>(null)
  const { favorites, toggleFavorite, migrateFavoriteKeys } = useFavorites()
  const isChannelFavorited = useCallback(
    (channel: PortalChannelWithSource) =>
      favorites.has(getChannelKey(channel)) || favorites.has(getLegacyChannelKey(channel)),
    [favorites]
  )

  useEffect(() => {
    const mappings = new Map<string, string[]>()
    for (const channel of allChannels) {
      const legacyKey = getLegacyChannelKey(channel)
      if (!favorites.has(legacyKey)) continue
      const current = mappings.get(legacyKey) ?? []
      current.push(getChannelKey(channel))
      mappings.set(legacyKey, current)
    }
    if (mappings.size) migrateFavoriteKeys(mappings)
  }, [allChannels, favorites, migrateFavoriteKeys])

  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const [selectedPortalIds, setSelectedPortalIds] = useState<Set<number>>(
    () => new Set()
  )
  const prefersReducedMotion = useReducedMotion()
  const [clientPlatform, setClientPlatform] = useState<ClientPlatform>("other")

  useEffect(() => {
    setClientPlatform(
      getClientPlatform(navigator.userAgent, navigator.maxTouchPoints)
    )
  }, [])

  // Number of favorites that actually exist in the currently loaded list.
  const favoriteCount = useMemo(
    () =>
      allChannels.reduce(
        (count, channel) =>
          isChannelFavorited(channel) ? count + 1 : count,
        0
      ),
    [allChannels, isChannelFavorited]
  )

  // Default the filter to Favorites only when the current list actually has
  // some, otherwise fall back to All. Seeded during the first render rather than
  // in an effect: this component only mounts once channels have loaded, so the
  // count is already known, and defaulting to All would paint a frame of every
  // channel before the effect could swap it out.
  const [browseFilter, setBrowseFilter] = useState<BrowseFilter>(() =>
    favoriteCount > 0 ? { type: "favorites" } : { type: "all" }
  )

  // Keeps reacting if favorites or channels arrive after mount, and stops once
  // the user picks a filter themselves.
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

  const portals = useMemo(() => {
    const uniquePortals = new Map<number, PortalSource>()
    for (const channel of allChannels) {
      if (channel.portalSource) {
        uniquePortals.set(channel.portalSource.id, channel.portalSource)
      }
    }

    return [...uniquePortals.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    )
  }, [allChannels])

  const togglePortal = useCallback((portalId: number, checked: boolean) => {
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
  }, [chooseFilter])

  const visibleChannels = useMemo(() => {
    const channelsForSelectedPortals = selectedPortalIds.size
      ? channels.filter((channel) =>
        channel.portalSource && selectedPortalIds.has(channel.portalSource.id)
      )
      : channels

    if (browseFilter.type === "all") {
      return channelsForSelectedPortals
    }

    if (browseFilter.type === "favorites") {
      return channelsForSelectedPortals.filter(isChannelFavorited)
    }

    return channelsForSelectedPortals.filter(
      (channel) => (channel.genre || "Uncategorized") === browseFilter.genre
    )
  }, [browseFilter, channels, isChannelFavorited, selectedPortalIds])
  const [copiedChannel, setCopiedChannel] = useState("")
  const [resolvingChannel, setResolvingChannel] = useState("")
  const [failedChannel, setFailedChannel] = useState("")
  // Lets a click on another channel supersede an in-flight resolve: the old
  // request is aborted and only the most recent one (by sequence) updates state.
  const pullControllerRef = useRef<AbortController | null>(null)
  const pullSeqRef = useRef(0)
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
  const captionCuesRef = useRef<Map<string, CaptionCue[]>>(new Map())
  const captionDebugStateRef = useRef("")
  const [activeCaption, setActiveCaption] = useState<string | null>(null)
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
    captionCuesRef.current.clear()
    captionDebugStateRef.current = ""
    setActiveCaption(null)

    if (!playerStream || !playerElement) {
      return
    }

    console.log("[Portal Hop captions] diagnostics attached", {
      streamUrl: playerStream.url,
    })

    let removeHlsListeners: (() => void) | undefined
    let intervalId: number | undefined
    let frameRateSampleIntervalId: number | undefined
    let hasManifestFrameRate = false
    let frameRateEstimated = false
    let lastFrameSample: { frames: number; time: number } | null = null
    const frameRateSamples: number[] = []

    const logCaptionState = (state: string, detail: Record<string, unknown>) => {
      if (captionDebugStateRef.current === state) return
      captionDebugStateRef.current = state
      console.log("[Portal Hop captions]", detail)
    }

    const getTextTrackDebugInfo = () =>
      Array.from(playerElement.querySelectorAll("track")).map((track) => ({
        id: track.id,
        kind: track.track.kind,
        label: track.track.label,
        mode: track.track.mode,
      }))

    const updateActiveCaption = () => {
      const selectedTrack = Array.from(playerElement.querySelectorAll("track")).find(
        (track) =>
          (track.track.kind === "captions" || track.track.kind === "subtitles") &&
          track.track.mode === "showing"
      )

      if (!selectedTrack) {
        logCaptionState("no-selected-track", {
          event: "overlay-cleared",
          reason: "No caption track is currently showing",
          tracks: getTextTrackDebugInfo(),
        })
        setActiveCaption(null)
        return
      }

      const cueTrackId = captionCuesRef.current.has(selectedTrack.id)
        ? selectedTrack.id
        : selectedTrack.id === "default" && captionCuesRef.current.size === 1
          ? [...captionCuesRef.current.keys()][0]
          : undefined
      const now = playerElement.currentTime
      const activeCues = (cueTrackId
        ? captionCuesRef.current.get(cueTrackId) ?? []
        : []
      ).filter(
        (cue) => cue.startTime <= now && cue.endTime >= now
      )

      if (!activeCues.length) {
        logCaptionState(`no-active-cue:${selectedTrack.id}`, {
          event: "overlay-cleared",
          reason: "Selected track has no cue at the current video timestamp",
          currentTime: now,
          trackId: selectedTrack.id,
          cueTrackId,
          knownCueCount: cueTrackId
            ? captionCuesRef.current.get(cueTrackId)?.length ?? 0
            : 0,
        })
        setActiveCaption(null)
        return
      }

      // CEA captions emit one cue per screen row. Render the most recent
      // screen as one subtitle block so live updates never stack over each other.
      const latestStartTime = Math.max(...activeCues.map((cue) => cue.startTime))
      const lines = activeCues
        .filter((cue) => Math.abs(cue.startTime - latestStartTime) < 0.05)
        .sort((a, b) => a.line - b.line)
        .map((cue) => cue.text)
        .filter((text, index, values) => text && values.indexOf(text) === index)

      const text = lines.length ? lines.join("\n") : null
      logCaptionState(`${selectedTrack.id}:${text ?? ""}`, {
        event: "overlay-updated",
        currentTime: now,
        trackId: selectedTrack.id,
        cueTrackId,
        text,
        activeCueCount: activeCues.length,
      })
      setActiveCaption(text)
    }

    const sampleFrameRate = () => {
      if (hasManifestFrameRate || frameRateEstimated) {
        return
      }

      // Skip samples while paused, seeking, or still buffering (playbackRate
      // briefly changes during live catch-up), all of which skew the count.
      if (
        playerElement.paused ||
        playerElement.seeking ||
        playerElement.playbackRate !== 1
      ) {
        lastFrameSample = null
        return
      }

      const quality = playerElement.getVideoPlaybackQuality()
      const now = performance.now()

      if (lastFrameSample) {
        const frameDelta = quality.totalVideoFrames - lastFrameSample.frames
        const timeDelta = (now - lastFrameSample.time) / 1000

        if (frameDelta > 0 && timeDelta > 0) {
          frameRateSamples.push(frameDelta / timeDelta)
        }
      }

      lastFrameSample = { frames: quality.totalVideoFrames, time: now }

      // Discard the first couple of samples (playback is still stabilizing
      // right after a channel loads) and wait for a handful of consistent
      // 1s samples before settling on an estimate, since any single sample
      // can be thrown off by a stall or a burst of buffered frames.
      const stableSamples = frameRateSamples.slice(2)

      if (stableSamples.length >= 5) {
        const sorted = [...stableSamples].sort((a, b) => a - b)
        const median = sorted[Math.floor(sorted.length / 2)]
        const snapped = snapToCommonFrameRate(median)

        frameRateEstimated = true
        setStreamVariant((current) =>
          current.frameRateLabel
            ? current
            : { ...current, frameRateLabel: formatFrameRateLabel(snapped) }
        )
      }
    }

    if (typeof playerElement.getVideoPlaybackQuality === "function") {
      frameRateSampleIntervalId = window.setInterval(sampleFrameRate, 1000)
    }

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
        console.log("[Portal Hop captions] waiting for HLS engine")
        return false
      }

      console.log("[Portal Hop captions] HLS engine connected")

      const updateFromLevel = (levelIndex?: number) => {
        const currentLevelIndex =
          typeof levelIndex === "number" ? levelIndex : hls.currentLevel
        const level =
          currentLevelIndex >= 0 ? hls.levels[currentLevelIndex] : undefined

        if (level) {
          const next = formatStreamVariant(level)

          if (next.frameRateLabel) {
            hasManifestFrameRate = true
          }

          setStreamVariant((current) => ({
            resolutionLabel: next.resolutionLabel || current.resolutionLabel,
            frameRateLabel: next.frameRateLabel || current.frameRateLabel,
          }))
        }
      }

      const allowEmbeddedCaptions = () => {
        // Some IPTV manifests declare CLOSED-CAPTIONS=NONE even when their
        // transport-stream video frames carry CEA-608/708 caption data. HLS.js
        // otherwise skips decoding those embedded captions entirely.
        for (const level of hls.levels) {
          if (level.attrs["CLOSED-CAPTIONS"] === "NONE") {
            delete level.attrs["CLOSED-CAPTIONS"]
          }
        }
      }

      const handleManifestParsed = () => {
        allowEmbeddedCaptions()
        updateFromLevel()
      }
      const handleCuesParsed = (
        _event: typeof Hls.Events.CUES_PARSED,
        data: { type: string; track: string; cues: VTTCue[] }
      ) => {
        if (data.type !== "captions") return

        const existing = captionCuesRef.current.get(data.track) ?? []
        const next = [...existing]

        for (const cue of data.cues) {
          const text = cue.text.replace(/<[^>]+>/g, "").trim()
          if (!text) continue

          const captionCue: CaptionCue = {
            startTime: cue.startTime,
            endTime: cue.endTime,
            line: typeof cue.line === "number" ? cue.line : 0,
            text,
          }
          const alreadyKnown = next.some(
            (existingCue) =>
              existingCue.startTime === captionCue.startTime &&
              existingCue.endTime === captionCue.endTime &&
              existingCue.line === captionCue.line &&
              existingCue.text === captionCue.text
          )

          if (!alreadyKnown) next.push(captionCue)
        }

        captionCuesRef.current.set(
          data.track,
          next.filter((cue) => cue.endTime >= playerElement.currentTime - 5).slice(-300)
        )
        console.log("[Portal Hop captions]", {
          event: "hls-cues-parsed",
          trackId: data.track,
          cueCount: data.cues.length,
          cues: data.cues.map((cue) => ({
            startTime: cue.startTime,
            endTime: cue.endTime,
            text: cue.text,
          })),
          tracks: getTextTrackDebugInfo(),
        })
        updateActiveCaption()
      }
      const handleLevelSwitching = (
        _event: typeof Hls.Events.LEVEL_SWITCHING,
        data: { level: number }
      ) => updateFromLevel(data.level)
      const handleLevelSwitched = (
        _event: typeof Hls.Events.LEVEL_SWITCHED,
        data: { level: number }
      ) => updateFromLevel(data.level)

      hls.on(Hls.Events.MANIFEST_PARSED, handleManifestParsed)
      hls.on(Hls.Events.CUES_PARSED, handleCuesParsed)
      hls.on(Hls.Events.LEVEL_SWITCHING, handleLevelSwitching)
      hls.on(Hls.Events.LEVEL_SWITCHED, handleLevelSwitched)
      allowEmbeddedCaptions()
      updateFromLevel()

      removeHlsListeners = () => {
        hls.off(Hls.Events.MANIFEST_PARSED, handleManifestParsed)
        hls.off(Hls.Events.CUES_PARSED, handleCuesParsed)
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
    playerElement.addEventListener("timeupdate", updateActiveCaption)
    playerElement.textTracks.addEventListener("change", updateActiveCaption)
    playerElement.textTracks.addEventListener("addtrack", updateActiveCaption)
    updateFromNativeVideo()
    updateActiveCaption()

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId)
      }

      if (frameRateSampleIntervalId) {
        window.clearInterval(frameRateSampleIntervalId)
      }

      playerElement.removeEventListener("loadedmetadata", updateFromNativeVideo)
      playerElement.removeEventListener("timeupdate", updateActiveCaption)
      playerElement.textTracks.removeEventListener("change", updateActiveCaption)
      playerElement.textTracks.removeEventListener("addtrack", updateActiveCaption)
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
            epgMode: selectedChannel?.portalSource?.epgMode ?? "portal",
            epgSourceId: selectedChannel?.portalSource?.epgSourceId ?? null,
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
  }, [endpoint, playerStream, portalRequest, selectedChannel])

  async function pullChannelStream(
    channel: PortalChannelWithSource,
    action: "copy" | ExternalPlayer | "play" = "play"
  ) {
    const channelKey = getChannelKey(channel)
    const sourceRequest = channel.portalSource?.request ?? portalRequest
    const sourceEndpoint = channel.portalSource?.endpoint ?? endpoint

    if (!canResolveChannel(channel)) {
      return
    }

    // Supersede any in-flight resolve so clicking another channel is instant.
    const seq = ++pullSeqRef.current
    const controller = new AbortController()
    pullControllerRef.current?.abort()
    pullControllerRef.current = controller

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
        signal: controller.signal,
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
      } else if (action !== "play") {
        const playerUrl = getExternalPlayerUrl(action, streamLink)
        window.location.href = playerUrl
        toast.dismiss(toastId)
        toast.success(`Opening in ${getExternalPlayerLabel(action)}`, {
          description: channel.name,
          icon: <CheckIcon className="size-4 text-foreground" />,
        })
      } else {
        // A newer click already superseded this one — don't swap the player.
        if (pullSeqRef.current !== seq) {
          toast.dismiss(toastId)
          return
        }
        setSelectedChannel(channel)
        setPlayerStream({
          channelKey,
          channelName: channel.name || "Live stream",
          genre: channel.genre,
          logoUrl: getChannelLogoUrl(channel, channel.portalSource, epgChannels, customEpgChannels),
          number: channel.number,
          portalName: channel.portalSource?.name ?? "",
          url: streamLink,
        })
        toast.dismiss(toastId)
      }
    } catch (error) {
      // Superseded by a newer channel click — stay silent, its request owns
      // the UI now.
      if (controller.signal.aborted) {
        toast.dismiss(toastId)
        return
      }
      setFailedChannel(channelKey)
      window.setTimeout(() => setFailedChannel(""), 1800)
      toast.dismiss(toastId)
      toast.error("Could not pull stream", {
        description: error instanceof Error ? error.message : channel.name,
      })
    } finally {
      // Only the most recent request clears the shared resolving/spinner state.
      if (pullSeqRef.current === seq) {
        setResolvingChannel("")
      }
    }
  }

  const isMobileLayout = useMediaQuery("(max-width: 939px)", true)
  const resizableOrientation = isMobileLayout ? "vertical" : "horizontal"
  const isResponsiveLayoutReady = useHydratedLayout()
  const availableExternalPlayers = externalPlayers.filter(({ platforms }) =>
    platforms.includes(clientPlatform)
  )

  const activeCategoryGenre =
    browseFilter.type === "category" ? browseFilter.genre : null

  const renderChannelContent = () => (
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm min-[940px]:min-w-80">
      <div className="flex flex-col gap-3 p-4 pb-2">
        <PortalHopWordmark className="mb-1" />
        <InputGroup>
          <InputGroupInput
            placeholder={`Search ${visibleChannels.length.toLocaleString()} channels`}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            {...chipButtonProps(browseFilter.type === "favorites")}
            onClick={() => {
              chooseFilter({ type: "favorites" })
              setSelectedPortalIds(new Set())
            }}
          >
            <StarIcon className="size-3" />
            Favorites
          </Button>
          {portals.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    {...chipButtonProps(
                      selectedPortalIds.size > 0 || browseFilter.type === "all",
                      { wide: true }
                    )}
                    aria-label="Filter channels by portal"
                  />
                }
              >
                {selectedPortalIds.size ? (
                  <TvIcon className="size-3.5" />
                ) : (
                  <LayoutGridIcon className="size-3" />
                )}
                <span className="min-w-0 truncate">
                  {selectedPortalIds.size === 1
                    ? portals.find((portal) => selectedPortalIds.has(portal.id))?.name
                    : selectedPortalIds.size > 1
                      ? `${selectedPortalIds.size} portals`
                      : "All"}
                </span>
                <ChevronDownIcon className="size-4 shrink-0 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => {
                      chooseFilter({ type: "all" })
                      setSelectedPortalIds(new Set())
                    }}
                  >
                    <LayoutGridIcon />
                    All
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Show portals</DropdownMenuLabel>
                  {portals.map((portal) => (
                    <DropdownMenuCheckboxItem
                      key={portal.id}
                      checked={selectedPortalIds.has(portal.id)}
                      onCheckedChange={(checked) => togglePortal(portal.id, checked)}
                    >
                      <TvIcon />
                      <span className="min-w-0 flex-1 truncate">{portal.name}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              {...chipButtonProps(browseFilter.type === "all")}
              onClick={() => chooseFilter({ type: "all" })}
            >
              <LayoutGridIcon className="size-3" />
              All
            </Button>
          )}
          <Combobox
            items={categories}
            value={activeCategoryGenre}
            onValueChange={(genre) => {
              chooseFilter(genre ? { type: "category", genre } : { type: "all" })
              setSelectedPortalIds(new Set())
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
                {(genre: string) => {
                  const isActiveGenre =
                    browseFilter.type === "category" && browseFilter.genre === genre
                  return (
                    <ComboboxItem
                      key={genre}
                      value={genre}
                      className={isActiveGenre ? undefined : "pr-2"}
                    >
                      <CategoryVisual category={genre} />
                      <span className="min-w-0 flex-1 truncate font-mono font-medium tracking-tight">
                        {genre}
                      </span>
                      {isActiveGenre ? null : (
                        <span className="ml-auto shrink-0 pl-2 font-mono text-xs tabular-nums text-muted-foreground">
                          {(categoryCounts.get(genre) ?? 0).toLocaleString()}
                        </span>
                      )}
                    </ComboboxItem>
                  )
                }}
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
              const isFavorited = isChannelFavorited(channel)
              const logoUrl = getChannelLogoUrl(channel, channel.portalSource, epgChannels, customEpgChannels)
              const channelBadgeId = channel.xmltvId ?? ""

              return (
                <div
                  key={`${channel.id}-${channel.number}-${virtualRow.index}`}
                  className="absolute inset-x-0"
                  style={{
                    height: `${virtualRow.size - 6}px`,
                    transform: `translateY(${virtualRow.start + 3}px)`,
                  }}
                >
                  {/* Positioning (translateY) lives on the wrapper above; the
                      visible row scales as one unit on press so the whole
                      thing — background, content, and star — responds. */}
                  <div
                    className={cn(
                      "group flex h-full items-center gap-1 rounded-xl pr-1 pl-2 transition-[background-color,box-shadow,transform] duration-100 ease-out hover:bg-accent/80 active:scale-[0.99]",
                      isSelected && "bg-accent shadow-xs"
                    )}
                  >
                    <button
                      type="button"
                      disabled={!canResolve}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm disabled:pointer-events-none disabled:opacity-50"
                      onClick={() => pullChannelStream(channel)}
                    >
                      <div className="flex size-11 shrink-0 items-center justify-center overflow-clip rounded-lg border border-border/60 bg-zinc-900 p-1">
                        {logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- Portal/EPG logos can come from arbitrary hosts.
                          <img
                            src={logoUrl}
                            alt=""
                            className="size-full rounded-[6px] object-contain"
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
                    <div className="relative flex size-8 shrink-0 items-center justify-center">
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
                          "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-[color,opacity,transform] duration-[160ms] ease-out hover:text-foreground active:scale-95",
                          isResolving
                            ? "opacity-0"
                            : isFavorited
                              ? "text-amber-500 opacity-100 hover:text-amber-500"
                              : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                        )}
                      >
                        <StarIcon
                          className={cn("size-4", isFavorited && "fill-current")}
                        />
                      </button>
                      {isResolving ? (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <Spinner />
                        </span>
                      ) : null}
                    </div>
                  </div>
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
      <div className="relative z-10 flex min-h-16 items-center justify-between gap-3 px-4 pt-4 pb-3 min-[940px]:pr-[22rem]">
        {playerStream ? (
          // Keyed by channel so switching channels replays the arrival: the
          // header fades and rises in, so the swap reads as content arriving
          // rather than teleporting. Critically damped (no overshoot); reduced
          // motion keeps the fade but drops the movement.
          <motion.div
            key={playerStream.channelKey}
            className="flex min-w-0 items-center gap-3"
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          >
            {playerStream.logoUrl ? (
              <div className="flex size-11 shrink-0 items-center justify-center overflow-clip rounded-lg border border-border/60 bg-zinc-900 p-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- Channel logos can come from arbitrary provider or EPG hosts. */}
                <img
                  src={playerStream.logoUrl}
                  alt=""
                  className="size-full rounded-[6px] object-contain"
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
          </motion.div>
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
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pt-2">
            <MediaPlayer
              key={`${playerStream.channelKey}-${playerStream.url}`}
              autoHide
              className="group/player aspect-video w-full overflow-hidden rounded-lg bg-black"
            >
              <MediaPlayerVideo
                render={
                  <MuxVideo
                    ref={(element) => setPlayerElement(element ?? null)}
                    src={playerStream.url}
                    type="hls"
                    streamType="live"
                    preferPlayback="mse"
                    _hlsConfig={{
                      enableCEA708Captions: true,
                      renderTextTracksNatively: false,
                    }}
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
              {activeCaption ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-[10%] z-20 flex justify-center px-8">
                  <p className="max-w-[85%] rounded-xl bg-black/70 px-4 py-2 text-center text-[clamp(0.875rem,1.4vw,1.125rem)] font-medium leading-tight whitespace-pre-line text-white shadow-xl backdrop-blur-md group-data-[state=fullscreen]/player:text-[clamp(1rem,2.2vw,1.875rem)]">
                    {activeCaption}
                  </p>
                </div>
              ) : null}
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
                        className="size-full rounded-[6px] object-contain"
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
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  className={isMobileLayout ? "px-2" : undefined}
                  disabled={Boolean(resolvingChannel)}
                  aria-label="Open stream actions"
                />
              }
            >
              <TvIcon className="size-4 -mt-px" />
              {!isMobileLayout && "Open in player"}
              <ChevronDownIcon className="size-4 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {availableExternalPlayers.length > 0 ? (
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Open stream in</DropdownMenuLabel>
                  {availableExternalPlayers.map((player) => (
                    <DropdownMenuItem
                      key={player.id}
                      disabled={Boolean(resolvingChannel)}
                      onClick={() => pullChannelStream(selectedChannel, player.id)}
                      className="py-1.5"
                    >
                      <PlayerLogo player={player.id} />
                      <span>{player.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              ) : null}
              {availableExternalPlayers.length > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                disabled={Boolean(resolvingChannel)}
                onClick={() => pullChannelStream(selectedChannel, "copy")}
                className="py-1.5"
              >
                {copiedChannel === getChannelKey(selectedChannel) ? (
                  <CheckIcon />
                ) : failedChannel === getChannelKey(selectedChannel) ? (
                  <AlertCircleIcon />
                ) : (
                  <CopyIcon />
                )}
                Copy stream
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
        <div className="flex h-full w-full flex-col gap-1.5 overflow-hidden bg-muted/30 p-3 min-[940px]:flex-row">
          <div className="order-3 min-h-0 basis-[46%] shrink min-[940px]:order-1 min-[940px]:w-[360px] min-[940px]:max-w-[520px] min-[940px]:min-w-80 min-[940px]:basis-auto min-[940px]:shrink-0">
            {renderChannelContent()}
          </div>
          <div className="order-2 w-px h-px bg-transparent shrink-0 min-[940px]:order-2" />
          <div className="order-1 min-h-0 basis-[54%] shrink min-[940px]:order-3 min-[940px]:flex-1 min-[940px]:basis-auto">
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
    <Badge
      variant="outline"
      className={cn(
        "h-5 animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out",
        className
      )}
    >
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

const COMMON_FRAME_RATES = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60]

function snapToCommonFrameRate(frameRate: number) {
  let closest = COMMON_FRAME_RATES[0]
  let smallestDiff = Infinity

  for (const candidate of COMMON_FRAME_RATES) {
    const diff = Math.abs(frameRate - candidate)

    if (diff < smallestDiff) {
      smallestDiff = diff
      closest = candidate
    }
  }

  return smallestDiff / closest < 0.04 ? closest : frameRate
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
  // Channel IDs from older saved M3U sources can be XMLTV `tvg-id` values,
  // which are not necessarily unique. Include the stream URL and playlist
  // number so selection, favourites, and player state identify the actual
  // stream rather than its guide metadata.
  return JSON.stringify([
    channel.portalSource?.id ?? "manual",
    channel.savedChannelId ?? null,
    channel.id,
    channel.number,
    channel.cmd,
  ])
}

function getLegacyChannelKey(channel: PortalChannelWithSource) {
  return [channel.portalSource?.id ?? "manual", channel.id || channel.number || channel.name].join(":")
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
      epgMode: portal.epgMode,
      epgSourceId: portal.epgSourceId,
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
      epgMode: portal.epgMode,
      epgSourceId: portal.epgSourceId,
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
    epgMode: portal.epgMode,
    epgSourceId: portal.epgSourceId,
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

// Skips the /api/portals/[id] round trip (and the Postgres read behind it)
// when the source's cached channels are still fresh, so a plain page
// refresh doesn't re-download every enabled portal's full channel list.
async function loadPortalChannels(
  portal: SavedPortalRecord
): Promise<PortalResponse> {
  const updatedAt = new Date(portal.updatedAt).getTime()
  const cached = Number.isFinite(updatedAt)
    ? await getCachedPortalChannels(portal.id)
    : null

  if (cached && cached.updatedAt === updatedAt) {
    return {
      endpoint: portal.endpoint || "",
      profile: {},
      genres: uniqueGenres(cached.channels),
      channels: cached.channels,
    }
  }

  const result = await fetchSavedPortalResult(portal)

  if (Number.isFinite(updatedAt)) {
    setCachedPortalChannels({
      sourceId: portal.id,
      updatedAt,
      channels: result.channels,
    })
  }

  return result
}

function getChannelLogoUrl(channel: PortalChannel, portalSource: PortalSource | undefined, epgChannels: Record<string, { name: string; logoUrl?: string; countryCode?: string }>, customEpgChannels: Record<number, Record<string, { logoUrl?: string }>>) {
  const lookupId = normalizeXmltvId(channel.xmltvId) || channel.id

  const logoUrl =
    (portalSource?.epgMode === "iptv-org" && lookupId ? epgChannels[lookupId.toLowerCase()]?.logoUrl : null) ||
    (portalSource?.epgMode === "custom" && portalSource.epgSourceId && lookupId ? customEpgChannels[portalSource.epgSourceId]?.[lookupId.toLowerCase()]?.logoUrl : null) ||
    channel.logoUrl ||
    ""

  return logoUrl ? proxyImageUrl(logoUrl) : ""
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
  const isMobileLayout = useMediaQuery("(max-width: 939px)", true)
  const isResponsiveLayoutReady = useHydratedLayout()

  const channelContent = (
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm min-[940px]:min-w-80">
      <div className="flex flex-col gap-3 p-4 pb-2">
        <PortalHopWordmark className="mb-1" />
        <InputGroup>
          <InputGroupInput placeholder="Search channels" />
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
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
      <div className="relative z-10 flex min-h-16 items-center justify-between gap-3 px-4 pt-4 pb-3 min-[940px]:pr-[22rem]">
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
      <div className="flex h-full w-full flex-col gap-1.5 overflow-hidden bg-muted/30 p-3 min-[940px]:flex-row">
        <div className="order-3 min-h-0 basis-[46%] shrink min-[940px]:order-1 min-[940px]:w-[360px] min-[940px]:max-w-[520px] min-[940px]:min-w-80 min-[940px]:basis-auto min-[940px]:shrink-0">
          {channelContent}
        </div>
        <div className="order-2 w-px h-px bg-transparent shrink-0 min-[940px]:order-2" />
        <div className="order-1 min-h-0 basis-[54%] shrink min-[940px]:order-3 min-[940px]:flex-1 min-[940px]:basis-auto">
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
